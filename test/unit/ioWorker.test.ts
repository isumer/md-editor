import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ChangeSet, Text } from "@codemirror/state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IoGrantTable } from "../../src/io-worker/grants";
import {
  attachIoPort,
  IoPortRegistry,
  type IoWorkerPort,
} from "../../src/io-worker/port";
import { IoFileService } from "../../src/io-worker/services/file";

class FakePort implements IoWorkerPort {
  readonly replies: unknown[] = [];
  closed = false;
  private listener: ((event: { data: unknown }) => void) | undefined;
  on(_event: "message", listener: (event: { data: unknown }) => void): this {
    this.listener = listener;
    return this;
  }
  postMessage(message: unknown): void {
    this.replies.push(message);
  }

  start(): void {}
  close(): void {
    this.closed = true;
  }
  send(message: unknown): void {
    this.listener?.({ data: message });
  }
}

let temporaryDirectory: string;
let targetPath: string;

beforeEach(async () => {
  temporaryDirectory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-io-worker-")),
  );
  targetPath = path.join(temporaryDirectory, "protected.md");
  await fs.writeFile(targetPath, "original", "utf8");
});

afterEach(async () => {
  await fs.chmod(targetPath, 0o600).catch(() => undefined);
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

async function waitForReplies(port: FakePort, count: number): Promise<void> {
  await expect.poll(() => port.replies.length).toBe(count);
}

function attach(port: FakePort, id = "attach", docId = "doc", text = "original"): void {
  port.send({ id, op: "attach", docId, epoch: 0, version: 0, text });
}

function save(port: FakePort, id: string, grant = "valid", version = 0): void {
  port.send({ id, op: "save", grant, docId: "doc", epoch: 0, version });
}

function serviceWithGrant(windowId = 1): IoFileService {
  const grants = new IoGrantTable();
  grants.register(windowId, "valid", targetPath);
  return new IoFileService(grants);
}

describe("io-worker port boundary", () => {
  it("AC-SEC-12: refuses malformed saves and unowned grants without writing", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    const port = new FakePort();
    grants.register(1, "valid", targetPath);
    grants.register(2, "other-window", targetPath);
    grants.register(1, "revoked", targetPath);
    grants.revoke(1, "revoked");
    attachIoPort(port, 1, service);
    attach(port);
    await waitForReplies(port, 1);
    port.replies.length = 0;

    const requests = [
      { id: "raw", op: "save", grant: targetPath, docId: "doc", epoch: 0, version: 0 },
      { id: "unknown", op: "save", grant: "unknown", docId: "doc", epoch: 0, version: 0 },
      { id: "revoked", op: "save", grant: "revoked", docId: "doc", epoch: 0, version: 0 },
      { id: "other", op: "save", grant: "other-window", docId: "doc", epoch: 0, version: 0 },
      {
        id: "extra",
        op: "save",
        grant: "valid",
        docId: "doc",
        epoch: 0,
        version: 0,
        text: "forbidden",
      },
      { id: "wrong", op: "save", grant: "valid", docId: "doc", epoch: 0, version: 0.5 },
    ];
    for (const request of requests) {
      port.send(request);
    }
    await waitForReplies(port, requests.length);

    for (const reply of port.replies) {
      const value = reply as { id: string; result: { error: { code: string } } };
      const badRequest = value.id === "extra" || value.id === "wrong";
      expect(value.result.error.code).toBe(badRequest ? "BAD_REQUEST" : "GRANT_INVALID");
    }
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
  });

  it("AC-SEC-13: drops hostile changes and still answers the next valid save", async () => {
    const port = new FakePort();
    attachIoPort(port, 1, serviceWithGrant());
    attach(port);
    await waitForReplies(port, 1);
    const ownProto = {
      op: "change",
      docId: "doc",
      epoch: 0,
      fromVersion: 0,
      toVersion: 1,
      changes: [],
    };
    Object.defineProperty(ownProto, "__proto__", {
      enumerable: true,
      value: { polluted: true },
    });

    for (const message of [
      { ...ownProto, extra: true },
      ownProto,
      { op: "change", docId: "doc", epoch: -1, fromVersion: 0, toVersion: 1, changes: [] },
      { op: "change", docId: "doc", epoch: 0, fromVersion: 0, toVersion: 2, changes: [] },
      { op: "change", docId: "doc", epoch: 0, fromVersion: 0, toVersion: 1,
        changes: [[1, 2]] },
    ]) {
      port.send(message);
    }
    save(port, "save");
    await waitForReplies(port, 2);

    expect(port.replies[1]).toEqual({
      id: "save",
      result: { ok: true, value: { name: "protected.md", version: 0 } },
    });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
  });

  it("AC-SEC-13: an inapplicable change requires an attach before saving", async () => {
    const port = new FakePort();
    attachIoPort(port, 1, serviceWithGrant());
    attach(port);
    await waitForReplies(port, 1);

    port.send({
      op: "change",
      docId: "doc",
      epoch: 0,
      fromVersion: 0,
      toVersion: 1,
      changes: [99],
    });
    save(port, "stale", "valid", 1);
    await waitForReplies(port, 2);
    expect(port.replies[1]).toMatchObject({
      id: "stale",
      result: { ok: false, error: { code: "OUT_OF_SYNC" } },
    });

    port.send({ id: "resync", op: "attach", docId: "doc", epoch: 0, version: 1,
      text: "resynced" });
    save(port, "valid", "valid", 1);
    await waitForReplies(port, 4);
    expect(port.replies[3]).toMatchObject({ id: "valid", result: { ok: true } });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("resynced");
  });

  it("AC-SEC-13: another window cannot save a document mirror it does not own", async () => {
    const grants = new IoGrantTable();
    grants.register(1, "first", targetPath);
    grants.register(2, "second", targetPath);
    const service = new IoFileService(grants);
    const first = new FakePort();
    const second = new FakePort();
    attachIoPort(first, 1, service);
    attachIoPort(second, 2, service);
    first.send({
      id: "attach-private",
      op: "attach",
      docId: "private-doc",
      epoch: 0,
      version: 0,
      text: "window one",
    });
    await waitForReplies(first, 1);

    second.send({
      id: "foreign-save",
      op: "save",
      grant: "second",
      docId: "private-doc",
      epoch: 0,
      version: 0,
    });
    await waitForReplies(second, 1);

    expect(second.replies[0]).toMatchObject({
      result: { ok: false, error: { code: "OUT_OF_SYNC" } },
    });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
  });

  it("AC-SEC-13: refuses a sixty-fifth attached document and remains responsive", async () => {
    const port = new FakePort();
    attachIoPort(port, 1, serviceWithGrant());
    for (let index = 0; index < 65; index += 1) {
      attach(port, `attach-${index}`, `doc-${index}`, "");
    }
    await waitForReplies(port, 65);

    expect(port.replies[64]).toMatchObject({
      id: "attach-64",
      result: { ok: false, error: { code: "BAD_REQUEST" } },
    });
    port.send({
      op: "change",
      docId: "overflow",
      epoch: 0,
      fromVersion: 0,
      toVersion: 1,
      changes: [],
    });
    port.send({ id: "read", op: "read", grant: "valid" });
    await waitForReplies(port, 66);
    expect(port.replies[65]).toMatchObject({ id: "read", result: { ok: true } });
  });

  it("AC-SEC-12: drops invalid input without a usable correlation id", async () => {
    const port = new FakePort();
    attachIoPort(port, 1, new IoFileService(new IoGrantTable()));

    port.send({ op: "read", grant: "unknown" });
    await Promise.resolve();

    expect(port.replies).toEqual([]);
  });

  it("AC-SEC-13: changes before attach are dropped and detach removes the mirror", async () => {
    const port = new FakePort();
    attachIoPort(port, 1, serviceWithGrant());
    port.send({
      op: "change",
      docId: "doc",
      epoch: 0,
      fromVersion: 0,
      toVersion: 1,
      changes: [],
    });
    attach(port);
    await waitForReplies(port, 1);
    attach(port, "attach-other", "other", "other");
    await waitForReplies(port, 2);

    port.send({ op: "detach", docId: "doc" });
    save(port, "detached");
    await waitForReplies(port, 3);

    expect(port.replies[2]).toMatchObject({
      result: { ok: false, error: { code: "OUT_OF_SYNC" } },
    });
    port.send({ op: "detach", docId: "other" });
    await Promise.resolve();
  });
});

describe("io-worker save by version", () => {
  it("AC-R5-18: a save snapshots v1 before a same-tick change to v2", async () => {
    const initial = Text.of(["original"]);
    const first = ChangeSet.of({ from: initial.length, insert: " v1" }, initial.length);
    const atVersionOne = first.apply(initial);
    const second = ChangeSet.of({ from: atVersionOne.length, insert: " v2" }, atVersionOne.length);
    const port = new FakePort();
    attachIoPort(port, 1, serviceWithGrant());
    attach(port);
    port.send({ op: "change", docId: "doc", epoch: 0, fromVersion: 0, toVersion: 1,
      changes: first.toJSON() });
    save(port, "save", "valid", 1);
    port.send({ op: "change", docId: "doc", epoch: 0, fromVersion: 1, toVersion: 2,
      changes: second.toJSON() });
    await waitForReplies(port, 2);

    expect(port.replies[1]).toEqual({
      id: "save",
      result: { ok: true, value: { name: "protected.md", version: 1 } },
    });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original v1");
  });

  it("AC-SEC-13: replacing or revoking a window port drops its mirrors", async () => {
    const service = serviceWithGrant();
    const registry = new IoPortRegistry(service);
    const first = new FakePort();
    const replacement = new FakePort();
    registry.attach(1, first);
    attach(first);
    await waitForReplies(first, 1);

    registry.attach(1, replacement);
    save(replacement, "lost");
    await waitForReplies(replacement, 1);
    expect(first.closed).toBe(true);
    expect(replacement.replies[0]).toMatchObject({
      result: { ok: false, error: { code: "OUT_OF_SYNC" } },
    });

    attach(replacement, "again");
    await waitForReplies(replacement, 2);
    registry.revokeWindow(1);
    expect(replacement.closed).toBe(true);
  });
});

describe("io-worker file service", () => {
  it("AC-SEC-07: registers canonical existing and missing save targets", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    const missingPath = path.join(temporaryDirectory, "new.md");

    await expect(service.registerGrant(1, "existing", targetPath, true))
      .resolves.toEqual({ canonicalPath: targetPath, name: "protected.md" });
    await expect(service.registerGrant(1, "missing", missingPath, false))
      .resolves.toEqual({ canonicalPath: missingPath, name: "new.md" });
    await expect(service.registerGrant(1, "refused", missingPath, true))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("AC-SEC-16 AC-SEC-17: resolves a document asset from its own folder only", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    const folder = path.join(temporaryDirectory, "documents");
    const imagePath = path.join(folder, "pic.png");
    const outsidePath = path.join(temporaryDirectory, "outside.png");
    await fs.mkdir(folder);
    await fs.writeFile(imagePath, "png", "utf8");
    await fs.writeFile(outsidePath, "outside", "utf8");
    await service.registerGrant(1, "grant", targetPath, true);
    grants.register(2, "other-window", targetPath);
    grants.register(1, "document", path.join(folder, "note.md"));

    await expect(service.resolveAsset(1, "document", "pic.png"))
      .resolves.toEqual({ path: imagePath });
    await expect(service.resolveAsset(1, "document", "../outside.png"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(service.resolveAsset(1, "document", "missing.png"))
      .rejects.toMatchObject({ code: "NOT_FOUND", params: { file: "missing.png" } });
    await expect(service.resolveAsset(2, "document", "pic.png"))
      .rejects.toMatchObject({ code: "GRANT_INVALID" });
    await expect(service.resolveAsset(1, "unknown", "pic.png"))
      .rejects.toMatchObject({ code: "GRANT_INVALID" });
  });

  it("AC-R5-02: reads and saves a mirrored version through a window grant", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    await service.registerGrant(1, "grant", targetPath, true);
    service.attach(1, { docId: "doc", epoch: 0, version: 4, text: "updated" });

    await expect(service.read(1, "grant")).resolves.toEqual({
      name: "protected.md",
      text: "original",
    });
    await expect(service.save(1, {
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 4,
    })).resolves.toEqual({ name: "protected.md", version: 4 });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("updated");
  });

  it("AC-R12-01: reading a binary file rejects with its typed error", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    await service.registerGrant(1, "binary", path.join(
      __dirname, "../fixtures/binary/nul-byte.bin",
    ), true);

    await expect(service.read(1, "binary")).rejects.toMatchObject({
      code: "BINARY_FILE",
      messageKey: "file.binary",
      params: { file: "nul-byte.bin" },
    });
  });

  it("AC-R12-01: a UTF-16LE BOM exempts a file with NUL bytes", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    await service.registerGrant(1, "utf16", path.join(
      __dirname, "../fixtures/binary/utf16le-bom.txt",
    ), true);

    await expect(service.read(1, "utf16")).resolves.toEqual({
      name: "utf16le-bom.txt",
      text: "\uFFFD\uFFFDh\u0000e\u0000l\u0000l\u0000o\u0000",
    });
  });

  it("AC-R12-01: a UTF-8 BOM keeps its exact text", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    await service.registerGrant(1, "utf8-bom", path.join(
      __dirname, "../fixtures/encodings/utf8-bom.txt",
    ), true);

    await expect(service.read(1, "utf8-bom")).resolves.toEqual({
      name: "utf8-bom.txt",
      text: "\uFEFFhello\n",
    });
  });

  it("AC-R5-16: read and save failures name the file", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    const folder = path.join(temporaryDirectory, "folder.md");
    const unreachable = path.join(temporaryDirectory, "missing-folder", "new.md");
    await fs.mkdir(folder);
    await service.registerGrant(1, "folder", folder, true);
    await service.registerGrant(1, "unreachable", unreachable, false);
    service.attach(1, { docId: "doc", epoch: 0, version: 0, text: "text" });

    await expect(service.read(1, "folder")).rejects.toMatchObject({
      code: "IS_DIRECTORY",
      params: { file: "folder.md" },
    });
    await expect(service.save(1, {
      grant: "unreachable",
      docId: "doc",
      epoch: 0,
      version: 0,
    })).rejects.toMatchObject({ code: "NOT_FOUND", params: { file: "new.md" } });
  });

  if (process.platform !== "win32") {
    it("AC-R5-16: refuses to save a read-only file", async () => {
      const grants = new IoGrantTable();
      const service = new IoFileService(grants);
      await fs.chmod(targetPath, 0o400);
      await service.registerGrant(1, "grant", targetPath, true);
      service.attach(1, { docId: "doc", epoch: 0, version: 0, text: "blocked" });

      await expect(service.save(1, {
        grant: "grant",
        docId: "doc",
        epoch: 0,
        version: 0,
      })).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
        params: { file: "protected.md" },
      });
      await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
    });
  }
});
