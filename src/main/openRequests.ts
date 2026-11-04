import path from "node:path";

interface OpenRequestDependencies {
  deliver(filePath: string): Promise<void>;
  isFile(filePath: string): Promise<boolean>;
}

export class OpenRequests {
  private readonly pending: string[] = [];
  private operation = Promise.resolve();
  private rendererReady = false;

  constructor(private readonly dependencies: OpenRequestDependencies) {}

  enqueueArguments(arguments_: readonly string[], cwd: string): Promise<void> {
    return this.enqueue(async () => {
      for (const argument of arguments_) {
        if (argument.startsWith("-")) {
          continue;
        }
        const candidate = path.resolve(cwd, argument);
        if (await this.dependencies.isFile(candidate)) {
          this.pending.push(candidate);
        }
      }
      await this.drain();
    });
  }

  enqueueFile(filePath: string): Promise<void> {
    return this.enqueue(async () => {
      const candidate = path.resolve(filePath);
      if (await this.dependencies.isFile(candidate)) {
        this.pending.push(candidate);
      }
      await this.drain();
    });
  }

  setRendererReady(): Promise<void> {
    return this.enqueue(async () => {
      this.rendererReady = true;
      await this.drain();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.then(operation, operation);
    this.operation = next.catch(() => undefined);
    return next;
  }

  private async drain(): Promise<void> {
    while (this.rendererReady && this.pending.length > 0) {
      const filePath = this.pending.shift();
      if (filePath) {
        await this.dependencies.deliver(filePath);
      }
    }
  }
}
