import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IoControlHandler, type IoParentPort } from "../../src/io-worker/control";
import { IoGrantTable } from "../../src/io-worker/grants";
import type { IoWorkerPort } from "../../src/io-worker/port";
import { IoFileService } from "../../src/io-worker/services/file";

class FakeParent implements IoParentPort {
  readonly replies: unknown[] = [];
  private listener: ((event: { data: unknown; ports: IoWorkerPort[] }) => void) | undefined;

  on(
    _event: "message",
    listener: (event: { data: unknown; ports: IoWorkerPort[] }) => void,
  ): this {
    this.listener = listener;
    return this;
  }

  postMessage(message: unknown): void {
    this.replies.push(message);
  }

  send(data: unknown, ports: IoWorkerPort[] = []): void {
    this.listener?.({ data, ports });
  }
}

class FakePort implements IoWorkerPort {
  closeCount = 0;
  startCount = 0;
  private listener: ((event: { data: unknown }) => void) | undefined;

  on(_event: "message", listener: (event: { data: unknown }) => void): this {
    this.listener = listener;
    return this;
  }

  postMessage(): void {}
  start(): void { this.startCount += 1; }
  close(): void { this.closeCount += 1; }
  send(data: unknown): void { this.listener?.({ data }); }
}

let temporaryDirectory: string;
let targetPath: string;

