#!/usr/bin/env node
// Deterministic large log fixture generator. See README.md in this directory.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_BYTES = 20_971_520;
const MAX_SLACK_BYTES = 4096;
const SEED = 0x2545f491;
const BASE_TIME_MS = 1_767_225_600_000; // 2026-01-01T00:00:00.000Z
const TIME_STEP_MS = 7;

const MODULES = ["auth", "cache", "config", "db", "http", "index", "queue", "render", "save", "worker"];
const EVENTS = ["start", "stop", "retry", "flush", "load", "store", "parse", "write", "read", "timeout"];
const KEYS = ["user", "file", "bytes", "ms", "tab", "attempt", "id", "chunk"];
const VALUES = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];

function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

function makeLine(random, lineIndex) {
  const timestamp = new Date(BASE_TIME_MS + lineIndex * TIME_STEP_MS).toISOString();
  const moduleName = pick(random, MODULES);
  const eventName = pick(random, EVENTS);
  const key = pick(random, KEYS);
  const value = random() < 0.5 ? pick(random, VALUES) : String(1 + Math.floor(random() * 1000));
  return timestamp + " INFO " + moduleName + " " + eventName + " " + key + "=" + value + "\n";
}

function generate(targetBytes) {
  const random = createRandom(SEED);
  const parts = [];
  let size = 0;
  let lineIndex = 0;

  while (size < targetBytes) {
    const line = makeLine(random, lineIndex);
    parts.push(line);
    size += Buffer.byteLength(line, "ascii");
    lineIndex += 1;
  }

  if (size > targetBytes + MAX_SLACK_BYTES) {
    throw new Error("generated size exceeds the allowed slack");
  }

  return parts.join("");
}

function fail(message) {
  console.error("generate-log: " + message);
  process.exitCode = 2;
}

function parseBytes(rawBytes) {
  if (rawBytes === undefined) {
    return DEFAULT_BYTES;
  }
  if (!/^[0-9]+$/.test(rawBytes)) {
    return undefined;
  }
  const value = Number(rawBytes);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) {
    fail("usage: node generate-log.mjs <path> [bytes]");
    return;
  }

  const [rawPath, rawBytes] = args;
  const bytes = parseBytes(rawBytes);
  if (bytes === undefined) {
    fail("bytes must be a positive integer");
    return;
  }

  const outputPath = resolve(rawPath);
  if (existsSync(outputPath)) {
    fail("refusing to overwrite existing path: " + outputPath);
    return;
  }

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    const content = generate(bytes);
    writeFileSync(outputPath, content, { encoding: "ascii", flag: "wx" });
    const size = Buffer.byteLength(content, "ascii");
    process.stdout.write("wrote " + String(size) + " bytes to " + outputPath + "\n");
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
