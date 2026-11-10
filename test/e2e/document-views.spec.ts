import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import {
  closeEditor,
  DOCUMENT_END,
  DOCUMENT_START,
  launchEditor,
  PRIMARY_MODIFIER,
  repositoryRoot,
  stubOpenDialog,
  clickMenuItem,
} from "./helpers";

const SAMPLES = 30;
const WARM_UP_SAMPLES = 5;
const tabsDirectory = path.join(repositoryRoot, "test/fixtures/tabs");
const alphaFixture = path.join(tabsDirectory, "alpha.md");
const betaFixture = path.join(tabsDirectory, "beta.md");

async function copyFixtures(): Promise<{ directory: string; alpha: string; beta: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-views-"));
  const alpha = path.join(directory, "alpha.md");
  const beta = path.join(directory, "beta.md");
  await fs.copyFile(alphaFixture, alpha);
  await fs.copyFile(betaFixture, beta);
  return { directory, alpha, beta };
}

async function openWithMenu(
  application: ElectronApplication,
  filePath: string,
): Promise<void> {
  await stubOpenDialog(application, filePath);
  await clickMenuItem(application, "file-open");
}

function tabIn(page: Page, view: "tabs" | "tabs-two", name: string) {
  return page.getByTestId(view).locator(`[data-testid="tab"][data-name="${name}"]`);
}

async function cloneAlpha(page: Page): Promise<void> {
  await tabIn(page, "tabs", "alpha.md").click({ button: "right" });
  await page.getByRole("button", { name: "Clone to Other View" }).click();
  await expect(page.getByTestId("document-view-two")).toBeVisible();
}

function editor(page: Page, view: 1 | 2) {
  return page.getByTestId(view === 1 ? "editor" : "editor-two").locator(".cm-content");
}

function scroller(page: Page, view: 1 | 2) {
  return page.getByTestId(view === 1 ? "editor" : "editor-two").locator(".cm-scroller");
}

