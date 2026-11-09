/// <reference lib="webworker" />

import type { CompareRequest } from "./contracts";
import { CompareWorkerHandler } from "./handler";

const scope = self as DedicatedWorkerGlobalScope;
const handler = new CompareWorkerHandler((response) => scope.postMessage(response));

scope.onmessage = (event: MessageEvent<CompareRequest>): void => {
  handler.handle(event.data);
};
