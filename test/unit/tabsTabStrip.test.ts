// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { DocumentRecord } from "../../src/renderer/core/document";
import { TabStrip } from "../../src/renderer/tabs/tabStrip";

function record(id: string, name: string | null, dirty = false): DocumentRecord {
  return { dirty, id, name } as DocumentRecord;
}

describe("tab strip", () => {
  it("AC-R4-01 AC-R4-03: render keeps labels stable and shows only dirty markers", () => {
    const host = document.createElement("div");
    const first = record("one", null);
    const second = record("two", "note.md", true);
    const strip = new TabStrip({
      active: () => first,
      close: vi.fn(),
      documents: () => [first, second],
      host,
      select: vi.fn(),
    });

    strip.render();

    const rows = host.querySelectorAll<HTMLElement>('[data-testid="tab"]');
    expect([...rows].map((row) => row.dataset["name"]))
      .toEqual(["Untitled", "note.md"]);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
    expect(rows[0]?.querySelector<HTMLElement>('[data-testid="tab-dirty"]')?.hidden)
      .toBe(true);
    expect(rows[1]?.querySelector<HTMLElement>('[data-testid="tab-dirty"]')?.hidden)
      .toBe(false);
  });

  it("AC-R4-01: activate and close dispatch the selected document once", () => {
    const host = document.createElement("div");
    const item = record("one", "note.md");
    const select = vi.fn();
    const close = vi.fn();
    new TabStrip({ active: () => item, close, documents: () => [item], host, select })
      .render();
    const row = host.querySelector<HTMLElement>('[data-testid="tab"]');

    row?.click();
    row?.querySelector<HTMLButtonElement>('[data-testid="tab-close"]')?.click();
    row?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    row?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 1 }));

    expect(select).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenLastCalledWith(item);
  });

  it("AC-R4-03: update changes one row without replacing its DOM node", () => {
    const host = document.createElement("div");
    const item = record("one", "before.md");
    const strip = new TabStrip({
      active: () => item,
      close: vi.fn(),
      documents: () => [item],
      host,
      select: vi.fn(),
    });
    strip.render();
    const before = host.firstElementChild;
    item.name = "after.md";
    item.dirty = true;

    strip.update(item);

    expect(host.firstElementChild).toBe(before);
    expect(before?.getAttribute("data-name")).toBe("after.md");
    expect(before?.querySelector<HTMLElement>('[data-testid="tab-dirty"]')?.hidden)
      .toBe(false);

    const added = record("two", "added.md");
    strip.update(added);
    expect(host.querySelectorAll('[data-testid="tab"]')).toHaveLength(1);
  });
});
