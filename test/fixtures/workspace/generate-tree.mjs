#!/usr/bin/env node
// Deterministic workspace tree fixture generator. See README.md in this directory.

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_COUNT = 5000;
const BATCHES = ["", join("a", "b"), "c"];
const DECOY_FILES = ["hidden-1.md", "hidden-2.md", "hidden-3.md"];
const FILE_CONTENT =
  "# Workspace fixture file\n\nThis deterministic file exists for the workspace sidebar tests.\n";
const DECOY_CONTENT =
  "# Ignored fixture file\n\nThis file must not appear in the workspace tree.\n";

function fail(message) {
  console.error(message);
  process.exitCode = 2;
}

function isEmptyOrMissing(dir) {
  try {
    return readdirSync(dir).length === 0;
  } catch (error) {
    if (error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

function main() {
  const [rawDir, rawCount, ...rest] = process.argv.slice(2);
  if (rawDir === undefined || rest.length > 0) {
    fail("usage: node generate-tree.mjs <dir> [count]");
    return;
  }

  const rawNumber = rawCount ?? String(DEFAULT_COUNT);
  if (!/^[1-9][0-9]*$/.test(rawNumber)) {
    fail("count must be a positive integer");
    return;
  }
  const count = Number(rawNumber);

  const target = resolve(rawDir);
  if (!isEmptyOrMissing(target)) {
    fail("target directory must not exist or must be empty: " + target);
    return;
  }

  mkdirSync(target, { recursive: true });
  const batches = BATCHES.map((batch) => join(target, batch));
  for (const batch of batches) {
    mkdirSync(batch, { recursive: true });
  }

  for (let index = 0; index < count; index += 1) {
    const name = "file-" + String(index + 1).padStart(4, "0") + ".md";
    const batch = batches[index % batches.length];
    writeFileSync(join(batch, name), FILE_CONTENT, "utf8");
  }

  const ignored = join(target, "node_modules");
  mkdirSync(ignored, { recursive: true });
  for (const name of DECOY_FILES) {
    writeFileSync(join(ignored, name), DECOY_CONTENT, "utf8");
  }

  process.stdout.write(
    "wrote " +
      String(count) +
      " files to " +
      target +
      " (" +
      String(DECOY_FILES.length) +
      " node_modules decoys)\n",
  );
}

main();
