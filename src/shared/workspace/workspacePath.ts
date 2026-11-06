export type WorkspacePathReason =
  | "empty"
  | "absolute"
  | "parent"
  | "dot"
  | "separator"
  | "device-name"
  | "alternate-stream"
  | "trailing-dot"
  | "control";

export type WorkspacePathCheck =
  | { readonly ok: true; readonly segments: readonly string[] }
  | { readonly ok: false; readonly reason: WorkspacePathReason };

const WINDOWS_DEVICE_NAME =
  /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export function checkWorkspacePath(input: string): WorkspacePathCheck {
  if (input.trim() === "") {
    return { ok: false, reason: "empty" };
  }
  if (
    input.startsWith("/") ||
    input.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(input)
  ) {
    return { ok: false, reason: "absolute" };
  }

  const segments = input.split(/[\\/]/);
  if (segments.includes("")) {
    return { ok: false, reason: "separator" };
  }
  if (segments.includes(".")) {
    return { ok: false, reason: "dot" };
  }
  if (segments.includes("..")) {
    return { ok: false, reason: "parent" };
  }
  if (segments.some((segment) => segment.includes(":"))) {
    return { ok: false, reason: "alternate-stream" };
  }
  if (segments.some((segment) => WINDOWS_DEVICE_NAME.test(segment))) {
    return { ok: false, reason: "device-name" };
  }
  if (segments.some((segment) => /[. ]$/.test(segment))) {
    return { ok: false, reason: "trailing-dot" };
  }
  if (segments.some((segment) => /[\u0000-\u001f\u007f]/.test(segment))) {
    return { ok: false, reason: "control" };
  }
  return { ok: true, segments };
}
