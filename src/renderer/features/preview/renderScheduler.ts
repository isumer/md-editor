export interface ScheduledRender {
  id: number;
}

export type TimeSource = () => number;

export class RenderScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstChangeAt: number | undefined;
  private nextRequestId = 1;
  private newestAppliedId = 0;

  constructor(
    private readonly requestRender: (request: ScheduledRender) => void,
    private readonly now: TimeSource = Date.now,
    private readonly debounceMilliseconds = 150,
    private readonly maximumWaitMilliseconds = 500,
  ) {}

  schedule(): void {
    const currentTime = this.now();
    this.firstChangeAt ??= currentTime;

    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }

    const elapsed = currentTime - this.firstChangeAt;
    const delay = Math.min(
      this.debounceMilliseconds,
      Math.max(0, this.maximumWaitMilliseconds - elapsed),
    );
    this.timer = setTimeout(() => this.dispatch(), delay);
  }

  applyResult<T>(id: number, result: T, apply: (result: T) => void): boolean {
    if (id < this.newestAppliedId) {
      return false;
    }
    this.newestAppliedId = id;
    apply(result);
    return true;
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private dispatch(): void {
    this.timer = undefined;
    this.firstChangeAt = undefined;
    this.requestRender({ id: this.nextRequestId });
    this.nextRequestId += 1;
  }
}
