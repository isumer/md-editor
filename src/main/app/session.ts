import {
  STORED_SESSION_VERSION,
  emptyStoredSession,
  parseStoredSession,
  type StoredDocument,
  type StoredSession,
} from "../../shared/ipc/ioControl";
import type { Result } from "../../shared/ipc/result";

export const SESSION_VERSION = STORED_SESSION_VERSION;
export type { StoredDocument, StoredSession };

export function emptySession(): StoredSession {
  return emptyStoredSession();
}

export function parseSession(value: unknown): StoredSession {
  return parseStoredSession(value);
}

export interface SessionControl {
  readSession(filePath: string): Promise<Result<StoredSession>>;
  writeSession(filePath: string, session: StoredSession): Promise<Result<void>>;
}

// Main owns the path; the io-worker does the file I/O (ADR-0004).
export class SessionStore {
  constructor(
    private readonly filePath: string,
    private readonly control: SessionControl,
  ) {}

  async read(): Promise<StoredSession> {
    const result = await this.control.readSession(this.filePath);
    return result.ok ? result.value : emptySession();
  }

  async write(session: StoredSession): Promise<void> {
    const result = await this.control.writeSession(this.filePath, session);
    if (!result.ok) {
      throw result.error;
    }
  }
}
