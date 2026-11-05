# Orbit CLI

[![CI](https://img.shields.io/badge/ci-passing-brightgreen)](https://example.com/ci)
[![coverage](https://img.shields.io/badge/coverage-94%25-blue)](https://example.com/coverage)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Orbit is a small command-line tool that prints the next visible satellite
pass for a location.

## Install

| Platform | Command | Notes |
| --- | --- | --- |
| Linux | `./install.sh` | Needs glibc 2.31+ |
| macOS | `brew install orbit` | Apple silicon supported |
| Windows | `winget install orbit` | Preview channel |

## Usage

```js
import { nextPass } from "orbit-cli";

const pass = await nextPass({ lat: 52.52, lon: 13.405 });
console.log(pass.startsAt);
```

```python
from orbit import next_pass

result = next_pass(lat=52.52, lon=13.405)
print(result["starts_at"])
```

```rust
use orbit::next_pass;

fn main() {
    let pass = next_pass(52.52, 13.405).unwrap();
    println!("{}", pass.starts_at);
}
```

```bash
orbit --lat 52.52 --lon 13.405 --days 7 --format json
```

> Orbit caches predictions for 15 minutes. Use `--no-cache` when scripting.

See [the manual](https://example.com/docs) or run `orbit --help`.

- Fast: no network call for cached locations
- Offline: bundled TLE snapshot
- Scriptable: JSON and CSV output

MIT licensed.
