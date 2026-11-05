# API reference

## `nextPass(options)`

Returns the next visible pass for a ground station.

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `lat` | `number` | — | Latitude in degrees |
| `lon` | `number` | — | Longitude in degrees |
| `days` | `number` | `7` | Search horizon |
| `format` | `"json" \| "csv"` | `"json"` | Output encoding |

### Example

```ts
const pass = await nextPass({ lat: 52.52, lon: 13.405, days: 3 });

console.log(pass.startsAt.toISOString());
```

### Errors

- `E_RANGE` — the coordinates are outside the valid range
- `E_NETWORK` — the TLE source could not be reached
  - Retry after 30 seconds
  - Check the proxy settings

<details>
<summary>Legacy callback form</summary>

```js
nextPass({ lat: 1, lon: 2 }, (error, pass) => {
  if (error) throw error;
  console.log(pass);
});
```

</details>

> Deprecated: the callback form will be removed in 2.0.

Keyboard: press <kbd>Ctrl</kbd> + <kbd>K</kbd> to open search.
