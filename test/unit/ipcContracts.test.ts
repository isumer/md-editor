import { describe, expect, it } from "vitest";

import {
  FILE_CHANNELS,
  isChooseSaveTargetRequest,
  isOpenFileRequest,
  isOpenRequestsReadyRequest,
  isReleaseDocumentRequest,
} from "../../src/shared/ipc/file";
import {
  isOpenExternalRequest,
  LINK_CHANNELS,
} from "../../src/shared/ipc/link";
import {
  isMenuContribution,
  isMenuItemId,
  MENU_CHANNELS,
  MENU_ITEM_IDS,
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
    expect(isChooseSaveTargetRequest({ grant: null })).toBe(true);
    expect(isReleaseDocumentRequest({ grant: "grant" })).toBe(true);

    expect(isOpenFileRequest({ currentGrant: null })).toBe(false);
    expect(isOpenRequestsReadyRequest({ extra: true })).toBe(false);
    expect(isChooseSaveTargetRequest({})).toBe(false);
    expect(isChooseSaveTargetRequest({ grant: {} })).toBe(false);
    expect(isReleaseDocumentRequest({ grant: null })).toBe(false);
  });

  it("AC-SEC-07: file request validators reject hostile own prototype keys", () => {
    expect(isOpenFileRequest(withOwnProto({}))).toBe(false);
    expect(isOpenRequestsReadyRequest(withOwnProto({}))).toBe(false);
    expect(isChooseSaveTargetRequest(withOwnProto({ grant: null }))).toBe(false);
    expect(isReleaseDocumentRequest(withOwnProto({ grant: "grant" }))).toBe(false);
  });

  it("AC-SEC-07: file request validators do not run getters or throw on proxies", () => {
    const getterRequest = {} as Record<string, unknown>;
    Object.defineProperty(getterRequest, "grant", {
      enumerable: true,
      get: () => { throw new Error("getter must not run"); },
    });
    const hostileProxy = new Proxy({}, {
      ownKeys: () => { throw new Error("hostile proxy"); },
    });

    expect(isChooseSaveTargetRequest(getterRequest)).toBe(false);
    expect(isOpenFileRequest(hostileProxy)).toBe(false);
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

  it("AC-SEC-11: contract channel names and menu item ids are fixed", () => {
    expect(FILE_CHANNELS).toEqual({
      openFile: "file:open",
      openPath: "file:open-path",
      chooseSaveTarget: "file:choose-save-target",
      releaseDocument: "file:release-document",
      openRequestsReady: "file:open-requests-ready",
      openRequest: "file:open-request",
    });
    expect(LINK_CHANNELS).toEqual({ openExternal: "link:open-external" });
    expect(MENU_CHANNELS).toEqual({
      command: "menu:command",
      contribute: "menu:contribute",
    });
    expect(MENU_ITEM_IDS.every(isMenuItemId)).toBe(true);
    expect(isMenuItemId("unknown")).toBe(false);
    expect(isMenuContribution({
      fileMenuTitle: "File",
      items: [{ id: "file-open", title: "Open", accelerator: "CmdOrCtrl+O" }],
    })).toBe(true);
  });
});
