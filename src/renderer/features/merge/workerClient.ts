import type {
  MergeWorkerRequest,
  MergeWorkerResponse,
  MergeWorkerResult,
} from "../../../shared/workers/merge";

export interface MergeWorkerPort {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<MergeWorkerResponse>) => void) | null;
  postMessage(request: MergeWorkerRequest): void;
  terminate(): void;
}

interface PendingRequest {
  readonly id: number;
  readonly receive: (result: MergeWorkerResult) => void;
}

export class MergeWorkerClient {
  private worker: MergeWorkerPort | null = null;
  private pending: PendingRequest | null = null;
  private requestId = 0;

  constructor(
    private readonly createWorker: () => MergeWorkerPort,
    private readonly showError: (message: string) => void,
    private readonly workerFailedMessage: string,
  ) {}

  request(
    input: Omit<MergeWorkerRequest, "id">,
    receive: (result: MergeWorkerResult) => void,
  ): void {
    this.requestId += 1;
    this.pending = { id: this.requestId, receive };
    try {
      const worker = this.worker ?? this.startWorker();
      worker.postMessage({ ...input, id: this.requestId });
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private startWorker(): MergeWorkerPort {
    const worker = this.createWorker();
    worker.onmessage = (event) => this.receive(event.data);
    worker.onerror = () => this.fail(this.workerFailedMessage);
    this.worker = worker;
    return worker;
  }

  private receive(response: MergeWorkerResponse): void {
    if (response.id !== this.pending?.id) return;
    const pending = this.pending;
    this.pending = null;
    if (response.ok) pending.receive(response.result);
    else this.showError(response.message);
  }

  private fail(message: string): void {
    this.pending = null;
    this.showError(message);
    if (this.worker === null) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
}
