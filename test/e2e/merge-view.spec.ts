import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  clickMenuItem,
  closeEditor,
  launchEditor,
  PRIMARY_MODIFIER,
  readTextOrNull,
  repositoryRoot,
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
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-merge-"));
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
