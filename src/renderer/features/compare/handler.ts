import type { CompareRequest, CompareResponse } from "./contracts";
import { createCompareViewState } from "./viewState";

export class CompareWorkerHandler {
  constructor(private readonly postMessage: (response: CompareResponse) => void) {}

  handle(request: CompareRequest): void {
    try {
      this.postMessage({
        id: request.id,
        ok: true,
        state: createCompareViewState(request.left, request.right),
      });
    } catch (error) {
      this.postMessage({
        id: request.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
