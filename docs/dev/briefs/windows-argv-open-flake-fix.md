review: deep

# Windows argv-open e2e fix - close the app on failure and prove the wait

Base: continues the PR branch `feature/windows-argv-open-flake` at
`8408d1e`. Run `git merge origin/main` first. Keep the goals of
`windows-argv-open-flake.md`. Add no features. No new dependencies. Commit
after each item. Show a red test first where behaviour changes (AGENTS.md).

The Vision gate on candidate `8408d1e` found two real defects and one
misreading. This brief covers all three. It also requires the evidence the
gate could not collect.

## State of the branch
- `8408d1e` is the PR branch tip. It merges main `c439fa0` into the branch
  commit `b138ae8`.
- `launchEditor(filePath)` polls `document.title` for up to 10,000 ms. It
  calls `onPage(page)` before the poll.
- Windows CI run 42401357886 on `8408d1e` is green. The Windows
  `Run end-to-end tests` step succeeded. AC-PERF-03 (2 s launch-to-editable)
  and AC-R12-01 passed there.
- The poll and the predicate are correct. Do not rewrite them.

## Findings

1. Major - `test/e2e/helpers.ts:43`. The gate says the 10,000 ms bound must
   be at most 2,000 ms. **Disputed with evidence.** The brief says "a bound
   no larger than the test timeout" and, on the next line, "(the 2000 ms
   expect timeout stays)". In `playwright.config.ts`, `timeout` is 15,000 ms
   (the test timeout) and `expect.timeout` is 2,000 ms. 10,000 ms is within
   the test timeout. 2,000 ms is the margin that failed on Windows and
   started this work. AC-PERF-03 enforces the 2 s startup budget inside the
   test, and it passed on Windows CI. Keep 10,000 ms. Add the comment in
   item 1 so the two timeouts cannot be confused again.

2. Major - `test/e2e/preview.spec.ts:82` and `test/e2e/helpers.ts:19`. The
   `preview.spec.ts` edit and the `onPage` callback are outside the original
   brief's allowed list. **Confirmed as a process defect, but the change is
   required.** This brief authorizes both, narrowly. The listener must
   attach before the argv document is applied. The title wait would
   otherwise delay it past the first `probe.png` request, and AC-R1-11
   fails (precheck red at `preview.spec.ts:64`, `Received: 0`). Do not
   remove the callback and do not move the listener back.

3. Major - `test/e2e/helpers.ts:39`. If the poll rejects or `onPage` throws,
   `launchEditor` rejects before it returns `application`. The caller's
   `finally { await application.close() }` never runs. The Electron process
   stays open. **Confirmed.** Fix it as item 1. Cover both failure paths
   with tests.

## Allowed files
`test/e2e/helpers.ts`, `test/e2e/editor.spec.ts` (the two failure tests
only), `test/e2e/preview.spec.ts` (the listener move and the callback call
shape only).

Nothing else. Do not touch `test/e2e/binary-open.spec.ts`; its assertion
already proves the broken predicate. Do not edit `playwright.config.ts`,
`test/e2e/io-worker.spec.ts`, `docs/acceptance/`, `CHANGELOG.md`,
`package.json` or the workflows. Keep the macOS chord constants
(`PRIMARY_MODIFIER`, `DOCUMENT_START`, `DOCUMENT_END`) if they are in
`test/e2e/helpers.ts`; do not change them.

## Items

1. **Close the app when the launch setup fails.** Replace the
   `launchEditor` signature and body in `test/e2e/helpers.ts` with the code
   below. Keep the poll predicate and the 10,000 ms bound. The
   `titleTimeoutMs` option is test-only; it makes the failure test fast and
   does not change the default.

   ```ts
   export interface LaunchEditorOptions {
     // Runs after the first window exists and before the argv document is applied.
     onPage?: (editor: { application: ElectronApplication; page: Page }) => void;
     // Test-only override; the real bound is ARGV_TITLE_TIMEOUT_MS.
     titleTimeoutMs?: number;
   }

   // Bound by the 15_000 ms test timeout (the 2_000 ms expect timeout is separate):
   // 10_000 ms leaves the cold-Windows margin that the old 2_000 ms setup wait lost.
   const ARGV_TITLE_TIMEOUT_MS = 10_000;

   export async function launchEditor(
     filePath?: string,
     options: LaunchEditorOptions = {},
   ): Promise<{
     application: ElectronApplication;
     page: Page;
   }> {
     const environment: Record<string, string> = {};
     for (const [name, value] of Object.entries(process.env)) {
       if (name !== "ELECTRON_RUN_AS_NODE" && value !== undefined) {
         environment[name] = value;
       }
     }
     const application = await electron.launch({
       args: filePath ? [repositoryRoot, filePath] : [repositoryRoot],
       cwd: repositoryRoot,
       env: environment,
     });
     try {
       const page = await application.firstWindow();
       // Runs before the argv document is applied, so startup traffic is observable.
       options.onPage?.({ application, page });
       if (filePath) {
         const waitStarted = Date.now();
         await expect.poll(
           () => page.title(),
           {
             message: `argv document did not open: ${path.basename(filePath)}`,
             timeout: options.titleTimeoutMs ?? ARGV_TITLE_TIMEOUT_MS,
           },
         ).toContain(path.basename(filePath));
         console.log(
           `argv title wait: ${String(Date.now() - waitStarted)} ms (${path.basename(filePath)})`,
         );
       }
       return { application, page };
     } catch (error) {
       try {
         await application.close();
       } catch {
         // Best effort: the original failure is the one the caller must see.
       }
       throw error;
     }
   }
   ```

   The `try` starts after `electron.launch`, so a `firstWindow()` failure
   also closes the app. Rethrow the original error; do not wrap it and do not
   mask it with a close error.

