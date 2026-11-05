# Source fixtures

Two committed source files for the language tests: keyword, string and
comment tokens, comment toggling, and code folding. Line numbers are
1-based. Both files are ASCII with LF line endings and end with one LF.
`java.java` has 12 lines. `python.py` has 6 lines.

| File | Language | Toggle-comment marker | Keyword token | String token | Comment token | Fold block |
| --- | --- | --- | --- | --- | --- | --- |
| `java.java` | Java | `//` | `class` on line 2 | `"Hello, "` on line 7 | `// Builds a greeting for a person.` on line 1 | Method block, lines 6 to 11: line 6 is `public String greet(String name) {`; line 11 is `}` |
| `python.py` | Python | `#` | `def` on line 2 | `"Hello, "` on line 3 | `# Builds a greeting for a person.` on line 1 | Function block, lines 2 to 6: line 2 is `def greet(name):`; line 6 is `return greeting` |

Fold the method block, not the class block. In `java.java` the class block
starts on line 2 and closes on line 12.
