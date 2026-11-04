import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ALLOWED = new Set([
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "MPL-2.0",
  "0BSD", "CC0-1.0", "Unlicense", "LGPL-2.1+", "LGPL-3.0", "GPL-3.0",
  "Python-2.0", "BlueOak-1.0.0",
]);

function normalizeLicense(license) {
  const aliases = {
    "GPL-3.0-only": "GPL-3.0",
    "GPL-3.0-or-later": "GPL-3.0",
    "LGPL-2.1-or-later": "LGPL-2.1+",
    "LGPL-3.0-only": "LGPL-3.0",
    "LGPL-3.0-or-later": "LGPL-3.0",
    "PSF-2.0": "Python-2.0",
  };
  return aliases[license] ?? license;
}

function trimParentheses(value) {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")")) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

export function isAllowedLicenseExpression(expression) {
  if (typeof expression !== "string") {
    return false;
  }
  return trimParentheses(expression).split(/\s+OR\s+/iu)
    .map(trimParentheses)
    .some((branch) => ALLOWED.has(normalizeLicense(branch)));
}

export function assertAllowedLicenses(packages) {
  const rejected = packages.filter((dependency) =>
    !isAllowedLicenseExpression(dependency.license));
  if (rejected.length > 0) {
    const details = rejected.map((dependency) =>
      `${dependency.name}@${dependency.version}: ${String(dependency.license)}`);
    throw new Error(`GPL-incompatible production licences:\n${details.join("\n")}`);
  }
}

function dependencyPath(parentPath, dependencyName, packages) {
  let current = parentPath;
  while (true) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages[candidate]) {
      return candidate;
    }
    const nestedIndex = current.lastIndexOf("/node_modules/");
    if (nestedIndex < 0) {
      current = "";
    } else {
      current = current.slice(0, nestedIndex);
    }
    if (!current && !packages[`node_modules/${dependencyName}`]) {
      return null;
    }
  }
}

function productionPackagePaths(lock) {
  const packages = lock.packages;
  const root = packages[""];
  const pending = Object.keys(root.dependencies ?? {}).map((name) => ({ name, parent: "" }));
  const found = new Set();
  while (pending.length > 0) {
    const next = pending.pop();
    const packagePath = dependencyPath(next.parent, next.name, packages);
    if (!packagePath || found.has(packagePath)) {
      continue;
    }
    found.add(packagePath);
    const metadata = packages[packagePath];
    const dependencies = { ...metadata.dependencies, ...metadata.optionalDependencies };
    pending.push(...Object.keys(dependencies).map((name) => ({ name, parent: packagePath })));
  }
  return [...found].sort();
}

async function readLicenseText(repositoryRoot, packagePath) {
  const directory = path.join(repositoryRoot, packagePath);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const candidate = entries
    .filter((entry) => entry.isFile() &&
      /^(licen[cs]e|copying|copyright)([-._]|$)/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort()[0];
  if (!candidate) {
    throw new Error(`No licence text found for ${packagePath}`);
  }
  return fs.readFile(path.join(directory, candidate), "utf8");
}

async function collectDependencies(repositoryRoot) {
  const lockPath = path.join(repositoryRoot, "package-lock.json");
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  return Promise.all(productionPackagePaths(lock).map(async (packagePath) => {
    const metadata = lock.packages[packagePath];
    return {
      name: packagePath.slice(packagePath.lastIndexOf("node_modules/") + 13),
      version: metadata.version,
      license: metadata.license,
      text: (await readLicenseText(repositoryRoot, packagePath)).trim(),
    };
  }));
}

function renderNotices(packages) {
  const sections = packages.map((dependency) => [
    `Package: ${dependency.name}@${dependency.version}`,
    `License: ${dependency.license}`,
    "",
    dependency.text,
  ].join("\n"));
  return [
    "THIRD-PARTY SOFTWARE NOTICES",
    "",
    "This file is generated from the production dependency tree.",
    "",
    ...sections.flatMap((section) => [section, "", "---", ""]),
  ].join("\n");
}

async function run() {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const dependencies = await collectDependencies(repositoryRoot);
  assertAllowedLicenses(dependencies);
  if (!process.argv.includes("--check")) {
    await fs.mkdir(path.join(repositoryRoot, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(repositoryRoot, "dist/THIRD_PARTY_NOTICES.txt"),
      renderNotices(dependencies),
      "utf8",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
