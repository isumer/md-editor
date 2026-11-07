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
