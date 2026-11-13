import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  DOCUMENT_END,
  launchEditor,
  PRIMARY_MODIFIER,
  repositoryRoot,
  stubOpenDialog,
} from "./helpers";

const leftPath = path.join(repositoryRoot, "test/fixtures/compare/lines/left.txt");
const rightPath = path.join(repositoryRoot, "test/fixtures/compare/lines/right.txt");

test("two open files show aligned line and word differences with navigation", {
  tag: ["@AC-R14-01", "@AC-R14-02", "@AC-R14-07"],
  annotation: [
    { type: "AC-R14-01" },
    { type: "AC-R14-02" },
    { type: "AC-R14-07" },
  ],
}, async () => {
  const { application, page } = await launchEditor(leftPath);
  try {
    await expect(page.getByRole("tab", { name: /left\.txt/ })).toBeVisible();
    await stubOpenDialog(application, rightPath);
    await clickMenuItem(application, "file-open");
    await expect(page.getByRole("tab", { name: /right\.txt/ })).toBeVisible();

    await clickMenuItem(application, "file-compare-open");

    const compare = page.getByTestId("compare-view");
    await expect(compare).toBeVisible();
    await expect(page.getByTestId("compare-left-heading")).toHaveText("left.txt");
    await expect(page.getByTestId("compare-right-heading")).toHaveText("right.txt");
    const firstChange = compare.locator('[data-change-index="0"]').first();
    await expect(firstChange).toHaveAttribute("class", /compare-selected/);
    await expect(firstChange.locator(".compare-changed").last()).toHaveText(" and paper");

    await page.keyboard.press("F7");
    await expect(compare.locator('[data-change-index="1"]').first())
      .toHaveAttribute("class", /compare-selected/);
    await page.keyboard.press("F7");
    await expect(compare.locator('[data-change-index="2"]').first())
      .toHaveAttribute("class", /compare-selected/);
    await page.keyboard.press("F7");
    await expect(compare.locator('[data-change-index="3"]').first())
      .toHaveAttribute("class", /compare-selected/);
    await page.keyboard.press("Shift+F7");
    await expect(compare.locator('[data-change-index="2"]').first())
      .toHaveAttribute("class", /compare-selected/);
    await expect(compare.locator(".compare-overview-marker")).toHaveCount(5);
  } finally {
    await closeEditor(application, page);
  }
});

test("dirty text compares with saved and read-only clipboard text", {
  tag: ["@AC-R14-04"],
  annotation: [{ type: "AC-R14-04" }],
}, async () => {
  const { application, page } = await launchEditor(leftPath);
  try {
    await stubOpenDialog(application, rightPath);
    await clickMenuItem(application, "file-open");
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("\nUnsaved comparison line");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { readText: async () => "Clipboard comparison line" },
      });
    });
    await clickMenuItem(application, "file-compare-open");
    const compare = page.getByTestId("compare-view");

    await compare.getByRole("button", { name: "Compare with Saved" }).click();
    await expect(page.getByTestId("compare-left-heading")).toHaveText(
      "right.txt (current)",
    );
    await expect(page.getByTestId("compare-right-heading")).toHaveText(
      "right.txt (saved)",
    );
    await expect(compare).toContainText("Unsaved comparison line");

    await compare.getByRole("button", { name: "Compare with Clipboard" }).click();
    await expect(page.getByTestId("compare-right-heading")).toHaveText("Clipboard");
    await expect(compare).toContainText("Clipboard comparison line");
    await expect(compare.locator(".compare-apply")).toHaveCount(0);
  } finally {
    await closeEditor(application, page);
  }
});

test("a chunk arrow applies one change and Undo restores it", {
  tag: ["@AC-R14-05"],
  annotation: [{ type: "AC-R14-05" }],
}, async () => {
  const { application, page } = await launchEditor(leftPath);
  try {
    await stubOpenDialog(application, rightPath);
    await clickMenuItem(application, "file-open");
    await clickMenuItem(application, "file-compare-open");
    const compare = page.getByTestId("compare-view");
    await expect(compare.locator(".compare-overview-marker")).toHaveCount(5);

    await page.getByTestId("compare-apply-1").click();
    await expect(compare.locator(".compare-overview-marker")).toHaveCount(4);

    await compare.getByRole("button", { name: "Close compare" }).click();
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await clickMenuItem(application, "file-compare-open");
    await expect(compare.locator(".compare-overview-marker")).toHaveCount(5);
  } finally {
    await closeEditor(application, page);
  }
});

test("compare keeps the workspace sidebar in the left column", async () => {
  const { application, page } = await launchEditor(leftPath);
  try {
    await expect(page.getByRole("tab", { name: /left\.txt/ })).toBeVisible();
    await stubOpenDialog(application, rightPath);
    await clickMenuItem(application, "file-open");
    await expect(page.getByRole("tab", { name: /right\.txt/ })).toBeVisible();

    await clickMenuItem(application, "file-compare-open");

    const sidebar = page.getByRole("complementary", { name: "Workspace" });
    const compare = page.getByTestId("compare-view");
    await expect(compare).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    const compareBox = await compare.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(compareBox).not.toBeNull();
    if (!sidebarBox || !compareBox) throw new Error("The layout boxes are missing.");
    expect(compareBox.x).toBe(sidebarBox.x + sidebarBox.width);
    expect(compareBox.y).toBe(sidebarBox.y);
  } finally {
    await closeEditor(application, page);
  }
});

test("unified compare preserves changes, collapses context, and reports fallback", {
  tag: ["@AC-R14-03", "@AC-R14-09", "@AC-R14-11"],
  annotation: [
    { type: "AC-R14-03" },
    { type: "AC-R14-09" },
    { type: "AC-R14-11" },
  ],
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-compare-"));
  const left = Array.from({ length: 1_000 }, (_, index) => `line ${String(index + 1)}`);
  const right = [...left];
  left[499] = Array.from({ length: 200 }, (_, index) => `left${String(index)}`).join(" ");
  right[499] = Array.from({ length: 200 }, (_, index) => `right${String(index)}`).join(" ");
  const leftFile = path.join(temporaryDirectory, "left-long.txt");
  const rightFile = path.join(temporaryDirectory, "right-long.txt");
  await Promise.all([
    fs.writeFile(leftFile, left.join("\n")),
    fs.writeFile(rightFile, right.join("\n")),
  ]);
  const { application, page } = await launchEditor(leftFile);
  try {
    await stubOpenDialog(application, rightFile);
    await clickMenuItem(application, "file-open");
    await expect(page.getByRole("tab", { name: /right-long\.txt/ })).toBeVisible();
    await clickMenuItem(application, "file-compare-open");

    const compare = page.getByTestId("compare-view");
    await expect(compare.getByRole("status")).toContainText("shows line changes instead");
    await expect(compare.locator(".compare-expand")).toHaveCount(2);
    const markers = await compare.locator(".compare-overview-marker").count();
    await compare.locator(".compare-mode").click();

    await expect(compare).toHaveClass(/compare-unified/);
    await expect(compare.locator(".compare-overview-marker")).toHaveCount(markers);
    await compare.locator(".compare-expand").first().click();
    await expect(compare.locator(".compare-line-number").filter({ hasText: "250" }))
      .toBeVisible();
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});
