# Architecture decision records

Each record: context, options considered, decision, consequences, and what
would make us reverse it. Status is `proposed`, `accepted` or
`superseded by NNNN`. Numbers are never reused.

| # | Decision | Status |
|---|---|---|
| [0001](0001-electron.md) | Electron as the shell | accepted |
| [0002](0002-codemirror.md) | CodeMirror 6 as the editor | accepted |
| [0003](0003-ui-framework.md) | SolidJS for UI chrome | proposed |
| [0004](0004-utility-process-for-io.md) | Heavy I/O in a utility process, main stays a router | proposed |
| [0005](0005-command-registry.md) | Every action is a registered command | proposed |
| [0006](0006-document-model.md) | Document owns the text; tabs and views point at it | proposed |
| [0007](0007-ipc-contracts.md) | Typed, validated IPC contracts in `shared/ipc` | proposed |
