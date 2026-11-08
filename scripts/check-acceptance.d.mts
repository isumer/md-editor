export interface CriterionFile {
  path: string;
  content: string;
}

export interface AcceptanceCriterion {
  id: string;
  title: string;
  status: "planned" | "implemented";
  platforms: string[] | null;
  source: string;
}

export interface AcceptanceTest {
  name: string;
  ids: string[];
  passed: boolean;
  source: string;
}

export interface AcceptanceReport {
  markdown: string;
  missing: string[];
  unknown: Map<string, string[]>;
  ok: boolean;
}

export function parseCriterionFiles(
  files: readonly CriterionFile[],
): AcceptanceCriterion[];
export function parseJUnit(xml: string, source?: string): AcceptanceTest[];
export function buildAcceptanceReport(
  criteria: readonly AcceptanceCriterion[],
  tests: readonly AcceptanceTest[],
  platform?: string,
  skipPerf?: boolean,
): AcceptanceReport;
