import { createCompareState, type CompareState, type HighlightMode } from "./state";

export interface CompareWorkerRequest {
  readonly id: number;
  readonly left: string;
  readonly right: string;
  readonly highlight: HighlightMode;
}

export type CompareWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly state: CompareState }
  | { readonly id: number; readonly ok: false; readonly message: string };

export class CompareWorkerHandler {
  constructor(private readonly post: (response: CompareWorkerResponse) => void) {}

  handle(request: CompareWorkerRequest): void {
    try {
      this.post({
        id: request.id,
        ok: true,
        state: createCompareState(request.left, request.right, request.highlight),
      });
    } catch (error) {
      this.post({
        id: request.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
