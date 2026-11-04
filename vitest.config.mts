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
        "src/shared/window.d.ts",
        // app.ts is UI wiring and is covered by e2e; e2e coverage merging arrives in slice 3.
        "src/renderer/app.ts",
      ],
      thresholds: {
        lines: 85,
        branches: 80,
        "src/main/atomicWrite.ts": { lines: 95, branches: 90 },
        "src/renderer/render.ts": { lines: 95, branches: 90 },
        "src/renderer/renderScheduler.ts": { lines: 95, branches: 90 },
        "src/renderer/sanitize.ts": { lines: 95, branches: 90 },
      },
    },
  },
});
