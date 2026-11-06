import { describe, expect, it } from "vitest";

import {
  MAX_SESSION_TEXT_LENGTH,
  SESSION_CHANNELS,
  isSessionCloseResult,
  isSessionLoadRequest,
  sessionContracts,
} from "../../src/shared/ipc/session";

function withOwnProto<T extends object>(value: T): T {
  Object.defineProperty(value, "__proto__", {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
  });
  return value;
}

const validDocument = {
  grant: "grant",
  name: "note.md",
  savedText: "old",
  text: "new",
};

const validClose = {
  allow: true,
  documents: [validDocument],
  id: 1,
};

describe("session IPC contracts", () => {
  it("AC-R4-08: accepts exactly an empty load request", () => {
    expect(isSessionLoadRequest({})).toBe(true);
    expect(sessionContracts.load.channel).toBe(SESSION_CHANNELS.load);

    for (const value of [
      null,
      [],
      "request",
      { id: 1 },
      withOwnProto({}),
      new Proxy({}, { ownKeys: () => { throw new Error("hostile"); } }),
    ]) {
      expect(isSessionLoadRequest(value)).toBe(false);
    }
    const accessor = {};
    Object.defineProperty(accessor, "id", { enumerable: true, get: () => 1 });
    expect(isSessionLoadRequest(accessor)).toBe(false);
  });

  it("AC-R4-06: accepts a valid close result with a grant and a document list", () => {
    expect(isSessionCloseResult(validClose)).toBe(true);
    expect(sessionContracts.closeResult.channel).toBe(SESSION_CHANNELS.closeResult);
  });

  it("AC-SEC-07: rejects close results with invalid scalar fields", () => {
    for (const value of [
      null,
      [],
      { ...validClose, allow: "yes" },
      { ...validClose, id: 0 },
      { ...validClose, id: 1.5 },
      { ...validClose, id: "1" },
      withOwnProto({ ...validClose }),
    ]) {
      expect(isSessionCloseResult(value)).toBe(false);
    }
    const accessor = { ...validClose };
    Object.defineProperty(accessor, "allow", { enumerable: true, get: () => true });
    expect(isSessionCloseResult(accessor)).toBe(false);
  });

  it("AC-SEC-07: rejects a documents value that is not a plain array", () => {
    const badLength = new Proxy([], {
      getOwnPropertyDescriptor: (target, key) => key === "length"
        ? { configurable: false, enumerable: false, value: "1", writable: true }
        : Reflect.getOwnPropertyDescriptor(target, key),
    });
    for (const documents of ["documents", null, {}, badLength]) {
      expect(isSessionCloseResult({ ...validClose, documents })).toBe(false);
    }

    const extraKey = [validDocument] as unknown[] & { extra?: boolean };
    extraKey.extra = true;
    expect(isSessionCloseResult({ ...validClose, documents: extraKey })).toBe(false);

    const accessorIndex = [validDocument];
    Object.defineProperty(accessorIndex, "0", {
      enumerable: true,
      get: () => validDocument,
    });
    expect(isSessionCloseResult({ ...validClose, documents: accessorIndex }))
      .toBe(false);

    const hostile = new Proxy([], {
      ownKeys: () => { throw new Error("hostile array"); },
    });
    expect(isSessionCloseResult({ ...validClose, documents: hostile })).toBe(false);
  });

  it("AC-SEC-07: rejects more than 512 documents", () => {
    const documents = Array.from({ length: 513 }, () => validDocument);
    expect(isSessionCloseResult({ ...validClose, documents })).toBe(false);
  });

  it("AC-SEC-07: rejects a malformed document entry", () => {
    const invalidDocuments = [
      null,
      1,
      [],
      { ...validDocument, extra: true },
      { ...validDocument, grant: "" },
      { ...validDocument, grant: 7 },
      { ...validDocument, grant: "g".repeat(8 * 1024 + 1) },
      { ...validDocument, name: 7 },
      { ...validDocument, name: "n".repeat(1025) },
      { ...validDocument, savedText: 7 },
      { ...validDocument, savedText: "s".repeat(MAX_SESSION_TEXT_LENGTH + 1) },
      { ...validDocument, text: null },
      withOwnProto({ ...validDocument }),
    ];
    for (const document of invalidDocuments) {
      expect(isSessionCloseResult({ ...validClose, documents: [document] }))
        .toBe(false);
    }
    expect(isSessionCloseResult({
      ...validClose,
      documents: [validDocument, validDocument],
    })).toBe(true);
  });
});
