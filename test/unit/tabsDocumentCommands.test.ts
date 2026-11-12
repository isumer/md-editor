// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuCommandMessage, MenuContribution } from "../../src/shared/ipc/menu";
import { menuItems as mainMenuItems } from "../../src/main/app/menu/registry";
import {
  createSecondaryDocumentCommands,
  type SecondaryDocumentCommands,
} from "../../src/renderer/tabs/documentCommandsSecondary";

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

function createEditor(): EditorView {
  const parent = document.createElement("div");
  document.body.append(parent);
  return new EditorView({ state: EditorState.create({ doc: "note" }), parent });
}

describe("document commands", () => {
  it("AC-PERF-03 AC-R5-15: primary commands run while the secondary module is pending", async () => {
    const { DocumentCommands } = await import(
      "../../src/renderer/tabs/documentCommands"
    );
    const editor = createEditor();
    const open = vi.fn(async () => undefined);
    const save = vi.fn(async () => undefined);
    const compare = vi.fn();
    const onResult = vi.fn();
    let resolveSecondary!: (value: SecondaryDocumentCommands) => void;
    const pendingSecondary = new Promise<SecondaryDocumentCommands>((resolve) => {
      resolveSecondary = resolve;
    });
    const loadSecondary = vi.fn(() => pendingSecondary);
    const commands = new DocumentCommands({
      editor,
      loadSecondary,
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
      ],
    });
    menuListener?.("file-open");
    menuListener?.("file-save");
    menuListener?.("file-save-as");
    (menuListener as ((command: string) => void) | null)?.("unknown");
    await Promise.resolve();

    expect(open).toHaveBeenCalledOnce();
    expect(save.mock.calls).toEqual([[false], [true]]);
    expect(onResult).toHaveBeenCalledWith({ ok: true, value: undefined });

    commands.startSecondaryFeatures();
    commands.startSecondaryFeatures();
    await Promise.resolve();
    expect(loadSecondary).toHaveBeenCalledOnce();
    expect(contributeMenu).toHaveBeenCalledOnce();

    menuListener?.("file-compare-open");
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, ctrlKey: true, shiftKey: true, key: "c",
    }));
    await Promise.resolve();
    expect(compare).not.toHaveBeenCalled();

    resolveSecondary(createSecondaryDocumentCommands({ compare }));
    await vi.waitFor(() => expect(contributeMenu).toHaveBeenCalledTimes(2));
    expect(contributeMenu.mock.calls[1]?.[0].items.map((item) => item.id))
      .toEqual([
        "file-open",
        "file-save",
        "file-save-as",
        "file-compare-open",
      ]);

    menuListener?.("file-compare-open");
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, ctrlKey: true, shiftKey: true, key: "c",
    }));
    await Promise.resolve();
    expect(compare).toHaveBeenCalledTimes(2);

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

  it("AC-R5-08 AC-R5-20: secondary items join the primary list in main order", async () => {
    const { menuContribution, menuItems } = await import(
      "../../src/renderer/tabs/documentCommands"
    );
    const secondary = createSecondaryDocumentCommands({ compare: vi.fn() });
    const combined = [...menuItems, ...secondary.menuItems];

    expect(menuItems.map((item) => item.id)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
    ]);
    expect(combined).toEqual(mainMenuItems);
    expect(menuContribution(combined).items.map((item) => item.id)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
      "file-compare-open",
    ]);
  });
});
