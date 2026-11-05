# Conflict-style fixtures

These fixtures test conflict-marker parsing for slice 11. All files are plain
ASCII with LF endings. Line numbers are 1-based. Each style file has exactly
two conflicts.

## Inputs

`left.txt` and `right.txt` each change two regions of `base.txt`. The changed
lines are base lines 6 and 29. Lines 7 to 28 are unchanged, so the regions
are separate.

| Line | Base | Left | Right |
|---|---|---|---|
| 6 | The build runs on the shared runner. | The build runs on the release runner. | The build runs on the nightly runner. |
| 29 | The support rota is published monthly. | The support rota is published weekly. | The support rota is published daily. |

`git merge-file` produced `merge.txt`, `diff3.txt` and `zdiff3.txt` from these
inputs. The command exited with code 2, which is the conflict count.

## `merge.txt`

Marker form: `<<<<<<< left` then `=======` then `>>>>>>> right`. This style
has no base section.

Conflict count: 2.

Markers and line numbers:

- line 6: `<<<<<<< left`
- line 8: `=======`
- line 10: `>>>>>>> right`
- line 33: `<<<<<<< left`
- line 35: `=======`
- line 37: `>>>>>>> right`

Conflict 1:

```
Left:  The build runs on the release runner.
Base:  The build runs on the shared runner.
Right: The build runs on the nightly runner.
```

Conflict 2:

```
Left:  The support rota is published weekly.
Base:  The support rota is published monthly.
Right: The support rota is published daily.
```

## `diff3.txt`

Marker form: `<<<<<<< left`, `||||||| base`, `=======`, `>>>>>>> right`.

Conflict count: 2.

Markers and line numbers:

- line 6: `<<<<<<< left`
- line 8: `||||||| base`
- line 10: `=======`
- line 12: `>>>>>>> right`
- line 35: `<<<<<<< left`
- line 37: `||||||| base`
- line 39: `=======`
- line 41: `>>>>>>> right`

Conflict 1:

```
Left:  The build runs on the release runner.
Base:  The build runs on the shared runner.
Right: The build runs on the nightly runner.
```

Conflict 2:

```
Left:  The support rota is published weekly.
Base:  The support rota is published monthly.
Right: The support rota is published daily.
```

## `zdiff3.txt`

Marker form: `<<<<<<< left`, `||||||| base`, `=======`, `>>>>>>> right`.
This file matches `diff3.txt`, because the conflicts share no common lines.

Conflict count: 2.

Markers and line numbers:

- line 6: `<<<<<<< left`
- line 8: `||||||| base`
- line 10: `=======`
- line 12: `>>>>>>> right`
- line 35: `<<<<<<< left`
- line 37: `||||||| base`
- line 39: `=======`
- line 41: `>>>>>>> right`

Conflict 1:

```
Left:  The build runs on the release runner.
Base:  The build runs on the shared runner.
Right: The build runs on the nightly runner.
```

Conflict 2:

```
Left:  The support rota is published weekly.
Base:  The support rota is published monthly.
Right: The support rota is published daily.
```
