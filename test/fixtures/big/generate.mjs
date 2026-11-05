#!/usr/bin/env node
// Deterministic Markdown fixture generator. See README.md in this directory.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SEED = 0x51c4f1e5;
const SLACK_BYTES = 1024;

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

const CODE_SNIPPETS = [
  "npm run build",
  "node:fs",
  "process.argv",
  "src/shared",
  "readFileSync",
  "renderChunk()",
  "block.diff",
  "content-visibility",
];

const CODE_LANGUAGES = ["js", "python", "bash", "json"];

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

function pickInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function phrase(random, count) {
  const words = [];
  for (let index = 0; index < count; index += 1) {
    words.push(pick(random, WORDS));
  }
  return words.join(" ");
}

function sentence(random) {
  const count = pickInt(random, 6, 12);
  const words = [];
  for (let index = 0; index < count; index += 1) {
    words.push(pick(random, WORDS));
  }
  words[0] = capitalise(words[0]);
  if (random() < 0.3) {
    const index = pickInt(random, 1, count - 1);
    words[index] = "`" + pick(random, CODE_SNIPPETS) + "`";
  }
  if (random() < 0.2) {
    const index = pickInt(random, 1, count - 1);
    words[index] =
      "[" + words[index] + "](https://example.com/docs/" + pick(random, WORDS) + ")";
  }
  return words.join(" ") + ".";
}

function paragraph(random) {
  const sentences = [];
  const count = pickInt(random, 2, 4);
  for (let index = 0; index < count; index += 1) {
    sentences.push(sentence(random));
  }
  return sentences.join(" ");
}

function title(random) {
  const count = pickInt(random, 2, 5);
  const words = [];
  for (let index = 0; index < count; index += 1) {
    words.push(capitalise(pick(random, WORDS)));
  }
  return words.join(" ");
}

function javascriptCode(random) {
  const name = pick(random, WORDS);
  const argument = pick(random, WORDS);
  return [
    "function " + name + "(" + argument + ") {",
    "  const result = " + argument + " + " + String(pickInt(random, 2, 99)) + ";",
    "  if (result > 10) {",
    "    return { ok: true, value: result };",
    "  }",
    '  return { ok: false, value: "empty" };',
    "}",
  ];
}

function pythonCode(random) {
  const name = pick(random, WORDS);
  return [
    "def " + name + "(items):",
    "    total = 0",
    "    for item in items:",
    "        total += len(item)",
    "    return total",
  ];
}

function bashCode(random) {
  const name = pick(random, WORDS);
  return [
    "set -euo pipefail",
    name + "() {",
    '  for file in "$@"; do',
    '    printf "%s\\n" "$file"',
    "  done",
    "}",
  ];
}

function jsonCode(random) {
  const first = pick(random, WORDS);
  const second = pick(random, WORDS);
  return [
    "{",
    '  "name": "' + first + '",',
    '  "count": ' + String(pickInt(random, 1, 500)) + ",",
    '  "enabled": true,',
    '  "tags": ["' + second + '", "' + pick(random, WORDS) + '"]',
    "}",
  ];
}

function codeBlock(random) {
  const language = pick(random, CODE_LANGUAGES);
  const builders = {
    js: javascriptCode,
    python: pythonCode,
    bash: bashCode,
    json: jsonCode,
  };
  return ["```" + language, ...builders[language](random), "```"].join("\n");
}

function tableBlock(random) {
  const statuses = ["done", "open", "review", "blocked"];
  const rows = [];
  const count = pickInt(random, 3, 5);
  for (let index = 0; index < count; index += 1) {
    rows.push(
      "| " +
        capitalise(pick(random, WORDS)) +
        " | " +
        capitalise(pick(random, WORDS)) +
        " | " +
        pick(random, statuses) +
        " |",
    );
  }
  return ["| Item | Owner | Status |", "| --- | --- | --- |", ...rows].join("\n");
}

function listBlock(random) {
  const ordered = random() < 0.4;
  const indent = ordered ? "   " : "  ";
  const lines = [];
  const count = pickInt(random, 3, 5);
  for (let index = 0; index < count; index += 1) {
    const marker = ordered ? String(index + 1) + "." : "-";
    lines.push(marker + " " + phrase(random, pickInt(random, 3, 6)));
    const nested = pickInt(random, 0, 2);
    for (let child = 0; child < nested; child += 1) {
      lines.push(indent + "- " + phrase(random, pickInt(random, 3, 5)));
    }
  }
  return lines.join("\n");
}

function quoteBlock(random) {
  const lines = [];
  const count = pickInt(random, 2, 3);
  for (let index = 0; index < count; index += 1) {
    lines.push("> " + sentence(random));
  }
  lines.push(">");
  const items = pickInt(random, 1, 2);
  for (let index = 0; index < items; index += 1) {
    lines.push("> - " + phrase(random, pickInt(random, 3, 6)));
  }
  return lines.join("\n");
}

function taskBlock(random) {
  const lines = [];
  const count = pickInt(random, 3, 6);
  for (let index = 0; index < count; index += 1) {
    const checked = random() < 0.4 ? "x" : " ";
    lines.push("- [" + checked + "] " + phrase(random, pickInt(random, 3, 7)));
  }
  return lines.join("\n");
}

function inlineBlock(random) {
  const link =
    "[" +
    capitalise(pick(random, WORDS)) +
    "](https://example.com/docs/" +
    pick(random, WORDS) +
    ")";
  const code = "`" + pick(random, CODE_SNIPPETS) + "`";
  const first =
    capitalise(phrase(random, 5)) + " points at " + link + " and uses " + code + ".";
  const second = sentence(random);
  return first + " " + second;
}

const BLOCK_KINDS = [
  "heading",
  "paragraph",
  "code",
  "table",
  "list",
  "quote",
  "tasks",
  "inline",
];

function makeBlock(random, kind, headingLevel) {
  switch (kind) {
    case "heading":
      return "#".repeat(headingLevel) + " " + title(random);
    case "paragraph":
      return paragraph(random);
    case "code":
      return codeBlock(random);
    case "table":
      return tableBlock(random);
    case "list":
      return listBlock(random);
    case "quote":
      return quoteBlock(random);
    case "tasks":
      return taskBlock(random);
    case "inline":
      return inlineBlock(random);
    default:
      return paragraph(random);
  }
}

function generate(targetBytes) {
  const random = createRandom(SEED);
  const parts = [];
  let size = 0;
  let blockIndex = 0;
  let headingLevel = 1;

  for (;;) {
    const kind = BLOCK_KINDS[blockIndex % BLOCK_KINDS.length];
    const chunk = makeBlock(random, kind, headingLevel) + "\n\n";
    if (size + chunk.length > targetBytes + SLACK_BYTES) {
      break;
    }
    parts.push(chunk);
    size += chunk.length;
    blockIndex += 1;
    if (kind === "heading") {
      headingLevel = (headingLevel % 6) + 1;
    }
  }

  return parts.join("");
}

function main() {
  const [rawBytes, rawPath] = process.argv.slice(2);
  if (!/^[1-9][0-9]*$/.test(rawBytes ?? "") || rawPath === undefined) {
    console.error("usage: node test/fixtures/big/generate.mjs <bytes> <path>");
    process.exitCode = 2;
    return;
  }

  const content = generate(Number(rawBytes));
  const outputPath = resolve(rawPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf8");
  process.stdout.write(
    "wrote " + String(Buffer.byteLength(content, "utf8")) + " bytes to " + outputPath + "\n",
  );
}

main();
