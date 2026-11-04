export interface DocumentState {
  currentGrant: string | null;
  currentName: string | null;
  dirty: boolean;
  applyingDocument: boolean;
  productName: string;
}

export function createDocumentState(): DocumentState {
  return {
    currentGrant: null,
    currentName: null,
    dirty: false,
    applyingDocument: false,
    productName: "",
  };
}

export function documentTitle(state: DocumentState): string {
  const name = state.currentName ?? "Untitled";
  return `${state.dirty ? "• " : ""}${name}${
    state.productName ? ` — ${state.productName}` : ""
  }`;
}

interface ReplacementInput {
  currentGrant: string | null;
  newGrant: string;
  dirty: boolean;
  confirmDiscard(): boolean;
  release(grant: string): Promise<void>;
}

export async function settleDocumentReplacement(
  input: ReplacementInput,
): Promise<boolean> {
  const accepted = !input.dirty || input.confirmDiscard();
  const releasedGrant = accepted ? input.currentGrant : input.newGrant;
  if (releasedGrant) {
    await input.release(releasedGrant);
  }
  return accepted;
}
