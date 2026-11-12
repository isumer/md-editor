const fs = require("fs");
const path = require("path");

const files = [
  "src/renderer/features/preview/preview.ts",
  "src/renderer/features/preview/sanitize.ts",
  "src/renderer/features/preview/rewriteAssets.ts",
  "src/renderer/features/preview/wiring.ts",
  "src/renderer/features/registry.ts",
  "src/renderer/editor/featureWiring.ts",
  "src/renderer/main.ts",
  "src/renderer/styles.css",
  "src/renderer/tabs/renderController.ts",
  "src/renderer/workers/render/incremental.ts",
  "test/unit/preview.test.ts",
];

for (const file of files) {
  fs.copyFileSync(path.join(__dirname, file), path.join(__dirname, "..", file));
  console.log("restored", file);
}
