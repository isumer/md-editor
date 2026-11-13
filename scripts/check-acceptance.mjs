import { appendFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// An optional "platforms:" line scopes a criterion to the OSes where it can hold (e.g. POSIX file modes).
const criterionPattern = /^### (AC-(?:R\d+|SEC|PERF)-\d{2}) — (.+)\nstatus: (planned|implemented)(?:\nplatforms: ([a-z0-9, ]+))?$/gm;
const criterionIdPattern = /@?(AC-(?:R\d+|SEC|PERF)-\d{2})\b/g;

function decodeXml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributeValue(attributes, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match ? decodeXml(match[1]) : "unnamed test";
}

export function parseCriterionFiles(files) {
  const criteria = [];
  const seen = new Set();

  for (const file of files) {
    for (const match of file.content.matchAll(criterionPattern)) {
      const [, id, title, status, platformList] = match;
      if (seen.has(id)) {
        throw new Error(`Duplicate acceptance criterion ${id}`);
      }
      seen.add(id);
      const platforms = platformList ? platformList.split(",").map((name) => name.trim()) : null;
      criteria.push({ id, title, status, platforms, source: file.path });
    }
  }

  return criteria.sort((left, right) => left.id.localeCompare(right.id, undefined, {
    numeric: true,
  }));
}

export function parseJUnit(xml, source = "JUnit") {
  const tests = [];
  const testCasePattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;

  for (const match of xml.matchAll(testCasePattern)) {
    const [rawTestCase, attributes] = match;
    const ids = [...new Set(
      [...rawTestCase.matchAll(criterionIdPattern)].map((idMatch) => idMatch[1]),
    )];
    tests.push({
      name: attributeValue(attributes, "name"),
      ids,
      passed: !/<(?:failure|error|skipped)\b/.test(rawTestCase),
      source,
    });
  }

  return tests;
}

function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildAcceptanceReport(
  criteria,
  tests,
  platform = process.platform,
) {
  const knownIds = new Set(criteria.map((criterion) => criterion.id));
  const unknown = new Map();

  for (const test of tests) {
    for (const id of test.ids) {
      if (!knownIds.has(id)) {
        const references = unknown.get(id) ?? [];
        references.push(`${test.name} (${test.source})`);
        unknown.set(id, references);
      }
    }
  }

  const rows = criteria.map((criterion) => {
    const matchingTests = tests.filter((test) => test.ids.includes(criterion.id));
    const passingTests = matchingTests.filter((test) => test.passed);
    const applies = criterion.platforms === null || criterion.platforms.includes(platform);
    const required = criterion.status === "implemented" && applies;
    const result = !applies
      ? `not applicable on ${platform}`
      : required
      ? passingTests.length > 0 ? "pass" : "missing"
      : passingTests.length > 0 ? "planned (tested)" : "planned";
    const testNames = matchingTests.length > 0
      ? matchingTests.map((test) => `${test.name}${test.passed ? "" : " (not passing)"}`).join("<br>")
      : "—";
    return { ...criterion, result, testNames };
  });

  const lines = [
    "| Criterion | Status | Tests | Result |",
    "|---|---|---|---|",
    ...rows.map((row) =>
      `| ${row.id} | ${row.status} | ${escapeCell(row.testNames)} | ${row.result} |`,
    ),
  ];
  const missing = rows.filter((row) => row.result === "missing").map((row) => row.id);

  return {
    markdown: lines.join("\n"),
    missing,
    unknown,
    ok: missing.length === 0 && unknown.size === 0,
  };
}

async function readJUnitFile(filePath) {
  try {
    return parseJUnit(await readFile(filePath, "utf8"), path.basename(filePath));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function runAcceptanceCheck(repositoryRoot = process.cwd()) {
  const acceptanceDirectory = path.join(repositoryRoot, "docs", "acceptance");
  const names = (await readdir(acceptanceDirectory))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const criterionFiles = await Promise.all(names.map(async (name) => ({
    path: name,
    content: await readFile(path.join(acceptanceDirectory, name), "utf8"),
  })));
  const criteria = parseCriterionFiles(criterionFiles);
  const junitPaths = [
    path.join(repositoryRoot, "reports", "e2e-junit.xml"),
    path.join(repositoryRoot, "reports", "perf-e2e-junit.xml"),
    path.join(repositoryRoot, "reports", "unit-junit.xml"),
  ];
  const [e2eTests, perfTests, unitTests] = await Promise.all(junitPaths.map(readJUnitFile));
  const e2eNames = new Set(e2eTests.map((test) => test.name));
  const splitPerfTests = perfTests.filter((test) => !e2eNames.has(test.name));
  const tests = [...e2eTests, ...splitPerfTests, ...unitTests];
  const report = buildAcceptanceReport(criteria, tests, process.platform);

  console.log(report.markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `\n## Acceptance criteria\n\n${report.markdown}\n`,
    );
  }
  if (report.missing.length > 0) {
    console.error(`Implemented criteria without a passing test: ${report.missing.join(", ")}`);
  }
  for (const [id, references] of report.unknown) {
    console.error(`Unknown acceptance criterion ${id}: ${references.join(", ")}`);
  }

  return report;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const report = await runAcceptanceCheck();
  if (!report.ok) {
    process.exitCode = 1;
  }
}
