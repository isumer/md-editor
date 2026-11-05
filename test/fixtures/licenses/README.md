# Licence policy fixtures

Each file holds JSON with two arrays: `allowed` and `rejected`.
`test/unit/thirdPartyNotices.test.ts` drives the check. It reads the files and
calls `isAllowedLicenseExpression` and `assertAllowedLicenses` from
`scripts/third-party-notices.mjs`.

`isAllowedLicenseExpression` splits an expression on ` OR `. It trims
parentheses and normalizes licence aliases. It accepts the expression when any
branch is allowed. It does not parse ` AND `.

| File | Contents | Expected result |
|---|---|---|
| `compatible.json` | `allowed` has 15 licence names. `rejected` is empty. | `isAllowedLicenseExpression` accepts every entry in `allowed`. |
| `incompatible.json` | `allowed` is empty. `rejected` has `SSPL-1.0`. | `assertAllowedLicenses` throws for that entry, and the error message names `SSPL-1.0`. |
| `or-expressions.json` | `allowed` has three OR expressions. `rejected` has two expressions. | Every `allowed` OR expression is accepted when one branch is allowed. The `MIT AND SSPL-1.0` entry is rejected. |

`or-expressions.json` shows the exact cases. `SSPL-1.0 OR MIT`,
`(Apache-2.0 OR Proprietary)`, and `GPL-3.0-only OR BUSL-1.1` are accepted.
`SSPL-1.0 OR BUSL-1.1` and `MIT AND SSPL-1.0` are rejected.
