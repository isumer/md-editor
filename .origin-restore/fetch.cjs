const https = require("https");
const fs = require("fs");
const path = require("path");

const base = "https://raw.githubusercontent.com/isumer/solidmd/main/";
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

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`${url} -> ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

(async () => {
  for (const file of files) {
    try {
      const body = await get(base + file);
      const target = path.join(__dirname, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
      console.log("ok", file, body.length);
    } catch (error) {
      console.log("fail", file, error.message);
    }
  }
})();
