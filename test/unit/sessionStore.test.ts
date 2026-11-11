import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SessionStore,
  SESSION_VERSION,
  emptySession,
  parseSession,
  type SessionControl,
  type StoredSession,
} from "../../src/main/app/session";
import { serviceError } from "../../src/shared/ipc/result";
import { SessionStore as FileSessionStore } from "../../src/io-worker/services/session";

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-session-"));
  directories.push(directory);
  return directory;
}

function remoteControl(): SessionControl {
  const files = new FileSessionStore();
  return {
    async readSession(filePath) {
      return { ok: true, value: await files.read(filePath) };
    },
    async writeSession(filePath, session) {
      await files.write(filePath, session);
      return { ok: true, value: undefined };
    },
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })));
});

function stored(pathValue: string) {
  return {
    name: path.basename(pathValue),
    path: pathValue,
    savedText: "saved",
    text: "unsaved",
  };
}

describe("session store", () => {
  it("AC-R4-08: rejects an unknown version and malformed documents", () => {
    expect(parseSession(null)).toEqual(emptySession());
    expect(parseSession({ version: 99, documents: [] })).toEqual(emptySession());
    expect(parseSession({ version: SESSION_VERSION, documents: "not-a-list" }))
      .toEqual(emptySession());
    expect(parseSession({
      version: SESSION_VERSION,
      documents: [stored("/tmp/a.md"), { name: "b.md", path: "" }],
    }).documents).toEqual([stored("/tmp/a.md")]);
  });

  it("AC-R4-08: writes and reads a session atomically", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "session.json");
    const store = new SessionStore(filePath, remoteControl());
    const session: StoredSession = {
      documents: [stored("/tmp/a.md")],
      version: SESSION_VERSION,
    };

    await store.write(session);

    await expect(store.read()).resolves.toEqual(session);
    await expect(fs.readFile(filePath, "utf8")).resolves.toBe(
      JSON.stringify(session),
    );
    expect((await fs.readdir(directory)).sort()).toEqual(["session.json"]);
  });

  it("AC-R4-08: a missing or corrupt file reads as an empty session", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "session.json");
    const store = new SessionStore(filePath, remoteControl());
    await expect(store.read()).resolves.toEqual(emptySession());
    await fs.writeFile(filePath, "{not json", "utf8");
    await expect(store.read()).resolves.toEqual(emptySession());
  });

  it("AC-R4-08: a refused write rejects with the worker error", async () => {
    const store = new SessionStore("/profiles/session.json", {
      async readSession() {
        return { ok: true, value: emptySession() };
      },
      async writeSession() {
        return {
          ok: false,
          error: serviceError("PERMISSION_DENIED", "file.permissionDenied", {}, true),
        };
      },
    });

    await expect(store.write(emptySession())).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      retryable: true,
    });
  });
});
