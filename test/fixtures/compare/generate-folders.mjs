#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const USAGE =
  "Usage: node test/fixtures/compare/generate-folders.mjs <target-dir> <file-count>";
const SEED = 0x5eed10;
const FILES_PER_DIR = 10;

const WORDS = [
  "amber",
  "birch",
  "cedar",
  "delta",
  "ember",
  "fable",
  "garnet",
  "harbor",
  "indigo",
  "juniper",
  "kelp",
  "lantern",
  "meadow",
  "nickel",
  "onyx",
  "pepper",
  "quartz",
  "river",
  "silver",
  "timber",
  "umber",
  "violet",
  "willow",
  "yarrow",
  "zephyr",
];

function failUsage(message) {
  process.stderr.write(`${message}\n${USAGE}\n`);
  process.exitCode = 1;
}

// Mulberry32: small, fixed-output PRNG so every run writes the same bytes.
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function relativePath(index) {
  const directory = String(Math.floor((index - 1) / FILES_PER_DIR) + 1).padStart(3, "0");
  const name = String(index).padStart(6, "0");
  return `dir-${directory}/file-${name}.txt`;
}

function linesFor(random, index) {
  const lineCount = 3 + Math.floor(random() * 4);
  const lines = [];
  for (let line = 1; line <= lineCount; line += 1) {
    const wordCount = 4 + Math.floor(random() * 5);
    const words = [];
    for (let word = 0; word < wordCount; word += 1) {
      words.push(WORDS[Math.floor(random() * WORDS.length)]);
    }
    lines.push(`file ${index} line ${line}: ${words.join(" ")}`);
  }
  return lines;
}

function writeText(root, side, relative, lines) {
  const absolute = join(root, side, relative);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    failUsage("Expected exactly two arguments.");
    return;
  }

  const [targetArg, countArg] = args;
  if (!/^[0-9]+$/.test(countArg)) {
    failUsage("The file count must be a positive integer.");
    return;
  }

  const fileCount = Number(countArg);
  if (!Number.isSafeInteger(fileCount) || fileCount < 1) {
    failUsage("The file count must be a positive integer.");
    return;
  }

  const target = resolve(targetArg);
  if (existsSync(target)) {
    const notEmpty = !statSync(target).isDirectory() || readdirSync(target).length > 0;
    if (notEmpty) {
      process.stderr.write(`Refusing to write: ${target} exists and is not empty.\n`);
      process.exitCode = 2;
      return;
    }
  } else {
    mkdirSync(target, { recursive: true });
  }

  const random = createRandom(SEED);
  let differingPaths = 0;

  for (let index = 1; index <= fileCount; index += 1) {
    const relative = relativePath(index);
    const lines = linesFor(random, index);
    writeText(target, "left", relative, lines);
    if (index % 7 === 0) {
      writeText(target, "right", relative, [...lines.slice(0, -1), `${lines.at(-1)} changed`]);
      differingPaths += 1;
    } else {
      writeText(target, "right", relative, lines);
    }
  }

  writeText(target, "left", "left-only.txt", [
    "Left only.",
    "This path has no right counterpart.",
  ]);
  writeText(target, "right", "right-only.txt", [
    "Right only.",
    "This path has no left counterpart.",
  ]);
  differingPaths += 2;

  process.stdout.write(`left files: ${fileCount + 1}\n`);
  process.stdout.write(`right files: ${fileCount + 1}\n`);
  process.stdout.write(`differing paths: ${differingPaths}\n`);
}

main();
