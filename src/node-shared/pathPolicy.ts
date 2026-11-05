import { promises as fs } from "node:fs";
import path from "node:path";

export type PathPolicyRejection =
  | "empty"
  | "nul"
  | "encoded"
  | "unc"
  | "backslash"
  | "absolute"
  | "outside"
  | "ads"
  | "device";

export type PathPolicyReason = PathPolicyRejection | "io";

export type PathPolicyResult =
  | { ok: true; path: string }
  | { ok: false; reason: PathPolicyRejection }
  | { ok: false; reason: "io"; error: unknown };

// Windows device names apply with or without an extension (CON, NUL.txt, ...).
const DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
// A percent-encoded separator or dot can hide a traversal until the next decode.
const ENCODED_SEPARATOR = /%(?:2e|2f|5c)/i;

function isOutside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || relative === ".." ||
    relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

export function checkRelativePath(
  relativePath: string,
): PathPolicyRejection | null {
  if (relativePath.length === 0) {
    return "empty";
  }
  if (relativePath.includes("\0")) {
    return "nul";
  }
  if (ENCODED_SEPARATOR.test(relativePath)) {
    return "encoded";
  }
  if (relativePath.startsWith("\\\\") || relativePath.startsWith("//")) {
    return "unc";
  }
  if (relativePath.includes("\\")) {
    return "backslash";
  }
  if (relativePath.startsWith("/") || path.win32.isAbsolute(relativePath)) {
    return "absolute";
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "")) {
    return "empty";
  }
  if (segments.includes("..")) {
    return "outside";
  }
  if (segments.some((segment) => segment.includes(":"))) {
    return "ads";
  }
  if (segments.some((segment) => DEVICE_NAME.test(segment))) {
    return "device";
  }
  return null;
}

export async function resolvePathUnderRoot(
  root: string,
  relativePath: string,
): Promise<PathPolicyResult> {
  const rejection = checkRelativePath(relativePath);
  if (rejection !== null) {
    return { ok: false, reason: rejection };
  }
  try {
    const canonicalRoot = await fs.realpath(root);
    const candidate = path.resolve(canonicalRoot, relativePath);
    if (isOutside(canonicalRoot, candidate)) {
      return { ok: false, reason: "outside" };
    }
    const canonicalCandidate = await fs.realpath(candidate);
    return isOutside(canonicalRoot, canonicalCandidate)
      ? { ok: false, reason: "outside" }
      : { ok: true, path: canonicalCandidate };
  } catch (error) {
    return { ok: false, reason: "io", error };
  }
}

export const resolveConfinedPath = resolvePathUnderRoot;
