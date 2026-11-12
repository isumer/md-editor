import { describe, expect, it, vi } from "vitest";

import { createCommandRegistry } from "../../src/renderer/core/commands";
import { createContextKeys } from "../../src/renderer/core/contextKeys";
import {
  bindingForEvent,
  chordForEvent,
  DEFAULT_BINDINGS,
  installKeymap,
  type KeyEventLike,
  type KeydownTarget,
} from "../../src/renderer/core/keymap";

function event(
  key: string,
  modifiers: Partial<Pick<KeyEventLike, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">> = {},
): KeyEventLike {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...modifiers,
  };
}

class FakeTarget implements KeydownTarget {
  listener: ((event: KeyEventLike) => void) | null = null;
  capture: boolean | null = null;
  removed: Array<{ listener: ((event: KeyEventLike) => void) | null; capture: boolean }> = [];

  addEventListener(
    _type: "keydown",
    listener: (event: KeyEventLike) => void,
    useCapture: boolean,
  ): void {
    this.listener = listener;
    this.capture = useCapture;
  }

  removeEventListener(
    _type: "keydown",
    listener: (event: KeyEventLike) => void,
    useCapture: boolean,
  ): void {
    this.removed.push({ listener, capture: useCapture });
  }
}

describe("keymap data", () => {
  it("AC-R1-08 AC-R5-20: binds the File and history chords to their command ids", () => {
    expect(DEFAULT_BINDINGS).toMatchObject({
      "Mod-o": "file.open",
      "Mod-s": "file.save",
      "Mod-Shift-s": "file.saveAs",
      "Mod-z": "undo",
      "Mod-Shift-z": "redo",
      "Mod-y": "redo",
      "Mod-Shift-c": "file.compareOpen",
      "Mod-1": "view.split",
      "Mod-2": "view.editor",
      "Mod-3": "view.preview",
      "Mod-Shift-f": "view.focusMode",
      F11: "view.toggleFullScreen",
    });
  });
});

describe("chordForEvent", () => {
  it("maps Mod to Ctrl on Linux and Windows and Meta on macOS", () => {
    expect(chordForEvent(event("o", { ctrlKey: true }), "linux")).toBe("Mod-o");
    expect(chordForEvent(event("o", { ctrlKey: true }), "win32")).toBe("Mod-o");
    expect(chordForEvent(event("o", { metaKey: true }), "darwin")).toBe("Mod-o");
    expect(chordForEvent(event("o", { metaKey: true }), "linux")).toBe("Meta-o");
    expect(chordForEvent(event("o", { ctrlKey: true }), "darwin")).toBe("Ctrl-o");
  });

  it("AC-R2-03: maps F11 without a modifier", () => {
    expect(chordForEvent(event("F11"), "linux")).toBe("F11");
    expect(chordForEvent(event("F11"), "win32")).toBe("F11");
  });

  it("normalises modifier order and letter case", () => {
    expect(chordForEvent(
      event("Z", { ctrlKey: true, shiftKey: true }),
      "linux",
    )).toBe("Mod-Shift-z");
    expect(chordForEvent(
      event("s", { ctrlKey: true, shiftKey: true, altKey: true }),
      "linux",
    )).toBe("Mod-Alt-Shift-s");
  });

  it("ignores events with no chord or a bare modifier", () => {
    expect(chordForEvent(event("o"), "linux")).toBeNull();
    expect(chordForEvent(event("Shift", { shiftKey: true }), "linux")).toBeNull();
    expect(chordForEvent(event("Control", { ctrlKey: true }), "linux")).toBeNull();
    expect(chordForEvent(event(""), "linux")).toBeNull();
  });

  it("never treats a Windows AltGr Ctrl+Alt character as a command", () => {
    expect(chordForEvent(
      event("ę", { ctrlKey: true, altKey: true }),
      "win32",
    )).toBeNull();
    expect(chordForEvent(
      event("€", { ctrlKey: true, altKey: true }),
      "win32",
    )).toBeNull();
    expect(chordForEvent(
      event("ArrowLeft", { ctrlKey: true, altKey: true }),
      "win32",
    )).toBe("Mod-Alt-ArrowLeft");
  });

  it("AC-R5-20: uses the physical key when a non-Latin layout types another letter", () => {
    expect(chordForEvent(event("ы", { code: "KeyS", ctrlKey: true }), "linux"))
      .toBe("Mod-s");
    expect(chordForEvent(event("Я", { code: "KeyZ", metaKey: true, shiftKey: true }), "darwin"))
      .toBe("Mod-Shift-z");
    expect(chordForEvent(event("щ", { code: "KeyO", ctrlKey: true }), "win32"))
      .toBe("Mod-o");
    expect(chordForEvent(event("٢", { code: "Digit2", ctrlKey: true }), "linux"))
      .toBe("Mod-2");
    expect(chordForEvent(event("z", { code: "KeyY", ctrlKey: true }), "linux"))
      .toBe("Mod-z");
    expect(chordForEvent(event("ę", { code: "KeyE", ctrlKey: true, altKey: true }), "win32"))
      .toBeNull();
  });

  it("does not suppress Ctrl+Alt characters on other platforms", () => {
    expect(chordForEvent(
      event("ę", { ctrlKey: true, altKey: true }),
      "linux",
    )).toBe("Mod-Alt-ę");
  });
});

