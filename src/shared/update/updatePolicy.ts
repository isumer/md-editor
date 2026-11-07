export interface ReleaseInfo {
  version: string;
  url: string;
  notes: string;
}

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly string[];
}

export interface ShouldCheckInput {
  enabled: boolean;
  lastCheckedAt: number | null;
  now: number;
}

export type UpdateKind =
  | "installer"
  | "appimage"
  | "portable"
  | "deb"
  | "mac-unsigned"
  | "mac-signed";

export type UpdateAction = "install" | "notify" | "none";

const VERSION_PATTERN =
  /^v?(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const CHECKSUM_PATTERN = /^(?:sha256:)?([0-9A-Fa-f]{64})$/;
const RELEASE_KEYS = ["tag_name", "html_url", "body"] as const;
const DAY_MS = 24 * 60 * 60 * 1_000;

export function parseVersion(text: string): Version | null {
  const match = VERSION_PATTERN.exec(text);
  if (match === null) {
    return null;
  }

  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    return null;
  }

  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareNumber(left: number, right: number): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareNumericText(left: string, right: string): -1 | 0 | 1 {
  const normalizedLeft = left.replace(/^0+(?=\d)/, "");
  const normalizedRight = right.replace(/^0+(?=\d)/, "");
  const lengthOrder = compareNumber(normalizedLeft.length, normalizedRight.length);
  if (lengthOrder !== 0) {
    return lengthOrder;
  }
  if (normalizedLeft === normalizedRight) {
    return 0;
  }
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function compareIdentifier(left: string, right: string): -1 | 0 | 1 {
  if (/^[0-9]+$/.test(left) && /^[0-9]+$/.test(right)) {
    return compareNumericText(left, right);
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function comparePrerelease(
  left: readonly string[],
  right: readonly string[],
): -1 | 0 | 1 {
  if (left.length === 0 || right.length === 0) {
    return compareNumber(right.length, left.length);
  }

  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return 0;
    }
    const order = compareIdentifier(leftIdentifier, rightIdentifier);
    if (order !== 0) {
      return order;
    }
  }
  return compareNumber(left.length, right.length);
}

export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === null || right === null) {
    return null;
  }

  for (const key of ["major", "minor", "patch"] as const) {
    const order = compareNumber(left[key], right[key]);
    if (order !== 0) {
      return order;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function isNewerRelease(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) === 1;
}

export function parseReleaseFeed(value: unknown): ReleaseInfo | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== RELEASE_KEYS.length ||
      !RELEASE_KEYS.every((key) => keys.includes(key))
    ) {
      return null;
    }

    const fields = Object.getOwnPropertyDescriptors(value);
    const tagName = fields.tag_name?.value as unknown;
    const htmlUrl = fields.html_url?.value as unknown;
    const body = fields.body?.value as unknown;
    if (
      typeof tagName !== "string" ||
      parseVersion(tagName) === null ||
      typeof htmlUrl !== "string" ||
      !htmlUrl.startsWith("https://") ||
      htmlUrl.length > 2_048 ||
      typeof body !== "string" ||
      body.length > 64 * 1_024
    ) {
      return null;
    }
    return { version: tagName, url: htmlUrl, notes: body };
  } catch {
    return null;
  }
}

export function parseChecksum(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = CHECKSUM_PATTERN.exec(value);
  return match?.[1]?.toLowerCase() ?? null;
}

export function shouldCheckForUpdates(input: ShouldCheckInput): boolean {
  if (!input.enabled || !Number.isFinite(input.now) || input.now < 0) {
    return false;
  }
  if (input.lastCheckedAt === null) {
    return true;
  }
  if (!Number.isFinite(input.lastCheckedAt) || input.lastCheckedAt < 0) {
    return false;
  }
  return input.now - input.lastCheckedAt >= DAY_MS;
}

export function updateActionFor(
  kind: UpdateKind,
  newer: boolean,
): UpdateAction {
  if (!newer) {
    return "none";
  }
  if (kind === "installer" || kind === "appimage" || kind === "mac-signed") {
    return "install";
  }
  return "notify";
}
