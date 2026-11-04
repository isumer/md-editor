import { describe, expect, it } from "vitest";

import {
  FILE_CHANNELS,
  isOpenFileRequest,
  isOpenRequestsReadyRequest,
  isSaveFileAsRequest,
  isSaveFileRequest,
} from "../../src/shared/ipc/file";
import {
  isOpenExternalRequest,
  LINK_CHANNELS,
} from "../../src/shared/ipc/link";
import {
  isMenuCommand,
  MENU_CHANNELS,
} from "../../src/shared/ipc/menu";

function withOwnProto<T extends object>(value: T): T {
  Object.defineProperty(value, "__proto__", {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
  });
  return value;
}

describe("IPC contracts", () => {
  it("AC-SEC-07: file request validators accept only their exact shapes", () => {
    expect(isOpenFileRequest({})).toBe(true);
    expect(isOpenRequestsReadyRequest({})).toBe(true);
    expect(isSaveFileRequest({ grant: null, text: "text" })).toBe(true);
    expect(isSaveFileAsRequest({ grant: "grant", text: "text" })).toBe(true);

    expect(isOpenFileRequest({ currentGrant: null })).toBe(false);
    expect(isOpenRequestsReadyRequest({ extra: true })).toBe(false);
    expect(isSaveFileRequest({ grant: null })).toBe(false);
    expect(isSaveFileRequest({ grant: null, text: 1 })).toBe(false);
    expect(isSaveFileAsRequest({ grant: {}, text: "text" })).toBe(false);
  });

  it("AC-SEC-07: file request validators reject hostile own prototype keys", () => {
    expect(isOpenFileRequest(withOwnProto({}))).toBe(false);
    expect(isOpenRequestsReadyRequest(withOwnProto({}))).toBe(false);
    expect(isSaveFileRequest(withOwnProto({ grant: null, text: "text" }))).toBe(false);
    expect(isSaveFileAsRequest(withOwnProto({ grant: null, text: "text" }))).toBe(false);
  });

  it("AC-SEC-07: file request validators do not run getters or throw on proxies", () => {
    const getterRequest = { grant: null } as Record<string, unknown>;
    Object.defineProperty(getterRequest, "text", {
      enumerable: true,
      get: () => { throw new Error("getter must not run"); },
    });
    const hostileProxy = new Proxy({}, {
      ownKeys: () => { throw new Error("hostile proxy"); },
    });

    expect(isSaveFileRequest(getterRequest)).toBe(false);
    expect(isOpenFileRequest(hostileProxy)).toBe(false);
  });

  it("AC-SEC-07: file request validators reject 257 MiB of text", () => {
    const oversizedText = "x".repeat(257 * 1024 * 1024);

    expect(isSaveFileRequest({ grant: null, text: oversizedText })).toBe(false);
  });

  it("AC-SEC-07 AC-SEC-08: link requests have exact keys, types, and limits", () => {
    expect(isOpenExternalRequest({ url: "https://example.com" })).toBe(true);
    expect(isOpenExternalRequest(null)).toBe(false);
    expect(isOpenExternalRequest([])).toBe(false);
    expect(isOpenExternalRequest({ url: 42 })).toBe(false);
    expect(isOpenExternalRequest({ url: "x".repeat(8 * 1024 + 1) })).toBe(false);
    expect(isOpenExternalRequest({ url: "https://example.com", extra: true })).toBe(false);
    expect(isOpenExternalRequest(withOwnProto({ url: "https://example.com" }))).toBe(false);
  });

  it("AC-SEC-08: link validation does not run getters or throw on proxies", () => {
    const getterRequest = {} as Record<string, unknown>;
    Object.defineProperty(getterRequest, "url", {
      enumerable: true,
      get: () => { throw new Error("getter must not run"); },
    });
    const hostileProxy = new Proxy({}, {
      ownKeys: () => { throw new Error("hostile proxy"); },
    });

    expect(isOpenExternalRequest(getterRequest)).toBe(false);
    expect(isOpenExternalRequest(hostileProxy)).toBe(false);
  });

  it("AC-SEC-11: contract channel names and menu commands are fixed", () => {
    expect(FILE_CHANNELS).toEqual({
      openFile: "file:open",
      saveFile: "file:save",
      saveFileAs: "file:save-as",
      openRequestsReady: "file:open-requests-ready",
      openRequest: "file:open-request",
    });
    expect(LINK_CHANNELS).toEqual({ openExternal: "link:open-external" });
    expect(MENU_CHANNELS).toEqual({ command: "menu:command" });
    expect(["open", "save", "saveAs"].every(isMenuCommand)).toBe(true);
    expect(isMenuCommand("unknown")).toBe(false);
  });
});
