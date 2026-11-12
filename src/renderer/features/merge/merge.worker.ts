/// <reference lib="webworker" />

import { MergeWorkerHandler } from "./worker";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new MergeWorkerHandler((response) => workerScope.postMessage(response));

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  handler.handle(event.data);
};
