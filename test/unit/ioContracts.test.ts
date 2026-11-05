import { describe, expect, it } from "vitest";

import {
  ioRequestId,
  ioMessageOperation,
  isIoReply,
  isIoOneWayMessage,
  isIoRequest,
} from "../../src/shared/ipc/io";
import {
  isIoControlRequest,
  isRegisterGrantReply,
  isResolveAssetReply,
  controlRequestId,
  MAX_ASSET_RELATIVE_PATH_LENGTH,
} from "../../src/shared/ipc/ioControl";

function withOwnProto<T extends object>(value: T): T {
  Object.defineProperty(value, "__proto__", {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
  });
  return value;
}

describe("io-worker contracts", () => {
  it("AC-SEC-12 AC-SEC-13: accepts only exact read, attach, and save requests", () => {
    expect(isIoRequest({ id: "1", op: "read", grant: "grant" })).toBe(true);
    expect(isIoRequest({
      id: "2",
      op: "attach",
      docId: "doc",
      epoch: 1,
      version: 0,
      text: "text",
    })).toBe(true);
    expect(isIoRequest({
      id: "3",
      op: "save",
      grant: "grant",
      docId: "doc",
      epoch: 1,
      version: 2,
    })).toBe(true);
    expect(isIoRequest({
      id: "4",
      op: "draft",
      grant: "grant",
      docId: "doc",
      epoch: 1,
      version: 2,
    })).toBe(true);
    expect(isIoRequest({ id: "5", op: "drafts" })).toBe(true);

    expect(isIoRequest({ id: "1", op: "read", grant: "grant", extra: true }))
      .toBe(false);
    expect(isIoRequest({ id: 1, op: "read", grant: "grant" })).toBe(false);
    expect(isIoRequest({ id: "1", op: "save", grant: "grant", text: "forbidden" }))
      .toBe(false);
    expect(isIoRequest({
      id: "4",
      op: "draft",
      grant: "grant",
      docId: "doc",
      epoch: 1,
      version: 2,
      text: "forbidden",
    })).toBe(false);
    expect(isIoRequest({ id: "5", op: "drafts", extra: true })).toBe(false);
    expect(isIoRequest(withOwnProto({ id: "1", op: "read", grant: "grant" })))
      .toBe(false);
  });

  it("AC-SEC-12: rejects hostile and oversized port requests", () => {
    const hostileProxy = new Proxy({}, {
      ownKeys: () => { throw new Error("hostile proxy"); },
    });
    const oversizedText = "x".repeat(257 * 1024 * 1024);

    expect(isIoRequest(hostileProxy)).toBe(false);
    expect(isIoRequest({
      id: "oversized",
      op: "attach",
      docId: "doc",
      epoch: 0,
      version: 0,
      text: oversizedText,
    })).toBe(false);
  });

  it("AC-R5-18: refuses a save request that carries document text", () => {
    expect(isIoRequest({
      id: "save",
      op: "save",
      grant: "grant",
      docId: "doc",
      epoch: 0,
      version: 1,
      text: "must not cross the port",
    })).toBe(false);
  });

  it("AC-SEC-13: accepts only exact consecutive change and detach messages", () => {
    const change = {
      op: "change",
      docId: "doc",
      epoch: 2,
      fromVersion: 4,
      toVersion: 5,
      changes: [3, [0, "line one", "line two"]],
    };
    expect(isIoOneWayMessage(change)).toBe(true);
    expect(isIoOneWayMessage({ op: "detach", docId: "doc" })).toBe(true);
    expect(isIoOneWayMessage({ op: "clear-draft", docId: "doc" })).toBe(true);
    expect(isIoOneWayMessage({ op: "clear-draft", docId: "doc", extra: true }))
      .toBe(false);

    expect(isIoOneWayMessage({ ...change, extra: true })).toBe(false);
    expect(isIoOneWayMessage({ ...change, toVersion: 6 })).toBe(false);
    expect(isIoOneWayMessage({ ...change, changes: [[1, 2]] })).toBe(false);
    expect(isIoOneWayMessage(withOwnProto({ ...change }))).toBe(false);

    const accessorChange = { ...change };
    Object.defineProperty(accessorChange, "docId", { get: () => "doc" });
    const accessorChanges = [0];
    Object.defineProperty(accessorChanges, "0", { get: () => 0 });
    const extraChanges = [0];
    Object.defineProperty(extraChanges, "extra", { value: true });
    const hostileChanges = new Proxy([], {
      ownKeys: () => { throw new Error("hostile changes"); },
    });
    for (const changes of [{}, [[]], [[0, 1]], accessorChanges, extraChanges,
      hostileChanges]) {
      expect(isIoOneWayMessage({ ...change, changes })).toBe(false);
    }
    expect(isIoOneWayMessage(accessorChange)).toBe(false);
  });

  it("AC-SEC-13: reads a candidate operation without invoking hostile input", () => {
    expect(ioMessageOperation({ op: "change" })).toBe("change");
    expect(ioMessageOperation(null)).toBeNull();
    expect(ioMessageOperation(new Proxy({}, {
      getOwnPropertyDescriptor: () => { throw new Error("hostile operation"); },
    }))).toBeNull();
  });

  it("AC-SEC-13: rejects unsafe epochs and versions", () => {
    const attach = {
      id: "attach",
      op: "attach",
      docId: "doc",
      epoch: 0,
      version: 0,
      text: "",
    };
    for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(isIoRequest({ ...attach, epoch: invalid })).toBe(false);
      expect(isIoRequest({ ...attach, version: invalid })).toBe(false);
    }
  });

  it("AC-SEC-12: accepts only exact typed replies", () => {
    expect(isIoReply({
      id: "1",
      result: {
        ok: true,
        value: { canonicalPath: "/tmp/note.md", name: "note.md", text: "text" },
      },
    })).toBe(true);
    expect(isIoReply({
      id: "1",
      result: { ok: true, value: { name: "note.md", text: "text" } },
    })).toBe(false);
    expect(isIoReply({
      id: "2",
      result: { ok: true, value: { name: "note.md", version: 2 } },
    })).toBe(true);
    expect(isIoReply({
      id: "drafts",
      result: { ok: true, value: { drafts: [{ grant: "grant", text: "draft" }] } },
    })).toBe(true);
    expect(isIoReply({
      id: "drafts",
      result: { ok: true, value: { drafts: [{ grant: "grant" }] } },
    })).toBe(false);
    expect(isIoReply({
      id: "attach",
      result: { ok: true, value: {} },
    })).toBe(true);
    expect(isIoReply({
      id: "3",
      result: { ok: false, error: {
        code: "BAD_REQUEST",
        messageKey: "request.invalid",
        params: {},
        retryable: false,
      } },
    })).toBe(true);
    expect(isIoReply({ id: "1", result: { ok: true } })).toBe(false);
  });
});

