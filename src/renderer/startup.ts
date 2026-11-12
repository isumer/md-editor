import type { OpenRequestReady } from "../shared/ipc/file";
import type { Result } from "../shared/ipc/result";
import { formatMessage } from "./core/messages";
import type { InstalledFeatures } from "./editor/featureWiring";
import { beginStartup } from "./features/background/startup";
import type { DocumentLifecycle } from "./tabs/documentLifecycle";
import type { RenderController } from "./tabs/renderController";
import { onOpenRequest, onSessionCloseRequest } from "./platform/api";

export interface StartupBoundary {
  closePrompt: HTMLElement;
  settings: { apply(): void; load(): Promise<void> };
  render: Pick<RenderController, "start">;
  features: Pick<InstalledFeatures, "start">;
  lifecycle: Pick<DocumentLifecycle, "recover" | "restoreSession">;
  openInitialDocument(): void;
  requestOpenRequests(): Promise<Result<OpenRequestReady>>;
  unwrap: <T>(result: Result<T>) => T | undefined;
  onReady(ready: OpenRequestReady): void;
  showStatus(message?: string): void;
  showError(error: unknown): void;
}

export interface WindowSubscriptions {
  open: typeof onOpenRequest;
  close: typeof onSessionCloseRequest;
}

const windowSubscriptions: WindowSubscriptions = {
  open: onOpenRequest,
  close: onSessionCloseRequest,
};

export async function startRenderer(boundary: StartupBoundary): Promise<void> {
  for (const action of ["cancel", "discard", "save"] as const) {
    const button = boundary.closePrompt.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    );
    if (button) {
      button.textContent = formatMessage(`close.${action}`, {});
    }
  }
  boundary.settings.apply();
  boundary.render.start();
  boundary.features.start();
  const readyRequest = beginStartup({
    openInitialDocument: boundary.openInitialDocument,
    requestOpenRequests: boundary.requestOpenRequests,
    loadSettings: () => boundary.settings.load(),
    showError: boundary.showError,
  });
  try {
    const ready = boundary.unwrap(await readyRequest);
    if (!ready) {
      return;
    }
    boundary.onReady(ready);
    const recovered = await boundary.lifecycle.recover();
    if (!recovered) {
      await boundary.lifecycle.restoreSession();
    }
    if (ready.notice) {
      boundary.showStatus(ready.notice);
    }
  } catch (error) {
    boundary.showStatus(error instanceof Error ? error.message : String(error));
  }
}

export function wireWindow(
  lifecycle: Pick<
    DocumentLifecycle,
    "handleOpenRequest" | "handleSessionClose"
  >,
  showError: (error: unknown) => void,
  subscriptions: WindowSubscriptions = windowSubscriptions,
): void {
  subscriptions.open((request) => lifecycle.handleOpenRequest(request));
  subscriptions.close((request) => {
    void lifecycle.handleSessionClose(request).catch(showError);
  });
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
  });
}
