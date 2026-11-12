import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  launchEditor,
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
