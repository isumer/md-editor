import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { constants } from "node:fs";
import path from "node:path";
import { SettingsStore } from "../../src/io-worker/services/settings";

const TEST_DIR = "/tmp/test-settings-store";

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("SettingsStore (io-worker)", () => {
  beforeEach(async () => {
    await cleanup();
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns empty object for non-existent file", async () => {
    const store = new SettingsStore();
    const result = await store.read(path.join(TEST_DIR, "nonexistent.json"));
    expect(result).toEqual({});
  });

  it("reads and parses valid JSON", async () => {
    const filePath = path.join(TEST_DIR, "settings.json");
    await fs.writeFile(filePath, '{"theme": "dark", "fontSize": 16}', "utf8");

    const store = new SettingsStore();
    const result = await store.read(filePath);

    expect(result).toEqual({ theme: "dark", fontSize: 16 });
  });

  it("throws on invalid JSON", async () => {
    const filePath = path.join(TEST_DIR, "settings.json");
    await fs.writeFile(filePath, "invalid json", "utf8");

    const store = new SettingsStore();
    await expect(store.read(filePath)).rejects.toThrow();
  });

  it("writes settings atomically", async () => {
    const filePath = path.join(TEST_DIR, "settings.json");
    const store = new SettingsStore();

    await store.write(filePath, { theme: "dark", fontSize: 16 });

    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual({ theme: "dark", fontSize: 16 });
  });

  it("creates parent directories", async () => {
    const filePath = path.join(TEST_DIR, "nested", "settings.json");
    const store = new SettingsStore();

    await store.write(filePath, { theme: "dark" });

    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual({ theme: "dark" });
  });

  it("overwrites existing file", async () => {
    const filePath = path.join(TEST_DIR, "settings.json");
    const store = new SettingsStore();

    await store.write(filePath, { theme: "light" });
    await store.write(filePath, { theme: "dark" });

    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toEqual({ theme: "dark" });
  });
});