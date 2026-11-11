import type { ReplicatedVersion } from "../../core/replication";

export type BlockElements = Map<string, HTMLDivElement>;

export interface BlockLayout {
  section: HTMLDivElement | null;
  page: HTMLDivElement | null;
  blocksInPage: number;
  pagesInSection: number;
}

export interface LineShiftRecord {
  after: string | null;
  delta: number;
  version: number;
}

export interface DocumentPreview {
  container: HTMLDivElement;
  elements: BlockElements;
  shifts: LineShiftRecord[];
  layout: BlockLayout;
  epoch: number;
  version: number;
}

interface ShiftTable {
  root: HTMLElement;
  shifts: readonly LineShiftRecord[];
}

const shiftTables = new WeakMap<HTMLElement, ShiftTable>();

export function recordShiftTable(
  element: HTMLElement,
  root: HTMLElement,
  shifts: readonly LineShiftRecord[],
): void {
  shiftTables.set(element, { root, shifts });
}

function anchorElement(root: HTMLElement, blockId: string): HTMLElement | null {
  const escaped = blockId.replaceAll('"', '\\"');
  return root.querySelector<HTMLElement>(`[data-block-id="${escaped}"]`);
}

// Resolve line shifts lazily, so patches do not rewrite every block attribute.
export function blockLine(element: HTMLElement): number {
  let line = Number(element.dataset["line"] ?? "0");
  const version = Number(element.dataset["version"] ?? "0");
  const table = shiftTables.get(element);
  for (const shift of table?.shifts ?? []) {
    if (shift.version <= version) {
      continue;
    }
    if (shift.after === null) {
      line += shift.delta;
      continue;
    }
    const anchor = table ? anchorElement(table.root, shift.after) : null;
    if (anchor && anchor !== element &&
      (anchor.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
      line += shift.delta;
    }
  }
  return line;
}

export function resetLayout(layout: BlockLayout): void {
  layout.section = null;
  layout.page = null;
  layout.blocksInPage = 0;
  layout.pagesInSection = 0;
}

function createDocumentPreview(epoch: number): DocumentPreview {
  const container = document.createElement("div");
  container.className = "preview-document";
  return {
    container,
    elements: new Map(),
    shifts: [],
    layout: {
      section: null,
      page: null,
      blocksInPage: 0,
      pagesInSection: 0,
    },
    epoch,
    version: -1,
  };
}

export class PreviewDocuments {
  private readonly previews = new Map<string, DocumentPreview>();

  constructor(private readonly host: HTMLElement) {}

  getOrCreate(docId: string, epoch: number): DocumentPreview {
    const current = this.previews.get(docId);
    if (current?.epoch === epoch) {
      return current;
    }
    const created = createDocumentPreview(epoch);
    this.previews.set(docId, created);
    return created;
  }

  display(preview: DocumentPreview): void {
    // Keep an already shown container attached: the fill pass calls this for
    // every acknowledged batch, and re-inserting the whole preview each time
    // invalidates its subtree.
    if (this.host.childNodes.length !== 1 ||
      this.host.firstChild !== preview.container) {
      this.host.replaceChildren(preview.container);
    }
    const renderComplete = preview.container.dataset["renderComplete"] ?? "false";
    if (this.host.dataset["renderComplete"] !== renderComplete) {
      this.host.dataset["renderComplete"] = renderComplete;
    }
  }

  drop(docId: string): void {
    const preview = this.previews.get(docId);
    if (preview?.container.isConnected) {
      this.host.replaceChildren();
    }
    this.previews.delete(docId);
  }

  reset(): void {
    this.previews.clear();
    this.host.replaceChildren();
  }

  show(version: ReplicatedVersion): boolean {
    const preview = this.previews.get(version.docId);
    if (!preview || preview.epoch !== version.epoch) {
      this.host.replaceChildren();
      return false;
    }
    this.display(preview);
    return preview.version >= version.version &&
      preview.container.dataset["renderComplete"] === "true";
  }
}
