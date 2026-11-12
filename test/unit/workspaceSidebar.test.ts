// @vitest-environment jsdom

import { EditorState, Text } from "@codemirror/state";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { formatMessage } from "../../src/renderer/core/messages";

const ok = <T>(value: T) => ({ ok: true, value } as const);
const failure = {
  ok: false,
  error: { code: "UNKNOWN", messageKey: "file.unknown", params: {}, retryable: false },
} as const;

const api = {
  chooseWorkspaceRoot: vi.fn<Window["api"]["chooseWorkspaceRoot"]>(
    async () => ok({ name: "notes" }),
  ),
  listWorkspaceChildren: vi.fn<Window["api"]["listWorkspaceChildren"]>(
    async () => ok([]),
  ),
  openWorkspaceFile: vi.fn<Window["api"]["openWorkspaceFile"]>(
    async () => ok({ canonicalPath: "/notes/daily.md", grant: "grant", name: "daily.md" }),
  ),
  createWorkspaceFile: vi.fn<Window["api"]["createWorkspaceFile"]>(async () => ok(undefined)),
  deleteWorkspaceFile: vi.fn<Window["api"]["deleteWorkspaceFile"]>(async () => ok(undefined)),
  renameWorkspaceFile: vi.fn<Window["api"]["renameWorkspaceFile"]>(async () => ok(undefined)),
  loadSettings: vi.fn<Window["api"]["loadSettings"]>(async () => ok({
    version: 1, theme: "system", fontSize: 14,
    preview: { scrollSync: true, background: null },
    editor: { wrap: true, tabSize: 2, background: null },
    encoding: { default: "utf-8", lineEndings: "lf" }, ignore: [],
  })),
  saveSettings: vi.fn<Window["api"]["saveSettings"]>(async () => ok(undefined)),
  onWorkspaceChange: vi.fn<Window["api"]["onWorkspaceChange"]>(() => () => undefined),
};

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: api as unknown as Window["api"],
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  delete document.documentElement.dataset["sidebarShortcutReady"];
  delete document.documentElement.dataset["sidebarTogglePending"];
  api.chooseWorkspaceRoot.mockResolvedValue(ok({ name: "notes" }));
  api.listWorkspaceChildren.mockResolvedValue(ok([]));
  api.openWorkspaceFile.mockResolvedValue(ok({
    canonicalPath: "/notes/daily.md",
    grant: "grant",
    name: "daily.md",
  }));
  api.createWorkspaceFile.mockResolvedValue(ok(undefined));
  api.deleteWorkspaceFile.mockResolvedValue(ok(undefined));
  api.renameWorkspaceFile.mockResolvedValue(ok(undefined));
});

function fixture() {
  const workspace = document.createElement("main");
  const sidebar = document.createElement("aside");
  const title = document.createElement("h2");
  const open = document.createElement("button");
  const filter = document.createElement("input");
  const tree = document.createElement("div");
  const empty = document.createElement("p");
  sidebar.append(title, open, filter, tree, empty);
  workspace.append(sidebar);
  document.body.replaceChildren(workspace);
  const openDocument = vi.fn(async () => undefined);
  const removeDocument = vi.fn();
  const showStatus = vi.fn();
  const elements = { empty, filter, open, sidebar, title, tree, workspace };
  return { documents: vi.fn(() => []), elements, openDocument, removeDocument, showStatus };
}

async function createSidebar(context: ReturnType<typeof fixture>) {
  const { WorkspaceSidebar } = await import(
    "../../src/renderer/features/workspace/workspaceSidebar"
  );
  return new WorkspaceSidebar({
    elements: context.elements,
    documents: context.documents,
    openDocument: context.openDocument,
    removeDocument: context.removeDocument,
    showStatus: context.showStatus,
  });
}

function rows(tree: HTMLElement) {
  return [...tree.querySelectorAll<HTMLButtonElement>('[data-testid="workspace-row"]')].map(
    (row) => ({ text: row.textContent, path: row.dataset["path"], kind: row.dataset["kind"] }),
  );
}

async function chooseRoot(context: ReturnType<typeof fixture>) {
  const sidebar = await createSidebar(context);
  context.elements.open.click();
  await vi.waitFor(() => {
    expect(context.elements.title.textContent).toBe("notes");
  });
  return sidebar;
}