describe("bindingForEvent", () => {
  it("AC-R2-01 AC-R2-03: binds View commands for each platform", () => {
    expect(bindingForEvent(event("2", { ctrlKey: true }), "linux"))
      .toBe("view.editor");
    expect(bindingForEvent(event("F11"), "linux")).toBe("view.toggleFullScreen");
    expect(bindingForEvent(event("f", { ctrlKey: true, metaKey: true }), "darwin"))
      .toBe("view.toggleFullScreen");
    expect(bindingForEvent(event("F11"), "darwin")).toBeUndefined();
  });
  it("AC-R1-08: leaves Cmd+Y unbound on macOS and keeps Ctrl+Y redo elsewhere", () => {
    expect(bindingForEvent(event("y", { metaKey: true }), "darwin")).toBeUndefined();
    expect(bindingForEvent(event("y", { ctrlKey: true }), "linux")).toBe("redo");
  });

  it("returns the command for a bound chord and nothing for an unknown one", () => {
    expect(bindingForEvent(event("s", { ctrlKey: true }), "linux")).toBe("file.save");
    expect(bindingForEvent(event("s", { ctrlKey: true, shiftKey: true }), "linux"))
      .toBe("file.saveAs");
    expect(bindingForEvent(event("x", { ctrlKey: true }), "linux")).toBeUndefined();
    expect(bindingForEvent(event("x"), "linux")).toBeUndefined();
  });

  it("AC-R14-01: binds compare on Ctrl+Shift+C, including non-Latin layouts", () => {
    expect(bindingForEvent(event("c", { ctrlKey: true, shiftKey: true }), "linux"))
      .toBe("file.compareOpen");
    expect(bindingForEvent(
      event("с", { code: "KeyC", ctrlKey: true, shiftKey: true }),
      "linux",
    )).toBe("file.compareOpen");
    expect(bindingForEvent(event("c", { ctrlKey: true, altKey: true }), "linux"))
      .toBeUndefined();
    expect(bindingForEvent(event("ć", { ctrlKey: true, altKey: true }), "win32"))
      .toBeUndefined();
  });
});

describe("installKeymap", () => {
  function setup(platform = "linux") {
    const registry = createCommandRegistry();
    const run = vi.fn();
    registry.register({ id: "undo", titleKey: "menu.undo", run });
    registry.register({ id: "redo", titleKey: "menu.redo", run });
    const context = { contextKeys: createContextKeys() };
    const target = new FakeTarget();
    const dispose = installKeymap(target, { registry, context, platform });
    return { context, dispose, run, target };
  }

  it("runs a matched command in the capture phase and prevents the native action", async () => {
    const { run, target } = setup();
    const keyEvent = event("z", { ctrlKey: true });

    target.listener?.(keyEvent);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    expect(target.capture).toBe(true);
    expect(keyEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ contextKeys: expect.anything() }),
      undefined,
      undefined,
    );
  });

  it("leaves unbound and AltGr chords to the editor", () => {
    const { run, target } = setup("win32");
    const unbound = event("x", { ctrlKey: true });
    const altGr = event("ę", { ctrlKey: true, altKey: true });

    target.listener?.(unbound);
    target.listener?.(altGr);

    expect(run).not.toHaveBeenCalled();
    expect(unbound.preventDefault).not.toHaveBeenCalled();
    expect(altGr.preventDefault).not.toHaveBeenCalled();
  });

  it("AC-R1-08: leaves Cmd+Y to macOS without running redo", () => {
    const { run, target } = setup("darwin");
    const keyEvent = event("y", { metaKey: true });

    target.listener?.(keyEvent);

    expect(run).not.toHaveBeenCalled();
    expect(keyEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("removes the same capture listener on dispose", () => {
    const { dispose, target } = setup();
    const listener = target.listener;
    dispose();
    expect(target.removed).toEqual([{ listener, capture: true }]);
  });
});
