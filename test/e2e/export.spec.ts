import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  launchEditor,
  repositoryRoot,
  stubSaveDialog,
} from "./helpers";

const KEYSTROKE_SAMPLES = 30;

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

function reportLatency(values: readonly number[]): void {
  console.log(
    `AC-R6-05 preview cache: n=${String(values.length)} ` +
    `p95=${percentile95(values).toFixed(1)} ms ` +
    `distribution=[${values.map((value) => value.toFixed(1)).join(", ")}]`,
  );
}

test("HTML export writes the rendered preview with inline light CSS", {
  tag: ["@AC-R6-01", "@AC-R6-02"],
  annotation: [{ type: "AC-R6-01" }, { type: "AC-R6-02" }],
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-export-html-"));
  const sourcePath = path.join(repositoryRoot, "test/fixtures/export/complete.md");
  const exportPath = path.join(temporaryDirectory, "export.html");
  const { application, page } = await launchEditor(sourcePath);
  try {
    await expect.poll(
      () => page.getByTestId("preview").getAttribute("data-render-complete"),
      { timeout: 10_000 },
    ).toBe("true");
    await stubSaveDialog(application, exportPath);
    await clickMenuItem(application, "file-export-html");
    await page.getByTestId("export-always-light").check();
    await page.getByTestId("export-dialog").getByRole("button", { name: "Export" }).click();

    await expect.poll(() => fs.readFile(exportPath, "utf8").catch(() => ""))
      .toContain("<!doctype html>");
    const html = await fs.readFile(exportPath, "utf8");
    expect(html).toContain("hljs-");
    expect(html).toContain("<h1");
    expect(html).toContain('src="assets/diagram.png"');
    expect(html).not.toContain("doc-asset:");
    expect(html).toContain("<style>");
    expect(html).toContain("color-scheme: light");
    expect(html).not.toMatch(/<link\b[^>]*stylesheet/i);
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("PDF export applies options and writes the file", {
  tag: ["@AC-R6-03", "@AC-R6-04"],
  annotation: [
    { type: "AC-R6-03" },
    { type: "AC-R6-04" },
  ],
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-export-pdf-"));
  const sourcePath = path.join(repositoryRoot, "test/fixtures/export/long-document.md");
  const exportPath = path.join(temporaryDirectory, "export.pdf");
  const { application, page } = await launchEditor(sourcePath);
  try {
    await expect.poll(
      () => page.getByTestId("preview").getAttribute("data-render-complete"),
      { timeout: 10_000 },
    ).toBe("true");
    await stubSaveDialog(application, exportPath);
    await clickMenuItem(application, "file-export-pdf");
    await page.getByTestId("export-dialog").locator("select").selectOption("Letter");
    await page.getByTestId("export-dialog").locator('input[type="number"]').fill("1");
    await page.getByTestId("export-dialog").getByLabel("Print background").uncheck();
    await page.getByTestId("export-dialog").getByRole("button", { name: "Export" }).click();
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.keyboard.type("responsive export");
    await expect(editor).toContainText("responsive export");

    await expect.poll(async () =>
      (await fs.readFile(exportPath).catch(() => Buffer.alloc(0)))
        .subarray(0, 5).toString(),
    ).toBe("%PDF-");
    const text = (await fs.readFile(exportPath)).toString("latin1");
    expect(text.match(/\/Type\s*\/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("a 500 KB single-block PDF export keeps preview caching below one frame", {
  tag: ["@AC-R6-05", "@AC-PERF"],
  annotation: { type: "AC-R6-05" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-export-responsive-"));
  const sourcePath = path.join(temporaryDirectory, "single-block-500kb.md");
  const exportPath = path.join(temporaryDirectory, "export.pdf");
  await fs.writeFile(sourcePath, `${"x".repeat(500 * 1024 - 1)}\n`);
  expect((await fs.stat(sourcePath)).size).toBe(500 * 1024);
  const { application, page } = await launchEditor(sourcePath);
  try {
    await expect.poll(
      () => page.getByTestId("preview").getAttribute("data-render-complete"),
      { timeout: 10_000 },
    ).toBe("true");
    await stubSaveDialog(application, exportPath);
    await clickMenuItem(application, "file-export-pdf");
    await page.getByTestId("export-dialog").getByRole("button", { name: "Export" }).click();
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.evaluate(() => {
      const preview = document.querySelector<HTMLElement>("[data-testid=preview]");
      if (!preview) throw new Error("The preview is missing");
      const probe = { completions: 0 };
      (window as unknown as { __exportCacheProbe?: typeof probe }).__exportCacheProbe = probe;
      preview.addEventListener("solidmd:export-cache-updated", () => {
        probe.completions += 1;
      });
    });
    await expect(page.getByTestId("preview").locator(".preview-block")).toHaveCount(1);
    for (let index = 0; index < 5; index += 1) {
      const expected = index + 1;
      await page.keyboard.type(String(index));
      await expect.poll(() => page.evaluate(() =>
        (window as unknown as { __exportCacheProbe?: { completions: number } })
          .__exportCacheProbe?.completions ?? 0)).toBe(expected);
    }
    await page.evaluate(() => {
      const probe = (window as unknown as {
        __exportCacheProbe?: { completions: number };
      }).__exportCacheProbe;
      if (probe) probe.completions = 0;
      performance.clearMeasures("preview-export-cache");
    });
    const samples: number[] = [];
    for (let index = 0; index < KEYSTROKE_SAMPLES; index += 1) {
      await page.evaluate(() => performance.clearMeasures("preview-export-cache"));
      await page.keyboard.type(String(index % 10));
      await expect.poll(() => page.evaluate(() =>
        (window as unknown as { __exportCacheProbe?: { completions: number } })
          .__exportCacheProbe?.completions ?? 0)).toBe(index + 1);
      const duration = await page.evaluate(() =>
        performance.getEntriesByName("preview-export-cache", "measure").at(-1)?.duration ?? -1);
      expect(duration).toBeGreaterThanOrEqual(0);
      samples.push(duration);
    }
    reportLatency(samples);
    expect(samples).toHaveLength(KEYSTROKE_SAMPLES);
    expect(percentile95(samples)).toBeLessThan(16);
    // The export must finish before close: quitting during printToPDF holds
    // shutdown and the process outlives the close wait.
    await expect.poll(
      async () =>
        (await fs.readFile(exportPath).catch(() => Buffer.alloc(0)))
          .subarray(0, 5).toString(),
      { timeout: 10_000 },
    ).toBe("%PDF-");
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

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
