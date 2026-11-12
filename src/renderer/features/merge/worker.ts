import type {
  MergeWorkerResponse,
  MergeWorkerResult,
} from "../../../shared/workers/merge";
import { isMergeWorkerRequest } from "../../../shared/workers/merge";
import { createThreeWayMerge } from "./threeWayMerge";

type CreateMerge = (base: string, left: string, right: string) => MergeWorkerResult;

export class MergeWorkerHandler {
  constructor(
    private readonly post: (response: MergeWorkerResponse) => void,
    private readonly createMerge: CreateMerge = createThreeWayMerge,
  ) {}

  handle(value: unknown): void {
    if (!isMergeWorkerRequest(value)) return;
    try {
      this.post({
        id: value.id,
        ok: true,
        result: this.createMerge(value.base, value.left, value.right),
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
