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
