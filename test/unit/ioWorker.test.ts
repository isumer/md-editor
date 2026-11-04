import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IoGrantTable } from "../../src/io-worker/grants";
import { attachIoPort, type IoWorkerPort } from "../../src/io-worker/port";
import { IoFileService } from "../../src/io-worker/services/file";

class FakePort implements IoWorkerPort {
  readonly replies: unknown[] = [];
  private listener: ((event: { data: unknown }) => void) | undefined;

  on(_event: "message", listener: (event: { data: unknown }) => void): this {
    this.listener = listener;
    return this;
  }

  postMessage(message: unknown): void {
    this.replies.push(message);
  }

  start(): void {}

  send(message: unknown): void {
    this.listener?.({ data: message });
  }
}

let temporaryDirectory: string;
let targetPath: string;

beforeEach(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-io-worker-"));
  targetPath = path.join(temporaryDirectory, "protected.md");
  await fs.writeFile(targetPath, "original", "utf8");
});

afterEach(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

async function waitForReplies(port: FakePort, count: number): Promise<void> {
  await expect.poll(() => port.replies.length).toBe(count);
}

describe("io-worker port boundary", () => {
  it("AC-SEC-12: refuses invalid and unowned grants without file access", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    const port = new FakePort();
    grants.register(1, "valid", targetPath);
    grants.register(2, "other-window", targetPath);
    grants.register(1, "revoked", targetPath);
    grants.revoke(1, "revoked");
    attachIoPort(port, 1, service);

    const requests = [
      { id: "raw", op: "write", grant: targetPath, text: "raw path" },
      { id: "unknown", op: "write", grant: "unknown", text: "unknown" },
      { id: "revoked", op: "write", grant: "revoked", text: "revoked" },
      { id: "other", op: "write", grant: "other-window", text: "other" },
      { id: "extra", op: "write", grant: "valid", text: "extra", extra: true },
      { id: "wrong", op: "write", grant: "valid", text: 42 },
      {
        id: "oversized",
        op: "write",
        grant: "valid",
        text: "x".repeat(257 * 1024 * 1024),
      },
    ];
    for (const request of requests) {
      port.send(request);
    }
    await waitForReplies(port, requests.length);

    const replies = [...port.replies].sort((left, right) => {
      const leftId = (left as { id: string }).id;
      const rightId = (right as { id: string }).id;
      return leftId.localeCompare(rightId);
    });
    const expected = requests.map(({ id }) => ({
      id,
      result: {
        ok: false,
        error: expect.objectContaining({
          code: ["extra", "wrong", "oversized"].includes(id)
            ? "BAD_REQUEST"
            : "GRANT_INVALID",
        }),
      },
    })).sort((left, right) => left.id.localeCompare(right.id));
    expect(replies).toEqual(expected);
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
  });

  it("AC-SEC-12: survives hostile input and answers the next valid request", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    const port = new FakePort();
    grants.register(1, "valid", targetPath);
    attachIoPort(port, 1, service);
    const ownProto = { id: "proto", op: "read", grant: "valid" };
    Object.defineProperty(ownProto, "__proto__", {
      enumerable: true,
      value: { polluted: true },
    });

    port.send(ownProto);
    port.send({ id: "valid", op: "read", grant: "valid" });
    await waitForReplies(port, 2);

    expect(port.replies[0]).toMatchObject({
      id: "proto",
      result: { ok: false, error: { code: "BAD_REQUEST" } },
    });
    expect(port.replies[1]).toEqual({
      id: "valid",
      result: { ok: true, value: { name: "protected.md", text: "original" } },
    });
  });

  it("AC-SEC-12: drops invalid input without a usable correlation id", async () => {
    const port = new FakePort();
    attachIoPort(port, 1, new IoFileService(new IoGrantTable()));

    port.send({ op: "read", grant: "unknown" });
    await Promise.resolve();

    expect(port.replies).toEqual([]);
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

  it("AC-R5-02: reads and atomically writes through a window-bound grant", async () => {
    const grants = new IoGrantTable();
    const service = new IoFileService(grants);
    await service.registerGrant(1, "grant", targetPath, true);

    await expect(service.read(1, "grant")).resolves.toEqual({
      name: "protected.md",
      text: "original",
    });
    await expect(service.write(1, "grant", "updated")).resolves.toEqual({
      name: "protected.md",
    });
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("updated");
  });
});
