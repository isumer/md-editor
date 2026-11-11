import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWrite } from "../../node-shared/atomicWrite";

export class SettingsStore {
  async read(filePath: string): Promise<unknown> {
    try {
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
