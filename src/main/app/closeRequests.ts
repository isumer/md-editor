import type { SessionCloseResult } from "../../shared/ipc/session";

export type TimerHandle = unknown;

export interface CloseRequestBrokerOptions {
  ackTimeoutMilliseconds?: number;
  keepaliveTimeoutMilliseconds?: number;
  setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

interface PendingClose {
  resolve(allow: boolean): void;
  timer: TimerHandle;
  windowId: number;
}

const KEEPALIVE_GRANT = "session-close:keepalive";
// A live renderer acks immediately, so a short first wait leaves room to quit
// inside the 15 s e2e budget; a keepalive proves the prompt is open.
const DEFAULT_ACK_TIMEOUT_MILLISECONDS = 4_000;
const DEFAULT_KEEPALIVE_TIMEOUT_MILLISECONDS = 15_000;
const PERSIST_TIMEOUT_MILLISECONDS = 5_000;

function isKeepalive(result: SessionCloseResult): boolean {
  return !result.allow && result.documents[0]?.grant === KEEPALIVE_GRANT;
}

// Main asks the renderer before it closes a window with unsaved documents.
// A renderer that never answers must not wedge shutdown, so the request times
// out and the window closes without a session snapshot.
export class CloseRequestBroker {
  private readonly pending = new Map<number, PendingClose>();
  private readonly ackTimeoutMilliseconds: number;
  private readonly keepaliveTimeoutMilliseconds: number;
  private readonly setTimer: (callback: () => void, milliseconds: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private nextId = 1;

  constructor(
    private readonly send: (windowId: number, requestId: number) => void,
    private readonly persist: (
      result: SessionCloseResult,
      windowId: number,
    ) => Promise<void>,
    options: CloseRequestBrokerOptions = {},
  ) {
    this.ackTimeoutMilliseconds = options.ackTimeoutMilliseconds ??
      DEFAULT_ACK_TIMEOUT_MILLISECONDS;
    this.keepaliveTimeoutMilliseconds = options.keepaliveTimeoutMilliseconds ??
      DEFAULT_KEEPALIVE_TIMEOUT_MILLISECONDS;
    this.setTimer = options.setTimer ??
      ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearTimer = options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  request(windowId: number): Promise<boolean> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve) => {
      const timer = this.startTimer(id, this.ackTimeoutMilliseconds);
      this.pending.set(id, { resolve, timer, windowId });
      this.send(windowId, id);
    });
  }

  async settle(result: SessionCloseResult, windowId: number): Promise<void> {
    const pending = this.pending.get(result.id);
    if (!pending || pending.windowId !== windowId) {
      return;
    }
    if (isKeepalive(result)) {
      this.clearTimer(pending.timer);
      pending.timer = this.startTimer(result.id, this.keepaliveTimeoutMilliseconds);
      return;
    }
    this.pending.delete(result.id);
    this.clearTimer(pending.timer);
    // A failed snapshot write must not wedge shutdown; the timeout path
    // already closes without a snapshot.
    try {
      if (result.allow) {
        await this.persistWithTimeout(result, windowId);
      }
    } finally {
      pending.resolve(result.allow);
    }
  }

  private async persistWithTimeout(
    result: SessionCloseResult,
    windowId: number,
  ): Promise<void> {
    let timer: TimerHandle | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = this.setTimer(resolve, PERSIST_TIMEOUT_MILLISECONDS);
    });
    try {
      await Promise.race([this.persist(result, windowId), timeout]);
    } finally {
      if (timer !== undefined) {
        this.clearTimer(timer);
      }
    }
  }

  private startTimer(id: number, milliseconds: number): TimerHandle {
    let timer: TimerHandle;
    timer = this.setTimer(() => {
      const pending = this.pending.get(id);
      if (pending && pending.timer === timer) {
        this.pending.delete(id);
        pending.resolve(true);
      }
    }, milliseconds);
    return timer;
  }
}
