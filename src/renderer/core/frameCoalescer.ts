export interface FrameCoalescerOptions<T extends { id: string }> {
  requestFrame(callback: () => void): void;
  apply(item: T): void;
}

// Coalesces repeated changes into one application per animation frame.
export class FrameCoalescer<T extends { id: string }> {
  private readonly pending = new Map<string, T>();
  private scheduled = false;

  constructor(private readonly options: FrameCoalescerOptions<T>) {}

  changed(item: T): void {
    this.pending.set(item.id, item);
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    this.options.requestFrame(() => {
      this.flush();
    });
  }

  forget(id: string): void {
    this.pending.delete(id);
  }

  flush(): void {
    this.scheduled = false;
    const items = [...this.pending.values()];
    this.pending.clear();
    for (const item of items) {
      this.options.apply(item);
    }
  }
}
