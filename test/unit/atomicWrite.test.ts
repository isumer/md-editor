import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  atomicWrite,
  type AtomicWriteFs,
  type AtomicWriteHandle,
} from "../../src/node-shared/atomicWrite";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-atomic-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("atomicWrite", () => {
  it("AC-R5-02: writes new content", async () => {
    const directory = await temporaryDirectory();
    const target = path.join(directory, "document.md");

    await atomicWrite(target, "new content");

    await expect(fs.readFile(target, "utf8")).resolves.toBe("new content");
  });

  it("AC-R5-02: overwrites existing content", async () => {
    const directory = await temporaryDirectory();
    const target = path.join(directory, "document.md");
    await fs.writeFile(target, "old content", "utf8");

    await atomicWrite(target, "replacement");

    await expect(fs.readFile(target, "utf8")).resolves.toBe("replacement");
  });

  it("AC-R5-03: keeps the original and removes the temporary file when writing fails", async () => {
    const directory = await temporaryDirectory();
    const target = path.join(directory, "document.md");
    await fs.writeFile(target, "original", "utf8");
    const writeFailure = new Error("injected write failure");

    const failingFileSystem: AtomicWriteFs = {
      async open(filePath, flags): Promise<AtomicWriteHandle> {
        const handle = await fs.open(filePath, flags);
        return {
          writeFile: async () => {
            throw writeFailure;
          },
          sync: () => handle.sync(),
          close: () => handle.close(),
        };
      },
      rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
      unlink: (filePath) => fs.unlink(filePath),
      realpath: (filePath) => fs.realpath(filePath),
      stat: (filePath) => fs.stat(filePath),
      chmod: (filePath, mode) => fs.chmod(filePath, mode),
    };

    await expect(atomicWrite(target, "replacement", failingFileSystem)).rejects.toMatchObject({
      cause: writeFailure,
    });
    await expect(fs.readFile(target, "utf8")).resolves.toBe("original");
    expect((await fs.readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("AC-R5-03: reports a target path that cannot be resolved", async () => {
    const resolutionFailure = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    const fileSystem: AtomicWriteFs = {
      async open(): Promise<AtomicWriteHandle> {
        throw new Error("open should not run");
      },
      async rename() {},
      async unlink() {},
      async realpath() {
        throw resolutionFailure;
      },
      async stat() {
        return { mode: 0o644 };
      },
      async chmod() {},
    };

    await expect(
      atomicWrite("/virtual/document.md", "replacement", fileSystem),
    ).rejects.toMatchObject({ cause: resolutionFailure });
  });

  it("AC-R5-03: reports a target that cannot be inspected", async () => {
    const statFailure = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    const fileSystem: AtomicWriteFs = {
      async open(): Promise<AtomicWriteHandle> {
        throw new Error("open should not run");
      },
      async rename() {},
      async unlink() {},
      async realpath(filePath) {
        return filePath;
      },
      async stat() {
        throw statFailure;
      },
      async chmod() {},
    };

    await expect(
      // The mode is read only on POSIX, so pin the platform to reach the stat branch everywhere.
      atomicWrite("/virtual/document.md", "replacement", fileSystem, "linux"),
    ).rejects.toMatchObject({ cause: statFailure });
  });

  it("AC-R5-03: cleans up when the target directory does not exist", async () => {
    const directory = await temporaryDirectory();
    const target = path.join(directory, "missing", "document.md");

    await expect(atomicWrite(target, "content")).rejects.toThrow(
      `Could not atomically write ${target}`,
    );
  });

  it("AC-R5-04: serialises writes to the same resolved path", async () => {
    let openCount = 0;
    let finalContent = "";
    let secondRename: (() => void) | undefined;
    const secondRenamed = new Promise<void>((resolve) => {
      secondRename = resolve;
    });
    const temporaryContent = new Map<string, string>();
    const missingTarget = Object.assign(new Error("missing"), { code: "ENOENT" });
    const inMemoryFileSystem: AtomicWriteFs = {
      async open(filePath): Promise<AtomicWriteHandle> {
        const writeNumber = openCount++;
        return {
          async writeFile(content) {
            if (writeNumber === 0) {
              await Promise.race([
                secondRenamed,
                new Promise<void>((resolve) => setTimeout(resolve, 25)),
              ]);
            }
            temporaryContent.set(filePath, content);
          },
          async sync() {},
          async close() {},
        };
      },
      async rename(oldPath) {
        finalContent = temporaryContent.get(oldPath) ?? "";
        temporaryContent.delete(oldPath);
        if (finalContent === "second") {
          secondRename?.();
        }
      },
      async unlink(filePath) {
        temporaryContent.delete(filePath);
      },
      async realpath() {
        throw missingTarget;
      },
      async stat() {
        throw missingTarget;
      },
      async chmod() {},
    };

    await Promise.all([
      atomicWrite("/virtual/document.md", "first", inMemoryFileSystem),
      atomicWrite("/virtual/document.md", "second", inMemoryFileSystem),
    ]);

    expect(finalContent).toBe("second");
  });

  it.skipIf(process.platform === "win32")("AC-R5-05: updates a symlink target without replacing the link", async () => {
    const directory = await temporaryDirectory();
    const realTarget = path.join(directory, "real.md");
    const linkTarget = path.join(directory, "linked.md");
    await fs.writeFile(realTarget, "old content", "utf8");
    await fs.symlink(realTarget, linkTarget);

    await atomicWrite(linkTarget, "new content");

    expect((await fs.lstat(linkTarget)).isSymbolicLink()).toBe(true);
    await expect(fs.readFile(realTarget, "utf8")).resolves.toBe("new content");
  });

  it.skipIf(process.platform === "win32")("AC-R5-06: preserves the target file mode", async () => {
    const directory = await temporaryDirectory();
    const target = path.join(directory, "document.md");
    await fs.writeFile(target, "old content", { encoding: "utf8", mode: 0o640 });
    await fs.chmod(target, 0o640);

    await atomicWrite(target, "new content");

    expect((await fs.stat(target)).mode & 0o7777).toBe(0o640);
  });

  it("AC-R5-07: retries transient Windows rename failures with backoff", async () => {
    const renameFailures = [
      Object.assign(new Error("locked once"), { code: "EPERM" }),
      Object.assign(new Error("locked twice"), { code: "EACCES" }),
      Object.assign(new Error("locked three times"), { code: "EBUSY" }),
    ];
    const delays: number[] = [];
    let renameCalls = 0;
    const fileSystem: AtomicWriteFs = {
      async open(): Promise<AtomicWriteHandle> {
        return {
          async writeFile() {},
          async sync() {},
          async close() {},
        };
      },
      async rename() {
        const failure = renameFailures[renameCalls++];
        if (failure) {
          throw failure;
        }
      },
      async unlink() {},
      async realpath(filePath) {
        return filePath;
      },
      async stat() {
        return { mode: 0o644 };
      },
      async chmod() {},
    };

    await atomicWrite(
      "/virtual/document.md",
      "content",
      fileSystem,
      "win32",
      async (milliseconds) => {
        delays.push(milliseconds);
      },
    );

    expect(renameCalls).toBe(4);
    expect(delays).toEqual([50, 100, 200]);
  });

  it("AC-R5-07: cleans up after exhausting Windows rename retries", async () => {
    const renameFailures = Array.from({ length: 6 }, (_, index) =>
      Object.assign(new Error(`locked ${index}`), { code: "EPERM" }),
    );
    const unlinkedPaths: string[] = [];
    const delays: number[] = [];
    let renameCalls = 0;
    const fileSystem: AtomicWriteFs = {
      async open(): Promise<AtomicWriteHandle> {
        return {
          async writeFile() {},
          async sync() {},
          async close() {},
        };
      },
      async rename() {
        throw renameFailures[renameCalls++] ?? new Error("unexpected rename");
      },
      async unlink(filePath) {
        unlinkedPaths.push(filePath);
      },
      async realpath(filePath) {
        return filePath;
      },
      async stat() {
        return { mode: 0o644 };
      },
      async chmod() {},
    };

    await expect(
      atomicWrite(
        "/virtual/document.md",
        "content",
        fileSystem,
        "win32",
        async (milliseconds) => {
          delays.push(milliseconds);
        },
      ),
    ).rejects.toMatchObject({ cause: renameFailures[5] });
    expect(renameCalls).toBe(6);
    expect(delays).toEqual([50, 100, 200, 400, 800]);
    expect(unlinkedPaths).toHaveLength(1);
  });
});
