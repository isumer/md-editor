#!/usr/bin/env node
// Deterministic plain-text fixture generator. See README.md in this directory.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SEED = 0x9e3779b9;
const DUPLICATE_PERIOD = 10;
const DUPLICATE_OFFSET = 5;
const INDEX_DIGITS = 6;

const WORDS = [
  "adaptive", "annotation", "archive", "async", "batch", "buffer", "cache",
  "chunk", "client", "column", "command", "component", "config", "content",
  "cursor", "database", "default", "document", "draft", "editor", "engine",
  "event", "export", "feature", "file", "filter", "format", "frame", "graph",
  "handler", "heading", "history", "index", "inline", "input", "layout",
  "library", "markdown", "memory", "message", "module", "network", "offset",
  "option", "outline", "output", "panel", "paragraph", "parser", "payload",
  "preview", "process", "project", "queue", "render", "request", "result",
  "sample", "schema", "scroll", "section", "server", "session", "setting",
  "sidebar", "source", "stream", "style", "syntax", "table", "target",
  "template", "theme", "thread", "token", "toolbar", "update", "value",
  "viewport", "widget", "window", "worker", "workspace",
];

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

function makeLine(random, lineNumber) {
  const wordCount = 1 + Math.floor(random() * 10);
  const words = [];
  for (let index = 0; index < wordCount; index += 1) {
    words.push(WORDS[Math.floor(random() * WORDS.length)]);
  }
  return "line-" + String(lineNumber).padStart(INDEX_DIGITS, "0") + " | " + words.join(" ");
}

function generate(lineCount) {
  const random = createRandom(SEED);
  const lines = [];
  for (let index = 0; index < lineCount; index += 1) {
    const lineNumber = index + 1;
    if (lineNumber % DUPLICATE_PERIOD === 0) {
      // Every tenth line repeats the line five above it, so dedupe has a fixed result.
      lines.push(lines[index - DUPLICATE_OFFSET]);
    } else {
      lines.push(makeLine(random, lineNumber));
    }
  }
  return lines.join("\n") + "\n";
}

function main() {
  const [rawLines, rawPath] = process.argv.slice(2);
  if (!/^[1-9][0-9]*$/.test(rawLines ?? "") || rawPath === undefined) {
    console.error("usage: node test/fixtures/powertools/generate.mjs <lines> <path>");
    process.exitCode = 2;
    return;
  }

  const lineCount = Number(rawLines);
  const content = generate(lineCount);
  const outputPath = resolve(rawPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf8");
  process.stdout.write("wrote " + String(lineCount) + " lines to " + outputPath + "\n");
}

main();
