export interface DocumentState {
  currentPath: string | null;
  dirty: boolean;
  applyingDocument: boolean;
  productName: string;
}

export function createDocumentState(): DocumentState {
  return {
    currentPath: null,
    dirty: false,
    applyingDocument: false,
    productName: "",
  };
}

export function documentTitle(state: DocumentState): string {
  const name = state.currentPath
    ? // split() never yields undefined, but a trailing separator yields "", so fall back on empty.
      (state.currentPath.split(/[\\/]/).pop() || state.currentPath)
    : "Untitled";
  return `${state.dirty ? "• " : ""}${name}${state.productName ? ` — ${state.productName}` : ""}`;
}
