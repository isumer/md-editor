import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { IoControlHandler, type IoParentPort } from "../../src/io-worker/control";
import type { IoWorkerPort } from "../../src/io-worker/port";
import { SettingsStore } from "../../src/io-worker/services/settings";

let testDirectory: string;

class SettingsParent implements IoParentPort {
  readonly replies: unknown[] = [];

  on(
    _event: "message",
    _listener: (event: { data: unknown; ports: IoWorkerPort[] }) => void,
  ): this {
    return this;
  }

  postMessage(message: unknown): void {
    this.replies.push(message);
  }
}

function createControl(settings: SettingsStore): {
  handler: IoControlHandler;
  parent: SettingsParent;
} {
  const parent = new SettingsParent();
  const handler = new IoControlHandler(
    parent,
    {} as never,
    {} as never,
    {} as never,
    settings,
  );
  return { handler, parent };
}

describe("SettingsStore (io-worker)", () => {
  beforeEach(async () => {
    testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-settings-"));
  });

  afterEach(async () => {
    await fs.rm(testDirectory, { recursive: true, force: true });
  });

  it("returns empty object for non-existent file", async () => {
    const store = new SettingsStore();
    const result = await store.read(path.join(testDirectory, "nonexistent.json"));
    expect(result).toEqual({});
  });

  it("reads and parses valid JSON", async () => {
    const filePath = path.join(testDirectory, "settings.json");
    await fs.writeFile(filePath, '{"theme": "dark", "fontSize": 16}', "utf8");

    const store = new SettingsStore();
    const result = await store.read(filePath);

    expect(result).toEqual({ theme: "dark", fontSize: 16 });
  });

  it("throws on invalid JSON", async () => {
    const filePath = path.join(testDirectory, "settings.json");
    await fs.writeFile(filePath, "invalid json", "utf8");

    const store = new SettingsStore();
    await expect(store.read(filePath)).rejects.toThrow();
  });

  it("writes settings atomically", async () => {
    const filePath = path.join(testDirectory, "settings.json");
    const store = new SettingsStore();

    await store.write(filePath, { theme: "dark", fontSize: 16 });

    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual({ theme: "dark", fontSize: 16 });
  });

  it("creates parent directories", async () => {
    const filePath = path.join(testDirectory, "nested", "settings.json");
    const store = new SettingsStore();

    await store.write(filePath, { theme: "dark" });

    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual({ theme: "dark" });
  });

  it("overwrites existing file", async () => {
    const filePath = path.join(testDirectory, "settings.json");
    const store = new SettingsStore();

    await store.write(filePath, { theme: "light" });
    await store.write(filePath, { theme: "dark" });

    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual({ theme: "dark" });
  });

  it("concurrent writes leave one complete file and no temporary file", async () => {
    const filePath = path.join(testDirectory, "settings.json");
    const store = new SettingsStore();

    await expect(Promise.all([
      store.write(filePath, { sequence: 1 }),
      store.write(filePath, { sequence: 2 }),
    ])).resolves.toEqual([undefined, undefined]);

    // Last writer wins, so either complete payload is valid. A partial file or
    // a left-over temporary file would mean the temp paths collided.
    const content = await fs.readFile(filePath, "utf8");
    expect([{ sequence: 1 }, { sequence: 2 }]).toContainEqual(JSON.parse(content));
    const entries = await fs.readdir(testDirectory);
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("reads and writes settings through the io-worker control boundary", async () => {
    const filePath = path.join(testDirectory, "settings.json");
    const { handler, parent } = createControl(new SettingsStore());

    handler.handle({
      type: "writeSettings",
      id: "write",
      path: filePath,
      settings: { theme: "dark" },
    }, []);
    await expect.poll(() => parent.replies.length).toBe(1);
    handler.handle({ type: "readSettings", id: "read", path: filePath }, []);
    await expect.poll(() => parent.replies.length).toBe(2);

    expect(parent.replies).toEqual([
      { id: "write", result: { ok: true, value: {} } },
      { id: "read", result: { ok: true, value: { theme: "dark" } } },
    ]);
  });

  it("returns typed failures when settings control operations throw", async () => {
    const settings = {
      read: async () => { throw new Error("read failed"); },
      write: async () => { throw new Error("write failed"); },
    } as never;
    const { handler, parent } = createControl(settings);

    handler.handle({
      type: "readSettings",
      id: "read",
      path: "/profiles/settings.json",
    }, []);
    handler.handle({
      type: "writeSettings",
      id: "write",
      path: "/profiles/settings.json",
      settings: {},
    }, []);
    await expect.poll(() => parent.replies.length).toBe(2);

    expect(parent.replies).toEqual(expect.arrayContaining([
      { id: "read", result: { ok: false, error: expect.any(Object) } },
      { id: "write", result: { ok: false, error: expect.any(Object) } },
    ]));
  });
});
