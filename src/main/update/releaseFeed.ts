import {
  isNewerRelease,
  parseReleaseFeed,
  parseVersion,
  type ReleaseInfo,
} from "../../shared/update/updatePolicy";

export const RELEASE_FEED_URL =
  "https://api.github.com/repos/isumer/md-editor/releases/latest";

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
    const release = parseReleaseFeed(parsed);
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
