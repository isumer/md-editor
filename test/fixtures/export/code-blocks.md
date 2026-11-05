# Export fixture: fenced code

## JavaScript

```js
export function greet(name) {
  const message = `Hello, ${name}!`;
  if (name.length < 1 || name.length > 40) {
    throw new Error("name must be 1-40 characters");
  }
  return message;
}
```

## Python

```python
def greet(name: str) -> str:
    """Return a greeting for *name*."""
    if not 1 <= len(name) <= 40:
        raise ValueError("name must be 1-40 characters")
    return f"Hello, {name}!"
```

## Bash

```bash
#!/usr/bin/env bash
set -euo pipefail

for file in "$@"; do
  printf 'greeting: %s\n' "${file##*/}"
done
```

## Characters that must be escaped

```js
const markup = "<b>not bold</b> & 'quoted'";
const comparison = 1 < 2 && 3 > 2;
const entity = "& stays as written in the source";
```

## A language the highlighter does not know

```notalanguage
plain <text> & more
```

## A block without a language

```
plain text, no language
```

The last paragraph, so the export has content after the code blocks.
