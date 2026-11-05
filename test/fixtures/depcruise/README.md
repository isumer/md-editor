# Dependency-cruiser fixtures

Each folder is a planted input. `.dependency-cruiser.cjs` defines the rules.
`test/unit/dependencyRules.test.ts` drives the check with `cruise`. The test
collects the name of each violated rule.

Paths below are relative to the repository root. Each import is exact. The
table states the required result.

The `feature-to-feature` fixture must report `no-feature-to-feature` exactly
once.

| Folder | What it proves | Rule that must fire | Source file | Violating import |
|---|---|---|---|---|
| `feature-to-feature` | A feature must not import another feature. | `no-feature-to-feature` | `test/fixtures/depcruise/feature-to-feature/src/renderer/features/alpha/source.ts` | `import { target } from "../beta/target";` |
| `core-to-view` | Renderer core must not import `@codemirror/view`. | `core-no-codemirror-view` | `test/fixtures/depcruise/core-to-view/src/renderer/core/source.ts` | `import { EditorView } from "@codemirror/view";` |
| `renderer-to-node` | Renderer code must not import a Node core module. | `renderer-no-node` | `test/fixtures/depcruise/renderer-to-node/src/renderer/platform/source.ts` | `import { readFile } from "node:fs";` |
| `shared-to-anything` | Shared code must not import any other source folder. | `shared-no-dependencies` | `test/fixtures/depcruise/shared-to-anything/src/shared/source.ts` | `import { target } from "../renderer/core/target";` |
| `main-document-io` | Main code must not import the document I/O module. | `main-no-document-io` | `test/fixtures/depcruise/main-document-io/src/main/source.ts` | `import { atomicWrite } from "../node-shared/atomicWrite";` |
| `cycle` | Two modules must not form an import cycle. | `no-circular` | `test/fixtures/depcruise/cycle/src/main/cycle/a.ts` and `test/fixtures/depcruise/cycle/src/main/cycle/b.ts` | `import { b } from "./b";` in `a.ts` and `import { a } from "./a";` in `b.ts` |
| `own-feature-folder` | Negative control: an own-folder import must stay legal. | `no-feature-to-feature` must not fire | `test/fixtures/depcruise/own-feature-folder/src/renderer/features/alpha/source.ts` | `import { helper } from "./helper";` |

The `cycle` row has a deliberate loop. `a.ts` imports `./b`, and `b.ts` imports
`./a`. Both files form the single cycle.

The `own-feature-folder` row is the negative control. It guards the
backreference in `no-feature-to-feature`. A broken group number would flag the
own-folder import.
