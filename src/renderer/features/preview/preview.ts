import type { RenderResponse } from "../../../shared/workers/render";
import { openExternal } from "../../platform/api";
import { RenderScheduler } from "./renderScheduler";
import { sanitizeRenderedHtml } from "./sanitize";

export function wireRenderWorker(
  renderWorker: Worker,
  scheduler: RenderScheduler,
  preview: HTMLElement,
  showStatus: (message?: string) => void,
): void {
  renderWorker.onmessage = (event: MessageEvent<RenderResponse>) => {
    const response = event.data;
    scheduler.applyResult(response.id, response, (appliedResponse) => {
      if (appliedResponse.ok) {
        preview.innerHTML = sanitizeRenderedHtml(appliedResponse.html);
        showStatus();
      } else {
        showStatus(appliedResponse.message);
      }
    });
  };

  renderWorker.onerror = (event) => {
    showStatus(event.message || "The preview worker failed");
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
        showStatus(result.message);
      }
    }).catch((error) => {
      showStatus(error instanceof Error ? error.message : String(error));
    });
  }

  preview.addEventListener("click", handlePreviewLink);
  preview.addEventListener("auxclick", handlePreviewLink);
}
