import { constants, promises as fs } from "node:fs";
import path from "node:path";

import { atomicWrite } from "../../node-shared/atomicWrite";
import { toServiceError } from "../../shared/ipc/result";
import { IoGrantTable } from "../grants";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" ? error.code : undefined;
}

function errorCause(error: unknown): unknown {
  let current = error;
  while (current instanceof Error && current.cause !== undefined) {
    current = current.cause;
  }
  return current;
}

function fileError(error: unknown, filePath: string): never {
  throw toServiceError(errorCause(error), {
    file: path.basename(filePath) || filePath,
  });
}

async function canonicalPath(filePath: string, mustExist: boolean): Promise<string> {
  const absolutePath = path.resolve(filePath);
  try {
    return await fs.realpath(absolutePath);
  } catch (error) {
    if (!mustExist && errorCode(error) === "ENOENT") {
      return absolutePath;
    }
    return fileError(error, filePath);
  }
}

async function ensureWritable(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, constants.W_OK);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      fileError(error, filePath);
    }
  }
}

export class IoFileService {
  constructor(private readonly grants: IoGrantTable) {}

  async registerGrant(
    windowId: number,
    handle: string,
    filePath: string,
    mustExist: boolean,
  ): Promise<{ canonicalPath: string; name: string }> {
    const canonical = await canonicalPath(filePath, mustExist);
    this.grants.register(windowId, handle, canonical);
    return { canonicalPath: canonical, name: path.basename(canonical) };
  }

  async read(windowId: number, grant: string): Promise<{ name: string; text: string }> {
    const filePath = this.grants.resolve(windowId, grant);
    try {
      return {
        name: path.basename(filePath),
        text: await fs.readFile(filePath, "utf8"),
      };
    } catch (error) {
      return fileError(error, filePath);
    }
  }

  async write(
    windowId: number,
    grant: string,
    text: string,
  ): Promise<{ name: string }> {
    const filePath = this.grants.resolve(windowId, grant);
    try {
      await ensureWritable(filePath);
      await atomicWrite(filePath, text);
      return { name: path.basename(filePath) };
    } catch (error) {
      return fileError(error, filePath);
    }
  }
}
