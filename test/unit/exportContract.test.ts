import { describe, expect, it } from "vitest";

import { isExportDocumentRequest } from "../../src/shared/ipc/export";

describe("export IPC contract", () => {
  it("AC-R6-04: accepts exact HTML and PDF requests", () => {
    expect(isExportDocumentRequest({
      format: "html", html: "<h1>Note</h1>", suggestedName: "note.html",
    })).toBe(true);
    expect(isExportDocumentRequest({
      format: "pdf",
      html: "<h1>Note</h1>",
      suggestedName: "note.pdf",
      options: {
        pageSize: "Letter",
        margins: { top: 1, bottom: 1, left: 0.5, right: 0.5 },
        printBackground: false,
      },
    })).toBe(true);
  });

  it("AC-R6-04: rejects extra fields and invalid PDF options", () => {
    const request = {
      format: "pdf", html: "", suggestedName: "note.pdf",
      options: {
        pageSize: "A4", margins: { top: 1, bottom: 1, left: 1, right: 1 },
        printBackground: true,
      },
    };
    expect(isExportDocumentRequest({ ...request, extra: true })).toBe(false);
    expect(isExportDocumentRequest({ ...request, options: { ...request.options, pageSize: "Legal" } }))
      .toBe(false);
    expect(isExportDocumentRequest({ ...request, suggestedName: "../note.pdf" })).toBe(false);
  });

  it("AC-SEC-07: rejects malformed and hostile export requests", () => {
    const base = {
      format: "pdf", html: "", suggestedName: "note.pdf",
      options: {
        pageSize: "A4", margins: { top: 1, bottom: 1, left: 1, right: 1 },
        printBackground: true,
      },
    };
    const hostile = new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error("hostile"); },
    });
    for (const invalid of [
      null,
      [],
      hostile,
      { format: "html", html: 1, suggestedName: "note.html" },
      {
        format: "html",
        get html() { return ""; },
        suggestedName: "note.html",
      },
      { format: "html", html: "", suggestedName: "" },
      { ...base, options: null },
      { ...base, options: { ...base.options, margins: null } },
      { ...base, options: { ...base.options, margins: { ...base.options.margins, top: -1 } } },
      { ...base, options: { ...base.options, margins: { ...base.options.margins, bottom: 11 } } },
      { ...base, options: { ...base.options, margins: { ...base.options.margins, left: NaN } } },
      { ...base, options: { ...base.options, margins: { ...base.options.margins, right: Infinity } } },
      { ...base, options: { ...base.options, printBackground: "yes" } },
    ]) {
      expect(isExportDocumentRequest(invalid)).toBe(false);
    }
  });
});
