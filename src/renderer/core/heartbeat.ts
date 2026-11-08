export type TimerHandle = unknown;

export interface HeartbeatOptions {
  onPing(id: number): void;
  onStuck(): void;
  now?: () => number;
  setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  intervalMilliseconds?: number;
  timeoutMilliseconds?: number;
}

// A ping unanswered for longer than the timeout means the worker stopped
// responding. The 250 ms interval bounds the wait for the next ping, so
// detection stays well inside the 2.5 s budget.
export class WorkerHeartbeat {
  private readonly onPing: (id: number) => void;
  private readonly onStuck: () => void;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, milliseconds: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private readonly intervalMilliseconds: number;
  private readonly timeoutMilliseconds: number;

  private timer: TimerHandle | undefined;
  private outstanding: { id: number; sentAt: number } | null = null;
  private nextId = 1;
  private running = false;

  constructor(options: HeartbeatOptions) {
    this.onPing = options.onPing;
    this.onStuck = options.onStuck;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ??
      ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearTimer = options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.intervalMilliseconds = options.intervalMilliseconds ?? 250;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 1_500;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.outstanding = null;
    this.tick();
  }

  stop(): void {
    this.running = false;
    this.outstanding = null;
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
  }

  pong(id: number): void {
    if (this.outstanding?.id === id) {
      this.outstanding = null;
    }
  }

  private tick(): void {
    if (!this.running) {
      return;
    }
    if (this.outstanding !== null &&
      this.now() - this.outstanding.sentAt >= this.timeoutMilliseconds) {
      this.stop();
      this.onStuck();
      return;
    }
    if (this.outstanding === null) {
      const id = this.nextId;
      this.nextId += 1;
      this.outstanding = { id, sentAt: this.now() };
      this.onPing(id);
    }
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      this.tick();
    }, this.intervalMilliseconds);
  }
}
