import path from "node:path";

import { closeEditor, launchEditor, repositoryRoot } from "./helpers";

// A fresh CI machine pays one-time costs on its first Electron launches: the OS
// assesses each new binary and helper app on first exec, pages in the framework,
// and builds its system-wide GPU shader cache. Diag run 43250118484 (macos-latest)
// measured the first launch at 4.2 s to the argv document and the first 50 KB
// preview keystrokes at 107–124 ms; the same specs on the same machine a minute
// later gave 977 ms (AC-PERF-03) and p95 20.6 ms (AC-PERF-02). An installed app
// pays those costs once, not per start, so the machine is primed here before any
// budget is measured. Each test still launches its own app with a fresh profile;
// no test, budget or sample count changes.
const PRIME_ROUNDS = 2;
const PRIME_KEYSTROKES = "prime";
const PRIME_TIMEOUT_MS = 60_000;
const primeDocument = path.join(repositoryRoot, "test/fixtures/big/large-50kb.md");

async function primeOnce(round: number): Promise<void> {
  const started = Date.now();
  const { application, page } = await launchEditor(primeDocument, {
    titleTimeoutMs: PRIME_TIMEOUT_MS,
  });
  try {
    await page.getByTestId("preview").locator("h1").first()
      .waitFor({ timeout: PRIME_TIMEOUT_MS });
    const editor = page.getByTestId("editor").locator(".cm-content");
    await editor.click({ timeout: PRIME_TIMEOUT_MS });
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type(PRIME_KEYSTROKES);
    await page.getByTestId("preview").getByText(PRIME_KEYSTROKES, { exact: false })
      .first().waitFor({ timeout: PRIME_TIMEOUT_MS });
  } finally {
    await closeEditor(application, page);
  }
  console.log(`e2e machine prime round ${String(round)}: ${String(Date.now() - started)} ms`);
}

export default async function globalSetup(): Promise<void> {
  for (let round = 1; round <= PRIME_ROUNDS; round += 1) {
    await primeOnce(round);
  }
}