2. **Update the one callback call site.** In `test/e2e/preview.spec.ts`,
   keep the listener where it is (before the returned promise resolves) and
   change only the callback shape:

   ```ts
   const imageRequests: string[] = [];
   const { application, page } = await launchEditor(documentPath, {
     onPage: ({ page: readyPage }) => {
       readyPage.on("request", (request) => {
         if (request.url().includes("probe.png")) {
           imageRequests.push(request.url());
         }
       });
     },
   });
   ```

3. **Add the two failure tests** to `test/e2e/editor.spec.ts`. Use the
   existing style: `test(...)`, `tag`, `annotation`. Tag both `@AC-R5-01`
   (the command-line open). Import the type:
   `import { expect, test, type ElectronApplication } from "@playwright/test";`

   ```ts
   test("a failed argv open fails clearly and closes the application", {
     tag: "@AC-R5-01",
     annotation: { type: "AC-R5-01" },
   }, async () => {
     const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mdeditor-missing-"));
     const missingPath = path.join(directory, "missing.md");
     let launched: ElectronApplication | undefined;
     let failure: unknown;
     try {
       try {
         await launchEditor(missingPath, {
           titleTimeoutMs: 500,
           onPage: ({ application }) => {
             launched = application;
           },
         });
       } catch (error) {
         failure = error;
       }
       expect(failure).toBeInstanceOf(Error);
       expect((failure as Error).message).toContain("argv document did not open");
       await expect.poll(
         () => launched?.process().exitCode ?? null,
         { timeout: 5_000 },
       ).not.toBeNull();
     } finally {
       if (launched) {
         await launched.close().catch(() => undefined);
       }
       await fs.rm(directory, { recursive: true, force: true });
     }
   });

   test("a throwing page callback closes the application and keeps the error", {
     tag: "@AC-R5-01",
     annotation: { type: "AC-R5-01" },
   }, async () => {
     let launched: ElectronApplication | undefined;
     try {
       await expect(
         launchEditor(fixturePath, {
           onPage: ({ application }) => {
             launched = application;
             throw new Error("onPage failed");
           },
         }),
       ).rejects.toThrow("onPage failed");
       await expect.poll(
         () => launched?.process().exitCode ?? null,
         { timeout: 5_000 },
       ).not.toBeNull();
     } finally {
       if (launched) {
         await launched.close().catch(() => undefined);
       }
     }
   });
   ```

   Why a missing path: the io-worker registers argv paths with
   `mustExist` true, so the open fails and `document.title` never changes.
   The 500 ms override keeps the test fast. The exit-code poll fails when
   the app is not closed. The test's own `finally` closes a leaked app so a
   red run does not leave a process behind.

## Red evidence
Run each mutation alone, paste the failing run, then restore the line.

1. Delete the whole `catch` block in `launchEditor` (keep the poll and the
   `onPage` call). Run
   `npx playwright test test/e2e/editor.spec.ts -g "failed argv open"`.
   The test must fail at the exit-code poll. This proves the close.
2. With the catch still deleted, run
   `npx playwright test test/e2e/editor.spec.ts -g "throwing page callback"`.
   The test must fail at the exit-code poll. This proves the callback path.
3. Restore the catch. Replace the whole poll block with nothing (return
   `{ application, page }` straight after `onPage`). Run the first test
   again. It must fail at `expect(failure).toBeInstanceOf(Error)` because
   the launch resolves. This proves the wait is what makes the failure
   visible.
4. Restore the poll. Change `toContain(path.basename(filePath))` to
   `toContain("__unexpected_title__")`. Run
   `npx playwright test test/e2e/binary-open.spec.ts`. AC-R12-01 must fail.
5. Restore the predicate. Delete the `options.onPage?.(...)` line. Run
   `npx playwright test test/e2e/preview.spec.ts -g "does not re-request"`.
   AC-R1-11 must fail. Restore the line.

## Checks
- `/opt/pipeline/locked-npm run typecheck` and
  `/opt/pipeline/locked-npm run test:unit` exit 0. Paste the summary lines.
- Run `/opt/pipeline/locked-npm run verify` on the committed tree. Do not
  wait more than 10 minutes for the lock. If it cannot start in that time,
  stop it and say so; the next review runs it.
- Probe on Linux:
  `npx playwright test test/e2e/binary-open.spec.ts test/e2e/editor.spec.ts --repeat-each 10`.
  All runs must pass. Paste the summary line.
- Probe the listener move:
  `npx playwright test test/e2e/preview.spec.ts --repeat-each 10`.
  All runs must pass.
- Push the commits. After the push, report the Windows job result for the
  new head and the `argv title wait: N ms` lines for the file launches. If
  CI has not finished, say so; the next review quotes it.
- Do not merge main into this branch by hand unless `git merge origin/main`
  conflicts; if it conflicts, stop and report the files.

## Done means
- `git diff --stat origin/main...HEAD` names only the three allowed test
  files (plus the commits).
- The two new tests pass. The 10,000 ms default is unchanged. The poll
  predicate is unchanged.
- All five red runs above are pasted in the report, in order, each with the
  restored green run.
- The locked verify and both 10-repeat probes are green.
- The Windows CI job on the pushed head is green, or the report states that
  it has not finished.
