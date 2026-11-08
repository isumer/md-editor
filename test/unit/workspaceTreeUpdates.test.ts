import { describe, expect, it } from "vitest";

import {
  applyWorkspaceChange,
  decideOpenFile,
  type WorkspaceChange,
} from "../../src/shared/workspace/treeUpdates";
import type { WorkspaceNode } from "../../src/shared/workspace/treeRows";

describe("workspace tree updates", () => {
  it("AC-R11-05: adds a created file in tree order", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "a.md", kind: "file" },
      { name: "c.md", kind: "file" },
    ];

    const updated = applyWorkspaceChange(nodes, {
      kind: "created",
      path: "b.md",
      entryKind: "file",
    });

    expect(updated.map((node) => node.name)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("AC-R11-05: adds a created folder before files", () => {
    const nodes: readonly WorkspaceNode[] = [{ name: "a.md", kind: "file" }];

    const updated = applyWorkspaceChange(nodes, {
      kind: "created",
      path: "z-folder",
      entryKind: "folder",
    });

    expect(updated).toEqual([
      { name: "z-folder", kind: "folder" },
      { name: "a.md", kind: "file" },
    ]);
  });

  it("AC-R11-05: adds a created entry under a nested folder", () => {
    const other = { name: "other", kind: "folder" as const, children: [] };
    const nested = {
      name: "nested",
      kind: "folder" as const,
      children: [{ name: "a.md", kind: "file" as const }],
    };
    const parent = {
      name: "parent",
      kind: "folder" as const,
      children: [nested],
    };
    const nodes: readonly WorkspaceNode[] = [other, parent];

    const updated = applyWorkspaceChange(nodes, {
      kind: "created",
      path: "parent/nested/b.md",
      entryKind: "file",
    });

    expect(updated).toEqual([
      other,
      {
        name: "parent",
        kind: "folder",
        children: [
          {
            name: "nested",
            kind: "folder",
            children: [
              { name: "a.md", kind: "file" },
              { name: "b.md", kind: "file" },
            ],
          },
        ],
      },
    ]);
    expect(updated[0]).toBe(other);
    expect(updated[1]).not.toBe(parent);
    expect(updated[1]?.children?.[0]).not.toBe(nested);
  });

  it("AC-R11-05: does not add a duplicate or a missing parent", () => {
    const nodes: readonly WorkspaceNode[] = [
      {
        name: "notes",
        kind: "folder",
        children: [{ name: "a.md", kind: "file" }],
      },
    ];

    const duplicate = applyWorkspaceChange(nodes, {
      kind: "created",
      path: "notes/a.md",
      entryKind: "file",
    });
    const missingParent = applyWorkspaceChange(nodes, {
      kind: "created",
      path: "missing/a.md",
      entryKind: "file",
    });

    expect(duplicate).toBe(nodes);
    expect(missingParent).toBe(nodes);
  });

  it("AC-R11-05: refuses an invalid path", () => {
    const nodes: readonly WorkspaceNode[] = [{ name: "a.md", kind: "file" }];
    const paths = ["/b.md", "b.md/", "folder//b.md", "folder/../b.md"];
    const notes: readonly WorkspaceNode[] = [
      {
        name: "notes",
        kind: "folder",
        children: [{ name: "a.md", kind: "file" }],
      },
    ];

    const updated = paths.map((path) =>
      applyWorkspaceChange(nodes, { kind: "deleted", path }),
    );

    expect(updated.every((result) => result === nodes)).toBe(true);
    expect(
      applyWorkspaceChange(notes, {
        kind: "created",
        path: "notes/.",
        entryKind: "file",
      }),
    ).toBe(notes);
    expect(
      applyWorkspaceChange(notes, {
        kind: "created",
        path: "notes/..",
        entryKind: "file",
      }),
    ).toBe(notes);
    expect(
      applyWorkspaceChange(notes, {
        kind: "created",
        path: ".",
        entryKind: "file",
      }),
    ).toBe(notes);
  });

  it("AC-R11-05: treats a backslash as a literal name", () => {
    const notes = {
      name: "notes",
      kind: "folder" as const,
      children: [{ name: "a.md", kind: "file" as const }],
    };
    const nodes: readonly WorkspaceNode[] = [notes];

    const updated = applyWorkspaceChange(nodes, {
      kind: "created",
      path: "notes\\b.md",
      entryKind: "file",
    });

    expect(updated).toEqual([notes, { name: "notes\\b.md", kind: "file" }]);
    expect(updated[0]).toBe(notes);
  });

  it("AC-R11-05: adds a case-insensitively equal name after the existing entry", () => {
    const nodes: readonly WorkspaceNode[] = [
      { name: "Apple.md", kind: "file" },
      { name: "banana.md", kind: "file" },
    ];

    const updated = applyWorkspaceChange(nodes, {
      kind: "created",
      path: "apple.md",
      entryKind: "file",
    });

    expect(updated.map((node) => node.name)).toEqual([
      "Apple.md",
      "apple.md",
      "banana.md",
    ]);
  });

  it("AC-R11-05: removes a deleted file", () => {
    const parent = {
      name: "notes",
      kind: "folder" as const,
      children: [
        { name: "a.md", kind: "file" as const },
        { name: "b.md", kind: "file" as const },
      ],
    };
    const nodes: readonly WorkspaceNode[] = [parent];

    const updated = applyWorkspaceChange(nodes, {
      kind: "deleted",
      path: "notes/a.md",
    });

    expect(updated).toEqual([
      {
        name: "notes",
        kind: "folder",
        children: [{ name: "b.md", kind: "file" }],
      },
    ]);
    expect(updated[0]).not.toBe(parent);
  });

  it("AC-R11-05: removes a deleted folder with its descendants", () => {
    const keep = { name: "keep.md", kind: "file" as const };
    const nodes: readonly WorkspaceNode[] = [
      {
        name: "deleted",
        kind: "folder",
        children: [{ name: "child.md", kind: "file" }],
      },
      keep,
    ];

    const updated = applyWorkspaceChange(nodes, {
      kind: "deleted",
      path: "deleted",
    });

    expect(updated).toEqual([keep]);
    expect(updated[0]).toBe(keep);
  });

  it("AC-R11-05: removes nothing for an absent path", () => {
    const nodes: readonly WorkspaceNode[] = [{ name: "a.md", kind: "file" }];

    const updated = applyWorkspaceChange(nodes, {
      kind: "deleted",
      path: "missing.md",
    });

    expect(updated).toBe(nodes);
  });

  it("AC-R11-05: removes nothing for an absent nested path", () => {
    const notes = {
      name: "notes",
      kind: "folder" as const,
      children: [{ name: "a.md", kind: "file" as const }],
    };
    const nodes: readonly WorkspaceNode[] = [
      notes,
      { name: "empty", kind: "folder" },
      { name: "b.md", kind: "file" },
    ];

    const absentChild = applyWorkspaceChange(nodes, {
      kind: "deleted",
      path: "notes/missing.md",
    });
    const childlessParent = applyWorkspaceChange(nodes, {
      kind: "deleted",
      path: "empty/x.md",
    });
    const fileParent = applyWorkspaceChange(nodes, {
      kind: "deleted",
      path: "b.md/child.md",
    });

    expect(absentChild).toBe(nodes);
    expect(childlessParent).toBe(nodes);
    expect(fileParent).toBe(nodes);
  });

  it("AC-R11-05: does not mutate its input", () => {
    const nodes: readonly WorkspaceNode[] = Object.freeze([
      Object.freeze({
        name: "notes",
        kind: "folder" as const,
        children: Object.freeze([
          Object.freeze({ name: "a.md", kind: "file" as const }),
        ]),
      }),
    ]);
    const change: WorkspaceChange = Object.freeze({
      kind: "created" as const,
      path: "notes/b.md",
      entryKind: "file" as const,
    });

    const updated = applyWorkspaceChange(nodes, change);

    expect(updated).toEqual([
      {
        name: "notes",
        kind: "folder",
        children: [
          { name: "a.md", kind: "file" },
          { name: "b.md", kind: "file" },
        ],
      },
    ]);
    expect(nodes[0]?.children).toEqual([{ name: "a.md", kind: "file" }]);
  });

  it("AC-R11-05: closes only a deleted clean file", () => {
    expect(
      decideOpenFile({ kind: "deleted", path: "notes/a.md" }, "notes/a.md", true),
    ).toBe("keep");
    expect(
      decideOpenFile({ kind: "deleted", path: "notes/a.md" }, "notes/a.md", false),
    ).toBe("close");
    expect(
      decideOpenFile({ kind: "deleted", path: "notes" }, "notes/a.md", false),
    ).toBe("close");
    expect(
      decideOpenFile({ kind: "deleted", path: "note" }, "notebook/a.md", false),
    ).toBe("keep");
    expect(
      decideOpenFile(
        { kind: "created", path: "notes/a.md", entryKind: "file" },
        "notes/a.md",
        false,
      ),
    ).toBe("keep");
  });
});
