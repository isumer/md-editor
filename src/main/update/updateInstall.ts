import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import {
  parseChecksum,
  type ReleaseInfo,
} from "../../shared/update/updatePolicy";

export type FetchUpdate = (url: string) => Promise<Response>;
export type LaunchUpdate = (filePath: string, arguments_: readonly string[]) => void;

export interface UpdateTarget {
  readonly kind: "appimage" | "installer";
  readonly filename: string;
  readonly stageDirectory: string;
  readonly destination: string | null;
}

export interface StagedUpdate {
  readonly kind: UpdateTarget["kind"];
  readonly filePath: string;
  readonly destination: string | null;
}

export interface UpdateTargetInput {
  readonly appImagePath?: string;
  readonly arch: string;
  readonly executablePath: string;
  readonly packaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly stageDirectory?: string;
  readonly version: string;
}

export interface UpdateManagerDependencies {
  currentVersion(): string;
  resolveTarget(version: string): Promise<UpdateTarget | null>;
  fetchUpdate: FetchUpdate;
  apply(update: StagedUpdate, restart: boolean): Promise<void>;
  quit(): void;
  exit(): void;
  reportFailure(): Promise<void>;
}

export interface UpdateQuitEvent {
  preventDefault(): void;
}

const CHECKSUM_FILE = "SHA256SUMS.txt";
const CHECKSUM_LIMIT = 1024 * 1024;

function releaseVersion(version: string): string {
  return version.startsWith("v") ? version.slice(1) : version;
}

function appImageArchitecture(arch: string): string | null {
  if (arch === "x64") {
    return "x86_64";
  }
  return arch === "arm64" ? "arm64" : null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveUpdateTarget(
  input: UpdateTargetInput,
): Promise<UpdateTarget | null> {
  const version = releaseVersion(input.version);
  if (input.appImagePath) {
    const arch = appImageArchitecture(input.arch);
    return arch === null ? null : {
      destination: input.appImagePath,
      filename: `SolidMD-${version}-${arch}.AppImage`,
      kind: "appimage",
      stageDirectory: path.dirname(input.appImagePath),
    };
  }
  if (input.platform !== "win32" || !input.packaged) {
    return null;
  }
  if (await fileExists(path.join(path.dirname(input.executablePath), "portable"))) {
    return null;
  }
  if (input.arch !== "x64" && input.arch !== "arm64") {
    return null;
  }
  return {
    destination: null,
    filename: `SolidMD-Setup-${version}-${input.arch}.exe`,
    kind: "installer",
    stageDirectory: input.stageDirectory ?? path.dirname(input.executablePath),
  };
}

function releaseAssetUrl(release: ReleaseInfo, filename: string): string {
  const url = new URL(release.url);
  const suffix = `/tag/${release.version}`;
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !url.pathname.endsWith(suffix)
  ) {
    throw new Error("The update release URL is not valid.");
  }
  const basePath = url.pathname.slice(0, -suffix.length);
  url.pathname = `${basePath}/download/${release.version}/${filename}`;
  return url.href;
}

function checksumFromManifest(manifest: string, filename: string): string | null {
  let found: string | null = null;
  for (const line of manifest.split(/\r?\n/u)) {
    const match = /^([0-9A-Fa-f]{64}) [ *](.+)$/u.exec(line);
    if (match?.[2] !== filename) {
      continue;
    }
    const digest = parseChecksum(match[1]);
    if (digest === null || found !== null) {
      return null;
    }
    found = digest;
  }
  return found;
}

async function expectedChecksum(
  release: ReleaseInfo,
  target: UpdateTarget,
  fetchUpdate: FetchUpdate,
): Promise<string> {
  const response = await fetchUpdate(releaseAssetUrl(release, CHECKSUM_FILE));
  if (response.status !== 200) {
    throw new Error("The update checksum download failed.");
  }
  const manifest = await response.text();
  if (manifest.length > CHECKSUM_LIMIT) {
    throw new Error("The update checksum file is too large.");
  }
  const digest = checksumFromManifest(manifest, target.filename);
  if (digest === null) {
    throw new Error("The update checksum is missing or invalid.");
  }
  return digest;
}

