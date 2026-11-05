# Large Markdown fixtures

Deterministic Markdown documents for slice 4's preview latency, scroll-budget, and chunked-reparse tests. `large-50kb.md` and `large-500kb.md` are committed outputs of `node test/fixtures/big/generate.mjs 51200 <path>` and `node test/fixtures/big/generate.mjs 512000 <path>`, so regenerate them with those commands and review the diff. Slice 4 generates the 20 MB document at test time with `node test/fixtures/big/generate.mjs 20971520 <tmp-path>` (written as explicit LF, from a fixed seed), so it is never committed.
