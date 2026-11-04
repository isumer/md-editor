import { promises as fs } from "node:fs";

const [changelogPath, version, outputPath] = process.argv.slice(2);
if (!changelogPath || !version || !outputPath) {
  throw new Error("Usage: extract-release-notes <changelog> <version> <output>");
}
const changelog = await fs.readFile(changelogPath, "utf8");
const heading = `## [${version}]`;
const start = changelog.indexOf(heading);
if (start < 0) {
  throw new Error(`CHANGELOG.md has no ${heading} section`);
}
const contentStart = changelog.indexOf("\n", start) + 1;
const nextHeading = changelog.indexOf("\n## [", contentStart);
const notes = changelog.slice(contentStart, nextHeading < 0 ? undefined : nextHeading).trim();
await fs.writeFile(outputPath, `${notes}\n`, "utf8");
