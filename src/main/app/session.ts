import { promises as fs } from "node:fs";

import { atomicWrite } from "../../node-shared/atomicWrite";

export const SESSION_VERSION = 1;
export const MAX_SESSION_PATH_LENGTH = 32 * 1024;

export interface StoredDocument {
  name: string;
  path: string;
  savedText: string;
  text: string;
}

export interface StoredSession {
  documents: StoredDocument[];
  version: typeof SESSION_VERSION;
}

export function emptySession(): StoredSession {
  return { documents: [], version: SESSION_VERSION };
}

function validDocument(value: unknown): value is StoredDocument {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record["name"] === "string" &&
    typeof record["path"] === "string" && record["path"].length > 0 &&
    record["path"].length <= MAX_SESSION_PATH_LENGTH &&
    typeof record["savedText"] === "string" &&
    typeof record["text"] === "string";
}

export function parseSession(value: unknown): StoredSession {
  if (typeof value !== "object" || value === null) {
    return emptySession();
  }
  const record = value as Record<string, unknown>;
  if (record["version"] !== SESSION_VERSION || !Array.isArray(record["documents"])) {
    return emptySession();
  }
  return {
    documents: record["documents"].filter(validDocument),
    version: SESSION_VERSION,
  };
}

export class SessionStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<StoredSession> {
    try {
      return parseSession(JSON.parse(await fs.readFile(this.filePath, "utf8")));
    } catch {
      return emptySession();
    }
  }

  async write(session: StoredSession): Promise<void> {
    await atomicWrite(this.filePath, JSON.stringify(session));
  }
}
