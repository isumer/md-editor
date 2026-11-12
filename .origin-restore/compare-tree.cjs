const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "coverage-compare" } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8");
  return crypto.createHash("sha1").update(header).update(buffer).digest("hex");
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".origin-restore") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
}

(async () => {
  const tree = await getJson(
    "https://api.github.com/repos/isumer/solidmd/git/trees/main?recursive=1",
  );
  const remote = new Map();
  for (const item of tree.tree ?? []) {
    if (item.type === "blob") remote.set(item.path, item.sha);
  }
  const local = [];
  walk(root, local);
  const changed = [];
  const added = [];
  for (const full of local) {
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (!rel.startsWith("src/") && !rel.startsWith("test/") && !rel.startsWith("scripts/")) {
      continue;
    }
    const sha = blobSha(fs.readFileSync(full));
    if (!remote.has(rel)) added.push(rel);
    else if (remote.get(rel) !== sha) changed.push(rel);
  }
  console.log("CHANGED", changed.length);
  for (const file of changed) console.log("  M", file);
  console.log("ADDED", added.length);
  for (const file of added) console.log("  A", file);
})();
