import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  launchEditor,
  repositoryRoot,
  stubOpenDialog,
} from "./helpers";

test("AC-R14-01 AC-R14-02 AC-R14-07: compares open files and moves between differences", {
  tag: ["@AC-R14-01", "@AC-R14-02", "@AC-R14-07"],
}, async () => {
  const leftPath = path.join(repositoryRoot, "test/fixtures/compare/lines/left.txt");
  const rightPath = path.join(repositoryRoot, "test/fixtures/compare/lines/right.txt");
  const { application, page } = await launchEditor(leftPath);

  try {
    await stubOpenDialog(application, rightPath);
    await clickMenuItem(application, "file-open");
    await expect(page.getByRole("tab", { name: /right\.txt/ })).toBeVisible();

    await clickMenuItem(application, "file-compare");

    const compare = page.getByTestId("compare-view");
    await expect(compare).toBeVisible();
    await expect(compare.getByTestId("compare-left-title")).toHaveText("left.txt");
    await expect(compare.getByTestId("compare-right-title")).toHaveText("right.txt");
    await expect(compare.locator('[data-change-kind="modified"]')).not.toHaveCount(0);
    await expect(compare.getByTestId("changed-word").filter({ hasText: "and paper" })).toBeVisible();
    await expect(compare.getByTestId("compare-overview-marker")).not.toHaveCount(0);

    await compare.getByRole("combobox", { name: "Highlight" }).selectOption("none");
    await expect(compare.getByTestId("changed-word")).toHaveCount(0);
    await compare.getByRole("combobox", { name: "Highlight" }).selectOption("characters");
    await expect(compare.getByTestId("changed-word")).not.toHaveCount(0);

    const active = compare.locator('[data-active-difference="true"]');
    await expect(active.first()).toHaveAttribute("data-difference", "0");
    await page.keyboard.press("F7");
    await page.keyboard.press("F7");
    await page.keyboard.press("F7");
    await expect(active.first()).toHaveAttribute("data-difference", "3");
    await page.keyboard.press("Shift+F7");
    await expect(active.first()).toHaveAttribute("data-difference", "2");
  } finally {
    await closeEditor(application, page);
  }
});
