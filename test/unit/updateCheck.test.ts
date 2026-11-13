import { describe, expect, it, vi } from "vitest";

import {
  createUpdateCheck,
  createStartupUpdateCheck,
  type UpdateCheckDependencies,
  type UpdateMessage,
} from "../../src/main/update/updateCheck";
import { DEFAULT_SETTINGS, type Settings } from "../../src/shared/settings/settings";

function dependencies(feedText: string, response = 1): {
  readonly dependencies: UpdateCheckDependencies;
  readonly openExternal: ReturnType<typeof vi.fn>;
  readonly showMessage: ReturnType<typeof vi.fn>;
} {
  const openExternal = vi.fn(async () => undefined);
  const showMessage = vi.fn(async (_message: UpdateMessage) => ({
    checkboxChecked: true,
    response,
  }));
  return {
    dependencies: {
      currentVersion: () => "1.4.1",
      fetchFeed: vi.fn(async () => ({
        status: 200,
        text: async () => feedText,
      })),
      update: null,
      openExternal,
      readSettings: async () => {
        throw new Error("settings unavailable");
      },
      showMessage,
      writeSettings: async () => undefined,
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

  it("AC-R9-08: runs a manual check after an active silent startup check", async () => {
    let releaseFetch: (() => void) | undefined;
    const currentFeed = JSON.stringify({
      tag_name: "v1.4.1",
      html_url: "https://github.com/isumer/solidmd/releases/tag/v1.4.1",
      body: "Current release.",
    });
    const input = dependencies(currentFeed);
    input.dependencies.fetchFeed = vi.fn()
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          releaseFetch = resolve;
        });
        return { status: 200, text: async () => currentFeed };
      })
      .mockResolvedValue({ status: 200, text: async () => currentFeed });
    const check = createUpdateCheck(input.dependencies);

    const startup = check({ silent: true });
    const manual = check();
    releaseFetch?.();
    await Promise.all([startup, manual]);

    expect(input.dependencies.fetchFeed).toHaveBeenCalledTimes(2);
    expect(input.showMessage).toHaveBeenCalledOnce();
  });

  it("AC-R9-08: collapses concurrent silent startup checks", async () => {
    let releaseFetch: (() => void) | undefined;
    const input = dependencies(newerFeed);
    input.dependencies.fetchFeed = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      return { status: 200, text: async () => newerFeed };
    });
    const check = createUpdateCheck(input.dependencies);

    const first = check({ silent: true });
    const second = check({ silent: true });
    releaseFetch?.();
    await Promise.all([first, second]);

    expect(input.dependencies.fetchFeed).toHaveBeenCalledOnce();
  });

  it("AC-R9-07: contains a dialog failure", async () => {
    const input = dependencies(newerFeed);
    input.dependencies.showMessage = vi.fn(async () => {
      throw new Error("dialog unavailable");
    });

    await expect(createUpdateCheck(input.dependencies)()).resolves.toBeUndefined();
  });

  it("AC-R9-08: saves the automatic-check checkbox from a manual check", async () => {
    const input = dependencies(newerFeed, 1);
    const writeSettings = vi.fn(async (_settings: Settings) => undefined);
    input.dependencies.readSettings = async () => updateSettings(true, 42);
    input.dependencies.writeSettings = writeSettings;
    input.dependencies.showMessage = vi.fn(async () => ({
      checkboxChecked: false,
      response: 1,
    }));

    await createUpdateCheck(input.dependencies)();

    expect(writeSettings).toHaveBeenCalledWith(updateSettings(false, 42));
  });

  it("AC-R9-08: still reports a manual check when update settings cannot load", async () => {
    const input = dependencies(newerFeed, 1);
    input.dependencies.readSettings = async () => {
      throw new Error("settings unavailable");
    };

    await createUpdateCheck(input.dependencies)();

    expect(input.showMessage).toHaveBeenCalledOnce();
  });

  it("AC-R9-08: contains a failure to save the automatic-check checkbox", async () => {
    const input = dependencies(newerFeed, 1);
    input.dependencies.readSettings = async () => updateSettings(true, null);
    input.dependencies.writeSettings = async () => {
      throw new Error("settings unavailable");
    };
    input.dependencies.showMessage = vi.fn(async () => ({
      checkboxChecked: false,
      response: 1,
    }));

    await expect(createUpdateCheck(input.dependencies)()).resolves.toBeUndefined();
  });

  it("AC-R9-08: does not rewrite an unchanged automatic-check setting", async () => {
    const input = dependencies(newerFeed, 1);
    const writeSettings = vi.fn(async (_settings: Settings) => undefined);
    input.dependencies.readSettings = async () => updateSettings(true, null);
    input.dependencies.writeSettings = writeSettings;
    input.dependencies.showMessage = vi.fn(async () => ({
      checkboxChecked: true,
      response: 1,
    }));

    await createUpdateCheck(input.dependencies)();

    expect(writeSettings).not.toHaveBeenCalled();
  });

  it("AC-R9-08: keeps a startup current result silent", async () => {
    const input = dependencies(JSON.stringify({
      tag_name: "v1.4.1",
      html_url: "https://github.com/isumer/solidmd/releases/tag/v1.4.1",
      body: "Current release.",
    }));

    await createUpdateCheck(input.dependencies)({ silent: true });

    expect(input.showMessage).not.toHaveBeenCalled();
  });

  it("AC-R9-08: keeps a startup feed failure silent", async () => {
    const input = dependencies("ignored");
    input.dependencies.fetchFeed = vi.fn(async () => {
      throw new Error("offline");
    });

    await createUpdateCheck(input.dependencies)({ silent: true });

    expect(input.showMessage).not.toHaveBeenCalled();
  });
});

