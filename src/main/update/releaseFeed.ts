import {
  isNewerRelease,
  parseReleaseFeed,
  parseVersion,
  type ReleaseInfo,
} from "../../shared/update/updatePolicy";

export const RELEASE_FEED_URL =
  "https://api.github.com/repos/isumer/solidmd/releases/latest";

export interface FeedResponse {
  readonly status: number;
  text(): Promise<string>;
}

export type FetchFeed = (url: string) => Promise<FeedResponse>;

export type ReleaseCheckFailure =
  | "bad-current-version"
  | "unreachable"
  | "bad-status"
  | "too-large"
  | "bad-feed";

export type ReleaseCheck =
  | { readonly kind: "newer"; readonly release: ReleaseInfo }
  | { readonly kind: "current" }
  | { readonly kind: "failed"; readonly reason: ReleaseCheckFailure };

function projectReleaseFields(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const fields = value as Record<string, unknown>;
  return {
    tag_name: fields["tag_name"],
    html_url: fields["html_url"],
    body: fields["body"],
  };
}

export async function checkReleaseFeed(input: {
  readonly currentVersion: string;
  readonly fetchFeed: FetchFeed;
}): Promise<ReleaseCheck> {
  try {
    if (parseVersion(input.currentVersion) === null) {
      return { kind: "failed", reason: "bad-current-version" };
    }

    let response: FeedResponse;
    try {
      response = await input.fetchFeed(RELEASE_FEED_URL);
    } catch {
      return { kind: "failed", reason: "unreachable" };
    }
    if (response.status !== 200) {
      return { kind: "failed", reason: "bad-status" };
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      return { kind: "failed", reason: "unreachable" };
    }
    if (text.length > 262_144) {
      return { kind: "failed", reason: "too-large" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return { kind: "failed", reason: "bad-feed" };
    }
    const release = parseReleaseFeed(projectReleaseFields(parsed));
    if (release === null) {
      return { kind: "failed", reason: "bad-feed" };
    }
    return isNewerRelease(release.version, input.currentVersion)
      ? { kind: "newer", release }
      : { kind: "current" };
  } catch {
    return { kind: "failed", reason: "unreachable" };
  }
}
