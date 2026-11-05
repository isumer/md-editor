import { ChangeSet, Text } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";

import {
  DocumentReplication,
  saveReplicatedDocument,
} from "../../src/renderer/core/replication";

describe("renderer document replication", () => {
  it("AC-PERF-04: a one-character edit of 20 MB sends less than one KiB", () => {
    const document = Text.of(["x".repeat(20 * 1024 * 1024)]);
    const changes = ChangeSet.of({ from: document.length, insert: "!" }, document.length);
    const replication = new DocumentReplication();

    const message = replication.changed(changes);

    expect(JSON.stringify(message).length).toBeLessThan(1024);
    expect(message).not.toHaveProperty("text");
  });

  it("AC-R5-19: loading starts a new document epoch and edits advance its version", () => {
    const replication = new DocumentReplication();
    const initial = replication.current();
    const firstChange = ChangeSet.of({ from: 0, insert: "a" }, 0);

    expect(replication.changed(firstChange)).toMatchObject({
      docId: initial.docId,
      epoch: initial.epoch,
      fromVersion: 0,
      toVersion: 1,
    });
    const replacement = replication.replace();

    expect(replacement.detachedDocId).toBe(initial.docId);
    expect(replacement.current.docId).not.toBe(initial.docId);
    expect(replacement.current.epoch).toBeGreaterThan(initial.epoch);
    expect(replacement.current.version).toBe(0);
  });

  it("AC-R5-19: OUT_OF_SYNC attaches the saved text and retries once", async () => {
    const document = Text.of(["edited"]);
    const save = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "OUT_OF_SYNC",
          messageKey: "file.outOfSync",
          params: {},
          retryable: true,
        },
      })
      .mockResolvedValueOnce({ ok: true, value: { name: "note.md", version: 3 } });
    const attach = vi.fn().mockResolvedValue({ ok: true, value: undefined });

    const result = await saveReplicatedDocument({
      grant: "grant",
      document,
      version: { docId: "doc", epoch: 2, version: 3 },
      attach,
      save,
    });

    expect(result).toEqual({ ok: true, value: { name: "note.md", version: 3 } });
    expect(save).toHaveBeenCalledTimes(2);
    expect(attach).toHaveBeenCalledOnce();
    expect(attach).toHaveBeenCalledWith({
      docId: "doc",
      epoch: 2,
      version: 3,
      text: "edited",
    });
  });

  it("AC-R5-19: a second OUT_OF_SYNC is returned without a third save", async () => {
    const failure = {
      ok: false as const,
      error: {
        code: "OUT_OF_SYNC",
        messageKey: "file.outOfSync",
        params: {},
        retryable: true,
      },
    };
    const save = vi.fn().mockResolvedValue(failure);
    const attach = vi.fn().mockResolvedValue({ ok: true, value: undefined });

    const result = await saveReplicatedDocument({
      grant: "grant",
      document: Text.empty,
      version: { docId: "doc", epoch: 0, version: 0 },
      attach,
      save,
    });

    expect(result).toEqual(failure);
    expect(save).toHaveBeenCalledTimes(2);
    expect(attach).toHaveBeenCalledOnce();
  });

  it("AC-R5-19: a successful first save does not attach a snapshot", async () => {
    const success = { ok: true as const, value: { name: "note.md", version: 0 } };
    const save = vi.fn().mockResolvedValue(success);
    const attach = vi.fn();

    const result = await saveReplicatedDocument({
      grant: "grant",
      document: Text.empty,
      version: { docId: "doc", epoch: 0, version: 0 },
      attach,
      save,
    });

    expect(result).toEqual(success);
    expect(save).toHaveBeenCalledOnce();
    expect(attach).not.toHaveBeenCalled();
  });

  it("AC-R5-19: a failed resync attach is returned without retrying save", async () => {
    const outOfSync = {
      ok: false as const,
      error: { code: "OUT_OF_SYNC", messageKey: "file.outOfSync", params: {}, retryable: true },
    };
    const attachFailure = {
      ok: false as const,
      error: { code: "BAD_REQUEST", messageKey: "request.invalid", params: {}, retryable: false },
    };
    const save = vi.fn().mockResolvedValue(outOfSync);
    const attach = vi.fn().mockResolvedValue(attachFailure);

    const result = await saveReplicatedDocument({
      grant: "grant",
      document: Text.empty,
      version: { docId: "doc", epoch: 0, version: 0 },
      attach,
      save,
    });

    expect(result).toEqual(attachFailure);
    expect(save).toHaveBeenCalledOnce();
    expect(attach).toHaveBeenCalledOnce();
  });
});
