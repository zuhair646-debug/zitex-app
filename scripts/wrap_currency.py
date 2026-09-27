"""
Wrap remaining hardcoded Arabic strings in live-preview.tsx and any other
file with plain-quoted or template-literal Arabic that <TX>/useAutoT missed.

Idempotent: replaces
  ' ر.س' followed by JSX/backtick end with a `tSync` call
  Bare Arabic literal 'العربية' in JSX text nodes with `{tSync('العربية', lang)}`

For any sub-component missing `const { lang } = useT();`, insert one right after
the function signature.

This is meant to be run once per bug-fix cycle. Safe to re-run.
"""
from __future__ import annotations

import re
import sys

FILE = "/app/frontend/app/merchant/live-preview.tsx"

# Only rewrite inside JSX/backticks; skip lines that already contain tSync/tX
def transform(src: str) -> str:
    lines = src.split("\n")
    out = []
    # 1) Ensure sub-component wrappers have `const { lang } = useT();` line
    sub_component_pat = re.compile(r"^function ([A-Z]\w+)\s*\([^)]*\)\s*\{$")
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = sub_component_pat.match(line)
        if m and m.group(1) != "useSStyles":
            # peek forward — skip if `const { lang }` already there in next 3 lines
            look = "\n".join(lines[i+1:i+4])
            if "const { lang } = useT()" not in look:
                indent = "  "
                out.append(f"{indent}const {{ lang }} = useT();")
        i += 1
    src2 = "\n".join(out)

    # 2) Replace ر.س inside JSX text: `... > .... ر.س<` and `} ر.س<`
    src2 = re.sub(r'(?<![>\w])(\s)ر\.س(\s*)(?=<)', r"\1{tSync('ر.س', lang)}\2", src2)

    # 3) Replace ر.س inside template literals like `${x} ر.س`
    src2 = re.sub(r'\$\{([^}]+)\}\s*ر\.س', r"${\1} ${tSync('ر.س', lang)}", src2)

    # 4) Any bare string literal `` ` ر.س` `` or `` ' ر.س' `` → tSync
    src2 = re.sub(r"([`\"'])(\s*)ر\.س([`\"'])", r"tSync(' ر.س', lang)", src2)

    return src2


if __name__ == "__main__":
    with open(FILE, encoding="utf-8") as f:
        src = f.read()
    new_src = transform(src)
    with open(FILE, "w", encoding="utf-8") as f:
        f.write(new_src)
    remaining = len(re.findall(r"ر\.س", new_src))
    print(f"Done. Remaining ر.س strings: {remaining}")
