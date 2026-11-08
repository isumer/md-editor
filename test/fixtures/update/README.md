# Update check fixtures

These files are static test data for the update checks in slice 14. Every
file is committed ASCII with LF line endings and one final newline. The
files need no network access and hold no clock or random value. The update
policy module reads the JSON files through `parseReleaseFeed` and the
checksum file through `parseChecksum`.

| File | Contains | Expected result |
| --- | --- | --- |
| `feed-ok.json` | An accepted release object: tag `v1.4.2`, HTTPS release URL, multi-line body. | Accepted; version `v1.4.2`, URL `https://github.com/isumer/md-editor/releases/tag/v1.4.2`, body as stored. |
| `feed-prerelease.json` | The same keys with tag `v1.4.2-beta.1` and a one-line body. | Accepted; version `v1.4.2-beta.1`. |
| `feed-extra-key.json` | The accepted object plus `draft`. | Rejected: an extra key. |
| `feed-missing-body.json` | `tag_name` and `html_url` only. | Rejected: a missing key. |
| `feed-bad-url.json` | `html_url` is `http://example.invalid/notes`. | Rejected: the URL does not start with `https://`. |
| `feed-bad-version.json` | `tag_name` is `1.4`. | Rejected: the tag has two numeric parts. |
| `feed-array.json` | An array that holds one copy of the accepted object. | Rejected: the value is an array. |
| `checksums.sha256` | Two lines: one `sha256:` line and one bare line. | Lines 1 and 2 are accepted; both return the same 64 digits in lower case. |

A checksum with 63 digits, a wrong algorithm and a non-string are
rejected, and no file for those exists on purpose. A complete manifest
line with a trailing file name is also rejected: `parseChecksum` takes
the digest alone.
