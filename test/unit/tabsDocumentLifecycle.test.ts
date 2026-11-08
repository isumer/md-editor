// @vitest-environment jsdom

import { EditorState, Text } from "@codemirror/state";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDocumentRecord, type DocumentRecord } from "../../src/renderer/core/document";
import { DocumentRegistry } from "../../src/renderer/core/documentRegistry";
import { DraftScheduler } from "../../src/renderer/core/draftScheduler";
import { DocumentReplication } from "../../src/renderer/core/replication";
import { DocumentClosePrompt } from "../../src/renderer/tabs/closePrompt";

const ok = <T>(value: T) => ({ ok: true, value } as const);
const failure = {
  ok: false,
  error: { code: "UNKNOWN", messageKey: "file.unknown", params: {}, retryable: false },
} as const;
const api = {
  attachDocument: vi.fn(async () => ok(undefined)),
  chooseSaveTarget: vi.fn<Window["api"]["chooseSaveTarget"]>(async () => ok(null)),
  clearDraft: vi.fn(),
  contributeMenu: vi.fn(async () => ok(undefined)),
  detachDocument: vi.fn(),
  draftDocument: vi.fn<Window["api"]["draftDocument"]>(async () => ok(undefined)),
  listDrafts: vi.fn<Window["api"]["listDrafts"]>(async () => ok({ drafts: [] })),
  loadSession: vi.fn<Window["api"]["loadSession"]>(async () => ok({ documents: [] })),
  onMenuCommand: vi.fn(() => vi.fn()),
  onOpenRequest: vi.fn(() => vi.fn()),
  onSessionCloseRequest: vi.fn(() => vi.fn()),
  openExternal: vi.fn(async () => ok(undefined)),
  openFile: vi.fn<Window["api"]["openFile"]>(async () => ok(null)),
  readDocument: vi.fn<Window["api"]["readDocument"]>(async () => failure),
  readyForOpenRequests: vi.fn(async () => ok({ notice: null, productName: "Editor", windowId: 1 })),
  releaseDocument: vi.fn(async () => ok(undefined)),
  respondSessionClose: vi.fn<Window["api"]["respondSessionClose"]>(async () => ok(undefined)),
  saveDocument: vi.fn<Window["api"]["saveDocument"]>(
    async () => ok({ name: "saved.md", version: 0 }),
  ),
  sendChanges: vi.fn(),
};

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: api as unknown as Window["api"],
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  api.openFile.mockResolvedValue(ok(null));
  api.readDocument.mockResolvedValue(failure);
  api.chooseSaveTarget.mockResolvedValue(ok(null));
  api.saveDocument.mockResolvedValue(ok({ name: "saved.md", version: 0 }));
  api.loadSession.mockResolvedValue(ok({ documents: [] }));
  api.listDrafts.mockResolvedValue(ok({ drafts: [] }));
});

function record(input: {
  path?: string | null;
  grant?: string | null;
  name?: string | null;
  saved?: string;
  text?: string;
} = {}): DocumentRecord {
  const saved = input.saved ?? "saved";
  return createDocumentRecord({
    canonicalPath: input.path ?? null,
    grant: input.grant ?? null,
    name: input.name ?? null,
    replication: new DocumentReplication(),
    savedText: Text.of(saved.split("\n")),
    state: EditorState.create({ doc: input.text ?? saved }),
  });
}

function fixture(initial: readonly DocumentRecord[] = []) {
  const registry = new DocumentRegistry();
  for (const item of initial) registry.add(item);
  let active = initial[0] ?? null;
  const activate = vi.fn((item: DocumentRecord) => {
    active = item;
  });
  const remove = vi.fn((item: DocumentRecord) => {
    registry.remove(item.id);
    if (active === item) active = null;
  });
  const host = document.createElement("div");
  const message = document.createElement("p");
  host.append(message);
  for (const action of ["cancel", "discard", "save"] as const) {
    const button = document.createElement("button");
    button.dataset["action"] = action;
    host.append(button);
  }
  document.body.replaceChildren(host);
  const newDocument = vi.fn((input: {
    canonicalPath: string | null;
    grant: string | null;
    name: string | null;
    savedText: string;
    text: string;
  }) => {
    const item = record({
      path: input.canonicalPath,
      grant: input.grant,
      name: input.name,
      saved: input.savedText,
      text: input.text,
    });
    registry.add(item);
    return item;
  });
  const options = {
    active: () => active,
    activate,
    drafts: new DraftScheduler({ onDraft: vi.fn() }),
    flushDirty: vi.fn(),
    newDocument,
    prompt: new DocumentClosePrompt(host, message),
    registry,
    remove,
    removePristineUntitled: vi.fn(),
    showStatus: vi.fn(),
    syncDirty: vi.fn(),
  };
  return { host, options, registry };
}

