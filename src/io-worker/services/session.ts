import { promises as fs } from "node:fs";

import { atomicWrite } from "../../node-shared/atomicWrite";
import {
  emptyStoredSession,
  parseStoredSession,
  type StoredSession,
} from "../../shared/ipc/ioControl";

export class SessionStore {
  async read(filePath: string): Promise<StoredSession> {
    try {
      return parseStoredSession(JSON.parse(await fs.readFile(filePath, "utf8")));
    } catch {
      return emptyStoredSession();
    }
  }

  async write(filePath: string, session: StoredSession): Promise<void> {
    await atomicWrite(filePath, JSON.stringify(session));
  }
}
