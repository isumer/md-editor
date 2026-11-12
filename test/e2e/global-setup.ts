import path from "node:path";

import { closeEditor, launchEditor, repositoryRoot } from "./helpers";
import { isSteady } from "./prime-steady";

// A fresh CI machine pays one-time costs on its first Electron launches: the OS
// assesses each new binary and helper app on first exec, pages in the framework,
// and builds its system-wide GPU shader cache. Diag run 43250118484 (macos-latest)
// measured the first launch at 4.2 s to the argv document and the first 50 KB
// preview keystrokes at 107–124 ms; the same specs on the same machine a minute
// later gave 977 ms (AC-PERF-03) and p95 20.6 ms (AC-PERF-02). An installed app
// pays those costs once, not per start, so the machine is primed here before any
// budget is measured. Each test still launches its own app with a fresh profile;
// no test, budget or sample count changes.
// A slow machine keeps settling after the first launch (diag run 43253195712:
// one runner took 11.7 s then 4.6 s, the others about 2.5 s on round two), so
// rounds repeat until two in a row agree (see prime-steady.ts).
const PRIME_MAX_ROUNDS = 6;
const PRIME_KEYSTROKES = "prime";
const PRIME_TIMEOUT_MS = 60_000;
const primeDocument = path.join(repositoryRoot, "test/fixtures/big/large-50kb.md");

async function primeOnce(round: number): Promise<number> {
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
  const elapsedMs = Date.now() - started;
  console.log(`e2e machine prime round ${String(round)}: ${String(elapsedMs)} ms`);
  return elapsedMs;
}

export default async function globalSetup(): Promise<void> {
  let previousMs = await primeOnce(1);
  for (let round = 2; round <= PRIME_MAX_ROUNDS; round += 1) {
    const currentMs = await primeOnce(round);
    if (isSteady(previousMs, currentMs)) {
      return;
    }
    previousMs = currentMs;
  }
  // Not steady after the cap: the tests run anyway and report what they measure.
  console.log(`e2e machine prime: not steady after ${String(PRIME_MAX_ROUNDS)} rounds`);
}
