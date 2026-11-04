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

// Errors raised without a file name (a restarted file service) name the file the renderer asked about.
export function messageParams(
  params: Readonly<Record<string, string>>,
  fileName: string | null,
): Readonly<Record<string, string>> {
  return { file: fileName ?? "Untitled", ...params };
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
