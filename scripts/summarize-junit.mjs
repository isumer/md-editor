import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

import { parseJUnit } from "./check-acceptance.mjs";

async function summarize(filePath) {
  try {
    const tests = parseJUnit(await readFile(filePath, "utf8"), path.basename(filePath));
    return {
      report: path.basename(filePath),
      passed: tests.filter((test) => test.passed).length,
      failed: tests.filter((test) => !test.passed).length,
      total: tests.length,
    };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { report: path.basename(filePath), passed: 0, failed: 0, total: 0 };
    }
    throw error;
  }
}

const reports = await Promise.all([
  summarize(path.join(process.cwd(), "reports", "unit-junit.xml")),
  summarize(path.join(process.cwd(), "reports", "e2e-junit.xml")),
]);
const markdown = [
  "## JUnit test summary",
  "",
  "| Report | Passed | Not passing | Total |",
  "|---|---:|---:|---:|",
  ...reports.map((report) =>
    `| ${report.report} | ${report.passed} | ${report.failed} | ${report.total} |`,
  ),
].join("\n");

console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${markdown}\n`);
}
