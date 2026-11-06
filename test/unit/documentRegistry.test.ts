import { describe, expect, it } from "vitest";

import type { DocumentRecord } from "../../src/renderer/core/document";
import { DocumentRegistry } from "../../src/renderer/core/documentRegistry";

function document(id: string, canonicalPath: string | null): DocumentRecord {
  return {
    canonicalPath,
    id,
    name: canonicalPath ? canonicalPath.split("/").at(-1) ?? null : null,
  } as DocumentRecord;
}

describe("document registry", () => {
  it("AC-R4-02: finds at most one document per canonical path", () => {
    const registry = new DocumentRegistry();
    const first = document("one", "/tmp/a.md");
    registry.add(first);

    expect(registry.findByPath("/tmp/a.md")).toBe(first);
    expect(registry.findByPath("/tmp/b.md")).toBeUndefined();
    expect(registry.size).toBe(1);
  });

  it("AC-R4-02: removing a document frees its path", () => {
    const registry = new DocumentRegistry();
    const first = document("one", "/tmp/a.md");
    registry.add(first);

    expect(registry.remove("one")).toBe(first);
    expect(registry.findByPath("/tmp/a.md")).toBeUndefined();
    expect(registry.remove("missing")).toBeUndefined();
  });

  it("AC-R5-10: adopting a path moves the document's registry entry", () => {
    const registry = new DocumentRegistry();
    const first = document("one", "/tmp/old.md");
    registry.add(first);

    registry.adoptPath("one", "/tmp/new.md");

    expect(registry.findByPath("/tmp/old.md")).toBeUndefined();
    expect(registry.findByPath("/tmp/new.md")).toBe(first);
    expect(first.canonicalPath).toBe("/tmp/new.md");
  });

  it("AC-R4-02: keeps documents without a path out of the path index", () => {
    const registry = new DocumentRegistry();
    const untitled = document("one", null);
    registry.add(untitled);

    expect(registry.all()).toEqual([untitled]);
    expect(registry.get("one")).toBe(untitled);
    expect(registry.findByPath("/tmp/new.md")).toBeUndefined();

    registry.adoptPath("one", "/tmp/new.md");

    expect(registry.findByPath("/tmp/new.md")).toBe(untitled);
  });
});
