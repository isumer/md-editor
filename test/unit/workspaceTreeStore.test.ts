import { describe, expect, it } from "vitest";

import {
  WorkspaceTreeStore,
  type ChildrenRequest,
} from "../../src/renderer/features/workspace/treeStore";
import type { WorkspaceNode } from "../../src/shared/workspace/treeRows";

function recordedRequest(
  requests: readonly ChildrenRequest[],
  index: number,
): ChildrenRequest {
  const request = requests[index];
  expect(request).toBeDefined();
  if (request === undefined) {
    throw new Error(`Missing request at index ${index}`);
  }
  return request;
}

describe("workspace tree store", () => {
  it("AC-R11-05: applies disk changes to loaded folders", () => {
    const store = new WorkspaceTreeStore(() => undefined);
    const root = store.openRoot();
    store.receiveChildren(root, [{ name: "a.md", kind: "file" }]);

    store.applyChange({ kind: "created", path: "b.md", entryKind: "file" });
    expect(store.rows().map((row) => row.name)).toEqual(["a.md", "b.md"]);
    store.applyChange({ kind: "deleted", path: "a.md" });
    expect(store.rows().map((row) => row.name)).toEqual(["b.md"]);
  });

  it("AC-R11-01: lists only folders and markdown files with folders first", () => {
    const requests: Array<{ readonly id: number; readonly path: string }> = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    const root: readonly WorkspaceNode[] = [
      { name: "b.txt", kind: "file" },
      { name: "a.md", kind: "file" },
      { name: "node_modules", kind: "folder" },
      { name: "docs", kind: "folder" },
      { name: ".git", kind: "folder" },
    ];

    expect(store.receiveChildren(rootRequest, root)).toBe(true);

    expect(store.rows().map((row) => row.name)).toEqual(["docs", "a.md"]);
    expect(requests).toEqual([]);
  });

  it("AC-R11-01: loads a folder's children only when it expands", () => {
    const requests: Array<{ readonly id: number; readonly path: string }> = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    requests.push(rootRequest);
    expect(
      store.receiveChildren(rootRequest, [{ name: "docs", kind: "folder" }]),
    ).toBe(true);

    store.toggle("docs");

    expect(requests).toEqual([
      rootRequest,
      { id: rootRequest.id + 1, path: "docs" },
    ]);
    expect(store.isLoading("docs")).toBe(true);
    expect(store.rows().map((row) => row.name)).toEqual(["docs"]);

    expect(
      store.receiveChildren(recordedRequest(requests, 1), [
        { name: "guide.md", kind: "file" },
      ]),
    ).toBe(true);
    expect(store.rows().map((row) => row.name)).toEqual(["docs", "guide.md"]);
    expect(store.isLoading("docs")).toBe(false);
  });

  it("AC-R11-01: rejects a stale root reply after a second Open Folder", () => {
    const requests: Array<{ readonly id: number; readonly path: string }> = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const firstRequest = store.openRoot();
    const secondRequest = store.openRoot();

    expect(
      store.receiveChildren(firstRequest, [{ name: "stale.md", kind: "file" }]),
    ).toBe(false);
    expect(
      store.receiveChildren(secondRequest, [{ name: "current.md", kind: "file" }]),
    ).toBe(true);
    expect(store.rows().map((row) => row.name)).toEqual(["current.md"]);
    expect(requests).toEqual([]);
  });

  it("AC-R11-01: Open Folder resets filter, expansion and errors", () => {
    const requests: ChildrenRequest[] = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const firstRoot = store.openRoot();
    expect(
      store.receiveChildren(firstRoot, [{ name: "docs", kind: "folder" }]),
    ).toBe(true);
    store.toggle("docs");
    expect(
      store.failChildren(recordedRequest(requests, 0), "Permission denied"),
    ).toBe(true);
    store.setFilter("a");
    expect(store.childrenError("docs")).toBe("Permission denied");

    const secondRoot = store.openRoot();

    expect(store.isExpanded("docs")).toBe(false);
    expect(store.isLoading("docs")).toBe(false);
    expect(store.childrenError("docs")).toBeUndefined();
    expect(store.rows()).toEqual([]);

    expect(
      store.receiveChildren(secondRoot, [
        { name: "docs", kind: "folder" },
        { name: "a.md", kind: "file" },
      ]),
    ).toBe(true);
    expect(store.rows().map((row) => row.name)).toEqual(["docs", "a.md"]);
  });

  it("AC-R11-01: does not mutate the nodes it receives", () => {
    const requests: Array<{ readonly id: number; readonly path: string }> = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    const root: readonly WorkspaceNode[] = Object.freeze([
      Object.freeze({ name: "docs", kind: "folder" as const }),
    ]);
    const children: readonly WorkspaceNode[] = Object.freeze([
      Object.freeze({ name: "guide.md", kind: "file" as const }),
    ]);

    expect(store.receiveChildren(rootRequest, root)).toBe(true);
    expect(() => store.toggle("docs")).not.toThrow();
    expect(() =>
      store.receiveChildren(recordedRequest(requests, 0), children),
    ).not.toThrow();

    expect(store.rows().map((row) => row.name)).toEqual(["docs", "guide.md"]);
  });

  it("AC-R11-01: loads children on a nested folder path", () => {
    const requests: ChildrenRequest[] = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [
        {
          name: "docs",
          kind: "folder",
          children: [{ name: "api", kind: "folder" }],
        },
      ]),
    ).toBe(true);
    store.toggle("docs");

    store.toggle("docs/api");
    expect(
      store.receiveChildren(recordedRequest(requests, 0), [
        { name: "reference.md", kind: "file" },
      ]),
    ).toBe(true);

    expect(store.rows().map((row) => row.name)).toEqual([
      "docs",
      "api",
      "reference.md",
    ]);
  });

  it("AC-R11-02: reuses loaded children after collapse and expand", () => {
    const requests: Array<{ readonly id: number; readonly path: string }> = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [{ name: "docs", kind: "folder" }]),
    ).toBe(true);
    store.toggle("docs");
    expect(
      store.receiveChildren(recordedRequest(requests, 0), [
        { name: "guide.md", kind: "file" },
      ]),
    ).toBe(true);

    store.toggle("docs");

    expect(store.isExpanded("docs")).toBe(false);
    expect(store.rows().map((row) => row.name)).toEqual(["docs"]);

    store.toggle("docs");

    expect(store.isExpanded("docs")).toBe(true);
    expect(requests).toHaveLength(1);
    expect(store.isLoading("docs")).toBe(false);
    expect(store.rows().map((row) => row.name)).toEqual(["docs", "guide.md"]);
  });

  it("AC-R11-02: does not request an unloaded file or an unknown path", () => {
    const requests: Array<{ readonly id: number; readonly path: string }> = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [
        { name: "a.md", kind: "file" },
        { name: "docs", kind: "folder" },
      ]),
    ).toBe(true);

    expect(store.ensureChildren("a.md")).toBe(false);
    expect(store.ensureChildren("missing")).toBe(false);
    expect(store.ensureChildren("/docs")).toBe(false);
    expect(store.ensureChildren("docs/")).toBe(false);
    expect(store.ensureChildren("docs/./other")).toBe(false);
    expect(store.ensureChildren("docs/../other")).toBe(false);
    expect(store.ensureChildren("docs/missing")).toBe(false);
    expect(requests).toEqual([]);
  });

  it("AC-R11-02: keeps one pending request per folder", () => {
    const requests: ChildrenRequest[] = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [{ name: "docs", kind: "folder" }]),
    ).toBe(true);

    store.toggle("docs");

    expect(store.isExpanded("docs")).toBe(true);
    expect(store.ensureChildren("docs")).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it("AC-R11-02: ignores invalid toggles and child replies", () => {
    const requests: ChildrenRequest[] = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [
        { name: "docs", kind: "folder" },
        { name: "a.md", kind: "file" },
      ]),
    ).toBe(true);

    store.toggle("");
    store.toggle("missing");
    store.toggle("a.md");

    expect(store.isExpanded("docs")).toBe(false);
    expect(store.isExpanded("missing")).toBe(false);
    expect(store.isExpanded("a.md")).toBe(false);
    expect(
      store.receiveChildren(
        { id: rootRequest.id + 1, path: "docs//nested" },
        [],
      ),
    ).toBe(false);
    expect(requests).toEqual([]);
  });

  it("AC-R11-02: rejects a reply after its folder no longer exists", () => {
    const requests: ChildrenRequest[] = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const folder = { name: "docs", kind: "folder" as const };
    const rootRequest = store.openRoot();
    expect(store.receiveChildren(rootRequest, [folder])).toBe(true);
    store.toggle("docs");
    folder.name = "moved";

    expect(store.receiveChildren(recordedRequest(requests, 0), [])).toBe(false);
    expect(
      store.failChildren(recordedRequest(requests, 0), "Missing"),
    ).toBe(false);
    expect(store.rows().map((row) => row.name)).toEqual(["moved"]);
  });

  it("AC-R11-02: retries after a failed listing", () => {
    const requests: Array<{ readonly id: number; readonly path: string }> = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [{ name: "docs", kind: "folder" }]),
    ).toBe(true);
    store.toggle("docs");

    expect(
      store.failChildren(recordedRequest(requests, 0), "Permission denied"),
    ).toBe(true);
    expect(store.isLoading("docs")).toBe(false);
    expect(store.childrenError("docs")).toBe("Permission denied");

    store.toggle("docs");
    store.toggle("docs");

    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({ id: rootRequest.id + 2, path: "docs" });
    expect(store.isLoading("docs")).toBe(true);
    expect(store.childrenError("docs")).toBeUndefined();
  });

  it("AC-R11-02: dispose clears state and rejects outstanding replies", () => {
    const requests: ChildrenRequest[] = [];
    const store = new WorkspaceTreeStore((request) => requests.push(request));
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [{ name: "docs", kind: "folder" }]),
    ).toBe(true);
    store.toggle("docs");
    const childRequest = recordedRequest(requests, 0);
    store.setFilter("guide");
    expect(store.failChildren(childRequest, "Late failure")).toBe(true);
    expect(store.childrenError("docs")).toBe("Late failure");

    store.dispose();

    expect(store.rows()).toEqual([]);
    expect(store.isExpanded("docs")).toBe(false);
    expect(store.isLoading("docs")).toBe(false);
    expect(store.childrenError("docs")).toBeUndefined();
    expect(store.receiveChildren(childRequest, [])).toBe(false);
    expect(store.failChildren(childRequest, "Late failure")).toBe(false);
  });

  it("AC-R11-03: filters case-insensitively and keeps ancestor folders", () => {
    const store = new WorkspaceTreeStore(() => undefined);
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [
        {
          name: "docs",
          kind: "folder",
          children: [{ name: "guide.md", kind: "file" }],
        },
        {
          name: "notes",
          kind: "folder",
          children: [{ name: "todo.md", kind: "file" }],
        },
      ]),
    ).toBe(true);
    store.toggle("docs");
    store.toggle("notes");

    store.setFilter("GUI");

    expect(store.rows().map((row) => row.name)).toEqual(["docs", "guide.md"]);
  });

  it("AC-R11-03: trims the filter and restores all rows when it is empty", () => {
    const store = new WorkspaceTreeStore(() => undefined);
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [
        { name: "a.md", kind: "file" },
        { name: "b.md", kind: "file" },
      ]),
    ).toBe(true);
    store.setFilter(" A ");
    expect(store.rows().map((row) => row.name)).toEqual(["a.md"]);

    store.setFilter("   ");

    expect(store.rows().map((row) => row.name)).toEqual(["a.md", "b.md"]);
  });

  it("AC-R11-03: returns no rows when nothing matches", () => {
    const store = new WorkspaceTreeStore(() => undefined);
    const rootRequest = store.openRoot();
    expect(
      store.receiveChildren(rootRequest, [{ name: "guide.md", kind: "file" }]),
    ).toBe(true);

    store.setFilter("missing");

    expect(store.rows()).toEqual([]);
  });
});
