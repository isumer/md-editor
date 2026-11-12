import { describe, expect, it, vi } from "vitest";

import {
  createUpdateCheck,
  type UpdateCheckDependencies,
  type UpdateMessage,
} from "../../src/main/update/updateCheck";

function dependencies(feedText: string, response = 1): {
  readonly dependencies: UpdateCheckDependencies;
  readonly openExternal: ReturnType<typeof vi.fn>;
  readonly showMessage: ReturnType<typeof vi.fn>;
} {
  const openExternal = vi.fn(async () => undefined);
  const showMessage = vi.fn(async (_message: UpdateMessage) => ({ response }));
  return {
    dependencies: {
      currentVersion: () => "1.4.1",
      fetchFeed: vi.fn(async () => ({
        status: 200,
        text: async () => feedText,
      })),
      openExternal,
      showMessage,
    },
    openExternal,
    showMessage,
  };
}

const newerFeed = JSON.stringify({
  tag_name: "v1.4.2",
  html_url: "https://github.com/isumer/solidmd/releases/tag/v1.4.2",
  body: "Faster startup.\nSafer saves.",
});

describe("update check user surface", () => {
  it("AC-R9-07: names a newer version and shows its release notes", async () => {
    const input = dependencies(newerFeed);

    await createUpdateCheck(input.dependencies)();

    expect(input.showMessage).toHaveBeenCalledWith({
      buttons: ["Open Download Page", "Later"],
      cancelId: 1,
      defaultId: 0,
      detail: "Faster startup.\nSafer saves.",
      message: "SolidMD v1.4.2 is available.",
      title: "Update available",
      type: "info",
    });
  });

  it("AC-R9-07: says the running version is current", async () => {
    const input = dependencies(JSON.stringify({
      tag_name: "v1.4.1",
      html_url: "https://github.com/isumer/solidmd/releases/tag/v1.4.1",
      body: "Current release.",
    }));

    await createUpdateCheck(input.dependencies)();

    expect(input.showMessage).toHaveBeenCalledWith({
      buttons: ["OK"],
      cancelId: 0,
      defaultId: 0,
      detail: "SolidMD 1.4.1 is the latest available version.",
      message: "SolidMD is up to date.",
      title: "Check for Updates",
      type: "info",
    });
  });

  it("AC-R9-07: says why an update check failed", async () => {
    const input = dependencies("ignored");
    input.dependencies.fetchFeed = vi.fn(async () => {
      throw new Error("offline");
    });

    await createUpdateCheck(input.dependencies)();

    expect(input.showMessage).toHaveBeenCalledWith({
      buttons: ["OK"],
      cancelId: 0,
      defaultId: 0,
      detail: "SolidMD could not reach the release feed. Try again later.",
      message: "The update check failed.",
      title: "Check for Updates",
      type: "error",
    });
  });

  it.each([
    {
      detail: "SolidMD could not identify the running version.",
      name: "an invalid running version",
      prepare: (input: UpdateCheckDependencies) => {
        input.currentVersion = () => "1.4";
      },
    },
    {
      detail: "The release feed returned an unexpected response.",
      name: "an unexpected response status",
      prepare: (input: UpdateCheckDependencies) => {
        input.fetchFeed = vi.fn(async () => ({ status: 503, text: async () => "" }));
      },
    },
    {
      detail: "The release feed response was too large.",
      name: "an oversized response",
      prepare: (input: UpdateCheckDependencies) => {
        input.fetchFeed = vi.fn(async () => ({
          status: 200,
          text: async () => " ".repeat(262_145),
        }));
      },
    },
    {
      detail: "The release feed response was not valid.",
      name: "an invalid feed",
      prepare: (input: UpdateCheckDependencies) => {
        input.fetchFeed = vi.fn(async () => ({ status: 200, text: async () => "not JSON" }));
      },
    },
  ])("AC-R9-07: explains $name", async ({ detail, prepare }) => {
    const input = dependencies(newerFeed);
    prepare(input.dependencies);

    await createUpdateCheck(input.dependencies)();

    expect(input.showMessage).toHaveBeenCalledWith(expect.objectContaining({ detail }));
  });

  it("AC-R9-07: does not open a download page without consent", async () => {
    const input = dependencies(newerFeed, 1);

    await createUpdateCheck(input.dependencies)();

    expect(input.openExternal).not.toHaveBeenCalled();
  });

  it("AC-R9-07 AC-R9-10: opens the release page after consent", async () => {
    const input = dependencies(newerFeed, 0);

    await createUpdateCheck(input.dependencies)();

    expect(input.openExternal).toHaveBeenCalledOnce();
    expect(input.openExternal).toHaveBeenCalledWith(
      "https://github.com/isumer/solidmd/releases/tag/v1.4.2",
    );
  });

  it("AC-R9-07: collapses concurrent checks into one request", async () => {
    let releaseFetch: (() => void) | undefined;
    const fetchFeed = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      return { status: 200, text: async () => newerFeed };
    });
    const input = dependencies(newerFeed);
    input.dependencies.fetchFeed = fetchFeed;
    const check = createUpdateCheck(input.dependencies);

    const first = check();
    const second = check();
    releaseFetch?.();
    await Promise.all([first, second]);

    expect(fetchFeed).toHaveBeenCalledOnce();
    expect(input.showMessage).toHaveBeenCalledOnce();
  });

  it("AC-R9-07: contains a dialog failure", async () => {
    const input = dependencies(newerFeed);
    input.dependencies.showMessage = vi.fn(async () => {
      throw new Error("dialog unavailable");
    });

    await expect(createUpdateCheck(input.dependencies)()).resolves.toBeUndefined();
  });
});