describe("io-worker control contracts", () => {
  it("AC-SEC-07: accepts every exact control message", () => {
    expect(isIoControlRequest({
      type: "registerGrant",
      id: "1",
      windowId: 7,
      handle: "grant",
      path: "/tmp/note.md",
      mustExist: true,
    })).toBe(true);
    expect(isIoControlRequest({
      type: "revokeGrant",
      windowId: 7,
      handle: "grant",
    })).toBe(true);
    expect(isIoControlRequest({ type: "revokeWindow", windowId: 7 })).toBe(true);
    expect(isIoControlRequest({ type: "attachPort", windowId: 7 })).toBe(true);
  });

  it("AC-SEC-07: rejects invalid and hostile control messages", () => {
    expect(isIoControlRequest({
      type: "registerGrant",
      id: "1",
      windowId: 7,
      handle: "grant",
      path: "/tmp/note.md",
      mustExist: true,
      extra: true,
    })).toBe(false);
    expect(isIoControlRequest({
      type: "registerGrant",
      id: "1",
      windowId: "7",
      handle: "grant",
      path: "/tmp/note.md",
      mustExist: true,
    })).toBe(false);
    expect(isIoControlRequest(withOwnProto({ type: "revokeWindow", windowId: 7 })))
      .toBe(false);
    expect(isIoControlRequest(new Proxy({}, {
      ownKeys: () => { throw new Error("hostile proxy"); },
    }))).toBe(false);
  });

  it("AC-SEC-17: accepts exactly the valid resolveAsset shapes", () => {
    const request = {
      type: "resolveAsset",
      id: "resolve-1",
      windowId: 7,
      grant: "grant",
      relativePath: "images/pic.png",
    };

    expect(isIoControlRequest(request)).toBe(true);
    expect(isIoControlRequest({ ...request, relativePath: "a".repeat(
      MAX_ASSET_RELATIVE_PATH_LENGTH,
    ) })).toBe(true);
  });

  it("AC-SEC-17: rejects hostile resolveAsset shapes", () => {
    const request = {
      type: "resolveAsset",
      id: "resolve-1",
      windowId: 7,
      grant: "grant",
      relativePath: "images/pic.png",
    };
    const oversized = "a".repeat(MAX_ASSET_RELATIVE_PATH_LENGTH + 1);
    const hostile = [
      { ...request, extra: true },
      { ...request, id: "" },
      { ...request, id: 1 },
      { ...request, windowId: 0 },
      { ...request, windowId: 7.5 },
      { ...request, windowId: "7" },
      { ...request, grant: "" },
      { ...request, grant: 7 },
      { ...request, relativePath: "" },
      { ...request, relativePath: oversized },
      { ...request, relativePath: 7 },
      withOwnProto({ ...request }),
      new Proxy({}, { ownKeys: () => { throw new Error("hostile proxy"); } }),
    ];

    for (const value of hostile) {
      expect(isIoControlRequest(value)).toBe(false);
    }
  });

  it("AC-SEC-17: validates resolveAsset replies before main accepts them", () => {
    const reply = {
      id: "resolve-1",
      result: { ok: true, value: { path: "/documents/pic.png" } },
    };
    const failureReply = failure({ file: "pic.png" });

    expect(isResolveAssetReply(reply)).toBe(true);
    expect(isResolveAssetReply(failureReply)).toBe(true);
    expect(isResolveAssetReply({
      id: "resolve-1",
      result: { ok: true, value: { path: "" } },
    })).toBe(false);
    expect(isResolveAssetReply({
      id: "resolve-1",
      result: { ok: true, value: { path: "/documents/pic.png", extra: true } },
    })).toBe(false);
    expect(isResolveAssetReply({
      id: "resolve-1",
      result: { ok: true, value: { canonicalPath: "/documents/pic.png", name: "pic.png" } },
    })).toBe(false);
    expect(isResolveAssetReply(withOwnProto(reply))).toBe(false);
  });

  it("AC-SEC-07: validates register replies before main accepts them", () => {
    expect(isRegisterGrantReply({
      id: "1",
      result: {
        ok: true,
        value: { canonicalPath: "/tmp/note.md", name: "note.md" },
      },
    })).toBe(true);
    expect(isRegisterGrantReply({
      id: "1",
      result: { ok: true, value: { canonicalPath: "/tmp/note.md" } },
    })).toBe(false);
    expect(isRegisterGrantReply(withOwnProto({
      id: "1",
      result: {
        ok: true,
        value: { canonicalPath: "/tmp/note.md", name: "note.md" },
      },
    }))).toBe(false);
  });
});

