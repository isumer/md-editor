import { formatMessage } from "../../shared/messages/en";

export type CloseAnswer = "cancel" | "discard" | "save";
export type CloseResolution = "cancel" | "close" | "save";

// A clean document never asks. A dirty one does what the answer says.
export function resolveClosePrompt(
  dirty: boolean,
  answer: CloseAnswer,
): CloseResolution {
  if (!dirty) {
    return "close";
  }
  if (answer === "cancel") {
    return "cancel";
  }
  return answer === "save" ? "save" : "close";
}

export function closeFileMessage(fileName: string | null): string {
  return formatMessage("close.dirtyFile", { file: fileName ?? "Untitled" });
}

export function closeDocumentsMessage(
  names: readonly (string | null)[],
): string {
  const files = names.map((name) => `“${name ?? "Untitled"}”`).join(", ");
  return formatMessage("close.dirtyDocuments", {
    files,
    count: String(names.length),
  });
}
