export type TimerHandle = unknown;

export interface DraftSchedulerOptions {
  onDraft(docId: string): void;
  setTimer?: (callback: () => void, milliseconds: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  idleMilliseconds?: number;
  largeIdleMilliseconds?: number;
  largeSize?: number;
}

interface ScheduledDraft {
  handle: TimerHandle;
}

// One idle timer per dirty document: 2 s after the last edit, or 10 s for a
// document above 5 MB. Saving or closing the document cancels its timer.
export class DraftScheduler {
  private readonly scheduled = new Map<string, ScheduledDraft>();
  private readonly onDraft: (docId: string) => void;
  private readonly setTimer: (callback: () => void, milliseconds: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private readonly idleMilliseconds: number;
  private readonly largeIdleMilliseconds: number;
  private readonly largeSize: number;

  constructor(options: DraftSchedulerOptions) {
    this.onDraft = options.onDraft;
    this.setTimer = options.setTimer ??
      ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearTimer = options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.idleMilliseconds = options.idleMilliseconds ?? 2_000;
    this.largeIdleMilliseconds = options.largeIdleMilliseconds ?? 10_000;
    this.largeSize = options.largeSize ?? 5 * 1024 * 1024;
  }

  documentChanged(docId: string, size: number): void {
    this.cancel(docId);
    const large = size >= this.largeSize;
    const delay = large ? this.largeIdleMilliseconds : this.idleMilliseconds;
    const handle = this.setTimer(() => {
      this.scheduled.delete(docId);
      this.onDraft(docId);
    }, delay);
    this.scheduled.set(docId, { handle });
  }

  documentSaved(docId: string): void {
    this.cancel(docId);
  }

  dispose(): void {
    for (const docId of [...this.scheduled.keys()]) {
      this.cancel(docId);
    }
  }

  hasPending(docId: string): boolean {
    return this.scheduled.has(docId);
  }

  private cancel(docId: string): void {
    const scheduled = this.scheduled.get(docId);
    if (scheduled) {
      this.clearTimer(scheduled.handle);
      this.scheduled.delete(docId);
    }
  }
}
