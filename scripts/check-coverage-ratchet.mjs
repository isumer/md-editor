import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const coverageMetrics = ["statements", "branches", "functions", "lines"];

export function checkCoverageRatchet(summary, baseline, tolerance = 0.1) {
  const rows = coverageMetrics.map((metric) => {
    const current = summary?.total?.[metric]?.pct;
    const expected = baseline?.[metric];
    if (typeof current !== "number" || typeof expected !== "number") {
      throw new Error(`Missing numeric ${metric} coverage in summary or baseline`);
    }
    const drop = expected - current;
    return {
      metric,
      baseline: expected,
      current,
      result: drop > tolerance + Number.EPSILON ? "regression" : "pass",
    };
  });

  return { rows, ok: rows.every((row) => row.result === "pass") };
}

export function formatCoverageReport(result) {
  return [
    "| Metric | Baseline | Current | Result |",
    "|---|---:|---:|---|",
    ...result.rows.map((row) =>
      `| ${row.metric} | ${row.baseline.toFixed(2)}% | ${row.current.toFixed(2)}% | ${row.result} |`,
    ),
  ].join("\n");
}

export async function runCoverageRatchet(repositoryRoot = process.cwd()) {
  const [summary, baseline] = await Promise.all([
    readFile(path.join(repositoryRoot, "coverage", "coverage-summary.json"), "utf8"),
    readFile(path.join(repositoryRoot, "coverage-baseline.json"), "utf8"),
  ]).then((files) => files.map(JSON.parse));
  const result = checkCoverageRatchet(summary, baseline);
  const markdown = formatCoverageReport(result);

  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\n## Unit coverage\n\n${markdown}\n`,
    );
  }
  if (!result.ok) {
    const regressions = result.rows
      .filter((row) => row.result === "regression")
      .map((row) => row.metric);
    console.error(`Coverage fell more than 0.1 points below baseline: ${regressions.join(", ")}`);
  }

  return result;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const result = await runCoverageRatchet();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
