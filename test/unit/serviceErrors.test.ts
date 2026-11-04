import { describe, expect, it } from "vitest";

import { formatMessage } from "../../src/shared/messages/en";
import {
  serviceError,
  toServiceError,
} from "../../src/shared/ipc/result";

describe("service errors", () => {
  it.each([
    ["ENOENT", "NOT_FOUND", "file.notFound"],
    ["EISDIR", "IS_DIRECTORY", "file.isDirectory"],
    ["EACCES", "PERMISSION_DENIED", "file.permissionDenied"],
    ["EPERM", "PERMISSION_DENIED", "file.permissionDenied"],
    ["ENOSPC", "DISK_FULL", "file.diskFull"],
    ["EEXIST", "CONFLICT", "file.conflict"],
    ["EFBIG", "TOO_LARGE", "file.tooLarge"],
  ])("AC-R5-16: maps %s to %s", (errno, code, messageKey) => {
    expect(toServiceError({ code: errno }, { file: "notes.md" })).toMatchObject({
      code,
      messageKey,
      params: { file: "notes.md" },
    });
  });

  it("AC-R5-16: preserves typed service errors", () => {
    const error = serviceError(
      "GRANT_INVALID",
      "grant.invalid",
      { file: "notes.md" },
      false,
    );

    expect(toServiceError(error)).toBe(error);
  });

  it("AC-R5-16: unknown failures keep a safe reason for the catalog", () => {
    expect(toServiceError(new Error("device vanished"), { file: "notes.md" }))
      .toEqual({
        code: "UNKNOWN",
        messageKey: "file.unknown",
        params: { file: "notes.md", reason: "device vanished" },
        retryable: false,
      });
  });

  it("AC-R5-16: formats named user-facing failures", () => {
    expect(formatMessage("file.isDirectory", { file: "notes" }))
      .toBe("Could not open “notes”: it is a folder.");
    expect(formatMessage("file.permissionDenied", { file: "private.md" }))
      .toBe("Could not access “private.md”: permission was denied.");
    expect(formatMessage("file.unknown", {
      file: "notes.md",
      reason: "device vanished",
    })).toBe("Could not access “notes.md”: device vanished.");
  });

  it("AC-R5-17: tells the user a restarted file service can be retried", () => {
    expect(formatMessage("file.workerRestarted", { file: "notes.md" }))
      .toBe("Could not save “notes.md”: the file service restarted. Try again.");
    expect(serviceError(
      "WORKER_RESTARTED",
      "file.workerRestarted",
      { file: "notes.md" },
      true,
    )).toMatchObject({ retryable: true });
  });

  it("AC-R5-19: tells the user an out-of-sync file service can be retried", () => {
    expect(formatMessage("file.outOfSync", { file: "notes.md" }))
      .toBe(
        "Could not save “notes.md”: the file service lost track of the document. Try again.",
      );
    expect(serviceError(
      "OUT_OF_SYNC",
      "file.outOfSync",
      {},
      true,
    )).toMatchObject({ retryable: true, params: {} });
  });

  it.each([
    "file.notFound",
    "file.isDirectory",
    "file.permissionDenied",
    "file.diskFull",
    "file.conflict",
    "file.tooLarge",
    "file.unknown",
  ] as const)("AC-R5-16: %s names the file in plain words", (key) => {
    const message = formatMessage(key, { file: "notes.md", reason: "device vanished" });

    expect(message).toMatch(/^Could not \w+ “notes\.md”: [a-z][^{}]+\.$/);
  });

  it("AC-R5-16: leaves an unknown catalog placeholder visible", () => {
    expect(formatMessage("file.unknown", { file: "notes.md" }))
      .toBe("Could not access “notes.md”: {reason}.");
    expect(toServiceError({})).toMatchObject({
      params: { reason: "An unexpected error occurred" },
    });
  });
});
