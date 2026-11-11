import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SettingsStore } from "../../src/io-worker/services/settings";

let testDirectory: string;

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

  it("serializes concurrent writes without a temporary file collision", async () => {
    const filePath = path.join(testDirectory, "settings.json");
    const store = new SettingsStore();

    await expect(Promise.all([
      store.write(filePath, { sequence: 1 }),
      store.write(filePath, { sequence: 2 }),
    ])).resolves.toEqual([undefined, undefined]);

    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual({ sequence: 2 });
  });
});
