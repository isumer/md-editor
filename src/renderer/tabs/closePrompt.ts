import {
  closeDocumentsMessage,
  closeFileMessage,
  type CloseAnswer,
} from "../core/closePrompt";
import type { DocumentRecord } from "../core/document";

export function documentCloseMessage(
  documents: readonly Pick<DocumentRecord, "name">[],
): string {
  return documents.length === 1
    ? closeFileMessage(documents[0]?.name ?? null)
    : closeDocumentsMessage(documents.map((document) => document.name));
}

export class DocumentClosePrompt {
  private resolve: ((answer: CloseAnswer) => void) | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly message: HTMLElement,
  ) {
    host.addEventListener("click", (event) => this.handleClick(event));
  }

  ask(documents: readonly DocumentRecord[]): Promise<CloseAnswer> {
    this.message.textContent = documentCloseMessage(documents);
    this.host.hidden = false;
    this.host.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.focus();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private finish(answer: CloseAnswer): void {
    const resolve = this.resolve;
    this.resolve = null;
    this.host.hidden = true;
    resolve?.(answer);
  }

  private handleClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-action]")
      : null;
    const action = target?.dataset["action"];
    if (action === "cancel" || action === "discard" || action === "save") {
      this.finish(action);
    }
  }
}
