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
  listDrafts: vi.fn<Window["api"]["listDrafts"]>(async () => ok({ drafts: [] })),
  readDocument: vi.fn<Window["api"]["readDocument"]>(async () => failure),
  releaseDocument: vi.fn(async () => ok(undefined)),
  saveDocument: vi.fn<Window["api"]["saveDocument"]>(
    async () => ok({ name: "saved.md", version: 0 }),
  ),
};

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: api as unknown as Window["api"],
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  api.chooseSaveTarget.mockResolvedValue(ok(null));
  api.listDrafts.mockResolvedValue(ok({ drafts: [] }));
  api.readDocument.mockResolvedValue(failure);
  api.saveDocument.mockResolvedValue(ok({ name: "saved.md", version: 0 }));
});

function record(input: {
  path?: string | null;
  grant?: string | null;
  name?: string | null;
  text?: string;
}): DocumentRecord {
  return createDocumentRecord({
    canonicalPath: input.path ?? null,
    grant: input.grant ?? null,
    name: input.name ?? null,
    replication: new DocumentReplication(),
    savedText: Text.of(["saved"]),
    state: EditorState.create({ doc: input.text ?? "saved" }),
  });
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve = (_value: T): void => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function fixture(initial: readonly DocumentRecord[]) {
  const registry = new DocumentRegistry();
  for (const item of initial) registry.add(item);
  let active = initial[0] ?? null;
  const host = document.createElement("div");
  const message = document.createElement("p");
  host.append(message);
  for (const action of ["cancel", "discard", "save"] as const) {
    const button = document.createElement("button");
    button.dataset["action"] = action;
    host.append(button);
  }
  document.body.replaceChildren(host);
  const options = {
    active: () => active,
    activate: vi.fn((item: DocumentRecord) => {
      active = item;
    }),
    drafts: new DraftScheduler({ onDraft: vi.fn() }),
    flushDirty: vi.fn(),
    newDocument: vi.fn(),
    prompt: new DocumentClosePrompt(host, message),
    registry,
    remove: vi.fn(),
    removePristineUntitled: vi.fn(),
    showStatus: vi.fn(),
    syncDirty: vi.fn(),
  };
  return { host, options, registry };
}

describe("document lifecycle saves", () => {
  it("AC-R5-02 AC-R5-10: save marks snapshots and save-as adopts the new path", async () => {
    const current = record({ path: "/old.md", grant: "old", name: "old.md", text: "changed" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([current]);
    const lifecycle = new DocumentLifecycle(context.options);
    api.saveDocument.mockResolvedValue(ok({ name: "old.md", version: 0 }));

    await expect(lifecycle.save(current, false)).resolves.toBe(true);
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/new.md", grant: "new", name: "new.md",
    }));
    api.saveDocument.mockResolvedValue(ok({ name: "new.md", version: 0 }));
    await expect(lifecycle.save(current, true)).resolves.toBe(true);

    expect(current).toMatchObject({ canonicalPath: "/new.md", grant: "new", name: "new.md" });
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "old" });
  });

  it("AC-R4-02: save-as refuses a path that another open document owns", async () => {
    const first = record({
      path: "/first.md", grant: "first", name: "first.md", text: "changed first",
    });
    const second = record({ path: "/second.md", grant: "second", name: "second.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first, second]);
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/second.md", grant: "target", name: "second.md",
    }));

    await expect(new DocumentLifecycle(context.options).save(first, true)).resolves.toBe(false);

    expect(api.saveDocument).not.toHaveBeenCalled();
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "target" });
    expect(context.registry.findByPath("/first.md")).toBe(first);
    expect(context.registry.findByPath("/second.md")).toBe(second);
    expect(first).toMatchObject({
      canonicalPath: "/first.md", dirty: true, grant: "first", name: "first.md",
    });
    expect(second).toMatchObject({
      canonicalPath: "/second.md", dirty: false, grant: "second", name: "second.md",
    });
    expect(context.options.active()).toBe(first);
    expect(context.options.activate).not.toHaveBeenCalled();
    expect(context.options.showStatus).toHaveBeenCalledWith(
      "second.md is open in another tab. Close it first or choose another name.",
    );
  });

  it("AC-R4-02: concurrent save-as calls reserve the target path", async () => {
    const first = record({ path: "/first.md", grant: "first", name: "first.md" });
    const second = record({ path: "/second.md", grant: "second", name: "second.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first, second]);
    const lifecycle = new DocumentLifecycle(context.options);
    const write = deferred<Awaited<ReturnType<Window["api"]["saveDocument"]>>>();
    api.chooseSaveTarget
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-a", name: "race.md" }))
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-b", name: "race.md" }));
    api.saveDocument.mockImplementationOnce(() => write.promise);

    const firstSave = lifecycle.save(first, true);
    await vi.waitFor(() => {
      expect(api.saveDocument).toHaveBeenCalledOnce();
    });
    await expect(lifecycle.save(second, true)).resolves.toBe(false);

    expect(api.saveDocument).toHaveBeenCalledOnce();
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "race-b" });
    expect(second).toMatchObject({
      canonicalPath: "/second.md", grant: "second", name: "second.md",
    });
    expect(context.options.showStatus).toHaveBeenCalledWith(
      "Could not save “race.md”: another tab is saving it. Try again.",
    );
    write.resolve(ok({ name: "race.md", version: 0 }));
    await expect(firstSave).resolves.toBe(true);
    expect(context.registry.findByPath("/race.md")).toBe(first);
    expect(context.registry.findByPath("/first.md")).toBeUndefined();
    expect(context.registry.findByPath("/second.md")).toBe(second);
  });

  it("AC-R4-02: open during save-as releases its grant and creates no duplicate", async () => {
    const first = record({ path: "/first.md", grant: "first", name: "first.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first]);
    const lifecycle = new DocumentLifecycle(context.options);
    const write = deferred<Awaited<ReturnType<Window["api"]["saveDocument"]>>>();
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/race.md", grant: "race-a", name: "race.md",
    }));
    api.saveDocument.mockImplementationOnce(() => write.promise);
    api.readDocument.mockResolvedValue(ok({
      canonicalPath: "/race.md", name: "race.md", text: "on disk",
    }));

    const saving = lifecycle.save(first, true);
    await vi.waitFor(() => expect(api.saveDocument).toHaveBeenCalledOnce());
    await lifecycle.openReference({ canonicalPath: "/race.md", grant: "open", name: "race.md" });

    expect(context.options.newDocument).not.toHaveBeenCalled();
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "open" });
    expect(context.options.showStatus).toHaveBeenCalledWith(
      "Could not open “race.md”: another tab is saving it. Try again.",
    );
    expect(context.registry.findByPath("/race.md")).toBeUndefined();
    write.resolve(ok({ name: "race.md", version: 0 }));
    await expect(saving).resolves.toBe(true);
    expect(context.registry.findByPath("/race.md")).toBe(first);
    expect(context.registry.all().filter((item) => item.canonicalPath === "/race.md"))
      .toEqual([first]);
  });

  it("AC-R4-02: open of another path succeeds during save-as", async () => {
    const first = record({ path: "/first.md", grant: "first", name: "first.md" });
    const opened = record({ path: "/other.md", grant: "open", name: "other.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first]);
    const lifecycle = new DocumentLifecycle(context.options);
    const write = deferred<Awaited<ReturnType<Window["api"]["saveDocument"]>>>();
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/race.md", grant: "race-a", name: "race.md",
    }));
    api.saveDocument.mockImplementationOnce(() => write.promise);
    api.readDocument.mockResolvedValue(ok({
      canonicalPath: "/other.md", name: "other.md", text: "other",
    }));
    context.options.newDocument.mockReturnValue(opened);

    const saving = lifecycle.save(first, true);
    await vi.waitFor(() => expect(api.saveDocument).toHaveBeenCalledOnce());
    await lifecycle.openReference({ canonicalPath: "/other.md", grant: "open", name: "other.md" });

    expect(context.options.newDocument).toHaveBeenCalledOnce();
    expect(context.options.activate).toHaveBeenCalledWith(opened);
    write.resolve(ok({ name: "race.md", version: 0 }));
    await saving;
  });

  it("AC-R4-02: recovery during save-as releases its grant and creates no duplicate", async () => {
    const first = record({ path: "/first.md", grant: "first", name: "first.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first]);
    const lifecycle = new DocumentLifecycle(context.options);
    const write = deferred<Awaited<ReturnType<Window["api"]["saveDocument"]>>>();
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/race.md", grant: "race-a", name: "race.md",
    }));
    api.saveDocument.mockImplementationOnce(() => write.promise);
    api.listDrafts.mockResolvedValue(ok({
      drafts: [{ docId: "draft", grant: "draft", text: "recovered" }],
    }));
    api.readDocument.mockResolvedValue(ok({
      canonicalPath: "/race.md", name: "race.md", text: "on disk",
    }));

    const saving = lifecycle.save(first, true);
    await vi.waitFor(() => expect(api.saveDocument).toHaveBeenCalledOnce());
    await expect(lifecycle.recover()).resolves.toBe(false);

    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "draft" });
    expect(context.options.newDocument).not.toHaveBeenCalled();
    expect(context.registry.findByPath("/race.md")).toBeUndefined();
    write.resolve(ok({ name: "race.md", version: 0 }));
    await saving;
    expect(context.registry.all().filter((item) => item.canonicalPath === "/race.md"))
      .toEqual([first]);
  });

  it("AC-R4-02: a failed save-as releases its target path reservation", async () => {
    const first = record({ path: "/first.md", grant: "first", name: "first.md" });
    const second = record({ path: "/second.md", grant: "second", name: "second.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first, second]);
    const lifecycle = new DocumentLifecycle(context.options);
    api.chooseSaveTarget
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-a", name: "race.md" }))
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-b", name: "race.md" }));
    api.saveDocument
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(ok({ name: "race.md", version: 0 }));

    await expect(lifecycle.save(first, true)).resolves.toBe(false);
    await expect(lifecycle.save(second, true)).resolves.toBe(true);

    expect(api.saveDocument).toHaveBeenCalledTimes(2);
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "race-a" });
    expect(context.registry.findByPath("/race.md")).toBe(second);
  });

  it("AC-R4-02: a rejected save-as releases its target path reservation", async () => {
    const first = record({ path: "/first.md", grant: "first", name: "first.md" });
    const second = record({ path: "/second.md", grant: "second", name: "second.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first, second]);
    const lifecycle = new DocumentLifecycle(context.options);
    api.chooseSaveTarget
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-a", name: "race.md" }))
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-b", name: "race.md" }));
    api.saveDocument
      .mockRejectedValueOnce(new Error("save stopped"))
      .mockResolvedValueOnce(ok({ name: "race.md", version: 0 }));

    await expect(lifecycle.save(first, true)).resolves.toBe(false);
    await expect(lifecycle.save(second, true)).resolves.toBe(true);

    expect(api.saveDocument).toHaveBeenCalledTimes(2);
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "race-a" });
    expect(context.registry.findByPath("/race.md")).toBe(second);
  });

  it("AC-R4-02: a successful save-as releases its target path reservation", async () => {
    const first = record({ path: "/first.md", grant: "first", name: "first.md" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([first]);
    const lifecycle = new DocumentLifecycle(context.options);
    api.chooseSaveTarget
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-a", name: "race.md" }))
      .mockResolvedValueOnce(ok({ canonicalPath: "/race.md", grant: "race-b", name: "race.md" }));
    api.saveDocument.mockResolvedValue(ok({ name: "race.md", version: 0 }));

    await expect(lifecycle.save(first, true)).resolves.toBe(true);
    await expect(lifecycle.save(first, true)).resolves.toBe(true);

    expect(api.saveDocument).toHaveBeenCalledTimes(2);
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "race-a" });
    expect(context.registry.findByPath("/race.md")).toBe(first);
  });

  it("AC-R5-10: save-as permits the current document's own path", async () => {
    const current = record({ path: "/same.md", grant: "old", name: "same.md", text: "changed" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([current]);
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/same.md", grant: "new", name: "same.md",
    }));

    await expect(new DocumentLifecycle(context.options).save(current, true)).resolves.toBe(true);

    expect(api.saveDocument).toHaveBeenCalledOnce();
    expect(current.grant).toBe("new");
  });

  it("AC-R5-03: a failed save-as releases its new grant and keeps the old path", async () => {
    const current = record({ path: "/old.md", grant: "old", name: "old.md", text: "changed" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([current]);
    api.chooseSaveTarget.mockResolvedValue(ok({
      canonicalPath: "/new.md", grant: "new", name: "new.md",
    }));
    api.saveDocument.mockResolvedValue(failure);

    await expect(new DocumentLifecycle(context.options).save(current, true)).resolves.toBe(false);

    expect(current.canonicalPath).toBe("/old.md");
    expect(api.releaseDocument).toHaveBeenCalledWith({ grant: "new" });
  });

  it("AC-R5-03: active save failures keep a dirty tab open", async () => {
    const dirty = record({ grant: "one", name: "one.md", text: "changed" });
    const { DocumentLifecycle } = await import("../../src/renderer/tabs/documentLifecycle");
    const context = fixture([dirty]);
    const lifecycle = new DocumentLifecycle(context.options);
    await lifecycle.saveActive(false);
    dirty.state = EditorState.create({ doc: "changed again" });
    dirty.dirty = true;
    api.saveDocument.mockResolvedValue(failure);

    const closing = lifecycle.closeTab(dirty);
    context.host.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
    await closing;

    expect(context.options.remove).not.toHaveBeenCalled();
    expect(api.saveDocument).toHaveBeenCalledTimes(2);
  });
});
