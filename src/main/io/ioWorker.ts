import {
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from "electron";

import { ioRequestId } from "../../shared/ipc/io";
import {
  isRegisterGrantReply,
  type RegisteredGrant,
} from "../../shared/ipc/ioControl";
import {
  serviceError,
  toServiceError,
  type Result,
  type ServiceError,
} from "../../shared/ipc/result";
import type { GrantTable } from "../grants/grantTable";

interface IoWorkerDependencies {
  fork(): UtilityProcess;
  createChannel(): MessageChannelMain;
  now(): number;
  logExit(code: number, signal: string | null): void;
}

interface PendingRegistration {
  resolve(result: Result<RegisteredGrant>): void;
}

type PortReceiver = (port: MessagePortMain) => void;

const restartWindowMilliseconds = 60_000;
const maximumRestarts = 5;

function workerRestarted(): ServiceError {
  return serviceError(
    "WORKER_RESTARTED",
    "file.workerRestarted",
    {},
    true,
  );
}

function failedRegistration(): Result<RegisteredGrant> {
  return { ok: false, error: workerRestarted() };
}

export class IoWorkerSupervisor {
  private child: UtilityProcess | null = null;
  private generationReady: Promise<void> = Promise.resolve();
  private readonly pending = new Map<string, PendingRegistration>();
  private readonly receivers = new Map<number, PortReceiver>();
  private readonly restartTimes: number[] = [];
  private readonly failurePorts: MessagePortMain[] = [];
  private nextRequestId = 1;
  private stopped = true;
  private stopping = false;

  constructor(
    private readonly grants: GrantTable,
    private readonly dependencies: IoWorkerDependencies,
  ) {}

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.stopping = false;
    this.generationReady = this.spawnChild();
  }

  stop(): void {
    this.stopping = true;
    this.stopped = true;
    this.failPending();
    this.child?.kill();
    this.child = null;
  }

  async registerGrant(
    windowId: number,
    handle: string,
    filePath: string,
    mustExist: boolean,
  ): Promise<Result<RegisteredGrant>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendRegistration(windowId, handle, filePath, mustExist)
      : failedRegistration();
  }

  async revokeGrant(windowId: number, handle: string): Promise<void> {
    await this.generationReady;
    this.child?.postMessage({ type: "revokeGrant", windowId, handle });
  }

  async revokeWindow(windowId: number): Promise<void> {
    this.receivers.delete(windowId);
    await this.generationReady;
    this.child?.postMessage({ type: "revokeWindow", windowId });
  }

  async attachWindow(windowId: number, receive: PortReceiver): Promise<void> {
    this.receivers.set(windowId, receive);
    await this.generationReady;
    if (this.child && !this.stopped) {
      this.issuePort(windowId, receive);
    } else {
      this.issueFailurePort(receive);
    }
  }

  private spawnChild(): Promise<void> {
    const child = this.dependencies.fork();
    this.child = child;
    child.on("message", (message) => this.handleReply(message));
    child.once("exit", (code) => this.handleExit(child, code));
    // A child that exits before spawning must not leave callers waiting on this generation.
    return new Promise<void>((resolve) => {
      child.once("spawn", resolve);
      child.once("exit", () => resolve());
    });
  }

  private handleReply(message: unknown): void {
    if (!isRegisterGrantReply(message)) {
      const id = ioRequestId(message);
      if (id) {
        this.settleRegistration(id, {
          ok: false,
          error: serviceError("BAD_REQUEST", "request.invalid"),
        });
      }
      return;
    }
    const result: Result<RegisteredGrant> = message.result.ok
      ? message.result
      : { ok: false, error: toServiceError(message.result.error) };
    this.settleRegistration(message.id, result);
  }

  private settleRegistration(id: string, result: Result<RegisteredGrant>): void {
    const pending = this.pending.get(id);
    if (pending) {
      this.pending.delete(id);
      pending.resolve(result);
    }
  }

  private sendRegistration(
    windowId: number,
    handle: string,
    filePath: string,
    mustExist: boolean,
  ): Promise<Result<RegisteredGrant>> {
    const id = `control-${this.nextRequestId++}`;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      const child = this.child;
      if (!child) {
        this.settleRegistration(id, failedRegistration());
        return;
      }
      try {
        child.postMessage({
          type: "registerGrant",
          id,
          windowId,
          handle,
          path: filePath,
          mustExist,
        });
      } catch {
        this.settleRegistration(id, failedRegistration());
      }
    });
  }

  private handleExit(child: UtilityProcess, code: number): void {
    if (this.child !== child || this.stopping) {
      return;
    }
    this.dependencies.logExit(code, null);
    this.child = null;
    this.failPending();
    const cutoff = this.dependencies.now() - restartWindowMilliseconds;
    while ((this.restartTimes[0] ?? Number.POSITIVE_INFINITY) <= cutoff) {
      this.restartTimes.shift();
    }
    if (this.restartTimes.length >= maximumRestarts) {
      this.stopped = true;
      for (const receive of this.receivers.values()) {
        this.issueFailurePort(receive);
      }
      return;
    }
    this.restartTimes.push(this.dependencies.now());
    this.generationReady = this.recover();
  }

  private async recover(): Promise<void> {
    await this.spawnChild();
    for (const [windowId] of this.receivers) {
      for (const grant of this.grants.entries(windowId)) {
        await this.sendRegistration(
          windowId,
          grant.handle,
          grant.canonicalPath,
          false,
        );
      }
    }
    for (const [windowId, receive] of this.receivers) {
      this.issuePort(windowId, receive);
    }
  }

  private issuePort(windowId: number, receive: PortReceiver): void {
    const channel = this.dependencies.createChannel();
    this.child?.postMessage({ type: "attachPort", windowId }, [channel.port1]);
    receive(channel.port2);
  }

  private issueFailurePort(receive: PortReceiver): void {
    const channel = this.dependencies.createChannel();
    channel.port1.on("message", (event) => {
      const id = ioRequestId(event.data);
      if (id) {
        channel.port1.postMessage({ id, result: failedRegistration() });
      }
    });
    channel.port1.start();
    this.failurePorts.push(channel.port1);
    receive(channel.port2);
  }

  private failPending(): void {
    for (const pending of this.pending.values()) {
      pending.resolve(failedRegistration());
    }
    this.pending.clear();
  }
}

export function createIoWorkerSupervisor(
  workerPath: string,
  grants: GrantTable,
  logExit: (code: number, signal: string | null) => void,
): IoWorkerSupervisor {
  return new IoWorkerSupervisor(grants, {
    fork: () => utilityProcess.fork(workerPath, [], { serviceName: "io-worker" }),
    createChannel: () => new MessageChannelMain(),
    now: () => Date.now(),
    logExit,
  });
}
