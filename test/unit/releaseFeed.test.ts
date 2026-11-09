import { describe, expect, it, vi } from "vitest";

import {
  checkReleaseFeed,
  RELEASE_FEED_URL,
  type FeedResponse,
} from "../../src/main/update/releaseFeed";

const RELEASE_URL =
  "https://github.com/isumer/md-editor/releases/tag/v1.4.2";

function response(status: number, body: string): FeedResponse {
  return {
    status,
    text: async () => body,
  };
}

function feedText(tag = "v1.4.2"): string {
  return JSON.stringify({
    tag_name: tag,
    html_url: RELEASE_URL,
    body: "...",
  });
}

describe("release feed check", () => {
  it("AC-R9-07: returns the newer release and requests the fixed feed once", async () => {
    const fetchFeed = vi.fn(async () => response(200, feedText()));

    expect(RELEASE_FEED_URL).toBe(
      "https://api.github.com/repos/isumer/md-editor/releases/latest",
    );
    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({
      kind: "newer",
      release: {
        version: "v1.4.2",
        url: RELEASE_URL,
        notes: "...",
      },
    });
    expect(fetchFeed).toHaveBeenCalledOnce();
    expect(fetchFeed).toHaveBeenCalledWith(RELEASE_FEED_URL);
  });

  it("AC-R9-07: returns current for an equal version", async () => {
    const fetchFeed = vi.fn(async () => response(200, feedText()));

    await expect(
      checkReleaseFeed({ currentVersion: "v1.4.2", fetchFeed }),
    ).resolves.toEqual({ kind: "current" });
  });

  it("AC-R9-07: returns current for an older version", async () => {
    const fetchFeed = vi.fn(async () => response(200, feedText("v1.4.1")));

    await expect(
      checkReleaseFeed({ currentVersion: "v1.4.2", fetchFeed }),
    ).resolves.toEqual({ kind: "current" });
  });

  it("AC-R9-07: returns current when a prerelease matches its release", async () => {
    const fetchFeed = vi.fn(async () =>
      response(200, feedText("v1.4.2-beta.1")),
    );

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.2", fetchFeed }),
    ).resolves.toEqual({ kind: "current" });
  });

  it("AC-R9-07: rejects a bad current version without fetching", async () => {
    const fetchFeed = vi.fn(async () => response(200, feedText()));

    await expect(
      checkReleaseFeed({ currentVersion: "1.4", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "bad-current-version" });
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("AC-R9-07: reports a rejected feed request as unreachable", async () => {
    const fetchFeed = vi.fn(async (): Promise<FeedResponse> => {
      throw new Error("offline");
    });

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "unreachable" });
  });

  it("AC-R9-07: reports a synchronous feed request throw as unreachable", async () => {
    const fetchFeed = vi.fn((): Promise<FeedResponse> => {
      throw new Error("offline");
    });

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "unreachable" });
  });

  it("AC-R9-07: rejects a bad status without reading its text", async () => {
    const text = vi.fn(async () => feedText());
    const fetchFeed = vi.fn(async () => ({ status: 500, text }));

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "bad-status" });
    expect(text).not.toHaveBeenCalled();
  });

  it("AC-R9-07: reports a rejected response body as unreachable", async () => {
    const fetchFeed = vi.fn(async () => ({
      status: 200,
      text: async (): Promise<string> => {
        throw new Error("connection lost");
      },
    }));

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "unreachable" });
  });

  it("AC-R9-07: returns a failure when response access throws", async () => {
    const fetchFeed = vi.fn(async () => ({
      get status(): number {
        throw new Error("invalid response");
      },
      text: async () => feedText(),
    }));

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "unreachable" });
  });

  it("AC-R9-07: accepts a valid feed at the text length limit", async () => {
    const json = feedText();
    const body = json + " ".repeat(262_144 - json.length);
    const fetchFeed = vi.fn(async () => response(200, body));

    expect(body).toHaveLength(262_144);
    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({
      kind: "newer",
      release: { version: "v1.4.2", url: RELEASE_URL, notes: "..." },
    });
  });

  it("AC-R9-07: rejects a feed above the text length limit", async () => {
    const json = feedText();
    const body = json + " ".repeat(262_145 - json.length);
    const fetchFeed = vi.fn(async () => response(200, body));

    expect(body).toHaveLength(262_145);
    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "too-large" });
  });

  it("AC-R9-07: rejects text that is not JSON", async () => {
    const fetchFeed = vi.fn(async () => response(200, "not JSON"));

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "bad-feed" });
  });

  it.each([
    ["an array", "[]"],
    [
      "an insecure release URL",
      JSON.stringify({
        tag_name: "v1.4.2",
        html_url: "http://github.com/isumer/md-editor/releases/tag/v1.4.2",
        body: "...",
      }),
    ],
  ])("AC-R9-07: rejects %s from the parsed feed", async (_name, body) => {
    const fetchFeed = vi.fn(async () => response(200, body));

    await expect(
      checkReleaseFeed({ currentVersion: "1.4.1", fetchFeed }),
    ).resolves.toEqual({ kind: "failed", reason: "bad-feed" });
  });
});
