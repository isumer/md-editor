/// <reference lib="webworker" />

import { renderMarkdown } from "./render";

export interface RenderRequest {
  id: number;
  text: string;
}

export type RenderResponse =
  | { id: number; ok: true; html: string }
  | { id: number; ok: false; message: string };

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
