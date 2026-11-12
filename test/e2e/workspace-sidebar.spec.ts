import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  closeEditor,
  launchEditor,
  repositoryRoot,
  PRIMARY_MODIFIER,
  stubOpenDialog,
} from "./helpers";

const workspaceFixture = path.join(repositoryRoot, "test/fixtures/workspace");

async function writeNumberedFiles(
  directory: string,
  count: number,
  contents: (index: number) => string,
): Promise<void> {
  for (let start = 0; start < count; start += 250) {
    const end = Math.min(start + 250, count);
    await Promise.all(Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      const name = `file-${String(index).padStart(4, "0")}.md`;
      return fs.writeFile(path.join(directory, name), contents(index), "utf8");
    }));
  }
}

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
}

async function openWorkspace(
  application: Awaited<ReturnType<typeof launchEditor>>["application"],
  page: Awaited<ReturnType<typeof launchEditor>>["page"],
  directory: string,
): Promise<void> {
  await stubOpenDialog(application, directory);
  await page.getByRole("button", { name: "Open Folder" }).click();
  await expect(page.getByTestId("workspace-tree")).toBeVisible();
}

test("Open Folder shows a lazy Markdown tree", {
  tag: "@AC-R11-01",
  annotation: { type: "AC-R11-01" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await openWorkspace(application, page, workspaceFixture);
    const rows = page.getByTestId("workspace-row");
    await expect(rows).toHaveText([
      "empty",
      "notes",
      "about.md",
      "getting-started.md",
      "README.md",
    ]);
    await expect(page.getByText("data.json", { exact: true })).toHaveCount(0);
    await expect(page.getByText(".hidden.md", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "notes" }).click();
    await expect(page.getByRole("button", { name: "daily.md" })).toBeVisible();
  } finally {
    await closeEditor(application, page);
  }
});

