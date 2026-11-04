import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    reporters: ["default", ["junit", { outputFile: "reports/unit-junit.xml" }]],
    restoreMocks: true,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        // This declaration file contains types only, so it has no runtime coverage.
        "src/renderer/platform/window.d.ts",
        // UI wiring moved from app.ts: DOM and CodeMirror view setup, covered by e2e.
        // core/ is pure logic and is never excluded (docs/architecture.md §3).
        "src/renderer/main.ts",
        "src/renderer/editor/editor.ts",
        "src/renderer/features/preview/preview.ts",
        "src/renderer/platform/api.ts",
      ],
      // Floors are measured on Linux only: POSIX-only branches (symlinks, file
      // modes) are skipped elsewhere, so other platforms would under-report.
      thresholds: process.platform !== "linux" ? undefined : {
        lines: 85,
        branches: 80,
        "src/node-shared/atomicWrite.ts": { lines: 95, branches: 90 },
        "src/renderer/workers/render/render.ts": { lines: 95, branches: 90 },
        "src/renderer/features/preview/renderScheduler.ts": { lines: 95, branches: 90 },
        "src/renderer/features/preview/sanitize.ts": { lines: 95, branches: 90 },
        "src/renderer/core/**/*.ts": { lines: 95, branches: 90 },
      },
    },
  },
});
