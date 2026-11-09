import type {
  CompareState,
  CompareWorkerResponse,
  HighlightMode,
} from "../../../shared/workers/compare";
import { isCompareWorkerRequest } from "../../../shared/workers/compare";
import { createCompareState } from "./state";

type CreateState = (
  left: string,
  right: string,
  highlight: HighlightMode,
) => CompareState;

export class CompareWorkerHandler {
  constructor(
    private readonly post: (response: CompareWorkerResponse) => void,
    private readonly createState: CreateState = createCompareState,
  ) {}

  handle(value: unknown): void {
    if (!isCompareWorkerRequest(value)) return;
    try {
      this.post({
        id: value.id,
        ok: true,
        state: this.createState(value.left, value.right, value.highlight),
      });
    } catch (error) {
      this.post({
        id: value.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
