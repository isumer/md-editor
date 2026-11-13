import { Text } from "@codemirror/state";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { DocumentRecord } from "../../src/renderer/core/document";

function documentRecord(
  name: string | null,
  grant: string | null,
): DocumentRecord {
  return {
    grant,
    name,
    saved: { text: Text.of(["saved"]) },
    state: { doc: Text.of(["current"]) },
  } as DocumentRecord;
}

describe("tab modules", () => {
  beforeAll(() => {
    vi.stubGlobal("window", { api: {} });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("AC-R4-01: the tab strip gives untitled documents a stable label", async () => {
    const { tabLabel } = await import("../../src/renderer/tabs/tabStrip");
    expect(tabLabel(documentRecord(null, null))).toBe("Untitled");
    expect(tabLabel(documentRecord("note.md", "grant"))).toBe("note.md");
  });

  it("AC-R4-05 AC-R4-06: close messages identify one file or many files", async () => {
    const { documentCloseMessage } = await import("../../src/renderer/tabs/closePrompt");
    expect(documentCloseMessage([{ name: "note.md" }])).toContain("note.md");
    const multiple = documentCloseMessage([{ name: "one.md" }, { name: "two.md" }]);
    expect(multiple).toContain("one.md");
    expect(multiple).toContain("two.md");
  });

  it("AC-R5-20: command wiring selects the platform and fixed file menu", async () => {
    const { menuContribution, platformName } = await import(
      "../../src/renderer/tabs/documentCommands"
    );
    expect(platformName("MacIntel")).toBe("darwin");
    expect(platformName("Win32")).toBe("win32");
    expect(platformName("Linux x86_64")).toBe("linux");
    expect(menuContribution().items.map((item) => item.id)).toEqual([
      "file-open",
      "file-save",
      "file-save-as",
      "file-compare-open",
      "file-merge-open",
      "view-split",
      "view-editor",
      "view-preview",
      "view-sync-scroll",
      "view-focus-mode",
      "view-full-screen",
    ]);
  });

  it("AC-R4-08: session snapshots exclude untitled documents", async () => {
    const { sessionSnapshot } = await import(
      "../../src/renderer/tabs/documentLifecycle"
    );
    expect(sessionSnapshot([
      documentRecord(null, null),
      documentRecord("note.md", "grant"),
    ])).toEqual([{
      grant: "grant",
      name: "note.md",
      savedText: "saved",
      text: "current",
    }]);
  });

  it("AC-R1-12: render heartbeat replies are distinct from render results", async () => {
    vi.doMock("dompurify", () => {
      // Like the real export: callable, returning a configurable instance.
      const instance = { addHook: vi.fn(), setConfig: vi.fn(), sanitize: (html: string) => html };
      return { default: Object.assign(() => instance, instance) };
    });
    const { isRenderPong } = await import("../../src/renderer/tabs/renderController");
    expect(isRenderPong({ op: "pong", id: 3 })).toBe(true);
    expect(isRenderPong({
      id: 3,
      docId: "doc",
      epoch: 1,
      version: 1,
      ok: false,
      message: "failed",
    })).toBe(false);
  });
});
