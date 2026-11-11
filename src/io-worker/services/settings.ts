import { promises as fs } from "node:fs";
import { constants } from "node:fs";
import path from "node:path";
import { atomicWrite } from "../../node-shared/atomicWrite";
import type { Result } from "../../shared/ipc/result";
import { toServiceError } from "../../shared/ipc/result";

export interface SettingsControl {
  readSettings(filePath: string): Promise<Result<unknown>>;
  writeSettings(filePath: string, settings: unknown): Promise<Result<void>>;
}

export class SettingsStore {
  async read(filePath: string): Promise<unknown> {
    try {
      await fs.access(filePath, constants.F_OK);
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async write(filePath: string, settings: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const content = `${JSON.stringify(settings, null, 2)}\n`;
    await atomicWrite(filePath, content);
  }
}