async function writeChunk(
  file: FileHandle,
  chunk: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const result = await file.write(chunk, offset, chunk.byteLength - offset);
    if (result.bytesWritten === 0) {
      throw new Error("The update download was cut short.");
    }
    offset += result.bytesWritten;
  }
}

async function downloadArtifact(
  url: string,
  filePath: string,
  fetchUpdate: FetchUpdate,
): Promise<string> {
  const response = await fetchUpdate(url);
  if (response.status !== 200 || response.body === null) {
    throw new Error("The update download failed.");
  }
  const file = await fs.open(filePath, "wx", 0o600);
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      hash.update(result.value);
      await writeChunk(file, result.value);
    }
    await file.sync();
  } finally {
    reader.releaseLock();
    await file.close();
  }
  return hash.digest("hex");
}

export async function stageUpdate(
  release: ReleaseInfo,
  target: UpdateTarget,
  fetchUpdate: FetchUpdate,
): Promise<StagedUpdate> {
  await fs.mkdir(target.stageDirectory, { recursive: true });
  const expected = await expectedChecksum(release, target, fetchUpdate);
  const extension = path.extname(target.filename);
  const filePath = path.join(
    target.stageDirectory,
    `.solidmd-update-${randomUUID()}${extension}`,
  );
  try {
    const actual = await downloadArtifact(
      releaseAssetUrl(release, target.filename),
      filePath,
      fetchUpdate,
    );
    if (actual !== expected) {
      throw new Error("The update checksum does not match.");
    }
    if (target.kind === "appimage") {
      await fs.chmod(filePath, 0o755);
    }
    return { destination: target.destination, filePath, kind: target.kind };
  } catch (error) {
    await fs.rm(filePath, { force: true });
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function launchUpdate(
  filePath: string,
  arguments_: readonly string[],
): void {
  const child = spawn(filePath, [...arguments_], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export async function applyStagedUpdate(
  update: StagedUpdate,
  restart: boolean,
  launch: LaunchUpdate = launchUpdate,
): Promise<void> {
  if (update.kind === "installer") {
    launch(update.filePath, [
      "/S",
      "--updated",
      ...(restart ? ["--force-run"] : []),
    ]);
    return;
  }
  if (update.destination === null) {
    throw new Error("The AppImage update destination is missing.");
  }
  await fs.rename(update.filePath, update.destination);
  await syncDirectory(path.dirname(update.destination));
  if (restart) {
    launch(update.destination, []);
  }
}

export class UpdateManager {
  private applying = false;
  private restart = false;
  private staged: StagedUpdate | null = null;

  constructor(private readonly dependencies: UpdateManagerDependencies) {}

  async resolveAction(): Promise<"install" | "notify"> {
    const target = await this.dependencies.resolveTarget(
      this.dependencies.currentVersion(),
    );
    return target === null ? "notify" : "install";
  }

  async stage(release: ReleaseInfo): Promise<void> {
    const target = await this.dependencies.resolveTarget(release.version);
    if (target === null) {
      throw new Error("This build cannot install its own updates.");
    }
    this.staged = await stageUpdate(
      release,
      target,
      this.dependencies.fetchUpdate,
    );
  }

  requestRestart(): void {
    this.restart = true;
    this.dependencies.quit();
  }

  handleQuit(event: UpdateQuitEvent): void {
    if (this.staged === null || this.applying) {
      return;
    }
    event.preventDefault();
    this.applying = true;
    const update = this.staged;
    this.staged = null;
    void this.dependencies.apply(update, this.restart)
      .catch(async () => this.dependencies.reportFailure())
      .finally(() => this.dependencies.exit());
  }
}
