export interface MenuDeclarationItem {
  readonly id: string;
  readonly titleKey: string;
  readonly accelerator: string;
  readonly commandId: string;
}

export interface MenuDeclaration<Item extends MenuDeclarationItem> {
  readonly order: number;
  readonly items: readonly Item[];
}

// Sorts declarations by order (ties keep the given order) and flattens the items.
// Each process composes its own list; src/shared must import nothing.
export function composeMenuItems<
  Declaration extends MenuDeclaration<MenuDeclarationItem>,
>(declarations: readonly Declaration[]): Declaration["items"][number][] {
  return [...declarations]
    .sort((left, right) => left.order - right.order)
    .flatMap((declaration) => declaration.items);
}
