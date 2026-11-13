import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildAcceptanceReport,
  parseCriterionFiles,
  parseJUnit,
  runAcceptanceCheck,
} from "../../scripts/check-acceptance.mjs";

const criteriaFixture = `# Fixture

### AC-R1-01 — First behavior
status: implemented
Given a fixture
When it runs
Then it passes

### AC-R1-02 — Future behavior
status: planned
Given a fixture
When it runs
Then it passes
`;

async function acceptanceRepository(e2e: string, perf: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "solidmd-acceptance-"));
  await mkdir(path.join(root, "docs", "acceptance"), { recursive: true });
  await mkdir(path.join(root, "reports"));
  await writeFile(
    path.join(root, "docs", "acceptance", "PERF.md"),
    "### AC-PERF-07 — Fast preview\nstatus: implemented\nGiven a large document\n",
  );
  await Promise.all([
    writeFile(path.join(root, "reports", "e2e-junit.xml"), e2e),
    writeFile(path.join(root, "reports", "unit-junit.xml"), "<testsuites />"),
    writeFile(path.join(root, "reports", "perf-e2e-junit.xml"), perf),
  ]);
  return root;
}

describe("acceptance report", () => {
  it("maps passing JUnit tests to criteria from Markdown fixtures", () => {
    const criteria = parseCriterionFiles([
      { path: "R01.md", content: criteriaFixture },
    ]);
    const tests = parseJUnit(`
      <testsuite>
        <testcase name="layout works">
          <properties><property name="tag" value="@AC-R1-01" /></properties>
        </testcase>
      </testsuite>
    `, "fixture.xml");

    const report = buildAcceptanceReport(criteria, tests);

    expect(report.ok).toBe(true);
    expect(report.markdown).toContain("| AC-R1-01 | implemented | layout works | pass |");
    expect(report.markdown).toContain("| AC-R1-02 | planned | — | planned |");
  });

  it("fails when an implemented criterion has no passing fixture test", () => {
    const criteria = parseCriterionFiles([
      { path: "R01.md", content: criteriaFixture.replace("status: planned", "status: implemented") },
    ]);
    const tests = parseJUnit(`
      <testcase name="layout fails @AC-R1-01"><failure message="no layout" /></testcase>
    `);

    const report = buildAcceptanceReport(criteria, tests);

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["AC-R1-01", "AC-R1-02"]);
  });

  it("does not require a criterion on a platform it does not apply to", () => {
    const criteria = parseCriterionFiles([{
      path: "R05.md",
      content: "### AC-R5-06 — Keeps mode\nstatus: implemented\nplatforms: linux, darwin\nGiven a file\n",
    }]);
    const tests = parseJUnit('<testcase name="AC-R5-06: keeps mode"><skipped /></testcase>');

    const onWindows = buildAcceptanceReport(criteria, tests, "win32");
    const onLinux = buildAcceptanceReport(criteria, tests, "linux");

    expect(onWindows.ok).toBe(true);
    expect(onWindows.markdown).toContain("| not applicable on win32 |");
    expect(onLinux.ok).toBe(false);
    expect(onLinux.missing).toEqual(["AC-R5-06"]);
  });

  it("fails when a fixture test references an unknown criterion", () => {
    const criteria = parseCriterionFiles([
      { path: "R01.md", content: criteriaFixture },
    ]);
    const tests = parseJUnit(
      '<testcase name="unknown tag" tags="@AC-R9-99" />',
      "unknown.xml",
    );

    const report = buildAcceptanceReport(criteria, tests);

    expect(report.ok).toBe(false);
    expect([...report.unknown.keys()]).toEqual(["AC-R9-99"]);
  });

  it("fails when an implemented perf criterion has no passing test", () => {
    const criteria = parseCriterionFiles([{
      path: "PERF.md",
      content: "### AC-PERF-02 — Fast keystrokes\nstatus: implemented\nGiven a file\n",
    }]);

    const report = buildAcceptanceReport(criteria, [], "linux");

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["AC-PERF-02"]);
  });

  it("reads passing performance tests from their split JUnit report", async () => {
    const root = await acceptanceRepository(
      "<testsuites />",
      '<testsuite><testcase name="fast preview @AC-PERF-07" /></testsuite>',
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const report = await runAcceptanceCheck(root);

      expect(report.ok).toBe(true);
      expect(report.markdown).toContain("| AC-PERF-07 | implemented | fast preview @AC-PERF-07 | pass |");
    } finally {
      log.mockRestore();
      error.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a current E2E failure when a split report has a stale pass", async () => {
    const root = await acceptanceRepository(
      '<testsuite><testcase name="fast preview @AC-PERF-07"><failure /></testcase></testsuite>',
      '<testsuite><testcase name="fast preview @AC-PERF-07" /></testsuite>',
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const report = await runAcceptanceCheck(root);

      expect(report.ok).toBe(false);
      expect(report.missing).toEqual(["AC-PERF-07"]);
    } finally {
      log.mockRestore();
      error.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

});
