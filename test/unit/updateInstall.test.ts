import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyStagedUpdate,
  resolveUpdateTarget,
  stageUpdate,
  type FetchUpdate,
  UpdateManager,
  type UpdateManagerDependencies,
  type StagedUpdate,
  type UpdateTarget,
} from "../../src/main/update/updateInstall";
import {
  createUpdateCheck,
  type UpdateCheckDependencies,
  type UpdateLifecycle,
} from "../../src/main/update/updateCheck";
import type { ReleaseInfo } from "../../src/shared/update/updatePolicy";

const release: ReleaseInfo = {
  version: "v1.2.3",
  url: "https://github.com/isumer/solidmd/releases/tag/v1.2.3",
  notes: "Safer updates.",
};
const temporaryDirectories: string[] = [];
const newerFeed = JSON.stringify({
  tag_name: "v1.4.2",
  html_url: "https://github.com/isumer/solidmd/releases/tag/v1.4.2",
  body: "Faster startup.\nSafer saves.",
});

function checkDependencies(
  update: UpdateLifecycle,
  firstResponse = 0,
): UpdateCheckDependencies {
  return {
    currentVersion: () => "1.4.1",
    fetchFeed: async () => ({ status: 200, text: async () => newerFeed }),
    openExternal: async () => undefined,
    readSettings: async () => { throw new Error("settings unavailable"); },
    showMessage: vi.fn()
      .mockResolvedValueOnce({ checkboxChecked: true, response: firstResponse })
      .mockResolvedValue({ checkboxChecked: true, response: 0 }),
    update,
    writeSettings: async () => undefined,
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "solidmd-update-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function response(body: string | Uint8Array, status = 200): Response {
  return new Response(typeof body === "string" ? body : Buffer.from(body), { status });
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function updateFetch(
  filename: string,
  artifact: Uint8Array,
  digest = checksum(artifact),
): FetchUpdate {
  return vi.fn(async (url: string) => url.endsWith("SHA256SUMS.txt")
    ? response(`${digest}  ${filename}\n`)
    : response(artifact));
}

function managerDependencies(
  target: UpdateTarget | null,
  fetchUpdate: FetchUpdate,
) {
  const dependencies = {
    apply: vi.fn(async (_update: StagedUpdate, _restart: boolean) => undefined),
    currentVersion: () => "1.2.2",
    exit: vi.fn(() => undefined),
    fetchUpdate,
    quit: vi.fn(() => undefined),
    reportFailure: vi.fn(async () => undefined),
    resolveTarget: vi.fn(async (_version: string) => target),
  } satisfies UpdateManagerDependencies;
  return dependencies;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) =>
    rm(directory, { force: true, recursive: true })));
});

