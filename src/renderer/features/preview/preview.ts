import type {
  RenderResponse,
  RenderResync,
  RenderResult,
} from "../../../shared/workers/render";
import { formatMessage } from "../../../shared/messages/en";
import type { ReplicatedVersion } from "../../core/replication";
import { openExternal } from "../../platform/api";
import { RenderScheduler } from "./renderScheduler";
import { sanitizeRenderedHtml } from "./sanitize";

export interface RenderWorkerEvents {
  onmessage: ((event: MessageEvent<RenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface RenderWorkerWiring {
  scheduler: RenderScheduler;
  preview: HTMLElement;
  showStatus(message?: string): void;
  currentVersion(): ReplicatedVersion;
  onResync(response: RenderResync): void;
  rewriteHtml(html: string): string;
}

function applyRenderResult(result: RenderResult, wiring: RenderWorkerWiring): void {
  wiring.scheduler.applyResult(result.id, result, (appliedResponse) => {
    if (appliedResponse.ok) {
      const sanitized = sanitizeRenderedHtml(appliedResponse.html);
      wiring.preview.innerHTML = wiring.rewriteHtml(sanitized);
      wiring.showStatus();
    } else {
      wiring.showStatus(appliedResponse.message);
    }
  });
}

export function wireRenderWorker(
  renderWorker: RenderWorkerEvents,
  wiring: RenderWorkerWiring,
): void {
  renderWorker.onmessage = (event: MessageEvent<RenderResponse>) => {
    const response = event.data;
    const current = wiring.currentVersion();
    if (response.docId !== current.docId || response.epoch !== current.epoch) {
      return;
    }
    if ("op" in response) {
      wiring.onResync(response);
      return;
    }
    applyRenderResult(response, wiring);
  };

  renderWorker.onerror = (event) => {
    wiring.showStatus(event.message || "The preview worker failed");
  };
}

export function wirePreviewLinks(
  preview: HTMLElement,
  showStatus: (message?: string) => void,
): void {
  function handlePreviewLink(event: MouseEvent): void {
    if (event.type === "auxclick" && event.button !== 1) {
      return;
    }
    const link = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("a[href]")
      : null;
    const href = link?.getAttribute("href");
    if (!href) {
      return;
    }

    event.preventDefault();
    if (href.startsWith("#")) {
      if (href === "#") {
        preview.scrollTo({ top: 0 });
        return;
      }

      let id: string;
      try {
        id = decodeURIComponent(href.slice(1));
      } catch {
        return;
      }
      const target = Array.from(preview.querySelectorAll<HTMLElement>("[id]"))
        .find((element) => element.id === id);
      target?.scrollIntoView();
      return;
    }

    let protocol: string;
    try {
      protocol = new URL(href).protocol;
    } catch {
      showStatus(`Cannot open link: ${href}`);
      return;
    }
    if (protocol !== "http:" && protocol !== "https:" && protocol !== "mailto:") {
      showStatus(`Cannot open link: ${href}`);
      return;
    }

    void openExternal(href).then((result) => {
      if (!result.ok) {
        showStatus(formatMessage(result.error.messageKey, result.error.params));
      }
    }).catch((error) => {
      showStatus(error instanceof Error ? error.message : String(error));
    });
  }

  preview.addEventListener("click", handlePreviewLink);
  preview.addEventListener("auxclick", handlePreviewLink);
}
