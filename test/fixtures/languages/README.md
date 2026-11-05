# Language fixtures

`docs/languages.md` is the source of truth for these 36 languages, their
highlight.js ids, and their extensions. Each fixture is named
`<id>.<primary extension>`.

The first extension in each `docs/languages.md` row is the primary one. It
selects the fixture, and the fixture file name uses it.

Each row below gives the example comment and keyword from that table. It
also names the token class that highlight.js emits for the text. Five rows
follow a footnote in `docs/languages.md` and give a different result.

| File | Language id | Primary extension | Expected highlight result |
| --- | --- | --- | --- |
| `xml.xml` | `xml` | `.xml` | `<!-- note -->` gives `comment`; `html` in `<!DOCTYPE html>` gives `keyword` |
| `bash.sh` | `bash` | `.sh` | `# note` gives `comment`; `if` gives `keyword` |
| `c.c` | `c` | `.c` | `// note` gives `comment`; `return` gives `keyword` |
| `cpp.cpp` | `cpp` | `.cpp` | `// note` gives `comment`; `return` gives `keyword` |
| `csharp.cs` | `csharp` | `.cs` | `// note` gives `comment`; `class` gives `keyword` |
| `css.css` | `css` | `.css` | `/* note */` gives `comment`; `@media` gives `keyword` |
| `markdown.md` | `markdown` | `.md` | No tokenised comment: HTML comments stay plain text. `# Heading` gives `section` |
| `diff.diff` | `diff` | `.diff` | `--- a/file.txt` gives `comment`; `@@ -1 +1 @@` gives `meta` |
| `ruby.rb` | `ruby` | `.rb` | `# note` gives `comment`; `def` gives `keyword` |
| `go.go` | `go` | `.go` | `// note` gives `comment`; `package` gives `keyword` |
| `graphql.graphql` | `graphql` | `.graphql` | `# note` gives `comment`; `query` gives `keyword` |
| `ini.ini` | `ini` | `.ini` | `; note` gives `comment`; `[section]` gives `section` |
| `java.java` | `java` | `.java` | `// note` gives `comment`; `class` gives `keyword` |
| `javascript.js` | `javascript` | `.js` | `// note` gives `comment`; `const` gives `keyword` |
| `json.json` | `json` | `.json` | `// note` gives `comment`; `true` gives `keyword` |
| `kotlin.kt` | `kotlin` | `.kt` | `// note` gives `comment`; `val` gives `keyword` |
| `less.less` | `less` | `.less` | `// note` gives `comment`; `@media` gives `keyword` |
| `lua.lua` | `lua` | `.lua` | `-- note` gives `comment`; `end` gives `keyword` |
| `makefile.mk` | `makefile` | `.mk` | `# note` gives `comment`; `.PHONY` gives `keyword` |
| `perl.pl` | `perl` | `.pl` | `# note` gives `comment`; `my` gives `keyword` |
| `objectivec.m` | `objectivec` | `.m` | `// note` gives `comment`; `return` gives `keyword` |
| `php.php` | `php` | `.php` | `// note` gives `comment`; `return` gives `keyword` |
| `php-template.phtml` | `php-template` | `.phtml` | `<!-- note -->` gives `comment`; `if` gives `keyword` |
| `plaintext.txt` | `plaintext` | `.txt` | No tokens at all |
| `python.py` | `python` | `.py` | `# note` gives `comment`; `def` gives `keyword` |
| `python-repl.repl` | `python-repl` | `.repl` | `# note` after `>>>` gives `comment`; `if` gives `keyword` |
| `r.r` | `r` | `.r` | `# note` gives `comment`; `function` gives `keyword` |
| `rust.rs` | `rust` | `.rs` | `// note` gives `comment`; `fn` gives `keyword` |
| `scss.scss` | `scss` | `.scss` | `// note` gives `comment`; `@page` gives `keyword` |
| `shell.sh-session` | `shell` | `.sh-session` | `# note` after `$` gives `comment`; `if` gives `keyword` |
| `sql.sql` | `sql` | `.sql` | `-- note` gives `comment`; `SELECT` gives `keyword` |
| `swift.swift` | `swift` | `.swift` | `// note` gives `comment`; `func` gives `keyword` |
| `yaml.yaml` | `yaml` | `.yaml` | `# note` gives `comment`; `true` gives `literal` |
| `typescript.ts` | `typescript` | `.ts` | `// note` gives `comment`; `const` gives `keyword` |
| `vbnet.vb` | `vbnet` | `.vb` | `' note` gives `comment`; `Module` gives `keyword` |
| `wasm.wat` | `wasm` | `.wat` | `;; note` gives `comment`; `module` gives `keyword` |

No test drives these fixtures yet. Slice 7 will highlight each one through
the editor.
