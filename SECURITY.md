# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/isumer/md-editor/security/advisories/new). Do not open a public issue for a suspected vulnerability.

Include the affected version, operating system, reproduction steps, impact, and any suggested mitigation. You will receive an acknowledgement through the advisory.

## Security model

MD Editor runs its renderer in a sandbox with context isolation enabled. The live preview is sanitised before insertion into the document. Preview links never navigate the application window; supported external links are validated and opened through the system browser. Saves are atomic so a failed or interrupted write leaves the previous file intact.
