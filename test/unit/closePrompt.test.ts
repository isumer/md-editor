import { describe, expect, it } from "vitest";

import {
  closeDocumentsMessage,
  closeFileMessage,
  resolveClosePrompt,
} from "../../src/renderer/core/closePrompt";

describe("close prompt state machine", () => {
  it("AC-R4-04: a clean document closes without asking", () => {
    expect(resolveClosePrompt(false, "cancel")).toBe("close");
    expect(resolveClosePrompt(false, "discard")).toBe("close");
    expect(resolveClosePrompt(false, "save")).toBe("close");
  });

  it("AC-R4-05: a dirty document follows the answer", () => {
    expect(resolveClosePrompt(true, "cancel")).toBe("cancel");
    expect(resolveClosePrompt(true, "discard")).toBe("close");
    expect(resolveClosePrompt(true, "save")).toBe("save");
  });

  it("AC-R4-05: names the file in a single-document prompt", () => {
    expect(closeFileMessage("notes.md")).toBe(
      "“notes.md” has unsaved changes. Save before closing?",
    );
    expect(closeFileMessage(null)).toBe(
      "“Untitled” has unsaved changes. Save before closing?",
    );
  });

  it("AC-R4-06: lists every dirty document in a quit prompt", () => {
    expect(closeDocumentsMessage(["a.md", "b.md"])).toBe(
      "These documents have unsaved changes: “a.md”, “b.md”",
    );
    expect(closeDocumentsMessage([null])).toBe(
      "These documents have unsaved changes: “Untitled”",
    );
  });
});