test.describe("a 5,000-file folder", () => {
  // Writing and removing 5,000 files takes seconds on a Windows runner; the
  // hooks keep that time outside the test's own timeout.
  let root = "";

  test.beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-workspace-large-"));
    const bulk = path.join(root, "bulk");
    await fs.mkdir(bulk);
    await writeNumberedFiles(bulk, 5_000, () => "# Entry\n");
  });

  test.afterAll(async () => {
    if (root !== "") {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("a second expand reuses loaded children and keeps editing responsive", {
    tag: "@AC-R11-02",
    annotation: { type: "AC-R11-02" },
  }, async () => {
    const { application, page } = await launchEditor();
    try {
      await openWorkspace(application, page, root);
      const folder = page.getByRole("button", { name: "bulk" });
      await folder.click();
      const editor = page.getByTestId("editor").locator(".cm-content");
      await editor.click();
      await page.keyboard.type("responsive");
      await expect(editor).toContainText("responsive");
      await expect(page.getByTestId("workspace-row")).toHaveCount(5_001);
      const durations = await page.evaluate(async () => {
        const button = document.querySelector<HTMLButtonElement>('button[data-path="bulk"]');
        const samples: number[] = [];
        for (let index = 0; index < 30; index += 1) {
          button?.click();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const started = performance.now();
          button?.click();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          samples.push(performance.now() - started);
        }
        return samples;
      });
      await expect(page.locator('[data-testid="workspace-row"]:visible')).toHaveCount(5_001);
      console.log(`AC-R11-02 expand p95 ${percentile95(durations).toFixed(1)} ms`);
      expect(durations).toHaveLength(30);
      expect(percentile95(durations)).toBeLessThan(500);
    } finally {
      await closeEditor(application, page);
    }
  });
});

test("the workspace filter keeps matching file ancestors", {
  tag: "@AC-R11-03",
  annotation: { type: "AC-R11-03" },
}, async () => {
  const { application, page } = await launchEditor();
  try {
    await openWorkspace(application, page, workspaceFixture);
    await page.getByRole("button", { name: "notes" }).click();
    await expect(page.getByRole("button", { name: "daily.md" })).toBeVisible();

    const filter = page.getByRole("searchbox", { name: "Filter workspace" });
    await filter.fill("DAILY");
    await expect(page.getByTestId("workspace-row")).toHaveText(["notes", "daily.md"]);
    await filter.fill("missing");
    await expect(page.getByText("No matching files.", { exact: true })).toBeVisible();
  } finally {
    await closeEditor(application, page);
  }
});

test("clicking a workspace file opens and reuses its tab", {
  tag: "@AC-R11-04",
  annotation: { type: "AC-R11-04" },
}, async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-workspace-"));
  await writeNumberedFiles(temporaryDirectory, 31, (index) => {
    const heading = `# Workspace note ${String(index)}\n`;
    return (heading + "workspace text\n".repeat(8_000)).slice(0, 100 * 1024);
  });
  const { application, page } = await launchEditor();
  try {
    await openWorkspace(application, page, temporaryDirectory);
    const durations: number[] = [];
    for (let index = 0; index < 31; index += 1) {
      const name = `file-${String(index).padStart(4, "0")}.md`;
      const duration = await page.evaluate(({ fileName, marker }) =>
        new Promise<number>((resolve) => {
          const editor = document.querySelector("[data-testid=editor] .cm-content");
          const button = document.querySelector<HTMLButtonElement>(
            `button[data-path="${fileName}"]`,
          );
          const started = performance.now();
          const observer = new MutationObserver(() => {
            if (editor?.textContent?.includes(marker)) {
              observer.disconnect();
              requestAnimationFrame(() => resolve(performance.now() - started));
            }
          });
          observer.observe(editor ?? document.body, { childList: true, subtree: true });
          button?.click();
        }), { fileName: name, marker: `Workspace note ${String(index)}` });
      if (index > 0) {
        durations.push(duration);
      }
      if (index < 30) {
        await page.getByRole("button", { name: `Close ${name}` }).click();
        await expect(page.getByTestId("tab")).toHaveCount(0);
      }
    }
    console.log(`AC-R11-04 open p95 ${percentile95(durations).toFixed(1)} ms`);
    expect(durations).toHaveLength(30);
    expect(percentile95(durations)).toBeLessThan(100);
    await expect(page.getByTestId("tab")).toHaveCount(1);

    const tree = page.getByTestId("workspace-tree");
    await tree.getByRole("button", { name: "file-0029.md" }).click();
    await expect(page.getByTestId("editor")).toContainText("Workspace note 29");
    await expect(page.getByTestId("tab")).toHaveCount(2);
    await tree.getByRole("button", { name: "file-0030.md" }).click();
    await expect(page.getByTestId("editor")).toContainText("Workspace note 30");
    await expect(page.getByTestId("tab")).toHaveCount(2);
  } finally {
    await closeEditor(application, page);
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the workspace tree follows disk changes and preserves a dirty deleted file", {
  tag: "@AC-R11-05",
  annotation: { type: "AC-R11-05" },
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-workspace-watch-"));
  const cleanPath = path.join(root, "clean.md");
  const dirtyPath = path.join(root, "dirty.md");
  await fs.writeFile(cleanPath, "# Clean\n");
  await fs.writeFile(dirtyPath, "# Dirty\n");
  const { application, page } = await launchEditor();
  try {
    await openWorkspace(application, page, root);
    await fs.writeFile(path.join(root, "created.md"), "# Created\n");
    await expect(page.getByRole("button", { name: "created.md" })).toBeVisible({ timeout: 1_000 });
    await fs.writeFile(dirtyPath, "# Changed\n");
    await expect(page.getByRole("button", { name: "dirty.md" }))
      .toHaveAttribute("title", "Changed on disk", { timeout: 1_000 });

    await page.getByRole("button", { name: "clean.md" }).click();
    await expect(page.locator('[data-testid="tab"][data-name="clean.md"]')).toBeVisible();
    await fs.unlink(cleanPath);
    await expect(page.getByTestId("tab")).toHaveCount(0, { timeout: 1_000 });

    await page.getByRole("button", { name: "dirty.md" }).click();
    await expect(page.locator('[data-testid="tab"][data-name="dirty.md"]')).toBeVisible();
    await page.getByTestId("editor").locator(".cm-content").press("End");
    await page.keyboard.type("unsaved");
    await expect(page.getByTestId("tab-dirty")).toBeVisible();
    await fs.unlink(dirtyPath);
    await expect(page.getByTestId("tab")).toHaveCount(1, { timeout: 1_000 });
    await expect(page.getByTestId("tab-dirty")).toBeVisible();
  } finally {
    await closeEditor(application, page);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("CmdOrCtrl+B persists the closed sidebar across a restart", {
  tag: "@AC-R11-06",
  annotation: { type: "AC-R11-06" },
}, async () => {
  const first = await launchEditor();
  await expect.poll(() => first.page.evaluate(() =>
    document.documentElement.dataset["sidebarShortcutReady"],
  )).toBe("true");
  await first.page.keyboard.press(`${PRIMARY_MODIFIER}+b`);
  await expect(first.page.getByRole("complementary", { name: "Workspace" })).toBeHidden();
  const durations = await first.page.evaluate((useMeta) => {
    const sidebar = document.querySelector<HTMLElement>("#workspace-sidebar");
    return Array.from({ length: 30 }, () => {
      const started = performance.now();
      document.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "b",
        ctrlKey: !useMeta,
        metaKey: useMeta,
      }));
      if (!sidebar) return Number.POSITIVE_INFINITY;
      return performance.now() - started;
    });
  }, process.platform === "darwin");
  console.log(`AC-R11-06 toggle p95 ${percentile95(durations).toFixed(1)} ms`);
  expect(durations).toHaveLength(30);
  expect(percentile95(durations)).toBeLessThan(50);
  await expect(first.page.getByRole("complementary", { name: "Workspace" })).toBeHidden();
  await expect.poll(async () => fs.readFile(
    path.join(first.userDataDir, "settings.json"),
    "utf8",
  ).catch(() => "")).toContain('"workspaceSidebarOpen": false');
  await first.application.close();

  const second = await launchEditor(undefined, first.userDataDir);
  try {
    await expect(second.page.getByRole("complementary", { name: "Workspace" })).toBeHidden();
  } finally {
    await closeEditor(second.application, second.page);
  }
});

test("workspace file actions stay inside the root and keep state after failure", {
  tag: ["@AC-R11-07", "@AC-R11-08"],
  annotation: [{ type: "AC-R11-07" }, { type: "AC-R11-08" }],
}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-workspace-actions-"));
  await fs.writeFile(path.join(root, "existing.md"), "existing");
  const outsideName = `outside-${path.basename(root)}.md`;
  const { application, page } = await launchEditor();
  try {
    await openWorkspace(application, page, root);
    const tree = page.getByTestId("workspace-tree");
    await tree.click({ button: "right" });
    await page.getByRole("button", { name: "New File" }).click();
    const create = page.getByRole("dialog", { name: "New file name" });
    await create.getByRole("textbox").fill(`../${outsideName}`);
    await create.getByRole("button", { name: "Create" }).click();
    await expect(page.getByTestId("status")).toContainText("request was not valid");
    await expect(fs.stat(path.join(root, "..", outsideName))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await tree.click({ button: "right" });
    await page.getByRole("button", { name: "New File" }).click();
    await create.getByRole("textbox").fill("created.md");
    await create.getByRole("button", { name: "Create" }).click();
    await expect(tree.getByRole("button", { name: "created.md" })).toBeVisible();

    await tree.getByRole("button", { name: "created.md" }).click({ button: "right" });
    await page.getByRole("button", { name: "Rename" }).click();
    const rename = page.getByRole("dialog", { name: "Rename file" });
    await rename.getByRole("textbox").fill("existing.md");
    await rename.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByTestId("status")).toContainText("created.md");
    await expect(tree.getByRole("button", { name: "created.md" })).toBeVisible();
    await expect(fs.readFile(path.join(root, "existing.md"), "utf8")).resolves.toBe("existing");

    await tree.getByRole("button", { name: "created.md" }).click({ button: "right" });
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete created.md?" })
      .getByRole("button", { name: "Delete" }).click();
    await expect(tree.getByRole("button", { name: "created.md" })).toHaveCount(0);
  } finally {
    await closeEditor(application, page);
    await fs.rm(root, { recursive: true, force: true });
  }
});
