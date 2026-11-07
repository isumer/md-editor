interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ScrollPane {
  topLine(): number;
  scrollToLine(line: number): void;
  onScroll(listener: () => void): () => void;
}

interface SyncScrollOptions {
  editor: ScrollPane;
  preview: ScrollPane;
  storage?: StorageLike;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

export interface SyncScrollController {
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
  toggle(): void;
  dispose(): void;
}

const STORAGE_KEY = "view.syncScroll";

function storedEnabled(storage: StorageLike | undefined): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveEnabled(storage: StorageLike | undefined, enabled: boolean): void {
  try {
    storage?.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage can be unavailable in a locked-down renderer.
  }
}

export function createSyncScrollController(
  options: SyncScrollOptions,
): SyncScrollController {
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  let enabled = storedEnabled(options.storage);
  let queued = false;
  let frame = 0;
  let pending: ScrollPane | null = null;
  let suppressed: ScrollPane | null = null;

  function synchronize(source: ScrollPane, target: ScrollPane): void {
    suppressed = target;
    target.scrollToLine(source.topLine());
    requestFrame(() => {
      if (suppressed === target) {
        suppressed = null;
      }
    });
  }

  function schedule(source: ScrollPane): void {
    if (!enabled || suppressed === source) {
      if (suppressed === source) {
        suppressed = null;
      }
      return;
    }
    pending = source;
    if (queued) {
      return;
    }
    queued = true;
    frame = requestFrame(() => {
      queued = false;
      const current = pending;
      pending = null;
      if (current === options.editor) {
        synchronize(options.editor, options.preview);
      } else if (current === options.preview) {
        synchronize(options.preview, options.editor);
      }
    });
  }

  const disposeEditor = options.editor.onScroll(() => schedule(options.editor));
  const disposePreview = options.preview.onScroll(() => schedule(options.preview));
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      pending = null;
      saveEnabled(options.storage, nextEnabled);
    },
    toggle() {
      this.setEnabled(!enabled);
    },
    dispose() {
      if (queued) {
        cancelFrame(frame);
      }
      disposeEditor();
      disposePreview();
    },
  };
}

