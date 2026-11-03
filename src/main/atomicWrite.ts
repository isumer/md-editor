import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface AtomicWriteHandle {
  writeFile(content: string, options: { encoding: "utf8" }): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicWriteFs {
  open(filePath: string, flags: "wx"): Promise<AtomicWriteHandle>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(filePath: string): Promise<void>;
  realpath(filePath: string): Promise<string>;
  stat(filePath: string): Promise<{ mode: number }>;
  chmod(filePath: string, mode: number): Promise<void>;
}

type Delay = (milliseconds: number) => Promise<void>;

const nodeFs: AtomicWriteFs = {
  open: (filePath, flags) => fs.open(filePath, flags),
  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
  unlink: (filePath) => fs.unlink(filePath),
  realpath: (filePath) => fs.realpath(filePath),
  stat: (filePath) => fs.stat(filePath),
  chmod: (filePath, mode) => fs.chmod(filePath, mode),
};

const writeQueues = new Map<string, Promise<void>>();
const windowsRenameDelays = [50, 100, 200, 400, 800] as const;

function hasErrorCode(error: unknown, codes: readonly string[]): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

async function defaultDelay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveTargetPath(
  targetPath: string,
  fileSystem: AtomicWriteFs,
): Promise<string> {
  const absolutePath = path.resolve(targetPath);
  try {
    return await fileSystem.realpath(absolutePath);
  } catch (error) {
    if (hasErrorCode(error, ["ENOENT"])) {
      return absolutePath;
    }
    throw error;
  }
}

async function renameWithRetry(
  temporaryPath: string,
  targetPath: string,
  fileSystem: AtomicWriteFs,
  platform: NodeJS.Platform,
  delay: Delay,
): Promise<void> {
  let retry = 0;
  while (true) {
    try {
      await fileSystem.rename(temporaryPath, targetPath);
      return;
    } catch (error) {
      const retryDelay = windowsRenameDelays[retry];
      if (
        platform !== "win32" ||
        !hasErrorCode(error, ["EPERM", "EACCES", "EBUSY"]) ||
        retryDelay === undefined
      ) {
        throw error;
      }
      await delay(retryDelay);
      retry += 1;
    }
  }
}

async function writeResolvedTarget(
  originalPath: string,
  targetPath: string,
  content: string,
  fileSystem: AtomicWriteFs,
  platform: NodeJS.Platform,
  delay: Delay,
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `${path.basename(targetPath)}.${randomUUID()}.tmp`,
  );
  let handle: AtomicWriteHandle | undefined;

  try {
    let targetMode: number | undefined;
    if (platform !== "win32") {
      try {
        targetMode = (await fileSystem.stat(targetPath)).mode & 0o7777;
      } catch (error) {
        if (!hasErrorCode(error, ["ENOENT"])) {
          throw error;
        }
      }
    }

    handle = await fileSystem.open(temporaryPath, "wx");
    await handle.writeFile(content, { encoding: "utf8" });
    await handle.sync();
    if (targetMode !== undefined) {
      await fileSystem.chmod(temporaryPath, targetMode);
    }
    await handle.close();
    handle = undefined;
    await renameWithRetry(temporaryPath, targetPath, fileSystem, platform, delay);
  } catch (cause) {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Cleanup continues so the temporary file is still removed.
      }
    }

    try {
      await fileSystem.unlink(temporaryPath);
    } catch {
      // The file may not have been created or may already have been renamed.
    }

    throw new Error(`Could not atomically write ${originalPath}`, { cause });
  }
}

export async function atomicWrite(
  targetPath: string,
  content: string,
  fileSystem: AtomicWriteFs = nodeFs,
  platform: NodeJS.Platform = process.platform,
  delay: Delay = defaultDelay,
): Promise<void> {
  const queuePath = path.resolve(targetPath);
  const previousWrite = writeQueues.get(queuePath) ?? Promise.resolve();
  const queuedWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      let resolvedPath: string;
      try {
        resolvedPath = await resolveTargetPath(targetPath, fileSystem);
      } catch (cause) {
        throw new Error(`Could not atomically write ${targetPath}`, { cause });
      }
      await writeResolvedTarget(
        targetPath,
        resolvedPath,
        content,
        fileSystem,
        platform,
        delay,
      );
    });
  writeQueues.set(queuePath, queuedWrite);

  try {
    await queuedWrite;
  } finally {
    if (writeQueues.get(queuePath) === queuedWrite) {
      writeQueues.delete(queuePath);
    }
  }
}
