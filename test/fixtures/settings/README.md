# Settings fixtures

Deterministic, committed settings documents for slice 12's settings tests:
settings survive restart, a corrupt file loads defaults, unknown keys are
preserved, and version-0 documents migrate. Every file is committed, plain
ASCII with LF and no BOM; no clock or randomness, so tests assert these exact
bytes instead of building settings inline. The v0 to v1 migration renames
`editor.tabWidth` to `editor.tabSize` and back, so an older build reading a
version-1 document stays readable and loses no value.

| File | Contains | A settings test must assert |
| --- | --- | --- |
| `complete.json` | Valid version 1 with every exercised key. | Every value loads exactly (`system`, `14`, `true`, `true`, `2`, `utf-8`, `lf`, `["node_modules", ".git"]`) and save round-trips the same shape. |
| `partial.json` | Only `theme`: `dark`. | All other settings take their defaults, not `undefined`. |
| `unknown-keys.json` | Valid version 1 plus `futureOption` (object) and `futureFlag` (boolean). | Both unknown keys survive load then save unchanged. |
| `corrupt-truncated.json` | Object cut off mid-member at `tru`. | Parsing fails; the loader returns defaults, not an exception. |
| `corrupt-array.json` | Parseable JSON array where an object is required. | Validation rejects the array and the loader returns defaults. |
| `empty.json` | Zero bytes. | The loader returns defaults without throwing. |
| `version-old.json` | Version 0 with `editor.tabWidth`: `2`. | Migration renames it to `editor.tabSize` preserving `2`; reverse migration keeps version 1 readable. |
