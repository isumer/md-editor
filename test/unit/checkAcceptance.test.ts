import * as fs from "node:fs/promises";
import os from "node:os";
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

  it("reads passing performance tests once from split and merged CI reports", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-acceptance-"));
    const previousSummary = process.env.GITHUB_STEP_SUMMARY;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await fs.mkdir(path.join(root, "docs", "acceptance"), { recursive: true });
      await fs.mkdir(path.join(root, "reports"));
      await fs.writeFile(
        path.join(root, "docs", "acceptance", "PERF.md"),
        "### AC-PERF-02 — Fast keystrokes\nstatus: implemented\nGiven a file\n",
      );
      await fs.writeFile(
        path.join(root, "reports", "perf-e2e-junit.xml"),
        '<testsuite><testcase name="AC-PERF-02: fast keystrokes" /></testsuite>',
      );
      await fs.writeFile(
        path.join(root, "reports", "e2e-junit.xml"),
        '<testsuite><testcase name="AC-PERF-02: fast keystrokes" /></testsuite>',
      );
      delete process.env.GITHUB_STEP_SUMMARY;

      const report = await runAcceptanceCheck(root);

      expect(report.ok).toBe(true);
      expect(report.missing).toEqual([]);
      expect(report.markdown.match(/AC-PERF-02: fast keystrokes/g)).toHaveLength(1);
    } finally {
      if (previousSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = previousSummary;
      log.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("reads a performance test that lives only in the split performance report", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "solidmd-acceptance-"));
    const previousSummary = process.env.GITHUB_STEP_SUMMARY;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await fs.mkdir(path.join(root, "docs", "acceptance"), { recursive: true });
      await fs.mkdir(path.join(root, "reports"));
      await fs.writeFile(
        path.join(root, "docs", "acceptance", "PERF.md"),
        "### AC-PERF-02 — Fast keystrokes\nstatus: implemented\nGiven a file\n",
      );
      await fs.writeFile(
        path.join(root, "reports", "perf-e2e-junit.xml"),
        '<testsuite><testcase name="AC-PERF-02: fast keystrokes" /></testsuite>',
      );
      delete process.env.GITHUB_STEP_SUMMARY;

      const report = await runAcceptanceCheck(root);

      expect(report.ok).toBe(true);
      expect(report.missing).toEqual([]);
    } finally {
      if (previousSummary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = previousSummary;
      log.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
