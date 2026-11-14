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
  readTextOrNull,
  repositoryRoot,
  stubOpenDialog,
} from "./helpers";

const markerFixture = path.join(
  repositoryRoot,
  "test/fixtures/merge/conflict-markers.txt",
);

test("a conflict-marker file resolves each conflict and saves the result", {
  tag: ["@AC-R15-04", "@AC-R15-06"],
  annotation: [
    { type: "AC-R15-04" },
    { type: "AC-R15-06" },
  ],
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-merge-"));
  const mergedFile = path.join(temporaryDirectory, "conflicted.txt");
  await fs.copyFile(markerFixture, mergedFile);
  const { application, page } = await launchEditor(mergedFile);

  try {
    await expect(page.getByTestId("merge-view")).toBeVisible();
    await expect(page.getByTestId("merge-left")).toContainText(
      "The deploy starts at 09:00 UTC.",
    );
    await expect(page.getByTestId("merge-right")).toContainText(
      "The deploy starts at 10:00 UTC.",
    );
    await expect(page.getByTestId("merge-conflicts-left")).toHaveText("2 conflicts left");

    await page.getByTestId("merge-conflict-1-left").click();
    await expect(page.getByTestId("merge-conflicts-left")).toHaveText("1 conflict left");
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await expect(page.getByTestId("merge-conflicts-left")).toHaveText("2 conflicts left");
    await expect(page.getByTestId("merge-conflict-1-both")).toBeEnabled();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+Shift+z`);
    await expect(page.getByTestId("merge-conflicts-left")).toHaveText("1 conflict left");
    await expect(page.getByTestId("merge-conflict-1-both")).toBeDisabled();
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await page.getByTestId("merge-conflict-1-both").click();
    await page.getByTestId("merge-conflict-2-right").click();

    await expect(page.getByTestId("merge-conflicts-left")).toHaveText("0 conflicts left");
    await expect(page.getByTestId("editor")).toContainText(
      "The deploy starts at 09:00 UTC.Rollback is automatic on failure." +
      "The deploy starts at 10:00 UTC.Rollback is manual with a checklist.",
    );
    await clickMenuItem(application, "file-save");
    await expect.poll(() => readTextOrNull(mergedFile)).not.toContain("<<<<<<<");
    const saved = await readTextOrNull(mergedFile);
    expect(saved).not.toContain("<<<<<<<");
    expect(saved).toContain(
      "The support rota is published weekly.",
    );
    expect(saved).not.toContain("The support rota is published monthly.");
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("two files start an editable left-centred merge with read-only sides", {
  tag: "@AC-R15-03",
  annotation: { type: "AC-R15-03" },
}, async () => {
  const fixtureDirectory = path.join(repositoryRoot, "test/fixtures/merge");
  const leftPath = path.join(fixtureDirectory, "left.txt");
  const rightPath = path.join(fixtureDirectory, "right.txt");
  const { application, page } = await launchEditor(leftPath);

  try {
    await stubOpenDialog(application, rightPath);
    await clickMenuItem(application, "file-open");
    await page.getByRole("tab", { name: /left\.txt/ }).click();
    await clickMenuItem(application, "file-merge-open");

    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(page.getByTestId("merge-view")).toBeVisible();
    await expect(editor).toContainText("release runner");
    await expect(page.getByTestId("merge-left").locator("pre")).toContainText(
      "release runner",
    );
    await expect(page.getByTestId("merge-right").locator("pre")).toContainText(
      "shared runner",
    );
    await expect(page.getByTestId("merge-left").locator("[contenteditable=true]"))
      .toHaveCount(0);
    await expect(page.getByTestId("merge-right").locator("[contenteditable=true]"))
      .toHaveCount(0);

    await editor.click();
    await page.keyboard.press(DOCUMENT_END);
    await page.keyboard.type("\nEditable merge result");
    await expect(editor).toContainText("Editable merge result");
  } finally {
    await closeEditor(application, page);
  }
});

test("three open files start a base-centred merge with apply and navigation", {
  tag: ["@AC-R15-03", "@AC-R15-05", "@AC-R15-10"],
  annotation: [
    { type: "AC-R15-03" },
    { type: "AC-R15-05" },
    { type: "AC-R15-10" },
  ],
}, async () => {
  const fixtureDirectory = path.join(repositoryRoot, "test/fixtures/merge");
  const leftPath = path.join(fixtureDirectory, "left.txt");
  const rightPath = path.join(fixtureDirectory, "right.txt");
  const basePath = path.join(fixtureDirectory, "base.txt");
  const { application, page } = await launchEditor(leftPath);

  try {
    await stubOpenDialog(application, rightPath);
    await clickMenuItem(application, "file-open");
    await expect(page.getByRole("tab", { name: /right\.txt/ })).toBeVisible();
    await stubOpenDialog(application, basePath);
    await clickMenuItem(application, "file-open");
    await expect(page.getByRole("tab", { name: /base\.txt/ })).toBeVisible();

    await clickMenuItem(application, "file-merge-open");

    await expect(page.getByTestId("merge-view")).toBeVisible();
    await expect(page.getByTestId("merge-left")).toContainText("release runner");
    await expect(page.getByTestId("merge-right")).toContainText("every release");
    await expect(page.getByTestId("editor")).toContainText("shared runner");
    await expect(page.getByTestId("merge-counts"))
      .toHaveText("5 changes, 2 conflicts left");

    await page.getByTestId("merge-apply-changes").click();
    await expect(page.getByTestId("editor")).toContainText("release runner");
    await expect(page.getByTestId("editor")).toContainText("every release");
    await expect(page.getByTestId("merge-counts"))
      .toHaveText("0 changes, 2 conflicts left");
    await page.keyboard.press(`${PRIMARY_MODIFIER}+z`);
    await expect(page.getByTestId("merge-counts"))
      .toHaveText("5 changes, 2 conflicts left");
    await expect(page.getByTestId("editor")).toContainText("shared runner");
    await expect(page.getByTestId("editor")).toContainText("every merge");

    await page.keyboard.press("F7");
    await expect(page.getByTestId("editor").locator(".cm-activeLine")).toContainText("shared runner");
    await page.keyboard.press("F7");
    await page.keyboard.press("Shift+F7");
    await expect(page.getByTestId("editor").locator(".cm-activeLine")).toContainText("shared runner");
  } finally {
    await closeEditor(application, page);
  }
});
