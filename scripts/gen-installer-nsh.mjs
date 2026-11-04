import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function expand(template, productName) {
  return template
    .replaceAll("{productName}", productName)
    .replaceAll("{productKey}", productName.replaceAll(/[^A-Za-z0-9]/g, ""));
}

function quoted(value) {
  return `"${value.replaceAll("$", "$$").replaceAll('"', '$\\"')}"`;
}

function installLines(entries, productName) {
  const executable = '"$INSTDIR\\${APP_EXECUTABLE_FILENAME}"';
  return entries.flatMap((entry) => {
    const key = expand(entry.key, productName);
    const label = expand(entry.label, productName);
    return [
      `  WriteRegStr HKCU ${quoted(key)} "" ${quoted(label)}`,
      `  WriteRegStr HKCU ${quoted(key)} "Icon" '${executable},0'`,
      `  WriteRegStr HKCU ${quoted(`${key}\\command`)} "" '${executable} "${entry.argument}"'`,
    ];
  });
}

export function generateInstallerNsh(table, packageMetadata) {
  if (!packageMetadata.productName || !Array.isArray(table.entries)) {
    throw new Error("Shell integration requires productName and an entries table");
  }
  const install = installLines(table.entries, packageMetadata.productName);
  const uninstall = [...table.entries].reverse().map((entry) =>
    `  DeleteRegKey HKCU ${quoted(expand(entry.key, packageMetadata.productName))}`);
  return [
    "!macro customInstall",
    ...install,
    "!macroend",
    "",
    "!macro customUnInstall",
    ...uninstall,
    "!macroend",
    "",
  ].join("\n");
}

async function run() {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const tablePath = path.join(repositoryRoot, "build/shell-integration.json");
  const packagePath = path.join(repositoryRoot, "package.json");
  const outputPath = path.join(repositoryRoot, "build/installer.nsh");
  const [tableText, packageText] = await Promise.all([
    fs.readFile(tablePath, "utf8"),
    fs.readFile(packagePath, "utf8"),
  ]);
  const generated = generateInstallerNsh(JSON.parse(tableText), JSON.parse(packageText));
  if (process.argv.includes("--check")) {
    const existing = await fs.readFile(outputPath, "utf8");
    if (existing !== generated) {
      throw new Error("build/installer.nsh is not up to date");
    }
    return;
  }
  await fs.writeFile(outputPath, generated, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
