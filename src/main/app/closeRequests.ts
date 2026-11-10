import type { SessionCloseResult } from "../../shared/ipc/session";

export type TimerHandle = unknown;

export interface CloseRequestBrokerOptions {
  timeoutMilliseconds?: number;
  setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

interface PendingClose {
  resolve(allow: boolean): void;
  timer: TimerHandle;
  windowId: number;
}

const KEEPALIVE_GRANT = "session-close:keepalive";

function isKeepalive(result: SessionCloseResult): boolean {
  return !result.allow && result.documents[0]?.grant === KEEPALIVE_GRANT;
}

// Main asks the renderer before it closes a window with unsaved documents.
// A renderer that never answers must not wedge shutdown, so the request times
// out and the window closes without a session snapshot.
export class CloseRequestBroker {
  private readonly pending = new Map<number, PendingClose>();
  private readonly timeoutMilliseconds: number;
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
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 15_000;
    this.setTimer = options.setTimer ??
      ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearTimer = options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  request(windowId: number): Promise<boolean> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve) => {
      const timer = this.startTimer(id);
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
      pending.timer = this.startTimer(result.id);
      return;
    }
    this.pending.delete(result.id);
    this.clearTimer(pending.timer);
    // A failed snapshot write must not wedge shutdown; the timeout path
    // already closes without a snapshot.
    try {
      if (result.allow) {
        await this.persist(result, windowId);
      }
    } finally {
      pending.resolve(result.allow);
    }
  }

  private startTimer(id: number): TimerHandle {
    let timer: TimerHandle;
    timer = this.setTimer(() => {
      const pending = this.pending.get(id);
      if (pending && pending.timer === timer) {
        this.pending.delete(id);
        pending.resolve(true);
      }
    }, this.timeoutMilliseconds);
    return timer;
  }
}
