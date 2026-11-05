import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { repositoryRoot, launchEditor } from "./helpers";

const run = promisify(execFile);

test.describe.configure({ timeout: 600_000 });

test("debug 20MB perf shape", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-dbg-"));
  const file = path.join(directory, "large-20mb.md");
  await run("node", [
    path.join(repositoryRoot, "test/fixtures/big/generate.mjs"),
    "20971520",
    file,
  ], { cwd: repositoryRoot });
  const firstLine = (await fs.readFile(file, "utf8")).split("\n")[0] ?? "";
  const expected = firstLine.replace(/^#+\s*/u, "");
  const started = Date.now();
  const { application, page } = await launchEditor(file);
  page.on("console", (message) => console.log("CONSOLE", message.text().slice(0, 160)));
  try {
    const editor = page.getByTestId("editor").locator(".cm-content");
    await expect(editor).toContainText(firstLine, { timeout: 10_000 });
    console.log("EDITABLE", Date.now() - started);
    const heading = page.getByTestId("preview").locator("h1").first();
    await expect(heading).toHaveText(expected, { timeout: 10_000 });
    console.log("PREVIEW", Date.now() - started);
  } finally {
    await application.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
