/// <reference lib="webworker" />

import { CompareWorkerHandler } from "./worker";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new CompareWorkerHandler((response) => workerScope.postMessage(response));

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  handler.handle(event.data);
};
