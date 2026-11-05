# Languages

Highlighting is provided by `highlight.js/lib/common`, which registers the
36 languages below. The **id** is the exact argument to pass to
`hljs.highlight(text, { language: id })`; the extensions are the suffixes
that select that language. The first extension listed is the primary one and
is used by the fixture in `test/fixtures/languages/`.

| Language | id | extension(s) | example comment | example keyword |
|---|---|---|---|---|
| HTML, XML | `xml` | `.xml`, `.html`, `.xhtml`, `.svg`, `.xsl`, `.xsd` | `<!-- note -->` | `html` (in `<!DOCTYPE html>`) |
| Bash | `bash` | `.sh`, `.bash`, `.zsh` | `# note` | `if` |
| C | `c` | `.c` | `// note` | `return` |
| C++ | `cpp` | `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx` | `// note` | `return` |
| C# | `csharp` | `.cs` | `// note` | `class` |
| CSS | `css` | `.css` | `/* note */` | `@media` |
| Markdown | `markdown` | `.md`, `.markdown` | —† | `# Heading`† |
| Diff | `diff` | `.diff`, `.patch` | `--- a/file.txt` | `@@ -1 +1 @@`† |
| Ruby | `ruby` | `.rb`, `.gemspec`, `.rake` | `# note` | `def` |
| Go | `go` | `.go` | `// note` | `package` |
| GraphQL | `graphql` | `.graphql`, `.gql` | `# note` | `query` |
| TOML, also INI | `ini` | `.ini`, `.toml` | `; note` | `[section]`† |
| Java | `java` | `.java` | `// note` | `class` |
| JavaScript | `javascript` | `.js`, `.mjs`, `.cjs`, `.jsx` | `// note` | `const` |
| JSON | `json` | `.json`, `.jsonc`, `.json5` | `// note` | `true` |
| Kotlin | `kotlin` | `.kt`, `.kts` | `// note` | `val` |
| Less | `less` | `.less` | `// note` | `@media` |
| Lua | `lua` | `.lua` | `-- note` | `end` |
| Makefile | `makefile` | `.mk`, `.mak` (and `Makefile`) | `# note` | `.PHONY` |
| Perl | `perl` | `.pl`, `.pm` | `# note` | `my` |
| Objective-C | `objectivec` | `.m`, `.mm` | `// note` | `return` |
| PHP | `php` | `.php` | `// note` | `return` |
| PHP template | `php-template` | `.phtml` | `<!-- note -->` | `if` |
| Plain text | `plaintext` | `.txt`, `.text` | — | — |
| Python | `python` | `.py`, `.pyw` | `# note` | `def` |
| Python REPL | `python-repl` | `.repl`, `.pycon` | `# note` (after `>>>`) | `if` |
| R | `r` | `.r` | `# note` | `function` |
| Rust | `rust` | `.rs` | `// note` | `fn` |
| SCSS | `scss` | `.scss` | `// note` | `@page` |
| Shell Session | `shell` | `.sh-session`, `.console` | `# note` (after `$`) | `if` |
| SQL | `sql` | `.sql` | `-- note` | `SELECT` |
| Swift | `swift` | `.swift` | `// note` | `func` |
| YAML | `yaml` | `.yaml`, `.yml` | `# note` | `true`† |
| TypeScript | `typescript` | `.ts`, `.mts`, `.cts`, `.tsx` | `// note` | `const` |
| Visual Basic .NET | `vbnet` | `.vb` | `' note` | `Module` |
| WebAssembly | `wasm` | `.wat`, `.wast` | `;; note` | `module` |

† Where a format has no token of the named kind, the table gives its nearest
equivalent and the token highlight.js actually emits:

- **Markdown** has no tokenised comment: HTML comments are plain text to
  highlight.js. Its nearest keyword equivalent is a heading, which tokenises
  as `section`.
- **Diff** has no keywords; a hunk header tokenises as `meta`.
- **INI/TOML** has no keywords; a section header tokenises as `section`.
- **YAML** has no keywords; the reserved word `true` tokenises as `literal`.
- **Plain text** produces no tokens at all.

Two extensions avoid collisions: Shell Session is `.sh-session` (Bash owns
`.sh`), and PHP template is `.phtml` (PHP owns `.php`).