beforeEach(async () => {
  // Windows' temp dir is an 8.3 short path (RUNNER~1); grants hold the canonical long one.
  temporaryDirectory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-control-")),
  );
  targetPath = path.join(temporaryDirectory, "note.md");
  await fs.writeFile(targetPath, "text", "utf8");
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

function createHandler() {
  const parent = new FakeParent();
  const grants = new IoGrantTable();
  const handler = new IoControlHandler(parent, grants, new IoFileService(grants));
  handler.start();
  return { grants, handler, parent };
}

describe("io-worker control boundary", () => {
  it("AC-SEC-07: validates, canonicalises, and acknowledges a grant", async () => {
    const { grants, parent } = createHandler();

    parent.send({
      type: "registerGrant",
      id: "register-1",
      windowId: 1,
      handle: "grant",
      path: targetPath,
      mustExist: true,
    });
    await expect.poll(() => parent.replies.length).toBe(1);

    expect(parent.replies[0]).toEqual({
      id: "register-1",
      result: {
        ok: true,
        value: { canonicalPath: targetPath, name: "note.md" },
      },
    });
    expect(grants.resolve(1, "grant")).toBe(targetPath);
  });

  it("AC-R4-08: reads and writes the session file in the io-worker", async () => {
    const { parent } = createHandler();
    const sessionPath = path.join(temporaryDirectory, "session.json");
    const session = {
      version: 1,
      documents: [{
        name: "note.md",
        path: targetPath,
        savedText: "old",
        text: "new",
      }],
    };

    parent.send({ type: "readSession", id: "read-empty", path: sessionPath });
    await expect.poll(() => parent.replies.length).toBe(1);
    expect(parent.replies[0]).toEqual({
      id: "read-empty",
      result: { ok: true, value: { version: 1, documents: [] } },
    });

    parent.send({ type: "writeSession", id: "write", path: sessionPath, session });
    await expect.poll(() => parent.replies.length).toBe(2);
    expect(parent.replies[1]).toEqual({
      id: "write",
      result: { ok: true, value: {} },
    });

    parent.send({ type: "readSession", id: "read", path: sessionPath });
    await expect.poll(() => parent.replies.length).toBe(3);
    expect(parent.replies[2]).toEqual({
      id: "read",
      result: { ok: true, value: session },
    });

    parent.send({
      type: "writeSession",
      id: "invalid",
      path: sessionPath,
      session: { version: 2, documents: [] },
    });
    await expect.poll(() => parent.replies.length).toBe(4);
    expect(parent.replies[3]).toMatchObject({
      id: "invalid",
      result: { ok: false, error: { code: "BAD_REQUEST" } },
    });
  });

  it("AC-R4-08: reports read and write failures from the session store", async () => {
    const parent = new FakeParent();
    const grants = new IoGrantTable();
    const handler = new IoControlHandler(
      parent,
      grants,
      new IoFileService(grants),
      {
        read: async () => { throw new Error("read failed"); },
        write: async () => { throw new Error("write failed"); },
      } as never,
    );
    handler.start();

    parent.send({ type: "readSession", id: "read", path: "/profiles/session.json" });
    parent.send({
      type: "writeSession",
      id: "write",
      path: "/profiles/session.json",
      session: { version: 1, documents: [] },
    });
    await expect.poll(() => parent.replies.length).toBe(2);

    expect(parent.replies[0]).toMatchObject({
      id: "read",
      result: { ok: false, error: { code: expect.any(String) } },
    });
    expect(parent.replies[1]).toMatchObject({
      id: "write",
      result: { ok: false, error: { code: expect.any(String) } },
    });
  });

  it("AC-SEC-07: rejects hostile input and still handles the next message", async () => {
    const { parent } = createHandler();
    const invalid = {
      type: "registerGrant",
      id: "invalid",
      windowId: 1,
      handle: "grant",
      path: targetPath,
      mustExist: true,
      extra: true,
    };

    parent.send(invalid);
    parent.send({
      type: "registerGrant",
      id: "valid",
      windowId: 1,
      handle: "grant",
      path: targetPath,
      mustExist: true,
    });
    await expect.poll(() => parent.replies.length).toBe(2);

    expect(parent.replies).toContainEqual({
      id: "invalid",
      result: { ok: false, error: expect.objectContaining({ code: "BAD_REQUEST" }) },
    });
    expect(parent.replies).toContainEqual({
      id: "valid",
      result: { ok: true, value: expect.objectContaining({ name: "note.md" }) },
    });
  });

  it("AC-SEC-09: revokes grants and replaces one window's attached port", () => {
    const { grants, parent } = createHandler();
    const first = new FakePort();
    const replacement = new FakePort();
    grants.register(1, "grant", targetPath);
    parent.send({ type: "attachPort", windowId: 1 }, [first]);

    parent.send({ type: "attachPort", windowId: 1 }, [replacement]);
    parent.send({ type: "revokeGrant", windowId: 1, handle: "grant" });

    expect(first.closeCount).toBe(1);
    expect(replacement.startCount).toBe(1);
    expect(() => grants.resolve(1, "grant")).toThrow();
    parent.send({ type: "revokeWindow", windowId: 1 });
    expect(replacement.closeCount).toBe(1);
  });

  it("AC-SEC-07: a missing file is refused and no grant is registered", async () => {
    const { grants, parent } = createHandler();
    const missingPath = path.join(temporaryDirectory, "missing.md");

    parent.send({ revoke: "no id" });
    parent.send({ type: "attachPort", windowId: 1 });
    parent.send({
      type: "registerGrant",
      id: "missing",
      windowId: 1,
      handle: "grant",
      path: missingPath,
      mustExist: true,
    });
    await expect.poll(() => parent.replies.length).toBe(1);

    expect(parent.replies[0]).toEqual({
      id: "missing",
      result: {
        ok: false,
        error: {
          code: "NOT_FOUND",
          messageKey: "file.notFound",
          params: { file: "missing.md" },
          retryable: false,
        },
      },
    });
    expect(() => grants.resolve(1, "grant")).toThrow();
  });

  it("AC-SEC-16 AC-SEC-17: resolves assets only under the granted document folder", async () => {
    const { grants, parent } = createHandler();
    const folder = path.join(temporaryDirectory, "documents");
    const documentPath = path.join(folder, "note.md");
    const imagePath = path.join(folder, "images", "pic.png");
    const outsidePath = path.join(temporaryDirectory, "outside.png");
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(documentPath, "text", "utf8");
    await fs.writeFile(imagePath, "png", "utf8");
    await fs.writeFile(outsidePath, "outside", "utf8");
    grants.register(1, "document", documentPath);
    grants.register(2, "other-window", documentPath);

    const requests = [
      { id: "inside", windowId: 1, grant: "document", relativePath: "images/pic.png" },
      { id: "escape", windowId: 1, grant: "document", relativePath: "../outside.png" },
      { id: "other", windowId: 2, grant: "document", relativePath: "images/pic.png" },
      { id: "unknown", windowId: 1, grant: "missing", relativePath: "images/pic.png" },
      { id: "absent", windowId: 1, grant: "document", relativePath: "missing.png" },
    ];
    for (const request of requests) {
      parent.send({ type: "resolveAsset", ...request });
    }
    await expect.poll(() => parent.replies.length).toBe(requests.length);

    const replies = parent.replies as Array<{
      id: string;
      result: { ok: boolean; value?: { path: string }; error?: { code: string } };
    }>;
    const reply = (id: string) => replies.find((candidate) => candidate.id === id);
    expect(reply("inside")).toEqual({
      id: "inside",
      result: { ok: true, value: { path: imagePath } },
    });
    expect(reply("escape")).toMatchObject({
      result: { ok: false, error: { code: "BAD_REQUEST" } },
    });
    expect(reply("other")).toMatchObject({
      result: { ok: false, error: { code: "GRANT_INVALID" } },
    });
    expect(reply("unknown")).toMatchObject({
      result: { ok: false, error: { code: "GRANT_INVALID" } },
    });
    expect(reply("absent")).toMatchObject({
      result: { ok: false, error: { code: "NOT_FOUND" } },
    });
  });

  it("AC-SEC-07: the io-worker entry answers main over its parent port", async () => {
    const parent = new FakeParent();
    Object.defineProperty(process, "parentPort", { configurable: true, value: parent });
    try {
      await import("../../src/io-worker/main");
      parent.send({
        type: "registerGrant",
        id: "entry",
        windowId: 1,
        handle: "grant",
        path: targetPath,
        mustExist: true,
      });

      await expect.poll(() => parent.replies).toEqual([{
        id: "entry",
        result: { ok: true, value: { canonicalPath: targetPath, name: "note.md" } },
      }]);
    } finally {
      Reflect.deleteProperty(process, "parentPort");
    }
  });
});
