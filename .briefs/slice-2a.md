# Slice 2a — repository layout, test standards, CI

Repo: /home/hisumer/workspace/mdeditor. Read PLAN.md sections "Test
standards", "CI", "Repository layout" first — they are the spec.
No package changes, no npm install (no network). Do not touch PLAN.md,
package-lock.json, .git, src/**. The app name is still undecided:
use the existing `productName` "MD Editor" and refer to it in prose
as "MD Editor"; do not invent another name.

## Create / edit (nothing else)
- `AGENTS.md` — working rules for AI contributors, short and imperative:
  the stability rules (no sync fs/IPC on hot paths, worker for parsing,
  atomic writes, IPC handlers never throw), the response-time budget
  table (copy from PLAN.md), the test standards (copy the bullets), the
  verify command, scope discipline ("change only files the task names;
  no new dependencies"), comment rule (one or two lines, only the why).
- `CLAUDE.md` — one line: "Read AGENTS.md; it applies to Friday too."
- `README.md` — per PLAN "Repository layout": title, badges (CI status
  for ci.yml on isumer/md-editor, latest release, platforms Windows |
  macOS), one-paragraph description, a "Screenshot coming soon" note
  instead of an image, **Download** section with a table: Windows
  installer / Windows portable zip / macOS dmg / macOS zip, linking to
  the Releases page, and a one-line note on what portable means;
  Features (current state only: editor + live preview + atomic save —
  do not advertise unbuilt features; add a "Roadmap" list pointing to
  PLAN.md), Build from source (`npm ci`, `npm start`, `npm run verify`),
  Reporting bugs (issue templates), License ("License to be decided;
  all rights reserved for now").
- `CHANGELOG.md` — Keep a Changelog format; `## [Unreleased]` empty
  sections and `## [0.0.1] - 2026-11-04` describing slice 1 from a
  user's point of view (git log 88d324c has the facts).
- `SECURITY.md` — report privately via GitHub Security Advisories on the
  repo; security model in brief (sandboxed renderer, context isolation,
  sanitised preview, links never navigate the window, atomic saves).
- `.editorconfig` — utf-8, lf, 2-space indent for ts/js/json/yml/md,
  final newline, trim trailing whitespace except *.md.
- `.gitattributes` — `* text=auto eol=lf`; `test/fixtures/encodings/**
  -text`; `*.png *.ico *.icns binary`.
- `.github/ISSUE_TEMPLATE/bug_report.yml` (fields: version, OS + version,
  installer or portable, steps, expected, actual, file size if relevant,
  logs), `feature_request.yml`, `config.yml` (blank issues disabled).
- `.github/PULL_REQUEST_TEMPLATE.md` — what/why, failure modes covered
  and their tests, `npm run verify` passed, CHANGELOG updated.
- `.github/dependabot.yml` — npm and github-actions, weekly, one PR per
  dependency (no grouping), open-pull-requests-limit 5.
- `.github/workflows/ci.yml` — per PLAN "CI":
  - triggers: push (all branches), pull_request, workflow_dispatch,
    tags `v*`;
  - `permissions: contents: read`; concurrency group per ref with
    cancel-in-progress;
  - matrix os: ubuntu-latest, windows-latest; macos-latest included
    only when `github.ref_type == 'tag'` or the event is
    workflow_dispatch; `fail-fast: false`;
  - steps: checkout, setup-node (node-version-file `.nvmrc`, cache npm),
    `npm ci`, `npx electron --version` (prefetches the Electron binary,
    which npm 12 does not download at install), `npm run typecheck`,
    `npm run test:unit`, `npm run test:e2e`;
  - on failure upload `test-results/`, `playwright-report/` as an
    artifact named per OS; always write the JUnit summary to
    `$GITHUB_STEP_SUMMARY` (a tiny node script in scripts/ is fine);
  - pin actions by SHA with the version as a trailing comment:
    actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
    actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
- `.nvmrc` — `24`.
- `playwright.config.ts` — `retries: 0` always; `forbidOnly` in CI;
  reporters: list + junit (`test-results/junit.xml`) + html
  (`playwright-report`, open never); `trace: "retain-on-failure"`,
  `screenshot: "only-on-failure"`.
- `vitest.config.mts` — also write a JUnit report to
  `test-results/unit-junit.xml`.
- `scripts/**` — the summary script; keep `run-e2e.cjs` working on
  Windows (no xvfb there).
- Move `.briefs/*` to `docs/dev/briefs/` (use `git mv` is not possible in
  your sandbox — just move the files; Friday stages the rename).
- `docs/README.md` — index of docs (architecture = PLAN.md for now,
  dev/briefs).
- `examples/welcome.md` — a short sample showing headings, lists, a task
  list, a table, fenced code in two languages, a link and an image
  reference (no remote image).

## Done means
`npm run typecheck`, `npm run test:unit`, `npm run build` exit 0
(paste); every YAML file parses (`node -e` with a tiny parser is not
available — instead keep YAML simple and Friday validates it with
actionlint/yamllint); list every file created/changed/moved.
