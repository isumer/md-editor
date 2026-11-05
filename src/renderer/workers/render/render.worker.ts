/// <reference lib="webworker" />

import { RenderWorkerHandler } from "./handler";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

const handler = new RenderWorkerHandler((response) => workerScope.postMessage(response));

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  handler.handle(event.data);
};
