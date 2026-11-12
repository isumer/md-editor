const https = require("https");
const fs = require("fs");
const path = require("path");

const base = "https://raw.githubusercontent.com/isumer/solidmd/main/";
const files = [
  "package.json",
  "AGENTS.md",
  "src/renderer/tabs/documentCommands.ts",
  "test/unit/tabsDocumentCommands.test.ts",
  "test/unit/tabsDocumentLifecycleSave.test.ts",
  "src/main/app/menu.ts",
  "src/preload/preload.ts",
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
      console.log("ok", file, body.length, "same=", fs.readFileSync(path.join(__dirname, "..", file)).equals(body));
    } catch (error) {
      console.log("fail", file, error.message);
    }
  }
})();
