import type { CompareViewState } from "./viewState";

export interface CompareRequest {
  readonly id: number;
  readonly left: readonly string[];
  readonly right: readonly string[];
}

export type CompareResponse =
  | { readonly id: number; readonly ok: true; readonly state: CompareViewState }
  | { readonly id: number; readonly ok: false; readonly message: string };
