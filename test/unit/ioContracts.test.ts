import { describe, expect, it } from "vitest";

import {
  isIoReply,
  isIoRequest,
} from "../../src/shared/ipc/io";
import {
  isIoControlRequest,
  isRegisterGrantReply,
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
  it("AC-SEC-12: accepts only exact read and write requests", () => {
    expect(isIoRequest({ id: "1", op: "read", grant: "grant" })).toBe(true);
    expect(isIoRequest({ id: "2", op: "write", grant: "grant", text: "text" }))
      .toBe(true);

    expect(isIoRequest({ id: "1", op: "read", grant: "grant", extra: true }))
      .toBe(false);
    expect(isIoRequest({ id: 1, op: "read", grant: "grant" })).toBe(false);
    expect(isIoRequest({ id: "1", op: "write", grant: "grant", text: 42 }))
      .toBe(false);
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
      op: "write",
      grant: "grant",
      text: oversizedText,
    })).toBe(false);
  });

  it("AC-SEC-12: accepts only exact typed replies", () => {
    expect(isIoReply({
      id: "1",
      result: { ok: true, value: { name: "note.md", text: "text" } },
    })).toBe(true);
    expect(isIoReply({
      id: "2",
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
