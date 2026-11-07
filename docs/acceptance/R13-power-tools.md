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

### AC-R13-03 — The column editor inserts text at one column on every line
status: planned
Given a range of lines and a 1-based column
When the user inserts text or an increasing number at that column
Then the inserted value starts at the same column on every line in the range, a shorter line is padded with spaces up to that column, the numbers rise by the step, and the input is never changed

### AC-R13-04 — Word completion suggests words from the document
status: planned
Given a document and a cursor in a word
When the user has typed at least two word characters
Then the words elsewhere in the document that start with that prefix are suggested once each, case-insensitively, in document order, without the word at the cursor, and the input is never changed

### AC-R13-05 — User key bindings override the defaults safely
status: planned
Given the default key bindings and a user binding table read from settings
When the table binds, rebinds or unbinds chords, or holds invalid entries
Then valid entries replace the defaults in canonical chord form, invalid or duplicate entries and chords that can never fire on the platform are reported and ignored, and the inputs are never changed
