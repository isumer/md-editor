import { describe, expect, it } from "vitest";

import { GrantTable } from "../../src/main/grants/grantTable";

describe("document grants", () => {
  it("AC-SEC-09: issues opaque 128-bit base64url handles bound to a window", () => {
    const grants = new GrantTable();

    const handle = grants.issue(7, "/documents/notes.md", "document");

    expect(handle).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(grants.resolve(7, handle)).toEqual({
      ok: true,
      value: "/documents/notes.md",
    });
    expect(grants.resolve(8, handle)).toMatchObject({
      ok: false,
      error: { code: "GRANT_INVALID" },
    });
  });

  it.each(["forged-handle", "/tmp/raw-path.md"])(
    "AC-SEC-09: rejects an unknown or raw-path handle: %s",
    (handle) => {
      const grants = new GrantTable();

      expect(grants.resolve(1, handle)).toMatchObject({
        ok: false,
        error: { code: "GRANT_INVALID" },
      });
    },
  );

  it("AC-SEC-09: rejects a revoked document grant", () => {
    const grants = new GrantTable();
    const handle = grants.issue(1, "/documents/notes.md", "document");

    grants.revokeDocument(1, handle);

    expect(grants.resolve(1, handle)).toMatchObject({
      ok: false,
      error: { code: "GRANT_INVALID" },
    });
  });

  it("AC-SEC-09: revokes every grant when its window closes", () => {
    const grants = new GrantTable();
    const first = grants.issue(1, "/documents/first.md", "document");
    const second = grants.issue(1, "/documents/second.md", "document");

    grants.revokeWindow(1);

    expect(grants.resolve(1, first).ok).toBe(false);
    expect(grants.resolve(1, second).ok).toBe(false);
  });

  it("AC-R6-01: revoking an export grant keeps other grants", () => {
    const grants = new GrantTable();
    const documentGrant = grants.issue(1, "/documents/note.md", "document");
    const exportGrant = grants.issue(1, "/documents/note.html", "export");

    grants.revokeExport(1, documentGrant);
    grants.revokeExport(1, exportGrant);

    expect(grants.resolve(1, documentGrant).ok).toBe(true);
    expect(grants.resolve(1, exportGrant).ok).toBe(false);
  });

  it("AC-R5-17: lists only one window's live grants for restart replay", () => {
    const grants = new GrantTable();
    const first = grants.issue(1, "/documents/first.md", "document");
    const revoked = grants.issue(1, "/documents/revoked.md", "document");
    grants.issue(2, "/documents/other-window.md", "document");
    grants.revokeDocument(1, revoked);

    expect(grants.entries(1)).toEqual([{
      handle: first,
      canonicalPath: "/documents/first.md",
      kind: "document",
    }]);
  });
});