test("AC-R4-10: registered tab commands move and clone tabs to the other view", {
  tag: "@AC-R4-10",
  annotation: { type: "AC-R4-10" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await openWithMenu(application, beta);
    await tabIn(page, "tabs", "beta.md").click({ button: "right" });
    await page.getByRole("button", { name: "Move to Other View" }).click();
    await expect(page.getByTestId("tabs").getByTestId("tab")).toHaveCount(1);
    await expect(page.getByTestId("tabs-two").getByTestId("tab")).toHaveCount(1);

    await cloneAlpha(page);

    await expect(page.getByTestId("tabs").getByTestId("tab")).toHaveCount(1);
    await expect(page.getByTestId("tabs-two").getByTestId("tab")).toHaveCount(2);
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("AC-R4-11: a clone updates in the same frame and keeps its cursor and scroll", {
  tag: "@AC-R4-11",
  annotation: { type: "AC-R4-11" },
}, async () => {
  const { directory, alpha } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(900, 420);
    });
    await cloneAlpha(page);
    await editor(page, 2).click();
    await page.keyboard.press(DOCUMENT_END);
    await scroller(page, 2).evaluate((element) => { element.scrollTop = 200; });
    const otherScroll = await scroller(page, 2).evaluate((element) => element.scrollTop);
    await editor(page, 1).click();
    await page.keyboard.press(DOCUMENT_START);
    await page.evaluate(() => {
      const source = document.querySelector("#editor .cm-content");
      const peer = document.querySelector("#editor-two .cm-content");
      (window as unknown as { __cloneFrame?: number }).__cloneFrame = -1;
      source?.addEventListener("beforeinput", () => {
        let nextFrame = false;
        requestAnimationFrame(() => { nextFrame = true; });
        const observer = new MutationObserver(() => {
          if (peer?.textContent?.includes("X# Alpha")) {
            (window as unknown as { __cloneFrame?: number }).__cloneFrame = nextFrame ? 1 : 0;
            observer.disconnect();
          }
        });
        if (peer) observer.observe(peer, { characterData: true, childList: true, subtree: true });
      }, { once: true });
    });

    await page.keyboard.type("X");

    expect(await page.evaluate(() =>
      (window as unknown as { __cloneFrame?: number }).__cloneFrame)).toBe(0);
    const scrollAfterEdit = await scroller(page, 2).evaluate((element) => element.scrollTop);
    expect(scrollAfterEdit).toBeGreaterThan(100);
    expect(scrollAfterEdit).not.toBe(
      await scroller(page, 1).evaluate((element) => element.scrollTop),
    );
    expect(otherScroll).toBeGreaterThan(100);
    await editor(page, 2).focus();
    await page.keyboard.type("S");
    await expect(editor(page, 2)).toContainText("alpha bullet item fiveS");
    await expect(tabIn(page, "tabs", "alpha.md").getByTestId("tab-dirty")).toBeVisible();
    await expect(tabIn(page, "tabs-two", "alpha.md").getByTestId("tab-dirty")).toBeVisible();
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("AC-R4-12: view two undoes a view one edit and view one redoes it", {
  tag: "@AC-R4-12",
  annotation: { type: "AC-R4-12" },
}, async () => {
  const { directory, alpha } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await cloneAlpha(page);
    await editor(page, 1).click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("HISTORY-EDIT");
    await editor(page, 2).focus();
    await page.keyboard.press(DOCUMENT_END);
    await expect(editor(page, 2)).toContainText("HISTORY-EDIT");

    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await editor(page, 1).focus();
    await page.keyboard.press(DOCUMENT_END);
    await editor(page, 2).focus();
    await page.keyboard.press(DOCUMENT_END);
    await expect(editor(page, 1)).not.toContainText("HISTORY-EDIT");
    await expect(editor(page, 2)).not.toContainText("HISTORY-EDIT");

    await editor(page, 1).focus();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+z`);
    await expect(editor(page, 1)).toContainText("HISTORY-EDIT");
    await expect(editor(page, 2)).toContainText("HISTORY-EDIT");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("view two saves its document without changing view one", async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const alphaBefore = await fs.readFile(alpha, "utf8");
  const betaBefore = await fs.readFile(beta, "utf8");
  const { application, page } = await launchEditor(alpha);
  try {
    await openWithMenu(application, beta);
    await tabIn(page, "tabs", "beta.md").click({ button: "right" });
    await page.getByRole("button", { name: "Move to Other View" }).click();
    await tabIn(page, "tabs", "alpha.md").click();
    await editor(page, 2).click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("VIEW-TWO-SAVE");

    await clickMenuItem(application, "file-save");

    await expect.poll(() => fs.readFile(beta, "utf8")).toBe(`${betaBefore}VIEW-TWO-SAVE`);
    expect(await fs.readFile(alpha, "utf8")).toBe(alphaBefore);
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a view two edit keeps the clean view one document clean", async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await openWithMenu(application, beta);
    await tabIn(page, "tabs", "beta.md").click({ button: "right" });
    await page.getByRole("button", { name: "Move to Other View" }).click();
    await tabIn(page, "tabs", "alpha.md").click();
    await editor(page, 2).click();
    await page.keyboard.press(DOCUMENT_END);

    await page.keyboard.type("VIEW-TWO-DIRTY");

    await expect(page).toHaveTitle(/^\u2022 beta\.md/);
    await expect(tabIn(page, "tabs", "alpha.md").getByTestId("tab-dirty")).toBeHidden();
    await editor(page, 1).click();
    await expect(page).toHaveTitle(/^alpha\.md/);
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("AC-R4-11: an inactive clone reconnects to the authoritative text", {
  tag: "@AC-R4-11",
  annotation: { type: "AC-R4-11" },
}, async () => {
  const { directory, alpha, beta } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await openWithMenu(application, beta);
    await tabIn(page, "tabs", "beta.md").click({ button: "right" });
    await page.getByRole("button", { name: "Move to Other View" }).click();
    await cloneAlpha(page);
    await editor(page, 2).click();
    await page.keyboard.press(DOCUMENT_END);
    await tabIn(page, "tabs-two", "beta.md").click();
    await tabIn(page, "tabs", "alpha.md").click();
    await editor(page, 1).click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("INACTIVE-EDIT");

    await tabIn(page, "tabs-two", "alpha.md").click();

    await expect(editor(page, 2)).toContainText("INACTIVE-EDIT");
    await page.keyboard.type("-SECONDARY");
    await expect(editor(page, 1)).toContainText("-SECONDARYINACTIVE-EDIT");
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.POSITIVE_INFINITY;
}

test("AC-R4-11: cloned-view keystroke updates stay under 16 ms at p95", {
  tag: "@AC-R4-11",
  annotation: { type: "AC-R4-11" },
}, async () => {
  const { directory, alpha } = await copyFixtures();
  const { application, page } = await launchEditor(alpha);
  try {
    await cloneAlpha(page);
    await editor(page, 1).click();
    await page.keyboard.press(DOCUMENT_START);
    const measured: number[] = [];
    let prefix = "";
    for (let index = 0; index < SAMPLES + WARM_UP_SAMPLES; index += 1) {
      const value = String(index % 10);
      prefix += value;
      const duration = await page.evaluate(async (input) => {
        const peer = document.querySelector("#editor-two .cm-content");
        if (!peer) {
          throw new Error("The cloned editor is missing.");
        }
        return new Promise<number>((resolve) => {
          const started = performance.now();
          const observer = new MutationObserver(() => {
            if (peer.textContent?.startsWith(input.expected)) {
              observer.disconnect();
              resolve(performance.now() - started);
            }
          });
          observer.observe(peer, { characterData: true, childList: true, subtree: true });
          document.execCommand("insertText", false, input.value);
        });
      }, { expected: prefix, value });
      measured.push(duration);
    }
    const samples = measured.slice(WARM_UP_SAMPLES);
    const p95 = percentile(samples, 0.95);
    console.log(`AC-R4-11 clone keystroke: n=${String(samples.length)} p95=${p95.toFixed(2)} ms ` +
      `distribution=[${samples.map((value) => value.toFixed(2)).join(", ")}]`);
    expect(samples).toHaveLength(SAMPLES);
    expect(p95).toBeLessThan(16);
  } finally {
    await closeEditor(application, page);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
