import { describe, expect, it } from "vitest";

import {
  HIDDEN_FOLDER_NAMES,
  visibleRows,
  type WorkspaceNode,
} from "../../src/shared/workspace/treeRows";

describe("workspace tree rows", () => {
  it("AC-R11-01: hides node_modules and dot folders", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "node_modules", kind: "folder", children: [{ name: "dep.md", kind: "file" }] },
      { name: ".git", kind: "folder", children: [{ name: "head.md", kind: "file" }] },
      { name: "notes.md", kind: "file" },
      { name: "GUIDE.MD", kind: "file" },
    ];

    const rows = visibleRows(nodes, new Set(["node_modules", ".git"]), "");

    expect(rows.map((row) => row.name)).toEqual(["GUIDE.MD", "notes.md"]);
  });

  it("AC-R11-01: lists folders before files and other files are hidden", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "b.md", kind: "file" },
      { name: "a", kind: "folder" },
      { name: "z.txt", kind: "file" },
    ];

    const rows = visibleRows(nodes, new Set(), "");

    expect(rows.map((row) => [row.name, row.kind])).toEqual([
      ["a", "folder"],
      ["b.md", "file"],
    ]);
  });

  it("AC-R11-01: sets the depth from the nesting level", () => {
    const nodes: readonly WorkspaceNode[] = [
      {
        name: "a",
        kind: "folder",
        children: [
          {
            name: "b",
            kind: "folder",
            children: [{ name: "c.md", kind: "file" }],
          },
        ],
      },
    ];

    const rows = visibleRows(nodes, new Set(["a", "a/b"]), "");

    expect(rows.map((row) => [row.name, row.depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c.md", 2],
    ]);
  });

  it("AC-R11-02: a collapsed folder shows no child rows", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "a", kind: "folder", children: [{ name: "b.md", kind: "file" }] },
    ];

    const rows = visibleRows(nodes, new Set(), "");

    expect(rows).toEqual([{ name: "a", kind: "folder", depth: 0, expanded: false }]);
  });

  it("AC-R11-02: an expanded folder with no children is not expanded", () => {
    const nodes: readonly WorkspaceNode[] = [{ name: "empty", kind: "folder" }];

    const rows = visibleRows(nodes, new Set(["empty"]), "");

    expect(rows).toEqual([
      { name: "empty", kind: "folder", depth: 0, expanded: false },
    ]);
  });

  it("AC-R11-02: an expanded folder shows its children once with their paths", () => {
    const nodes: readonly WorkspaceNode[] = [
      {
        name: "a",
        kind: "folder",
        children: [
          {
            name: "b",
            kind: "folder",
            children: [{ name: "c.md", kind: "file" }],
          },
          { name: "d.md", kind: "file" },
        ],
      },
    ];

    const rows = visibleRows(nodes, new Set(["a", "a/b"]), "");

    expect(rows).toEqual([
      { name: "a", kind: "folder", depth: 0, expanded: true },
      { name: "b", kind: "folder", depth: 1, expanded: true },
      { name: "c.md", kind: "file", depth: 2, expanded: false },
      { name: "d.md", kind: "file", depth: 1, expanded: false },
    ]);
  });

  it("AC-R11-03: matches names case-insensitively", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "notes.md", kind: "file" },
      { name: "TODO.md", kind: "file" },
      { name: "image.png", kind: "file" },
    ];

    const rows = visibleRows(nodes, new Set(), "NOTE");

    expect(rows.map((row) => row.name)).toEqual(["notes.md"]);
  });

  it("AC-R11-03: keeps an ancestor folder visible for a matching file", () => {
    const nodes: readonly WorkspaceNode[] = [
      {
        name: "src",
        kind: "folder",
        children: [
          { name: "docs", kind: "folder" },
          {
            name: "deep",
            kind: "folder",
            children: [
              { name: "image.png", kind: "file" },
              { name: "target.md", kind: "file" },
              { name: "skip.md", kind: "file" },
            ],
          },
          { name: "other.md", kind: "file" },
        ],
      },
      { name: "empty", kind: "folder" },
    ];

    const rows = visibleRows(nodes, new Set(["src", "src/deep"]), "target");

    expect(rows.map((row) => [row.name, row.depth])).toEqual([
      ["src", 0],
      ["deep", 1],
      ["target.md", 2],
    ]);
  });

  it("AC-R11-03: a folder whose name matches keeps its children", () => {
    const nodes: readonly WorkspaceNode[] = [
      {
        name: "src",
        kind: "folder",
        children: [
          { name: "one.md", kind: "file" },
          { name: "two.md", kind: "file" },
        ],
      },
      { name: "root.md", kind: "file" },
    ];

    const rows = visibleRows(nodes, new Set(["src"]), "src");

    expect(rows.map((row) => row.name)).toEqual(["src", "one.md", "two.md"]);
  });

  it("AC-R11-03: no match yields no rows", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "src", kind: "folder", children: [{ name: "a.md", kind: "file" }] },
      { name: "b.md", kind: "file" },
    ];

    const rows = visibleRows(nodes, new Set(["src"]), "zzz");

    expect(rows).toEqual([]);
  });

  it("AC-R11-03: a blank filter yields every row", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "src", kind: "folder", children: [{ name: "a.md", kind: "file" }] },
      { name: "b.md", kind: "file" },
    ];

    const rows = visibleRows(nodes, new Set(["src"]), "   ");

    expect(rows.map((row) => row.name)).toEqual(["src", "a.md", "b.md"]);
  });

  it("AC-R11-01: keeps equal names in the input order", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "A.md", kind: "file" },
      { name: "a.md", kind: "file" },
    ];

    const rows = visibleRows(nodes, new Set(), "");

    expect(rows.map((row) => row.name)).toEqual(["A.md", "a.md"]);
  });

  it("AC-R11-01: hides an entry with an unknown kind", () => {
    const nodes = [
      { name: "link", kind: "symlink" },
      { name: "real.md", kind: "file" },
    ] as unknown as readonly WorkspaceNode[];

    const rows = visibleRows(nodes, new Set(), "");

    expect(rows.map((row) => row.name)).toEqual(["real.md"]);
  });

  it("AC-R11-01: does not mutate its inputs", () => {
    const nodes: readonly WorkspaceNode[] = Object.freeze([
      Object.freeze({
        name: "src",
        kind: "folder" as const,
        children: Object.freeze([Object.freeze({ name: "a.md", kind: "file" as const })]),
      }),
    ]);
    const expanded: ReadonlySet<string> = Object.freeze(new Set(["src"]));

    expect(() => visibleRows(nodes, expanded, "  ")).not.toThrow();
    expect(visibleRows(nodes, expanded, "  ").map((row) => row.name)).toEqual([
      "src",
      "a.md",
    ]);
  });

  it("AC-R11-01: hides the exact names in HIDDEN_FOLDER_NAMES", () => {
    expect(HIDDEN_FOLDER_NAMES).toEqual([".git", "node_modules"]);
  });
});
