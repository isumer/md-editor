/* eslint-disable max-lines -- Worker supervision stays together to preserve restart state. */
import {
  MessageChannelMain,
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from "electron";

import { ioRequestId } from "../../shared/ipc/io";
import {
  isRegisterGrantReply,
  isResolveAssetReply,
  isResolveWorkspaceFileReply,
  isSessionReadReply,
  isSessionWriteReply,
  isSettingsReadReply,
  isSettingsWriteReply,
  type RegisteredGrant,
  type ResolvedAsset,
  type ResolvedWorkspaceFile,
  type SettingsReadReply,
  type SettingsWriteReply,
  type StoredSession,
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

interface PendingControl {
  kind: ControlKind;
  resolve(result: Result<unknown>): void;
}

type ControlKind =
  | "registerGrant"
  | "resolveAsset"
  | "resolveWorkspaceFile"
  | "readSession"
  | "writeSession"
  | "readSettings"
  | "writeSettings";

function isReplyFor(kind: ControlKind, message: unknown): boolean {
  if (kind === "registerGrant") {
    return isRegisterGrantReply(message);
  }
  if (kind === "resolveAsset") {
    return isResolveAssetReply(message);
  }
  if (kind === "resolveWorkspaceFile") {
    return isResolveWorkspaceFileReply(message);
  }
  if (kind === "readSession") {
    return isSessionReadReply(message);
  }
  if (kind === "writeSession") {
    return isSessionWriteReply(message);
  }
  if (kind === "readSettings") {
    return isSettingsReadReply(message);
  }
  return isSettingsWriteReply(message);
}

type PortReceiver = (port: MessagePortMain) => void;
type PortLostReceiver = () => void;

interface WindowReceiver {
  receivePort: PortReceiver;
  notifyPortLost: PortLostReceiver;
}

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

function failedControl<T>(): Result<T> {
  return { ok: false, error: workerRestarted() };
}

export class IoWorkerSupervisor {
  private child: UtilityProcess | null = null;
  private generationReady: Promise<void> = Promise.resolve();
  private readonly pending = new Map<string, PendingControl>();
  private readonly receivers = new Map<number, WindowReceiver>();
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
    this.generationReady = this.spawnChild().then(() => undefined);
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
    kind: "document" | "root" = "document",
  ): Promise<Result<RegisteredGrant>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendControl<RegisteredGrant>({
          type: "registerGrant",
          windowId,
          handle,
          path: filePath,
          mustExist,
          kind,
        })
      : failedControl();
  }

  async resolveAsset(
    windowId: number,
    grant: string,
    relativePath: string,
  ): Promise<Result<ResolvedAsset>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendControl<ResolvedAsset>({
          type: "resolveAsset",
          windowId,
          grant,
          relativePath,
        })
      : failedControl();
  }

  async resolveWorkspaceFile(
    windowId: number,
    grant: string,
    relativePath: string,
  ): Promise<Result<ResolvedWorkspaceFile>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendControl<ResolvedWorkspaceFile>({
          type: "resolveWorkspaceFile",
          windowId,
          grant,
          relativePath,
        })
      : failedControl();
  }

  async revokeGrant(windowId: number, handle: string): Promise<void> {
    await this.generationReady;
    this.child?.postMessage({ type: "revokeGrant", windowId, handle });
  }

  async readSession(filePath: string): Promise<Result<StoredSession>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendControl<StoredSession>({ type: "readSession", path: filePath })
      : failedControl();
  }

  async writeSession(
    filePath: string,
    session: StoredSession,
  ): Promise<Result<void>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendControl<void>({ type: "writeSession", path: filePath, session })
      : failedControl();
  }

  async readSettings(filePath: string): Promise<Result<unknown>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendControl<unknown>({ type: "readSettings", path: filePath })
      : failedControl();
  }

  async writeSettings(filePath: string, settings: unknown): Promise<Result<void>> {
    await this.generationReady;
    return this.child && !this.stopped
      ? this.sendControl<void>({ type: "writeSettings", path: filePath, settings })
      : failedControl();
  }

  async revokeWindow(windowId: number): Promise<void> {
    this.receivers.delete(windowId);
    await this.generationReady;
    this.child?.postMessage({ type: "revokeWindow", windowId });
  }

  async attachWindow(
    windowId: number,
    receivePort: PortReceiver,
    notifyPortLost: PortLostReceiver = () => undefined,
  ): Promise<void> {
    this.receivers.set(windowId, { notifyPortLost, receivePort });
    await this.generationReady;
    if (this.child && !this.stopped) {
      this.issuePort(windowId, receivePort);
    } else {
      this.issueFailurePort(receivePort);
    }
  }

  private spawnChild(): Promise<UtilityProcess> {
    const child = this.dependencies.fork();
    this.child = child;
    child.on("message", (message) => this.handleReply(message));
    child.once("exit", (code) => this.handleExit(child, code));
    // A child that exits before spawning must not leave callers waiting on this generation.
    return new Promise<UtilityProcess>((resolve) => {
      child.once("spawn", () => resolve(child));
      child.once("exit", () => resolve(child));
    });
  }

  private handleReply(message: unknown): void {
    const id = ioRequestId(message);
    if (id === null) {
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    if (!isReplyFor(pending.kind, message)) {
      this.settleControl(id, {
        ok: false,
        error: serviceError("BAD_REQUEST", "request.invalid"),
      });
      return;
    }
    const reply = message as {
      id: string;
      result: { ok: true; value: unknown } | { ok: false; error: unknown };
    };
    const result: Result<unknown> = reply.result.ok
      ? reply.result
      : { ok: false, error: toServiceError(reply.result.error) };
    this.settleControl(reply.id, result);
  }

  private settleControl(id: string, result: Result<unknown>): void {
    const pending = this.pending.get(id);
    if (pending) {
      this.pending.delete(id);
      pending.resolve(result);
    }
  }

  private sendControl<T>(
    request: { type: ControlKind } & Record<string, unknown>,
  ): Promise<Result<T>> {
    const id = `control-${this.nextRequestId++}`;
    return new Promise((resolve) => {
      this.pending.set(id, {
        kind: request.type,
        resolve: (result) => resolve(result as Result<T>),
      });
      const child = this.child;
      if (!child) {
        this.settleControl(id, failedControl());
        return;
      }
      try {
        child.postMessage({ id, ...request });
      } catch {
        this.settleControl(id, failedControl());
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
    for (const receiver of this.receivers.values()) {
      // A window that cannot take the signal must not stop the restart for the others.
      try {
        receiver.notifyPortLost();
      } catch {
        // The replacement port still reaches that window, or it is gone.
      }
    }
    const cutoff = this.dependencies.now() - restartWindowMilliseconds;
    while ((this.restartTimes[0] ?? Number.POSITIVE_INFINITY) <= cutoff) {
      this.restartTimes.shift();
    }
    if (this.restartTimes.length >= maximumRestarts) {
      this.stopped = true;
      for (const receiver of this.receivers.values()) {
        this.issueFailurePort(receiver.receivePort);
      }
      return;
    }
    this.restartTimes.push(this.dependencies.now());
    this.generationReady = this.recover();
  }

  private async recover(): Promise<void> {
    const child = await this.spawnChild();
    if (this.child !== child) {
      return;
    }
    for (const [windowId] of this.receivers) {
      for (const grant of this.grants.entries(windowId)) {
        await this.sendControl<RegisteredGrant>({
          type: "registerGrant",
          windowId,
          handle: grant.handle,
          path: grant.canonicalPath,
          mustExist: false,
          kind: grant.kind,
        });
        if (this.child !== child) {
          return;
        }
      }
    }
    for (const [windowId, receiver] of this.receivers) {
      this.issuePort(windowId, receiver.receivePort);
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
        channel.port1.postMessage({ id, result: failedControl() });
      }
    });
    channel.port1.start();
    this.failurePorts.push(channel.port1);
    receive(channel.port2);
  }

  private failPending(): void {
    for (const pending of this.pending.values()) {
      pending.resolve(failedControl());
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
