import os

os.chdir("/work/test/fixtures/stability")

# 1. deep-nesting.md - 200 nested blockquote levels, then one paragraph
with open("deep-nesting.md", "w") as f:
    f.write("> " * 200 + "paragraph\n")

# 2. long-paragraph.md - 20,000 ASCII words on one line
with open("long-paragraph.md", "w") as f:
    words = ["word"] * 20000
    f.write(" ".join(words) + "\n")

# 3. many-links.md - 100 distinct definitions + 1,000 reference-link uses
defs = []
for i in range(100):
    ref = f"ref{i}"
    url = f"https://example.com/{ref}"
    title = f"Title {ref}"
    defs.append(f"[{ref}]: {url} \"{title}\"")

uses = []
for i in range(1000):
    uses.append(f"[text][ref0]")

with open("many-links.md", "w") as f:
    f.write("\n".join(defs) + "\n\n" + "\n".join(uses))

# 4. unclosed-fence.md - opening fenced code block with no closing fence, 50 lines of text
with open("unclosed-fence.md", "w") as f:
    f.write("```\n")
    for i in range(50):
        f.write(f"This is line {i+1}\n")
    # No closing fence

# 5. html-heavy.md - 200 inline <span> elements + one <script>alert(1)</script>
spans = []
for i in range(200):
    spans.append(f"<span>span{i}</span>")
with open("html-heavy.md", "w") as f:
    f.write("".join(spans) + "<script>alert(1)</script>")

print("All fixtures generated successfully")

# Verify counts
with open("deep-nesting.md") as f:
    content = f.read()
    g_count = content.count("> ")
    print(f"deep-nesting: > pairs = {g_count}")

with open("long-paragraph.md") as f:
    content = f.read()
    word_count = len(content.split())
    print(f"long-paragraph: words = {word_count}")

with open("many-links.md") as f:
    content = f.read()
    def_count = sum(1 for line in content.split("\n") if line.startswith("[") and "]: " in line)
    use_count = sum(1 for line in content.split("\n") if line.startswith("[text]"))
    print(f"many-links: definitions = {def_count}, uses = {use_count}")

with open("unclosed-fence.md") as f:
    content = f.read()
    fence_count = content.count("```")
    print(f"unclosed-fence: fence count = {fence_count} (should be 1 opening only)")

with open("html-heavy.md") as f:
    content = f.read()
    span_count = content.count("<span")
    script_count = content.count("<script")
    print(f"html-heavy: <span count = {span_count}, <script count = {script_count}")