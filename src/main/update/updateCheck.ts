import {
  checkReleaseFeed,
  type FetchFeed,
  type ReleaseCheckFailure,
} from "./releaseFeed";
import { shouldCheckForUpdates } from "../../shared/update/updatePolicy";
import type {
  ReleaseInfo,
  UpdateAction,
} from "../../shared/update/updatePolicy";
import type { Settings } from "../../shared/settings/settings";

export interface UpdateMessage {
  readonly type: "error" | "info";
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly string[];
  readonly defaultId: number;
  readonly cancelId: number;
  readonly checkboxLabel?: string;
  readonly checkboxChecked?: boolean;
}

export interface UpdateCheckDependencies {
  currentVersion(): string;
  fetchFeed: FetchFeed;
  showMessage(message: UpdateMessage): Promise<UpdateAnswer>;
  openExternal(url: string): Promise<void>;
  readSettings(): Promise<Settings>;
  writeSettings(settings: Settings): Promise<void>;
  update: UpdateLifecycle | null;
}

export interface UpdateLifecycle {
  resolveAction(): Promise<UpdateAction>;
  stage(release: ReleaseInfo): Promise<void>;
  requestRestart(): void;
}

interface UpdateAnswer {
  readonly response: number;
  readonly checkboxChecked: boolean;
}

async function showUpdateMessage(
  dependencies: UpdateCheckDependencies,
  message: UpdateMessage,
): Promise<UpdateAnswer> {
  let settings: Settings | null = null;
  try {
    settings = await dependencies.readSettings();
  } catch {
    settings = null;
  }
  const answer = await dependencies.showMessage(settings === null ? message : {
    ...message,
    checkboxLabel: "Check automatically at startup",
    checkboxChecked: settings.updates.enabled,
  });
  if (
    settings !== null &&
    answer.checkboxChecked !== settings.updates.enabled
  ) {
    try {
      await dependencies.writeSettings({
        ...settings,
        updates: { ...settings.updates, enabled: answer.checkboxChecked },
      });
    } catch {
      return answer;
    }
  }
  return answer;
}

function failureDetail(reason: ReleaseCheckFailure): string {
  switch (reason) {
    case "unreachable":
      return "SolidMD could not reach the release feed. Try again later.";
    case "bad-current-version":
      return "SolidMD could not identify the running version.";
    case "bad-status":
      return "The release feed returned an unexpected response.";
    case "too-large":
      return "The release feed response was too large.";
    case "bad-feed":
      return "The release feed response was not valid.";
  }
}

function singleButtonMessage(
  type: "error" | "info",
  message: string,
  detail: string,
): UpdateMessage {
  return {
    type,
    title: "Check for Updates",
    message,
    detail,
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
  };
}

export interface UpdateCheckOptions {
  readonly silent?: boolean;
}

async function runUpdateCheck(
  dependencies: UpdateCheckDependencies,
  options: UpdateCheckOptions,
): Promise<void> {
  const result = await checkReleaseFeed({
    currentVersion: dependencies.currentVersion(),
    fetchFeed: dependencies.fetchFeed,
  });
  if (result.kind === "failed") {
    if (options.silent === true) {
      return;
    }
    await showUpdateMessage(dependencies, singleButtonMessage(
      "error",
      "The update check failed.",
      failureDetail(result.reason),
    ));
    return;
  }
  if (result.kind === "current") {
    if (options.silent === true) {
      return;
    }
    await showUpdateMessage(dependencies, singleButtonMessage(
      "info",
      "SolidMD is up to date.",
      `SolidMD ${dependencies.currentVersion()} is the latest available version.`,
    ));
    return;
  }
  const update = dependencies.update;
  if (update !== null && await update.resolveAction() === "install") {
    await offerInstallableUpdate(dependencies, update, result.release);
    return;
  }
  const answer = await showUpdateMessage(dependencies, {
    type: "info",
    title: "Update available",
    message: `SolidMD ${result.release.version} is available.`,
    detail: result.release.notes,
    buttons: ["Open Download Page", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (answer.response === 0) {
    await dependencies.openExternal(result.release.url);
  }
}

async function offerInstallableUpdate(
  dependencies: UpdateCheckDependencies,
  update: UpdateLifecycle,
  release: ReleaseInfo,
): Promise<void> {
  const consent = await showUpdateMessage(dependencies, {
    type: "info",
    title: "Update available",
    message: `SolidMD ${release.version} is available.`,
    detail: release.notes,
    buttons: ["Download Update", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (consent.response !== 0) {
    return;
  }
  try {
    await update.stage(release);
  } catch {
    await showUpdateMessage(dependencies, singleButtonMessage(
      "error",
      "The update failed.",
      "Nothing was installed. Try again later.",
    ));
    return;
  }
  const timing = await showUpdateMessage(dependencies, {
    type: "info",
    title: "Update ready",
    message: `SolidMD ${release.version} is ready to install.`,
    detail: "Restart now, or install the update when SolidMD next quits.",
    buttons: ["Restart now", "Install on Quit"],
    defaultId: 0,
    cancelId: 1,
  });
  if (timing.response === 0) {
    update.requestRestart();
  }
}

export function createUpdateCheck(
  dependencies: UpdateCheckDependencies,
): (options?: UpdateCheckOptions) => Promise<void> {
  let active: Promise<void> | null = null;
  let activeIsSilent = false;
  const check = async (options: UpdateCheckOptions = {}): Promise<void> => {
    if (active !== null) {
      const pending = active;
      const repeatInteractively = activeIsSilent && options.silent !== true;
      await pending;
      if (repeatInteractively) {
        await check(options);
      }
      return;
    }
    activeIsSilent = options.silent === true;
    active = runUpdateCheck(dependencies, options)
      .catch(() => undefined)
      .finally(() => {
        active = null;
      });
    await active;
  };
  return check;
}

export interface StartupUpdateDependencies {
  readonly check: (options: UpdateCheckOptions) => Promise<void>;
  now(): number;
  read(): Promise<Settings>;
  write(settings: Settings): Promise<void>;
}

export interface StartupUpdateTimer {
  unref(): void;
}

export type SetStartupUpdateTimer = (
  callback: () => void,
  delayMilliseconds: number,
) => StartupUpdateTimer;

const STARTUP_UPDATE_DELAY_MS = 30_000;

export function scheduleStartupUpdateCheck(
  check: () => Promise<void>,
  setTimer: SetStartupUpdateTimer = (callback, delay) =>
    setTimeout(callback, delay),
): void {
  const timer = setTimer(() => {
    void check().catch(() => undefined);
  }, STARTUP_UPDATE_DELAY_MS);
  timer.unref();
}

export function createStartupUpdateCheck(
  dependencies: StartupUpdateDependencies,
): () => Promise<void> {
  return async () => {
    try {
      const settings = await dependencies.read();
      const now = dependencies.now();
      if (!shouldCheckForUpdates({
        enabled: settings.updates.enabled,
        lastCheckedAt: settings.updates.lastCheckedAt,
        now,
      })) {
        return;
      }
      await dependencies.write({
        ...settings,
        updates: { ...settings.updates, lastCheckedAt: now },
      });
      await dependencies.check({ silent: true });
    } catch {
      return;
    }
  };
}

