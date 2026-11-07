/// <reference lib="webworker" />

import { buildExportHtml, type HtmlExportInput } from "./html";

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<{ id: number; input: HtmlExportInput }>) => {
  try {
    scope.postMessage({
      id: event.data.id,
      ok: true,
      html: buildExportHtml(event.data.input),
    });
  } catch (error) {
    scope.postMessage({
      id: event.data.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
