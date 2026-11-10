// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuCommandMessage, MenuContribution } from "../../src/shared/ipc/menu";

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
    const onResult = vi.fn();
    const otherView = vi.fn();
    const commands = new DocumentCommands({
      editor: () => editor,
      onError: vi.fn(),
      onResult,
      open,
      otherView,
      save,
    });
    await Promise.resolve();

    expect(contributeMenu.mock.calls[0]?.[0].items.map((item) => item.id)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
    ]);
    menuListener?.("file-open");
    menuListener?.("file-save");
    menuListener?.("file-save-as");
    (menuListener as ((command: string) => void) | null)?.("unknown");
    await Promise.resolve();

    expect(open).toHaveBeenCalledOnce();
    expect(save.mock.calls).toEqual([[false], [true]]);
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
});
