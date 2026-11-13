// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuCommandMessage, MenuContribution } from "../../src/shared/ipc/menu";
import { menuItems as mainMenuItems } from "../../src/main/app/menu/registry";

const contributeMenu = vi.fn(async (_request: MenuContribution) =>
  ({ ok: true, value: undefined } as const));
let menuListener: ((command: MenuCommandMessage) => void) | null = null;

beforeAll(() => {
  const boundary = {
    contributeMenu,
    onMenuCommand: vi.fn((listener: (command: MenuCommandMessage) => void) => {
      menuListener = listener;
      return vi.fn();
    }),
  } as unknown as Window["api"];
  Object.defineProperty(window, "api", { configurable: true, value: boundary });
});

beforeEach(() => {
  contributeMenu.mockClear();
  menuListener = null;
  document.body.replaceChildren();
});

describe("document commands", () => {
  it("selects the primary document when the second editor is not focused", async () => {
    const { selectFocusedDocument } = await import(
      "../../src/renderer/tabs/documentCommands"
    );

    expect(selectFocusedDocument("primary", "secondary", false)).toBe("primary");
  });

  it("selects the secondary document when the second editor is focused", async () => {
    const { selectFocusedDocument } = await import(
      "../../src/renderer/tabs/documentCommands"
    );

    expect(selectFocusedDocument("primary", "secondary", true)).toBe("secondary");
  });

  it("AC-R5-08 AC-R5-15: publishes fixed menu ids and dispatches each command", async () => {
    const { DocumentCommands } = await import(
      "../../src/renderer/tabs/documentCommands"
    );
    const parent = document.createElement("div");
    document.body.append(parent);
    const editor = new EditorView({ state: EditorState.create({ doc: "note" }), parent });
    const open = vi.fn(async () => undefined);
    const save = vi.fn(async () => undefined);
    const compare = vi.fn();
    const featureCommand = vi.fn();
    const merge = vi.fn();
    const toggleFullScreen = vi.fn(async () => undefined);
    const onResult = vi.fn();
    const otherView = vi.fn();
    const commands = new DocumentCommands({
      compare,
      merge,
      editor: () => editor,
      featureCommand,
      onError: vi.fn(),
      onResult,
      open,
      otherView,
      save,
      toggleFullScreen,
    });
    await Promise.resolve();

    expect(contributeMenu.mock.calls[0]?.[0]).toEqual({
      fileMenuTitle: "File",
      viewMenuTitle: "View",
      items: [
        { id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" },
        { id: "file-save", title: "Save", accelerator: "CmdOrCtrl+S" },
        { id: "file-save-as", title: "Save As", accelerator: "CmdOrCtrl+Shift+S" },
        {
          id: "file-compare-open",
          title: "Compare Open Files",
          accelerator: "CmdOrCtrl+Shift+C",
        },
        {
          id: "file-merge-open",
          title: "Merge Open Files",
          accelerator: "CmdOrCtrl+Shift+M",
        },
        { id: "view-split", title: "Split View", accelerator: "CmdOrCtrl+1" },
        { id: "view-editor", title: "Editor Only", accelerator: "CmdOrCtrl+2" },
        { id: "view-preview", title: "Preview Only", accelerator: "CmdOrCtrl+3" },
        {
          id: "view-focus-mode",
          title: "Focus Mode",
          accelerator: "CmdOrCtrl+Shift+F",
        },
        { id: "view-full-screen", title: "Full Screen", accelerator: "F11" },
      ],
    });
    menuListener?.("file-open");
    menuListener?.("file-save");
    menuListener?.("file-save-as");
    menuListener?.("file-compare-open");
    menuListener?.("file-merge-open");
    menuListener?.("view-editor");
    menuListener?.("view-focus-mode");
    menuListener?.("view-full-screen");
    (menuListener as ((command: string) => void) | null)?.("unknown");
    await Promise.resolve();

    expect(open).toHaveBeenCalledOnce();
    expect(save.mock.calls).toEqual([[false], [true]]);
    expect(compare).toHaveBeenCalledOnce();
    expect(merge).toHaveBeenCalledOnce();
    expect(featureCommand).toHaveBeenCalledWith("view.editor");
    expect(featureCommand).toHaveBeenCalledWith("view.focusMode");
    expect(toggleFullScreen).toHaveBeenCalledOnce();
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, ctrlKey: true, shiftKey: true, key: "c",
    }));
    expect(compare).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, ctrlKey: true, altKey: true, key: "c",
    }));
    expect(compare).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledWith({ ok: true, value: undefined });
    editor.contentDOM.focus();
    editor.dispatch({ selection: { anchor: 0, head: 2 } });
    commands.refresh();
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, ctrlKey: true, key: "z",
    }));
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, ctrlKey: true, key: "y",
    }));
    commands.run("tab.moveToOtherView", "2:document-one");
    commands.run("tab.cloneToOtherView", "1:document-two");
    await Promise.resolve();
    expect(otherView.mock.calls).toEqual([
      ["2:document-one", "move"],
      ["1:document-two", "clone"],
    ]);
    editor.contentDOM.blur();
    editor.destroy();
  });

  it("composes the same ordered item list as the main registry", async () => {
    const { menuItems } = await import(
      "../../src/renderer/tabs/documentCommands"
    );

    expect(menuItems).toEqual(mainMenuItems);
    expect(menuItems.map((item) => item.id)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
      "file-compare-open",
      "file-merge-open",
      "view-split",
      "view-editor",
      "view-preview",
      "view-focus-mode",
      "view-full-screen",
    ]);
  });

  it("reports a rejected menu command", async () => {
    const { DocumentCommands } = await import(
      "../../src/renderer/tabs/documentCommands"
    );
    const parent = document.createElement("div");
    document.body.append(parent);
    const editor = new EditorView({ state: EditorState.create({ doc: "note" }), parent });
    const onError = vi.fn();
    new DocumentCommands({
      compare: vi.fn(),
      editor: () => editor,
      featureCommand: vi.fn(),
      merge: vi.fn(),
      onError,
      onResult: vi.fn(),
      open: vi.fn(async () => undefined),
      save: vi.fn(async () => {
        throw new Error("save stopped");
      }),
      toggleFullScreen: vi.fn(async () => undefined),
    });
    await Promise.resolve();

    menuListener?.("file-save");

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(new Error("save stopped"));
    });
    editor.destroy();
  });

  it("uses the active document history handlers for undo and redo", async () => {
    const { DocumentCommands } = await import(
      "../../src/renderer/tabs/documentCommands"
    );
    const parent = document.createElement("div");
    document.body.append(parent);
    const editor = new EditorView({ state: EditorState.create({ doc: "note" }), parent });
    const undo = vi.fn();
    const redo = vi.fn();
    const commands = new DocumentCommands({
      compare: vi.fn(),
      editor: () => editor,
      featureCommand: vi.fn(),
      merge: vi.fn(),
      onError: vi.fn(),
      onResult: vi.fn(),
      open: vi.fn(async () => undefined),
      redo,
      save: vi.fn(async () => undefined),
      toggleFullScreen: vi.fn(async () => undefined),
      undo,
    });

    commands.run("undo", "keyboard");
    commands.run("redo", "keyboard");
    await Promise.resolve();

    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledOnce();
    editor.destroy();
  });
});
