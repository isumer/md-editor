import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import { launchEditor, repositoryRoot, stubOpenDialog } from "./helpers";

const run = promisify(execFile);
const rates = [4, 6] as const;
let directory = "";
let large20 = "";

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-probe-"));
  large20 = path.join(directory, "large-20mb.md");
  await run("node", [
    path.join(repositoryRoot, "test/fixtures/big/generate.mjs"),
    "20971520",
    large20,
  ], { cwd: repositoryRoot });
});

test.afterAll(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

for (const rate of rates) {
  for (let runNumber = 1; runNumber <= 3; runNumber += 1) {
    test(`probe at ${String(rate)}x run ${String(runNumber)}`, async () => {
      const firstLine = (await fs.readFile(large20, "utf8")).split("\n")[0] ?? "";
      const { application, page } = await launchEditor();
      try {
        await page.addInitScript(() => {
          const probe: {
            tasks: { start: number; duration: number }[];
            entries: { name: string; start: number }[];
          } = { tasks: [], entries: [] };
          (window as unknown as { __windowProbe?: typeof probe }).__windowProbe = probe;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.entryType === "longtask") {
                probe.tasks.push({ start: entry.startTime, duration: entry.duration });
              } else if (entry.name === "preview-apply-start" ||
                entry.name === "preview-apply-end" || entry.name === "preview-patch") {
                probe.entries.push({ name: entry.name, start: entry.startTime });
              }
            }
          }).observe({ entryTypes: ["longtask", "mark", "measure"] });
        });
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setCPUThrottlingRate", { rate });
        await page.reload();
        await expect(page.getByTestId("editor").locator(".cm-content")).toBeVisible();
        await stubOpenDialog(application, large20);
        await expect.poll(() => application.evaluate(({ Menu }) =>
          Boolean(Menu.getApplicationMenu()?.getMenuItemById("file-open"))),
        { timeout: 5_000 }).toBe(true);
        await application.evaluate(({ Menu }) => {
          Menu.getApplicationMenu()?.getMenuItemById("file-open")?.click();
        });
        await expect(page.getByTestId("editor").locator(".cm-content")).toContainText(
          firstLine,
          { timeout: 60_000 },
        );
        const shownAt = await page.evaluate(() => performance.now());
        await expect(page.getByTestId("preview").locator("h1").first()).toHaveText(
          firstLine.replace(/^#+\s*/u, ""),
          { timeout: 60_000 },
        );
        await page.waitForTimeout(5_000);
        const probe = await page.evaluate(() =>
          (window as unknown as { __windowProbe: {
            tasks: { start: number; duration: number }[];
            entries: { name: string; start: number }[];
          } }).__windowProbe);
        const largestOverall = probe.tasks.reduce<typeof probe.tasks[number] | undefined>(
          (largest, task) => largest === undefined || task.duration > largest.duration
            ? task
            : largest,
          undefined,
        );
        const largestWindowed = probe.tasks.filter((task) => task.start >= shownAt)
          .reduce<typeof probe.tasks[number] | undefined>(
            (largest, task) => largest === undefined || task.duration > largest.duration
              ? task
              : largest,
            undefined,
          );
        const nearby = largestWindowed === undefined ? [] : probe.entries.filter((entry) =>
          entry.start >= largestWindowed.start - 50 &&
          entry.start <= largestWindowed.start + largestWindowed.duration + 50);
        console.log(JSON.stringify({ rate, runNumber, shownAt, largestOverall,
          largestOverallRelative: largestOverall === undefined ? null :
            largestOverall.start >= shownAt ? "after" : "before",
          largestWindowed, nearby }));
      } finally {
        await application.close();
      }
    });
  }
}
