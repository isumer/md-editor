# Electron fuse fixture

`secure-v1.json` is an Electron fuse wire. It has version 1, for a packaged
app. `scripts/check-fuses.mjs` reads the wire and compares each fuse index with
its expected value.

Value 48 means disabled. Value 49 means enabled.

| Index | Option name | Expected value | State |
|---|---|---|---|
| 0 | `RunAsNode` | 48 | disabled |
| 1 | `EnableCookieEncryption` | 49 | enabled |
| 2 | `EnableNodeOptionsEnvironmentVariable` | 48 | disabled |
| 3 | `EnableNodeCliInspectArguments` | 48 | disabled |
| 4 | `EnableEmbeddedAsarIntegrityValidation` | 49 | enabled |
| 5 | `OnlyLoadAppFromAsar` | 49 | enabled |

`checkFuses` first requires fuse wire version 1. It then throws on the first
index that does not match the table.

`test/unit/checkFuses.test.ts` drives the check. The test accepts this wire. It
rejects the wire when index 0, `RunAsNode`, is 49. The error names `RunAsNode`.
