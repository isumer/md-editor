// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  createSyncScrollController,
  type ScrollPane,
} from "../../src/renderer/features/sync-scroll/syncScroll";

class FakePane implements ScrollPane {
  line = 1;
  readonly scrollToLine = vi.fn((line: number) => {
    this.line = line;
    for (const listener of this.listeners) {
      listener();
    }
  });
  private readonly listeners = new Set<() => void>();

  topLine(): number {
    return this.line;
  }

  onScroll(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  userScroll(line: number): void {
    this.line = line;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function immediateFrame(callback: FrameRequestCallback): number {
  callback(0);
  return 1;
}

describe("sync scroll controller", () => {
  it("AC-R3-01: moves the preview to the editor's top source line", () => {
    const editor = new FakePane();
    const preview = new FakePane();
    const controller = createSyncScrollController({
      editor,
      preview,
      requestFrame: immediateFrame,
      cancelFrame: vi.fn(),
    });

    editor.userScroll(119);

    expect(preview.scrollToLine).toHaveBeenCalledWith(119);
    controller.dispose();
  });

  it("AC-R3-02: moves the editor to the preview's top source line", () => {
    const editor = new FakePane();
    const preview = new FakePane();
    const controller = createSyncScrollController({
      editor,
      preview,
      requestFrame: immediateFrame,
      cancelFrame: vi.fn(),
    });

    preview.userScroll(164);

    expect(editor.scrollToLine).toHaveBeenCalledWith(164);
    controller.dispose();
  });

  it("AC-R3-03: suppresses the reverse event from a synchronized scroll", () => {
    const editor = new FakePane();
    const preview = new FakePane();
    const controller = createSyncScrollController({
      editor,
      preview,
      requestFrame: immediateFrame,
      cancelFrame: vi.fn(),
    });

    editor.userScroll(51);

    expect(preview.scrollToLine).toHaveBeenCalledTimes(1);
    expect(editor.scrollToLine).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("AC-R3-04: disables synchronization and restores the setting", () => {
    const storage = {
      value: "false" as string | null,
      getItem: vi.fn(() => storage.value),
      setItem: vi.fn((_key: string, value: string) => {
        storage.value = value;
      }),
    };
    const editor = new FakePane();
    const preview = new FakePane();
    const controller = createSyncScrollController({
      editor,
      preview,
      storage,
      requestFrame: immediateFrame,
      cancelFrame: vi.fn(),
    });

    editor.userScroll(96);
    expect(preview.scrollToLine).not.toHaveBeenCalled();

    controller.setEnabled(true);
    expect(storage.setItem).toHaveBeenCalledWith("view.syncScroll", "true");
    controller.dispose();
  });
});