describe("self-update installation", () => {
  it("AC-R9-09: resolves installer and AppImage release artifacts", async () => {
    const directory = await temporaryDirectory();
    const executablePath = path.join(directory, "SolidMD.exe");
    const appImagePath = path.join(directory, "SolidMD.AppImage");

    await expect(resolveUpdateTarget({
      appImagePath,
      arch: "x64",
      executablePath,
      packaged: true,
      platform: "linux",
      version: "v1.2.3",
    })).resolves.toEqual({
      destination: appImagePath,
      filename: "SolidMD-1.2.3-x86_64.AppImage",
      kind: "appimage",
      stageDirectory: directory,
    });
    await expect(resolveUpdateTarget({
      arch: "arm64",
      executablePath,
      packaged: true,
      platform: "win32",
      stageDirectory: directory,
      version: "1.2.3",
    })).resolves.toEqual({
      destination: null,
      filename: "SolidMD-Setup-1.2.3-arm64.exe",
      kind: "installer",
      stageDirectory: directory,
    });
  });

  it("AC-R9-09: portable Windows and other builds do not self-update", async () => {
    const directory = await temporaryDirectory();
    const executablePath = path.join(directory, "SolidMD.exe");
    await writeFile(path.join(directory, "portable"), "");

    await expect(resolveUpdateTarget({
      arch: "x64",
      executablePath,
      packaged: true,
      platform: "win32",
      stageDirectory: directory,
      version: "1.2.3",
    })).resolves.toBeNull();
    await expect(resolveUpdateTarget({
      arch: "x64",
      executablePath,
      packaged: true,
      platform: "linux",
      stageDirectory: directory,
      version: "1.2.3",
    })).resolves.toBeNull();
  });

  it("AC-R9-09: verifies a complete download before staging it", async () => {
    const directory = await temporaryDirectory();
    const artifact = new TextEncoder().encode("verified update");
    const filename = "SolidMD-1.2.3-x86_64.AppImage";
    const fetch = updateFetch(filename, artifact);

    const staged = await stageUpdate(release, {
      destination: path.join(directory, "SolidMD.AppImage"),
      filename,
      kind: "appimage",
      stageDirectory: directory,
    }, fetch);

    await expect(readFile(staged.filePath)).resolves.toEqual(Buffer.from(artifact));
    expect(fetch).toHaveBeenCalledWith(
      "https://github.com/isumer/solidmd/releases/download/v1.2.3/SHA256SUMS.txt",
    );
    expect(fetch).toHaveBeenCalledWith(
      `https://github.com/isumer/solidmd/releases/download/v1.2.3/${filename}`,
    );
  });

  it.each([
    ["a failed download", 503, checksum(new TextEncoder().encode("update"))],
    ["a cut-short download", 200, checksum(new TextEncoder().encode("complete update"))],
    ["a tampered download", 200, "0".repeat(64)],
  ])("AC-R9-11: removes the partial file after %s", async (_name, status, digest) => {
    const directory = await temporaryDirectory();
    const filename = "SolidMD-1.2.3-x86_64.AppImage";
    const artifact = new TextEncoder().encode("update");
    const fetch = vi.fn(async (url: string) => url.endsWith("SHA256SUMS.txt")
      ? response(`${digest}  ${filename}\n`)
      : response(artifact, status));

    await expect(stageUpdate(release, {
      destination: path.join(directory, "SolidMD.AppImage"),
      filename,
      kind: "appimage",
      stageDirectory: directory,
    }, fetch)).rejects.toThrow("update");
    await expect(readFile(path.join(directory, "SolidMD.AppImage"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it("AC-R9-11: rejects a missing checksum entry before downloading", async () => {
    const directory = await temporaryDirectory();
    const fetch = vi.fn(async () => response(`${"a".repeat(64)}  other.exe\n`));

    await expect(stageUpdate(release, {
      destination: null,
      filename: "SolidMD-Setup-1.2.3-x64.exe",
      kind: "installer",
      stageDirectory: directory,
    }, fetch)).rejects.toThrow("checksum");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("AC-R9-09: atomically replaces an AppImage only when quitting", async () => {
    const directory = await temporaryDirectory();
    const destination = path.join(directory, "SolidMD.AppImage");
    const stagedPath = path.join(directory, ".SolidMD.update");
    await writeFile(destination, "old version");
    await writeFile(stagedPath, "new version");
    const launch = vi.fn();

    await applyStagedUpdate({
      destination,
      filePath: stagedPath,
      kind: "appimage",
    }, false, launch);

    await expect(readFile(destination, "utf8")).resolves.toBe("new version");
    expect(launch).not.toHaveBeenCalled();
  });

  it("AC-R9-09: restarts the new AppImage after replacement", async () => {
    const directory = await temporaryDirectory();
    const destination = path.join(directory, "SolidMD.AppImage");
    const stagedPath = path.join(directory, ".SolidMD.update");
    await writeFile(destination, "old version");
    await writeFile(stagedPath, "new version");
    const launch = vi.fn();

    await applyStagedUpdate({
      destination,
      filePath: stagedPath,
      kind: "appimage",
    }, true, launch);

    expect(launch).toHaveBeenCalledWith(destination, []);
  });

  it("AC-R9-09: runs the installer silently and restarts only when requested", async () => {
    const launch = vi.fn();
    const staged = {
      destination: null,
      filePath: "C:\\Temp\\SolidMD-Setup.exe",
      kind: "installer" as const,
    };

    await applyStagedUpdate(staged, false, launch);
    await applyStagedUpdate(staged, true, launch);

    expect(launch).toHaveBeenNthCalledWith(
      1,
      staged.filePath,
      ["/S", "--updated"],
    );
    expect(launch).toHaveBeenNthCalledWith(
      2,
      staged.filePath,
      ["/S", "--updated", "--force-run"],
    );
  });

  it("AC-R9-09: stages an accepted update before requesting restart", async () => {
    const update: UpdateLifecycle = {
      requestRestart: vi.fn(),
      resolveAction: async () => "install",
      stage: vi.fn(async () => undefined),
    };
    const dependencies = checkDependencies(update);

    await createUpdateCheck(dependencies)();

    expect(update.stage).toHaveBeenCalledWith({
      notes: "Faster startup.\nSafer saves.",
      url: "https://github.com/isumer/solidmd/releases/tag/v1.4.2",
      version: "v1.4.2",
    });
    expect(update.requestRestart).toHaveBeenCalledOnce();
  });

  it("AC-R9-09: does not download an update without consent", async () => {
    const update: UpdateLifecycle = {
      requestRestart: vi.fn(),
      resolveAction: async () => "install",
      stage: vi.fn(async () => undefined),
    };

    await createUpdateCheck(checkDependencies(update, 1))();

    expect(update.stage).not.toHaveBeenCalled();
    expect(update.requestRestart).not.toHaveBeenCalled();
  });

  it("AC-R9-11: reports verification failure and permits a later retry", async () => {
    const update: UpdateLifecycle = {
      requestRestart: vi.fn(),
      resolveAction: async () => "install",
      stage: vi.fn(async () => { throw new Error("checksum mismatch"); }),
    };
    const dependencies = checkDependencies(update);
    const check = createUpdateCheck(dependencies);

    await check();
    await check();

    expect(update.stage).toHaveBeenCalledTimes(2);
    expect(dependencies.showMessage).toHaveBeenCalledWith(expect.objectContaining({
      detail: "Nothing was installed. Try again later.",
      message: "The update failed.",
      type: "error",
    }));
  });

  it("AC-R9-09: applies a staged update only from the quit event", async () => {
    const directory = await temporaryDirectory();
    const filename = "SolidMD-Setup-1.2.3-x64.exe";
    const artifact = new TextEncoder().encode("installer");
    const target: UpdateTarget = {
      destination: null,
      filename,
      kind: "installer",
      stageDirectory: directory,
    };
    const dependencies = managerDependencies(
      target,
      updateFetch(filename, artifact),
    );
    const manager = new UpdateManager(dependencies);
    const event = { preventDefault: vi.fn() };

    await expect(manager.resolveAction()).resolves.toBe("install");
    await manager.stage(release);
    expect(dependencies.apply).not.toHaveBeenCalled();
    manager.requestRestart();
    manager.handleQuit(event);
    await vi.waitFor(() => expect(dependencies.exit).toHaveBeenCalledOnce());

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(dependencies.quit).toHaveBeenCalledOnce();
    expect(dependencies.apply).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "installer" }),
      true,
    );
    manager.handleQuit(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("AC-R9-09: leaves unsupported builds and unstaged quits unchanged", async () => {
    const dependencies = managerDependencies(null, vi.fn());
    const manager = new UpdateManager(dependencies);
    const event = { preventDefault: vi.fn() };

    await expect(manager.resolveAction()).resolves.toBe("notify");
    await expect(manager.stage(release)).rejects.toThrow("cannot install");
    manager.handleQuit(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dependencies.apply).not.toHaveBeenCalled();
  });

  it("AC-R9-11: reports an apply failure before exiting", async () => {
    const directory = await temporaryDirectory();
    const filename = "SolidMD-Setup-1.2.3-x64.exe";
    const artifact = new TextEncoder().encode("installer");
    const dependencies = managerDependencies({
      destination: null,
      filename,
      kind: "installer",
      stageDirectory: directory,
    }, updateFetch(filename, artifact));
    dependencies.apply.mockRejectedValueOnce(new Error("launch failed"));
    const manager = new UpdateManager(dependencies);

    await manager.stage(release);
    manager.handleQuit({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(dependencies.exit).toHaveBeenCalledOnce());

    expect(dependencies.reportFailure).toHaveBeenCalledOnce();
    expect(dependencies.reportFailure.mock.invocationCallOrder[0])
      .toBeLessThan(dependencies.exit.mock.invocationCallOrder[0] ?? 0);
  });
});
