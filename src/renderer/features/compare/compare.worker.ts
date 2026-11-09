/// <reference lib="webworker" />

import { CompareWorkerHandler, type CompareWorkerRequest } from "./worker";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const handler = new CompareWorkerHandler((response) => workerScope.postMessage(response));

workerScope.onmessage = (event: MessageEvent<CompareWorkerRequest>) => {
  handler.handle(event.data);
};
