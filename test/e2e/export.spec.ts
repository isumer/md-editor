import path from "node:path";

import { expect, test } from "@playwright/test";

import { launchEditor, repositoryRoot } from "./helpers";

test("PDF export returns a valid multi-page document", {
  tag: "@AC-R6-03",
  annotation: { type: "AC-R6-03" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor")).toBeVisible();
    const modulePath = path.join(repositoryRoot, "dist/main/export/pdf.js");
    const result = await application.evaluate(async (_, pdfModulePath) => {
      const createRequire = process.getBuiltinModule("node:module").createRequire;
      const load = createRequire(pdfModulePath);
      const pdfModule = load(pdfModulePath) as {
        createPdfBytes(request: unknown): Promise<Uint8Array>;
      };
      const pages = Array.from({ length: 3 }, (_, index) =>
        `<section style="break-after: page"><h1>Page ${String(index + 1)}</h1>` +
        `<p>${"export content ".repeat(200)}</p></section>`).join("");
      const bytes = await pdfModule.createPdfBytes({
        html: `<!doctype html><html><head></head><body>${pages}</body></html>`,
        pageSize: "A4",
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        printBackground: true,
      });
      const text = Buffer.from(bytes).toString("latin1");
      return {
        header: text.slice(0, 5),
        pageCount: text.match(/\/Type\s*\/Page\b/g)?.length ?? 0,
      };
    }, modulePath);

    expect(result.header).toBe("%PDF-");
    expect(result.pageCount).toBeGreaterThan(1);
  } finally {
    await application.close();
  }
});

test("PDF export handles HTML larger than a data URL may carry", {
  tag: "@AC-R6-03",
  annotation: { type: "AC-R6-03" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await expect(page.getByTestId("editor")).toBeVisible();
    const modulePath = path.join(repositoryRoot, "dist/main/export/pdf.js");
    const result = await application.evaluate(async (_, pdfModulePath) => {
      const createRequire = process.getBuiltinModule("node:module").createRequire;
      const load = createRequire(pdfModulePath);
      const pdfModule = load(pdfModulePath) as {
        createPdfBytes(request: unknown): Promise<Uint8Array>;
      };
      const comment = "章".repeat(300_000);
      const bytes = await pdfModule.createPdfBytes({
        html: `<!doctype html><html><head></head><body><!--${comment}--><p>Large</p></body></html>`,
        pageSize: "A4",
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        printBackground: true,
      });
      const text = Buffer.from(bytes).toString("latin1");
      return {
        header: text.slice(0, 5),
        pageCount: text.match(/\/Type\s*\/Page\b/g)?.length ?? 0,
      };
    }, modulePath);

    expect(result.header).toBe("%PDF-");
    expect(result.pageCount).toBeGreaterThan(0);
  } finally {
    await application.close();
  }
});
