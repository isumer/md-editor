export type CoverageMetric = "statements" | "branches" | "functions" | "lines";

export interface CoverageSummary {
  total?: Partial<Record<CoverageMetric, { pct?: number }>>;
}

export type CoverageBaseline = Partial<Record<CoverageMetric, number>>;

export interface CoverageRow {
  metric: CoverageMetric;
  baseline: number;
  current: number;
  result: "pass" | "regression";
}

export interface CoverageResult {
  rows: CoverageRow[];
  ok: boolean;
}

export const coverageMetrics: readonly CoverageMetric[];
export function checkCoverageRatchet(
  summary: CoverageSummary,
  baseline: CoverageBaseline,
  tolerance?: number,
): CoverageResult;
export function formatCoverageReport(result: CoverageResult): string;
