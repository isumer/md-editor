# R13 — The Notepad++ toolset

### AC-R13-01 — The outline lists every heading with its level and line
status: planned
Given a Markdown document
When the editor builds its outline
Then it lists every ATX and setext heading in source order with a level from 1 to 6 and a 1-based line number, keeps the heading text without the leading markers or a closing hash run, and ignores `#` lines inside a fenced code block

### AC-R13-02 — Line operations sort and remove lines exactly
status: planned
Given a list of lines
When the user sorts them, removes duplicates, removes consecutive duplicates, removes empty lines or trims trailing white space
Then the result is exact and deterministic: sorting is stable in code-unit order (ascending, descending, or ignoring case), removing duplicates keeps the first copy in place, and the input is never changed
