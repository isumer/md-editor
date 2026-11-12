export interface ScheduledRender {
  id: number;
}

export type TimeSource = () => number;
export type FrameRequest = (callback: () => void) => number;
export type FrameCancel = (handle: number) => void;
export type TimerRequest = (callback: () => void, milliseconds: number) => number;
export type TimerCancel = (handle: number) => void;

export interface RenderSchedulerOptions {
  now?: TimeSource;
  maximumWaitMilliseconds?: number;
  requestFrame?: FrameRequest;
  cancelFrame?: FrameCancel;
  setTimer?: TimerRequest;
  clearTimer?: TimerCancel;
  onApplied?: (latencyMilliseconds: number) => void;
}

interface ResolvedOptions {
  now: TimeSource;
  maximumWaitMilliseconds: number;
  requestFrame: FrameRequest;
  cancelFrame: FrameCancel;
  setTimer: TimerRequest;
  clearTimer: TimerCancel;
  onApplied: ((latencyMilliseconds: number) => void) | undefined;
}

function resolve(options: RenderSchedulerOptions): ResolvedOptions {
  return {
    now: options.now ?? (() => performance.now()),
    maximumWaitMilliseconds: options.maximumWaitMilliseconds ?? 50,
    requestFrame: options.requestFrame ??
      ((callback) => requestAnimationFrame(callback)),
    cancelFrame: options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle)),
    setTimer: options.setTimer ?? ((callback, milliseconds) =>
      setTimeout(callback, milliseconds) as unknown as number),
    clearTimer: options.clearTimer ?? ((handle) => clearTimeout(handle)),
    onApplied: options.onApplied,
  };
}

// Coalesces a burst into one dispatch per animation frame and keeps a timer as
// the upper bound for when frames are throttled or the window is hidden.
export class RenderScheduler {
  private readonly options: ResolvedOptions;
  private frame: number | undefined;
  private timer: number | undefined;
  private pendingSince: number | undefined;
  private readonly dispatchedAt = new Map<number, number>();
  private nextRequestId = 1;
  private newestAppliedId = 0;

  constructor(
    private readonly requestRender: (request: ScheduledRender) => void,
    options: RenderSchedulerOptions = {},
  ) {
    this.options = resolve(options);
  }

  schedule(): void {
    const currentTime = this.options.now();
    this.pendingSince ??= currentTime;
    if (this.frame !== undefined || this.timer !== undefined) {
      return;
    }
    this.frame = this.options.requestFrame(() => this.dispatch());
    const elapsed = currentTime - this.pendingSince;
    const delay = Math.max(0, this.options.maximumWaitMilliseconds - elapsed);
    this.timer = this.options.setTimer(() => this.dispatch(), delay);
  }

  applyResult<T>(id: number, result: T, apply: (result: T) => void): boolean {
    if (id < this.newestAppliedId) {
      return false;
    }
    this.newestAppliedId = id;
    const startedAt = this.dispatchedAt.get(id);
    this.dispatchedAt.delete(id);
    apply(result);
    if (startedAt !== undefined) {
      this.options.onApplied?.(this.options.now() - startedAt);
    }
    return true;
  }

  dispose(): void {
    this.cancelScheduled();
    this.pendingSince = undefined;
    this.dispatchedAt.clear();
  }

  private cancelScheduled(): void {
    if (this.frame !== undefined) {
      this.options.cancelFrame(this.frame);
      this.frame = undefined;
    }
    if (this.timer !== undefined) {
      this.options.clearTimer(this.timer);
      this.timer = undefined;
    }
  }

  private dispatch(): void {
    if (this.pendingSince === undefined) {
      this.cancelScheduled();
      return;
    }
    const startedAt = this.pendingSince;
    this.pendingSince = undefined;
    this.cancelScheduled();
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    this.dispatchedAt.set(id, startedAt);
    this.requestRender({ id });
  }
}
