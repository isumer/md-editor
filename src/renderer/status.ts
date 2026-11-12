import type { Result } from "../shared/ipc/result";
import { messageParams } from "./core/document";
import { formatMessage } from "./core/messages";

export interface StatusSurface {
  show(message?: string): void;
  showPreview(message?: string): void;
  showPreviewError(message?: string): void;
  valueOrStatus<T>(result: Result<T>, fileName?: string | null): T | undefined;
  unexpected(error: unknown): void;
}

// A successful render clears only the preview's own error, never a file failure.
export function createStatusSurface(
  status: HTMLElement,
  previewError: HTMLElement,
): StatusSurface {
  let fromPreview = false;
  const show = (message = ""): void => {
    fromPreview = false;
    status.textContent = message;
  };
  return {
    show,
    showPreview(message = "") {
      if (message || fromPreview) {
        status.textContent = message;
        fromPreview = message !== "";
      }
    },
    showPreviewError(message = "") {
      previewError.textContent = message;
      previewError.hidden = message === "";
    },
    valueOrStatus<T>(
      result: Result<T>,
      fileName: string | null = null,
    ): T | undefined {
      if (!result.ok) {
        show(formatMessage(
          result.error.messageKey,
          messageParams(result.error.params, fileName),
        ));
        return undefined;
      }
      return result.value;
    },
    unexpected(error: unknown) {
      show(error instanceof Error ? error.message : String(error));
    },
  };
}