function updateSettings(
  enabled: boolean,
  lastCheckedAt: number | null,
): Settings {
  return {
    ...DEFAULT_SETTINGS,
    updates: { enabled, lastCheckedAt },
  };
}

describe("startup update check", () => {
  it("AC-R9-08: skips a disabled check and a check made under 24 hours ago", async () => {
    const check = vi.fn(async () => undefined);
    const write = vi.fn(async (_settings: Settings) => undefined);

    for (const settings of [
      updateSettings(false, null),
      updateSettings(true, 1),
    ]) {
      const run = createStartupUpdateCheck({
        check,
        now: () => 24 * 60 * 60 * 1_000,
        read: async () => settings,
        write,
      });
      await run();
    }

    expect(check).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("AC-R9-08: records a due check before making one silent request", async () => {
    const events: string[] = [];
    const check = vi.fn(async (options: { readonly silent?: boolean }) => {
      events.push(`check:${String(options.silent)}`);
    });
    const write = vi.fn(async (settings: Settings) => {
      events.push(`write:${String(settings.updates.lastCheckedAt)}`);
    });
    const run = createStartupUpdateCheck({
      check,
      now: () => 24 * 60 * 60 * 1_000,
      read: async () => updateSettings(true, 0),
      write,
    });

    await run();

    expect(events).toEqual(["write:86400000", "check:true"]);
    expect(check).toHaveBeenCalledOnce();
  });

  it("AC-R9-08: contains settings failures and makes no unrecorded request", async () => {
    const check = vi.fn(async () => undefined);
    const readFailure = createStartupUpdateCheck({
      check,
      now: () => 0,
      read: async () => { throw new Error("read failed"); },
      write: async () => undefined,
    });
    const writeFailure = createStartupUpdateCheck({
      check,
      now: () => 0,
      read: async () => updateSettings(true, null),
      write: async () => { throw new Error("write failed"); },
    });

    await expect(readFailure()).resolves.toBeUndefined();
    await expect(writeFailure()).resolves.toBeUndefined();
    expect(check).not.toHaveBeenCalled();
  });
});

