// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { formatMessage } from "../../src/shared/messages/en";

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
};

beforeAll(() => {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: api as unknown as Window["api"],
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  api.chooseWorkspaceRoot.mockResolvedValue(ok({ name: "notes" }));
  api.listWorkspaceChildren.mockResolvedValue(ok([]));
  api.openWorkspaceFile.mockResolvedValue(ok({
    canonicalPath: "/notes/daily.md",
    grant: "grant",
    name: "daily.md",
  }));
});

function fixture() {
  const host = document.createElement("div");
  const title = document.createElement("h2");
  const open = document.createElement("button");
  const filter = document.createElement("input");
  const tree = document.createElement("div");
  const empty = document.createElement("p");
  host.append(title, open, filter, tree, empty);
  document.body.replaceChildren(host);
  const openDocument = vi.fn(async () => undefined);
  const showStatus = vi.fn();
  const elements = { empty, filter, open, title, tree };
  return { elements, host, openDocument, showStatus };
}

async function createSidebar(context: ReturnType<typeof fixture>) {
  const { WorkspaceSidebar } = await import(
    "../../src/renderer/features/workspace/workspaceSidebar"
  );
  return new WorkspaceSidebar({
    elements: context.elements,
    openDocument: context.openDocument,
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