function failure(params: unknown) {
  return {
    id: "1",
    result: {
      ok: false,
      error: { code: "NOT_FOUND", messageKey: "file.notFound", params, retryable: false },
    },
  };
}

// io.ts and ioControl.ts each carry their own validators (shared/ imports nothing).
const replyValidators = [
  { name: "port", isReply: isIoReply, success: { name: "a.md", version: 1 } },
  {
    name: "control",
    isReply: isRegisterGrantReply,
    success: { canonicalPath: "/tmp/a.md", name: "a.md" },
  },
] as const;
const requestIdReaders = [
  { name: "port", read: ioRequestId },
  { name: "control", read: controlRequestId },
] as const;

describe("boundary validators", () => {
  it.each(replyValidators)(
    "AC-SEC-12: $name replies accept typed failures and reject malformed params",
    ({ isReply, success }) => {
      const getterParams = {};
      Object.defineProperty(getterParams, "file", { enumerable: true, get: () => "a.md" });
      const hostile = new Proxy({}, { ownKeys: () => { throw new Error("hostile proxy"); } });

      expect(isReply({ id: "1", result: { ok: true, value: success } })).toBe(true);
      expect(isReply(failure({ file: "a.md" }))).toBe(true);
      for (const params of [null, ["a.md"], { file: 1 }, { [Symbol("file")]: "a.md" },
        getterParams, hostile]) {
        expect(isReply(failure(params))).toBe(false);
      }
      expect(isReply([{ id: "1", result: { ok: true, value: success } }])).toBe(false);
    },
  );

  it.each(requestIdReaders)(
    "AC-SEC-12: $name ids come only from an own string data property",
    ({ read }) => {
      const getter = {};
      Object.defineProperty(getter, "id", { get: () => "io-1" });
      const hostile = new Proxy({}, {
        getOwnPropertyDescriptor: () => { throw new Error("hostile proxy"); },
      });

      expect(read({ id: "io-1", extra: true })).toBe("io-1");
      for (const value of [null, "io-1", { id: 1 }, { id: "" }, { id: "x".repeat(129) },
        getter, hostile]) {
        expect(read(value)).toBeNull();
      }
    },
  );

  it("AC-SEC-07: reads only own data properties for exact shapes", () => {
    const accessor = { type: "revokeWindow" };
    Object.defineProperty(accessor, "windowId", { enumerable: true, get: () => 7 });

    expect(isIoControlRequest(accessor)).toBe(false);
    expect(isIoControlRequest([{ type: "revokeWindow", windowId: 7 }])).toBe(false);
    expect(isIoRequest([{ id: "1", op: "read", grant: "grant" }])).toBe(false);
  });
});
