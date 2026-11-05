# Large log fixture

`generate-log.mjs` makes a deterministic plain-text log file. Run it with:

```
node test/fixtures/log/generate-log.mjs <path> [bytes]
```

The default size is `20971520` bytes (20 MB). The script writes whole log
lines until the size is at least `bytes`. The final size is never more than
`bytes` plus 4096 bytes.

The script refuses a missing path, a non-positive integer, a fractional or
text size, an extra argument, and an existing file. Each refusal names the
problem on stderr and exits with code 2. It never prints a stack trace.

The output is the same for the same `bytes` value on every run. The script
uses a fixed seed and a fixed start time. It reads no clock and no random
source from the environment. It writes LF line endings and ASCII characters
only.

Slice 7 calls the script with a temporary path for its 20 MB keystroke test.
No large log file is committed to the repository.
