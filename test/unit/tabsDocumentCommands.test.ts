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
    const merge = vi.fn();
    const onResult = vi.fn();
    const commands = new DocumentCommands({
      compare,
      merge,
      editor,
      onError: vi.fn(),
      onResult,
      open,
      save,
    });
    await Promise.resolve();

    expect(contributeMenu.mock.calls[0]?.[0]).toEqual({
      fileMenuTitle: "File",
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
      ],
    });
    menuListener?.("file-open");
    menuListener?.("file-save");
    menuListener?.("file-save-as");
    menuListener?.("file-compare-open");
    menuListener?.("file-merge-open");
    (menuListener as ((command: string) => void) | null)?.("unknown");
    await Promise.resolve();

    expect(open).toHaveBeenCalledOnce();
    expect(save.mock.calls).toEqual([[false], [true]]);
    expect(compare).toHaveBeenCalledOnce();
    expect(merge).toHaveBeenCalledOnce();
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
      editor,
      merge: vi.fn(),
      onError,
      onResult: vi.fn(),
      open: vi.fn(async () => undefined),
      save: vi.fn(async () => {
        throw new Error("save stopped");
      }),
    });
    await Promise.resolve();

    menuListener?.("file-save");

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(new Error("save stopped"));
    });
    editor.destroy();
  });
});
