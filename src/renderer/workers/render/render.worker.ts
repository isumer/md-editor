/// <reference lib="webworker" />

import { renderMarkdown } from "./render";
import type { RenderRequest, RenderResponse } from "../../../shared/workers/render";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, text } = event.data;
  try {
    workerScope.postMessage({ id, ok: true, html: renderMarkdown(text) } satisfies RenderResponse);
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    } satisfies RenderResponse);
  }
};
