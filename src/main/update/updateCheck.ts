import {
  checkReleaseFeed,
  type FetchFeed,
  type ReleaseCheckFailure,
} from "./releaseFeed";

export interface UpdateMessage {
  readonly type: "error" | "info";
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly string[];
  readonly defaultId: number;
  readonly cancelId: number;
}

export interface UpdateCheckDependencies {
  currentVersion(): string;
  fetchFeed: FetchFeed;
  showMessage(message: UpdateMessage): Promise<{ readonly response: number }>;
  openExternal(url: string): Promise<void>;
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

async function runUpdateCheck(dependencies: UpdateCheckDependencies): Promise<void> {
  const result = await checkReleaseFeed({
    currentVersion: dependencies.currentVersion(),
    fetchFeed: dependencies.fetchFeed,
  });
  if (result.kind === "failed") {
    await dependencies.showMessage(singleButtonMessage(
      "error",
      "The update check failed.",
      failureDetail(result.reason),
    ));
    return;
  }
  if (result.kind === "current") {
    await dependencies.showMessage(singleButtonMessage(
      "info",
      "SolidMD is up to date.",
      `SolidMD ${dependencies.currentVersion()} is the latest available version.`,
    ));
    return;
  }
  const answer = await dependencies.showMessage({
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

export function createUpdateCheck(
  dependencies: UpdateCheckDependencies,
): () => Promise<void> {
  let active: Promise<void> | null = null;
  return async () => {
    if (active === null) {
      active = runUpdateCheck(dependencies)
        .catch(() => undefined)
        .finally(() => {
          active = null;
        });
    }
    await active;
  };
}