describe("workspace sidebar", () => {
  it("AC-R11-06: applies a sidebar toggle captured before renderer startup", async () => {
    const context = fixture();
    document.documentElement.dataset["sidebarTogglePending"] = "true";

    await createSidebar(context);

    expect(context.elements.sidebar.hidden).toBe(true);
    expect(context.elements.workspace.classList.contains("sidebar-closed")).toBe(true);
    expect(document.documentElement.dataset["sidebarTogglePending"]).toBeUndefined();
    expect(document.documentElement.dataset["sidebarShortcutReady"]).toBe("true");
    await vi.waitFor(() => {
      expect(api.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceSidebarOpen: false }),
      );
    });
  });

  it("AC-R11-06: CmdOrCtrl+B toggles and saves the sidebar state", async () => {
    const context = fixture();
    const sidebar = await createSidebar(context);
    sidebar.start();
    await vi.waitFor(() => expect(api.loadSettings).toHaveBeenCalled());

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));

    expect(context.elements.sidebar.hidden).toBe(true);
    expect(context.elements.workspace.classList.contains("sidebar-closed")).toBe(true);
    await vi.waitFor(() => {
      expect(api.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceSidebarOpen: false }),
      );
    });
  });

  it("AC-R11-05: disk changes update the tree and close only a clean deleted file", async () => {
    const context = fixture();
    api.listWorkspaceChildren.mockResolvedValueOnce(ok([{ name: "daily.md", kind: "file" }]));
    await chooseRoot(context);
    const clean = {
      bom: false,
      canonicalPath: "/notes/daily.md",
      dirty: false,
      encoding: "utf-8",
      eol: "lf",
      saved: { bom: false, encoding: "utf-8", eol: "lf", text: Text.of(["daily"]) },
      state: EditorState.create({ doc: "daily" }),
    };
    context.documents.mockReturnValue([clean as never]);
    const listener = api.onWorkspaceChange.mock.calls.at(-1)?.[0];

    listener?.({
      canonicalPath: "/notes/new.md", entryKind: "file", kind: "created", path: "new.md",
    });
    expect(rows(context.elements.tree).map((row) => row.text)).toEqual(["daily.md", "new.md"]);
    listener?.({ canonicalPath: "/notes/new.md", kind: "changed", path: "new.md" });
    expect(context.elements.tree.querySelector('[data-path="new.md"]')?.getAttribute("title"))
      .toBe("Changed on disk");
    listener?.({ canonicalPath: "/notes/missing.md", kind: "changed", path: "missing.md" });
    listener?.({ canonicalPath: "/notes/daily.md", kind: "deleted", path: "daily.md" });

    expect(context.removeDocument).toHaveBeenCalledWith(clean);
    expect(rows(context.elements.tree).map((row) => row.text)).toEqual(["new.md"]);
    const dirty = {
      ...clean,
      canonicalPath: "/notes/new.md",
      dirty: false,
      state: EditorState.create({ doc: "edited" }),
    };
    context.documents.mockReturnValue([dirty as never]);
    listener?.({ canonicalPath: "/notes/new.md", kind: "deleted", path: "new.md" });
    expect(context.removeDocument).not.toHaveBeenCalledWith(dirty);
  });

  it("AC-R11-07: tree actions create, rename and delete a file", async () => {
    const context = fixture();
    api.listWorkspaceChildren.mockResolvedValueOnce(ok([{ name: "daily.md", kind: "file" }]));
    await chooseRoot(context);
    const row = context.elements.tree.querySelector<HTMLButtonElement>("[data-path='daily.md']")!;

    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    document.querySelector<HTMLButtonElement>(".workspace-actions button")?.click();
    const createDialog = document.querySelector<HTMLElement>(".workspace-prompt")!;
    const createInput = createDialog.querySelector<HTMLInputElement>("input")!;
    createInput.value = "new.md";
    [...createDialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Create")?.click();
    await vi.waitFor(() => expect(api.createWorkspaceFile).toHaveBeenCalledWith({ path: "new.md" }));

    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    [...document.querySelectorAll<HTMLButtonElement>(".workspace-actions button")]
      .find((button) => button.textContent === "Rename")?.click();
    const renameDialog = document.querySelector<HTMLElement>(".workspace-prompt")!;
    const renameInput = renameDialog.querySelector<HTMLInputElement>("input")!;
    renameInput.value = "renamed.md";
    [...renameDialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Rename")?.click();
    await vi.waitFor(() => expect(api.renameWorkspaceFile).toHaveBeenCalledWith({
      path: "daily.md", newPath: "renamed.md",
    }));

    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    [...document.querySelectorAll<HTMLButtonElement>(".workspace-actions button")]
      .find((button) => button.textContent === "Delete")?.click();
    const deleteDialog = document.querySelector<HTMLElement>(".workspace-prompt")!;
    [...deleteDialog.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Delete")?.click();
    await vi.waitFor(() => expect(api.deleteWorkspaceFile).toHaveBeenCalledWith({
      path: "daily.md",
    }));
  });

  it("AC-R11-07: a context menu from a non-element target offers root actions", async () => {
    const context = fixture();
    await chooseRoot(context);
    const text = document.createTextNode("workspace");
    context.elements.tree.append(text);

    text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

    expect([...document.querySelectorAll(".workspace-actions button")]
      .map((button) => button.textContent)).toEqual(["New File"]);
  });

  it("AC-R11-08: failed and canceled tree actions keep the rendered entry", async () => {
    const context = fixture();
    api.listWorkspaceChildren.mockResolvedValueOnce(ok([{ name: "daily.md", kind: "file" }]));
    api.createWorkspaceFile.mockResolvedValueOnce(failure);
    api.renameWorkspaceFile.mockResolvedValueOnce(failure);
    api.deleteWorkspaceFile.mockResolvedValueOnce(failure);
    await chooseRoot(context);
    const row = context.elements.tree.querySelector<HTMLButtonElement>("[data-path='daily.md']")!;

    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    document.querySelector<HTMLButtonElement>(".workspace-actions button")?.click();
    document.querySelector<HTMLInputElement>(".workspace-prompt input")!.value = "new.md";
    document.querySelector<HTMLButtonElement>(".workspace-prompt button:last-child")?.click();
    await vi.waitFor(() => expect(api.createWorkspaceFile).toHaveBeenCalled());

    for (const action of ["Rename", "Delete"]) {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      [...document.querySelectorAll<HTMLButtonElement>(".workspace-actions button")]
        .find((button) => button.textContent === action)?.click();
      document.querySelector<HTMLButtonElement>(".workspace-prompt button:last-child")?.click();
    }
    await vi.waitFor(() => expect(api.deleteWorkspaceFile).toHaveBeenCalled());
    expect(context.showStatus).toHaveBeenCalledTimes(3);
    expect(rows(context.elements.tree).map((entry) => entry.text)).toEqual(["daily.md"]);

    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    document.querySelector<HTMLButtonElement>(".workspace-actions button")?.click();
    document.querySelector<HTMLButtonElement>(".workspace-prompt button")?.click();
    expect(api.createWorkspaceFile).toHaveBeenCalledTimes(1);

    for (const action of ["Rename", "Delete"]) {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      [...document.querySelectorAll<HTMLButtonElement>(".workspace-actions button")]
        .find((button) => button.textContent === action)?.click();
      document.querySelector<HTMLButtonElement>(".workspace-prompt button")?.click();
    }
    expect(api.renameWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(api.deleteWorkspaceFile).toHaveBeenCalledTimes(1);
  });

  it("AC-R11-07: creates at the root or inside a selected folder", async () => {
    const context = fixture();
    api.listWorkspaceChildren
      .mockResolvedValueOnce(ok([{ name: "notes", kind: "folder" }]))
      .mockResolvedValueOnce(ok([{ name: "daily.md", kind: "file" }]));
    await chooseRoot(context);

    context.elements.tree.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    document.querySelector<HTMLButtonElement>(".workspace-actions button")?.click();
    document.querySelector<HTMLInputElement>(".workspace-prompt input")!.value = "root.md";
    document.querySelector<HTMLButtonElement>(".workspace-prompt button:last-child")?.click();
    await vi.waitFor(() => expect(api.createWorkspaceFile).toHaveBeenCalledWith({
      path: "root.md",
    }));

    const folder = context.elements.tree.querySelector<HTMLButtonElement>("[data-path='notes']")!;
    folder.click();
    await vi.waitFor(() => expect(rows(context.elements.tree)).toHaveLength(2));
    context.elements.tree.querySelector<HTMLButtonElement>("[data-path='notes']")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    document.querySelector<HTMLButtonElement>(".workspace-actions button")?.click();
    document.querySelector<HTMLInputElement>(".workspace-prompt input")!.value = "nested.md";
    document.querySelector<HTMLButtonElement>(".workspace-prompt button:last-child")?.click();
    await vi.waitFor(() => expect(api.createWorkspaceFile).toHaveBeenCalledWith({
      path: "notes/nested.md",
    }));

    const file = context.elements.tree.querySelector<HTMLButtonElement>(
      "[data-path='notes/daily.md']",
    )!;
    file.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    [...document.querySelectorAll<HTMLButtonElement>(".workspace-actions button")]
      .find((button) => button.textContent === "Rename")?.click();
    document.querySelector<HTMLInputElement>(".workspace-prompt input")!.value = "done.md";
    document.querySelector<HTMLButtonElement>(".workspace-prompt button:last-child")?.click();
    await vi.waitFor(() => expect(api.renameWorkspaceFile).toHaveBeenCalledWith({
      path: "notes/daily.md", newPath: "notes/done.md",
    }));
  });

  it("AC-R11-06: an early toggle wins over settings loading and reports save failure", async () => {
    const context = fixture();
    let resolveSettings: ((result: Awaited<ReturnType<Window["api"]["loadSettings"]>>) => void)
      | undefined;
    api.loadSettings.mockReturnValueOnce(new Promise((resolve) => {
      resolveSettings = resolve;
    }));
    api.saveSettings.mockResolvedValue(failure);
    const sidebar = await createSidebar(context);
    sidebar.start();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "x", ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true }));
    resolveSettings?.(ok({ workspaceSidebarOpen: true } as never));

    await vi.waitFor(() => expect(context.elements.sidebar.hidden).toBe(true));
    await vi.waitFor(() => expect(context.showStatus).toHaveBeenCalled());
  });

  it("AC-R11-01: opens a root and renders folders before files", async () => {
    const context = fixture();
    api.listWorkspaceChildren.mockResolvedValueOnce(ok([
      { name: "notes", kind: "folder" },
      { name: "README.md", kind: "file" },
    ]));

    await chooseRoot(context);

    expect(api.listWorkspaceChildren).toHaveBeenCalledWith({ path: "" });
    expect(rows(context.elements.tree)).toEqual([
      { text: "notes", path: "notes", kind: "folder" },
      { text: "README.md", path: "README.md", kind: "file" },
    ]);
    expect(context.elements.empty.hidden).toBe(true);
  });

  it("AC-R11-01: a canceled choice leaves the sidebar unchanged", async () => {
    const context = fixture();
    api.chooseWorkspaceRoot.mockResolvedValueOnce(ok(null));
    await createSidebar(context);

    context.elements.open.click();
    await vi.waitFor(() => {
      expect(api.chooseWorkspaceRoot).toHaveBeenCalled();
    });

    expect(context.elements.title.textContent).toBe("");
    expect(api.listWorkspaceChildren).not.toHaveBeenCalled();
    expect(context.showStatus).not.toHaveBeenCalled();
  });

  it("AC-R11-01: a failed choice reports the folder error", async () => {
    const context = fixture();
    api.chooseWorkspaceRoot.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "IS_DIRECTORY",
        messageKey: "file.isDirectory",
        params: { file: "notes" },
        retryable: false,
      },
    });
    await createSidebar(context);

    context.elements.open.click();
    await vi.waitFor(() => {
      expect(context.showStatus).toHaveBeenCalledWith(
        formatMessage("file.isDirectory", { file: "notes" }),
      );
    });

    expect(api.listWorkspaceChildren).not.toHaveBeenCalled();
  });

  it("AC-R11-02: expanding reuses loaded children and collapsing hides them", async () => {
    const context = fixture();
    api.listWorkspaceChildren
      .mockResolvedValueOnce(ok([{ name: "notes", kind: "folder" }]))
      .mockResolvedValueOnce(ok([{ name: "daily.md", kind: "file" }]));
    await chooseRoot(context);

    const folderRow = () => context.elements.tree.querySelector<HTMLButtonElement>(
      '[data-path="notes"]',
    )!;
    folderRow().click();
    await vi.waitFor(() => {
      expect(rows(context.elements.tree).map((row) => row.text))
        .toEqual(["notes", "daily.md"]);
    });
    expect(api.listWorkspaceChildren).toHaveBeenLastCalledWith({ path: "notes" });
    expect(folderRow().getAttribute("aria-expanded")).toBe("true");

    folderRow().click();
    const children = folderRow().nextElementSibling as HTMLElement;
    expect(children.hidden).toBe(true);
    expect(folderRow().getAttribute("aria-expanded")).toBe("false");

    folderRow().click();
    expect(children.hidden).toBe(false);
    expect(api.listWorkspaceChildren).toHaveBeenCalledTimes(2);
  });

  it("AC-R11-03: filters to matches and shows the empty message", async () => {
    const context = fixture();
    api.listWorkspaceChildren
      .mockResolvedValueOnce(ok([
        { name: "notes", kind: "folder" },
        { name: "README.md", kind: "file" },
      ]))
      .mockResolvedValueOnce(ok([{ name: "daily.md", kind: "file" }]));
    await chooseRoot(context);
    context.elements.tree.querySelector<HTMLButtonElement>(
      '[data-path="notes"]',
    )!.click();
    await vi.waitFor(() => {
      expect(rows(context.elements.tree)).toHaveLength(3);
    });

    context.elements.filter.value = "DAILY";
    context.elements.filter.dispatchEvent(new Event("input"));

    expect(rows(context.elements.tree).map((row) => row.text))
      .toEqual(["notes", "daily.md"]);
    expect(context.elements.empty.hidden).toBe(true);

    context.elements.filter.value = "missing";
    context.elements.filter.dispatchEvent(new Event("input"));

    expect(rows(context.elements.tree)).toEqual([]);
    expect(context.elements.empty.hidden).toBe(false);
  });

  it("AC-R11-04: clicking a file opens it as a document", async () => {
    const context = fixture();
    api.listWorkspaceChildren.mockResolvedValueOnce(ok([
      { name: "daily.md", kind: "file" },
    ]));
    await chooseRoot(context);

    context.elements.tree.querySelector<HTMLButtonElement>(
      '[data-path="daily.md"]',
    )!.click();

    await vi.waitFor(() => {
      expect(context.openDocument).toHaveBeenCalledWith({
        canonicalPath: "/notes/daily.md",
        grant: "grant",
        name: "daily.md",
      });
    });
    expect(api.openWorkspaceFile).toHaveBeenCalledWith({ path: "daily.md" });
  });

  it("AC-R11-01: ignores clicks that are not rows and empty folders", async () => {
    const context = fixture();
    api.listWorkspaceChildren
      .mockResolvedValueOnce(ok([
        { name: "empty", kind: "folder" },
        { name: "daily.md", kind: "file" },
      ]))
      .mockResolvedValueOnce(ok([]));
    await chooseRoot(context);

    context.elements.tree.click();
    const decoy = document.createElement("button");
    context.elements.tree.append(decoy);
    decoy.click();

    const folder = context.elements.tree.querySelector<HTMLButtonElement>(
      '[data-path="empty"]',
    )!;
    folder.click();
    await vi.waitFor(() => {
      expect(api.listWorkspaceChildren).toHaveBeenCalledWith({ path: "empty" });
    });
    expect(api.openWorkspaceFile).not.toHaveBeenCalled();
    expect(context.openDocument).not.toHaveBeenCalled();
  });

  it("AC-R11-08: listing and opening failures report status", async () => {
    const context = fixture();
    api.listWorkspaceChildren.mockResolvedValue(failure);
    await createSidebar(context);

    context.elements.open.click();
    await vi.waitFor(() => {
      expect(context.showStatus).toHaveBeenCalledWith(
        formatMessage("file.unknown", { file: "folder" }),
      );
    });
    expect(context.elements.title.textContent).toBe("notes");

    api.listWorkspaceChildren.mockResolvedValueOnce(ok([
      { name: "daily.md", kind: "file" },
    ]));
    api.openWorkspaceFile.mockResolvedValueOnce(failure);
    context.elements.open.click();
    await vi.waitFor(() => {
      expect(rows(context.elements.tree)).toHaveLength(1);
    });
    context.elements.tree.querySelector<HTMLButtonElement>(
      '[data-path="daily.md"]',
    )!.click();
    await vi.waitFor(() => {
      expect(context.showStatus).toHaveBeenCalledWith(
        formatMessage("file.unknown", { file: "daily.md" }),
      );
    });
    expect(context.openDocument).not.toHaveBeenCalled();
  });
});
