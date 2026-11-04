import { constants, promises as fs } from "node:fs";
import path from "node:path";

export interface DataDirectoryInput {
  exeDir: string;
  markerExists: boolean;
  isWritable: boolean;
  defaultUserData: string;
}

export interface DataDirectoryResolution {
  path: string;
  portable: boolean;
  notice?: string;
}

export function resolveDataDirectory(
  input: DataDirectoryInput,
): DataDirectoryResolution {
  if (!input.markerExists) {
    return { path: input.defaultUserData, portable: false };
  }
  if (!input.isWritable) {
    return {
      path: input.defaultUserData,
      portable: false,
      notice: "Portable data is not writable; using the default profile.",
    };
  }
  return { path: path.join(input.exeDir, "data"), portable: true };
}

export function resolveExecutableDirectory(
  executablePath: string,
  appImagePath?: string,
): string {
  return path.dirname(appImagePath ?? executablePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function preparePortableDirectory(directory: string): Promise<boolean> {
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.access(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectDataDirectory(input: {
  executablePath: string;
  appImagePath?: string;
  defaultUserData: string;
}): Promise<DataDirectoryResolution> {
  const exeDir = resolveExecutableDirectory(
    input.executablePath,
    input.appImagePath,
  );
  const markerExists = await pathExists(path.join(exeDir, "portable"));
  const isWritable = markerExists
    ? await preparePortableDirectory(path.join(exeDir, "data"))
    : false;
  return resolveDataDirectory({
    exeDir,
    markerExists,
    isWritable,
    defaultUserData: input.defaultUserData,
  });
}