describe("document lifecycle", () => {
  it("AC-R4-02: opens a file and focuses a path that is already open", async () => {
    const existing = record({ path: "/one.md", grant: "old", name: "one.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const first = fixture([existing]);
    const lifecycle = new DocumentLifecycle(first.options);
    api.openFile.mockResolvedValue(ok({ canonicalPath: "/two.md", grant: "two", name: "two.md" }));
    api.readDocument.mockResolvedValue(ok({ canonicalPath: "/two.md", name: "two.md", text: "two" }));

    await lifecycle.open();
    await lifecycle.openReference({ canonicalPath: "/one.md", grant: "duplicate", name: "one.md" });

    expect(first.registry.findByPath("/two.md")?.state.doc.toString()).toBe("two");
    expect(first.options.activate).toHaveBeenLastCalledWith(existing);
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "duplicate" });
  });

  it("AC-R5-13: a failed open keeps the current document", async () => {
    const current = record({ path: "/one.md", grant: "one", name: "one.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([current]);
    const lifecycle = new DocumentLifecycle(context.options);

    await lifecycle.openReference({ canonicalPath: "/bad.md", grant: "bad", name: "bad.md" });

    expect(context.registry.all()).toEqual([current]);
    expect(context.options.activate).not.toHaveBeenCalled();
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "bad" });
  });

  it("AC-R4-04 AC-R4-05: closes clean and dirty tabs only after the selected answer", async () => {
    const clean = record({ name: "clean.md" });
    const dirty = record({ name: "dirty.md", text: "changed" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([clean, dirty]);
    const lifecycle = new DocumentLifecycle(context.options);

    await lifecycle.closeTab(clean);
    const cancelled = lifecycle.closeTab(dirty);
    context.host.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
    await cancelled;
    const discarded = lifecycle.closeTab(dirty);
    context.host.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    await discarded;

    expect(context.options.remove.mock.calls.map(([item]) => item)).toEqual([clean, dirty]);
  });

  it("AC-R4-08: snapshots and restores saved and unsaved session text", async () => {
    const stored = record({ grant: "one", name: "one.md", saved: "saved", text: "changed" });
    const { DocumentLifecycle, sessionSnapshot } = await import(
      "../../src/renderer/tabs/documentLifecycle"
    );
    expect(sessionSnapshot([stored])).toEqual([{
      grant: "one", name: "one.md", savedText: "saved", text: "changed",
    }]);
    const context = fixture();
    api.loadSession.mockResolvedValue(ok({ documents: sessionSnapshot([stored]) }));
    api.readDocument.mockResolvedValue(ok({ canonicalPath: "/one.md", name: "one.md", text: "disk" }));

    await new DocumentLifecycle(context.options).restoreSession();

    expect(context.registry.findByPath("/one.md")?.state.doc.toString()).toBe("changed");
    expect(context.registry.findByPath("/one.md")?.saved.text.toString()).toBe("saved");
  });

  it("AC-R4-08: restore releases grants for unreadable and already open documents", async () => {
    const open = record({ path: "/open.md", grant: "open", name: "open.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([open]);
    api.loadSession.mockResolvedValue(ok({ documents: [
      { grant: "bad", name: "bad.md", savedText: "bad", text: "bad" },
      { grant: "duplicate", name: "open.md", savedText: "open", text: "open" },
      { grant: "fresh", name: "fresh.md", savedText: "fresh", text: "fresh" },
    ] }));
    api.readDocument.mockImplementation(async (grant) => grant === "bad"
      ? failure
      : ok({
        canonicalPath: grant === "duplicate" ? "/open.md" : "/fresh.md",
        name: `${grant}.md`,
        text: "disk",
      }));

    await new DocumentLifecycle(context.options).restoreSession();

    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "bad" });
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "duplicate" });
    expect(api.releaseDocument).not.toHaveBeenCalledWith({ grant: "fresh" });
    expect(context.registry.findByPath("/fresh.md")).toBeDefined();
  });

  it("AC-R4-02: an open request uses the same open path", async () => {
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture();
    api.readDocument.mockResolvedValue(ok({
      canonicalPath: "/request.md", name: "request.md", text: "request",
    }));

    new DocumentLifecycle(context.options).handleOpenRequest(ok({
      canonicalPath: "/request.md", grant: "request", name: "request.md",
    }));
    await vi.waitFor(() => {
      expect(context.registry.findByPath("/request.md")).toBeDefined();
    });
  });

  it("AC-R4-06: session close cancels or saves every dirty document", async () => {
    const first = record({ grant: "one", name: "one.md", text: "changed one" });
    const second = record({ grant: "two", name: "two.md", text: "changed two" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first, second]);
    const lifecycle = new DocumentLifecycle(context.options);

    const cancelled = lifecycle.handleSessionClose({ id: 3 });
    context.host.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click();
    await cancelled;
    expect(api.respondSessionClose).toHaveBeenLastCalledWith({
      allow: false, documents: [], id: 3,
    });

    const saved = lifecycle.handleSessionClose({ id: 4 });
    context.host.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await saved;
    expect(api.saveDocument).toHaveBeenCalledTimes(2);
    expect(api.respondSessionClose).toHaveBeenLastCalledWith({
      allow: true,
      documents: expect.arrayContaining([
        expect.objectContaining({ grant: "one" }),
        expect.objectContaining({ grant: "two" }),
      ]),
      id: 4,
    });
  });

  it("AC-R4-07: recovers untitled and file drafts", async () => {
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture();
    api.listDrafts.mockResolvedValue(ok({ drafts: [
      { docId: "draft-one", grant: null, text: "untitled draft" },
      { docId: "draft-two", grant: "two", text: "file draft" },
    ] }));
    api.readDocument.mockResolvedValue(ok({
      canonicalPath: "/two.md", name: "two.md", text: "saved file",
    }));

    await expect(new DocumentLifecycle(context.options).recover()).resolves.toBe(true);

    expect(context.registry.all().map((item) => item.state.doc.toString()))
      .toEqual(["untitled draft", "file draft"]);
    expect(context.options.showStatus).toHaveBeenCalledTimes(2);
  });

  it("AC-R4-07: drafts only dirty documents and reports boundary failures", async () => {
    const dirty = record({ grant: "one", name: "one.md", text: "changed" });
    const clean = record({ grant: "two", name: "two.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([dirty, clean]);
    const lifecycle = new DocumentLifecycle(context.options);
    api.draftDocument.mockResolvedValueOnce(failure);

    lifecycle.sendDraft(clean.id);
    lifecycle.sendDraft("missing");
    lifecycle.sendDraft(dirty.id);
    await vi.waitFor(() => {
      expect(context.options.showStatus).toHaveBeenCalled();
    });

    expect(api.draftDocument).toHaveBeenCalledOnce();
  });

  it("AC-R5-16: unexpected open, save and draft failures report status", async () => {
    const dirty = record({ grant: "one", name: "one.md", text: "changed" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([dirty]);
    const lifecycle = new DocumentLifecycle(context.options);
    api.openFile.mockRejectedValueOnce(new Error("open stopped"));
    await lifecycle.open();
    api.saveDocument.mockRejectedValueOnce(new Error("save stopped"));
    await expect(lifecycle.save(dirty, false)).resolves.toBe(false);
    api.draftDocument.mockRejectedValueOnce(new Error("draft stopped"));
    lifecycle.sendDraft(dirty.id);
    await vi.waitFor(() => {
      expect(context.options.showStatus).toHaveBeenCalledWith("draft stopped");
    });

    expect(context.options.showStatus).toHaveBeenCalledWith("open stopped");
    expect(context.options.showStatus).toHaveBeenCalledWith("save stopped");
  });

  it("AC-R4-08: empty and failed recovery inputs change no documents", async () => {
    const clean = record({ grant: "one", name: "one.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([clean]);
    const lifecycle = new DocumentLifecycle(context.options);

    await lifecycle.handleSessionClose({ id: 5 });
    api.listDrafts.mockResolvedValue(failure);
    await expect(lifecycle.recover()).resolves.toBe(false);
    api.loadSession.mockResolvedValue(failure);
    await lifecycle.restoreSession();

    expect(api.respondSessionClose).toHaveBeenCalledWith({
      allow: true,
      documents: [{ grant: "one", name: "one.md", savedText: "saved", text: "saved" }],
      id: 5,
    });
    expect(context.registry.all()).toEqual([clean]);
  });

  it("AC-R4-02: a path race focuses the winner and releases the extra grant", async () => {
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture();
    const winner = record({ path: "/race.md", grant: "winner", name: "race.md" });
    api.readDocument.mockImplementationOnce(async () => {
      context.registry.add(winner);
      return ok({ canonicalPath: "/race.md", name: "race.md", text: "race" });
    });

    await new DocumentLifecycle(context.options).openReference({
      canonicalPath: "/not-indexed-yet.md", grant: "extra", name: "race.md",
    });

    expect(context.options.activate).toHaveBeenCalledWith(winner);
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "extra" });
  });

});
