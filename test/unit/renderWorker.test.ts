import { ChangeSet, Text } from "@codemirror/state";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenderWorkerHandler } from "../../src/renderer/workers/render/handler";
import type {
  RenderResponse,
  RenderWorkerRequest,
} from "../../src/shared/workers/render";

function text(value: string): Text {
  return Text.of(value.split("\n"));
}

class FakeWorkerScope {
  readonly responses: RenderResponse[] = [];

  postMessage = (response: RenderResponse): void => {
    this.responses.push(response);
  };
}

function send(
  handler: RenderWorkerHandler,
  message: RenderWorkerRequest,
): void {
  handler.handle(message);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("render worker mirror", () => {
  it("AC-R1-07: renders only the exact mirrored document version", () => {
    const scope = new FakeWorkerScope();
    const handler = new RenderWorkerHandler(scope.postMessage);
    send(handler, {
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 0,
      text: "# Rendered",
    });

    send(handler, { op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    send(handler, { op: "render", id: 2, docId: "doc", epoch: 1, version: 1 });
    send(handler, { op: "render", id: 3, docId: "doc", epoch: 2, version: 0 });
    send(handler, { op: "render", id: 4, docId: "missing", epoch: 1, version: 0 });

    expect(scope.responses).toEqual([
      {
        id: 1,
        docId: "doc",
        epoch: 1,
        version: 0,
        ok: true,
        html: '<h1 data-line="0">Rendered</h1>\n',
      },
      { op: "resync", id: 2, docId: "doc", epoch: 1, version: 1 },
      { op: "resync", id: 3, docId: "doc", epoch: 2, version: 0 },
      { op: "resync", id: 4, docId: "missing", epoch: 1, version: 0 },
    ]);
  });

  it("AC-R1-07: replays buffered changes from the resync version after attach", () => {
    const scope = new FakeWorkerScope();
    const handler = new RenderWorkerHandler(scope.postMessage);
    const atVersionOne = text("one");
    const older = ChangeSet.of({ from: 3, insert: " old" }, atVersionOne.length);
    const atVersionTwo = text("two");
    const buffered = ChangeSet.of({ from: 3, insert: " final" }, atVersionTwo.length);

    send(handler, { op: "render", id: 1, docId: "doc", epoch: 3, version: 2 });
    send(handler, {
      op: "change",
      docId: "doc",
      epoch: 3,
      fromVersion: 1,
      toVersion: 2,
      changes: older.toJSON(),
    });
    send(handler, {
      op: "change",
      docId: "doc",
      epoch: 3,
      fromVersion: 2,
      toVersion: 3,
      changes: buffered.toJSON(),
    });
    send(handler, {
      op: "attach",
      docId: "doc",
      epoch: 3,
      version: 2,
      text: atVersionTwo.toString(),
    });
    send(handler, { op: "render", id: 2, docId: "doc", epoch: 3, version: 3 });

    expect(scope.responses).toEqual([
      { op: "resync", id: 1, docId: "doc", epoch: 3, version: 2 },
      {
        id: 2,
        docId: "doc",
        epoch: 3,
        version: 3,
        ok: true,
        html: "<p data-line=\"0\">two final</p>\n",
      },
    ]);
  });

  it("AC-R1-07: buffered changes older than the attach version are dropped", () => {
    const scope = new FakeWorkerScope();
    const handler = new RenderWorkerHandler(scope.postMessage);
    const atVersionOne = text("one");
    const covered = ChangeSet.of({ from: 3, insert: " two" }, atVersionOne.length);
    const atVersionTwo = text("one two");
    const next = ChangeSet.of({ from: 7, insert: " three" }, atVersionTwo.length);

    send(handler, { op: "render", id: 1, docId: "doc", epoch: 3, version: 1 });
    send(handler, {
      op: "change",
      docId: "doc",
      epoch: 3,
      fromVersion: 1,
      toVersion: 2,
      changes: covered.toJSON(),
    });
    send(handler, {
      op: "change",
      docId: "doc",
      epoch: 3,
      fromVersion: 2,
      toVersion: 3,
      changes: next.toJSON(),
    });
    send(handler, {
      op: "attach",
      docId: "doc",
      epoch: 3,
      version: 2,
      text: atVersionTwo.toString(),
    });
    send(handler, { op: "render", id: 2, docId: "doc", epoch: 3, version: 3 });

    expect(scope.responses).toEqual([
      { op: "resync", id: 1, docId: "doc", epoch: 3, version: 1 },
      {
        id: 2,
        docId: "doc",
        epoch: 3,
        version: 3,
        ok: true,
        html: "<p data-line=\"0\">one two three</p>\n",
      },
    ]);
  });

  it("AC-R1-07: a non-chaining buffered change leaves the mirror stale", () => {
    const scope = new FakeWorkerScope();
    const handler = new RenderWorkerHandler(scope.postMessage);

    send(handler, { op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    send(handler, {
      op: "change",
      docId: "doc",
      epoch: 1,
      fromVersion: 1,
      toVersion: 2,
      changes: [],
    });
    send(handler, {
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 0,
      text: "attached",
    });
    send(handler, { op: "render", id: 2, docId: "doc", epoch: 1, version: 0 });

    expect(scope.responses).toEqual([
      { op: "resync", id: 1, docId: "doc", epoch: 1, version: 0 },
      { op: "resync", id: 2, docId: "doc", epoch: 1, version: 0 },
    ]);
  });

  it("AC-R1-07: a malformed buffered change leaves the mirror stale", () => {
    const scope = new FakeWorkerScope();
    const handler = new RenderWorkerHandler(scope.postMessage);

    send(handler, { op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    send(handler, {
      op: "change",
      docId: "doc",
      epoch: 1,
      fromVersion: 0,
      toVersion: 1,
      changes: [99],
    });
    send(handler, {
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 0,
      text: "short",
    });
    send(handler, { op: "render", id: 2, docId: "doc", epoch: 1, version: 1 });

    expect(scope.responses).toEqual([
      { op: "resync", id: 1, docId: "doc", epoch: 1, version: 0 },
      { op: "resync", id: 2, docId: "doc", epoch: 1, version: 1 },
    ]);
  });

  it("AC-R1-07: detach and a newer epoch discard pending resync state", () => {
    const scope = new FakeWorkerScope();
    const handler = new RenderWorkerHandler(scope.postMessage);

    handler.handle({ op: "attach", docId: "doc", epoch: 1, version: 0, text: "old" });
    handler.handle({ op: "detach", docId: "doc" });
    handler.handle({ op: "render", id: 1, docId: "doc", epoch: 1, version: 0 });
    handler.handle({ op: "change", docId: "doc", epoch: 2,
      fromVersion: 0, toVersion: 1, changes: [] });
    handler.handle({ op: "attach", docId: "doc", epoch: 3, version: 0, text: "new" });
    handler.handle({ op: "render", id: 2, docId: "doc", epoch: 3, version: 0 });
    handler.handle({ op: "render", id: 3, docId: "doc", epoch: 2, version: 1,
      extra: true });

    expect(scope.responses).toEqual([
      { op: "resync", id: 1, docId: "doc", epoch: 1, version: 0 },
      {
        id: 2,
        docId: "doc",
        epoch: 3,
        version: 0,
        ok: true,
        html: "<p data-line=\"0\">new</p>\n",
      },
    ]);
  });

  it("AC-R1-02: keeps typed render failures with their document version", () => {
    const scope = new FakeWorkerScope();
    const render = vi.fn()
      .mockImplementationOnce(() => { throw new Error("render failed"); })
      .mockImplementationOnce(() => { throw "string failure"; });
    const handler = new RenderWorkerHandler(scope.postMessage, render);
    send(handler, {
      op: "attach",
      docId: "doc",
      epoch: 4,
      version: 7,
      text: "broken",
    });

    send(handler, { op: "render", id: 9, docId: "doc", epoch: 4, version: 7 });
    send(handler, { op: "render", id: 10, docId: "doc", epoch: 4, version: 7 });

    expect(scope.responses).toEqual([{
      id: 9,
      docId: "doc",
      epoch: 4,
      version: 7,
      ok: false,
      message: "render failed",
    }, {
      id: 10,
      docId: "doc",
      epoch: 4,
      version: 7,
      ok: false,
      message: "string failure",
    }]);
  });

  it("AC-R1-07: the worker entry validates and dispatches scope messages", async () => {
    const workerScope = {
      onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal("self", workerScope);
    vi.resetModules();
    await import("../../src/renderer/workers/render/render.worker");

    workerScope.onmessage?.({ data: {
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 0,
      text: "entry",
    } } as unknown as MessageEvent<unknown>);
    workerScope.onmessage?.({ data: {
      op: "render",
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 0,
    } } as unknown as MessageEvent<unknown>);

    expect(workerScope.postMessage).toHaveBeenCalledWith({
      id: 1,
      docId: "doc",
      epoch: 1,
      version: 0,
      ok: true,
      html: "<p data-line=\"0\">entry</p>\n",
    });
  });
});

interface Generator {
  next(limit: number): number;
}

function generator(seed: number): Generator {
  let state = seed >>> 0;
  return {
    next(limit) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state % limit;
    },
  };
}

function randomInsert(random: Generator): string {
  const alphabet = ["a", "b", "c", "\n", "xy"] as const;
  return alphabet[random.next(alphabet.length)] ?? "";
}

interface PropertyState {
  epoch: number;
  version: number;
  document: Text;
  versions: Map<string, Text>;
}

function versionKey(epoch: number, version: number): string {
  return `${String(epoch)}:${String(version)}`;
}

function assertResponses(scope: FakeWorkerScope, state: PropertyState, seed: number): void {
  for (const response of scope.responses.splice(0)) {
    if ("op" in response) {
      expect(response.op, `seed ${seed}`).toBe("resync");
      continue;
    }
    expect(response.ok, `seed ${seed}`).toBe(true);
    if (response.ok) {
      const expected = state.versions.get(versionKey(response.epoch, response.version));
      expect(expected, `seed ${seed}`).toBeDefined();
      expect(response.html, `seed ${seed}`).toBe(expected?.toString());
    }
  }
}

function runProperty(seed: number): void {
  const random = generator(seed);
  const scope = new FakeWorkerScope();
  let handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
  const state: PropertyState = {
    epoch: 0,
    version: 0,
    document: Text.empty,
    versions: new Map([[versionKey(0, 0), Text.empty]]),
  };
  send(handler, { op: "attach", docId: "doc", epoch: 0, version: 0, text: "" });

  for (let step = 0; step < 30; step += 1) {
    const action = random.next(6);
    if (action === 0) {
      const from = random.next(state.document.length + 1);
      const change = ChangeSet.of({ from, insert: randomInsert(random) }, state.document.length);
      send(handler, { op: "change", docId: "doc", epoch: state.epoch,
        fromVersion: state.version, toVersion: state.version + 1,
        changes: change.toJSON() });
      state.document = change.apply(state.document);
      state.version += 1;
      state.versions.set(versionKey(state.epoch, state.version), state.document);
    } else if (action === 1) {
      const requestedVersion = random.next(state.version + 2);
      send(handler, { op: "render", id: step, docId: "doc", epoch: state.epoch,
        version: requestedVersion });
    } else if (action === 2) {
      send(handler, { op: "attach", docId: "doc", epoch: state.epoch,
        version: state.version, text: state.document.toString() });
    } else if (action === 3) {
      handler = new RenderWorkerHandler(scope.postMessage, (source) => source);
    } else if (action === 4) {
      state.epoch += 1;
      state.version = 0;
      state.document = text(randomInsert(random));
      state.versions.set(versionKey(state.epoch, 0), state.document);
      send(handler, { op: "attach", docId: "doc", epoch: state.epoch,
        version: 0, text: state.document.toString() });
    } else {
      send(handler, { op: "render", id: step, docId: "doc", epoch: state.epoch,
        version: state.version });
    }
    assertResponses(scope, state, seed);
  }
}

describe("render worker mirror property", () => {
  it("AC-R1-07: successful renders match their version over 500 seeded interleavings", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      runProperty(seed);
    }
  });
});
