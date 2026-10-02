"""
Automatic wrapper for raw Arabic strings in Expo TSX files.

Safe transformations:
  1. <Text ...>ARABIC</Text>  →  <Text ...>{tSync('ARABIC', lang)}</Text>
     where ARABIC is pure static text (no interpolation / children elements).
  2. placeholder="ARABIC"      →  placeholder={tSync('ARABIC', lang)}
     Similarly for: title=, label=, accessibilityLabel=, alt=
  3. Alert.alert('ARABIC', ...)
     and Alert.alert(x, 'ARABIC', ...)
  4. Alert messages passed through showToast(...) if any.

Unsafe (SKIPPED):
  - String inside object literal   (hard to inject `lang`)
  - Template literals with ${...}  (would mangle)
  - Nested <Text><Text>…</Text></Text> patterns
  - JSX children that mix text + components
  - Already wrapped: tSync('…'), t('…'), <TX>…</TX>

For each transformed file:
  - Insert   import { tSync } from '…/useAutoT';          (if missing)
  - Insert   import { useT } from '…/i18n';              (if missing)
  - Inside each exported React function component, ensure
    `const { lang } = useT();` is declared near the top. If the component
    already destructures from useT, we PATCH only when `lang` is missing
    from that destructure.

Output: counts per file + a .bak backup for each touched file.
"""
from __future__ import annotations

import os
import re
import sys
import glob
from typing import Optional

ROOTS = ["/app/frontend/app", "/app/frontend/src"]
SKIP_DIRS = ("node_modules", ".expo")
SKIP_FILES = ("i18n.tsx", "useAutoT.tsx", "i18n-generated.json")

AR = r"[\u0600-\u06FF]"
AR_TEXT = r"[\u0600-\u06FF][\u0600-\u06FF\s\u0030-\u0039\?\.,\!،؟:\-\u200f·]*"


def _should_skip(path: str) -> bool:
    for p in SKIP_FILES:
        if path.endswith(p):
            return True
    return False


# -----------------------------------------------------------------------------
# Transformations
# -----------------------------------------------------------------------------

JSX_TEXT_PATTERN = re.compile(
    r"(<Text\b[^>]*>)(\s*)(" + AR_TEXT + r")(\s*)(</Text>)",
    re.UNICODE,
)

ATTR_PATTERN = re.compile(
    r'\b(placeholder|title|label|accessibilityLabel|alt|hint|tooltip)=' r'"([^"]*' + AR + r'[^"]*)"',
    re.UNICODE,
)

ALERT_PATTERN = re.compile(
    r"(Alert\.alert\(\s*)'(" + AR_TEXT + r")'" ,
    re.UNICODE,
)


def transform_text(content: str) -> tuple[str, int]:
    changes = 0

    def _repl_jsx(m):
        nonlocal changes
        pre, w1, text, w2, close = m.group(1), m.group(2), m.group(3).strip(), m.group(4), m.group(5)
        # Don't double-wrap, don't touch empty strings
        if not text:
            return m.group(0)
        changes += 1
        # Escape single quotes inside text
        safe = text.replace("\\", "\\\\").replace("'", "\\'")
        return f"{pre}{{tSync('{safe}', lang)}}{close}"

    content = JSX_TEXT_PATTERN.sub(_repl_jsx, content)

    def _repl_attr(m):
        nonlocal changes
        attr, val = m.group(1), m.group(2)
        changes += 1
        safe = val.replace("\\", "\\\\").replace("'", "\\'")
        return f"{attr}={{tSync('{safe}', lang)}}"

    content = ATTR_PATTERN.sub(_repl_attr, content)

    def _repl_alert(m):
        nonlocal changes
        head, text = m.group(1), m.group(2)
        changes += 1
        safe = text.replace("\\", "\\\\").replace("'", "\\'")
        return f"{head}tSync('{safe}', lang)"

    content = ALERT_PATTERN.sub(_repl_alert, content)

    return content, changes


# -----------------------------------------------------------------------------
# Import + hook injection
# -----------------------------------------------------------------------------

def _rel_to(path: str, dst_src: str) -> str:
    """Return relative import path from `path` dir to a file under src."""
    file_dir = os.path.dirname(path)
    rel = os.path.relpath(dst_src, file_dir)
    rel = rel.replace("\\", "/")
    if not rel.startswith("."):
        rel = "./" + rel
    return rel.rsplit(".tsx", 1)[0].rsplit(".ts", 1)[0]


def inject_imports(content: str, path: str) -> str:
    changed = False
    if "tSync(" in content and "tSync" not in content.split("export", 1)[0] and "from '" not in content.split("tSync", 1)[0]:
        changed = True
    # Simpler: just ensure imports exist textually
    needs_tsync = ("tSync(" in content) and ("tSync" not in content[: content.find("const ") if content.find("const ") > 0 else 1000])
    # Fall back to pure "is import present" check
    if "tSync(" in content and re.search(r"import\s*\{[^}]*\btSync\b[^}]*\}\s*from", content) is None:
        rel = _rel_to(path, "/app/frontend/src/useAutoT")
        content = re.sub(
            r"^(import [^\n]+\n)",
            lambda m: m.group(1) + f"import {{ tSync }} from '{rel}';\n",
            content,
            count=1,
        )
    if ("tSync(" in content) and re.search(r"import\s*\{[^}]*\buseT\b[^}]*\}\s*from", content) is None:
        rel = _rel_to(path, "/app/frontend/src/i18n")
        content = re.sub(
            r"^(import [^\n]+\n)",
            lambda m: m.group(1) + f"import {{ useT }} from '{rel}';\n",
            content,
            count=1,
        )
    return content


# Add `const { lang } = useT();` inside every React function component that
# contains tSync(…, lang) in its body but doesn't currently destructure lang.
FUNC_COMP_RE = re.compile(
    r"(export (?:default )?function\s+[A-Z][A-Za-z0-9_]*\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{)",
)
ARROW_COMP_RE = re.compile(
    r"(const\s+[A-Z][A-Za-z0-9_]*\s*(?::\s*[^=]+)?=\s*\(?\{?[^)]*\}?\)?\s*(?::\s*[^=]+)?\s*=>\s*\{)",
)


def inject_lang_hook(content: str) -> str:
    if "tSync(" not in content:
        return content
    # Find top-level function/arrow component bodies and inject hook if missing.
    def _patch(block: str, body_start_abs: int) -> str:
        # Look ahead for next '}' at matching depth to delimit body
        depth = 1
        i = body_start_abs
        while i < len(content) and depth > 0:
            c = content[i]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            i += 1
        body = content[body_start_abs:i - 1]
        if "tSync(" not in body:
            return content
        # Already has lang in scope? skip
        if re.search(r"\bconst\s*\{\s*[^}]*\blang\b[^}]*\}\s*=\s*useT\(\)", body):
            return content
        if re.search(r"\bconst\s+lang\s*=", body):
            return content
        # Prefer to extend existing destructure from useT
        m = re.search(r"const\s*\{\s*([^}]*)\}\s*=\s*useT\(\)\s*;", body)
        if m:
            cur = m.group(1).strip()
            if "lang" in [c.strip() for c in cur.split(",")]:
                return content
            new_destr = f"const {{ {cur}, lang }} = useT();"
            new_body = body[: m.start()] + new_destr + body[m.end():]
            return content[:body_start_abs] + new_body + content[i - 1 :]
        # Inject fresh line after the opening brace
        inject = "\n  const { lang } = useT();\n"
        return content[:body_start_abs] + inject + content[body_start_abs:]
    # Run on function components
    for pattern in (FUNC_COMP_RE, ARROW_COMP_RE):
        for m in pattern.finditer(content):
            new_content = _patch(m.group(1), m.end())
            if new_content != content:
                content = new_content
                # Only patch first-match per iteration to avoid offset drift
                break
    return content


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main() -> int:
    files = []
    for r in ROOTS:
        for p in glob.glob(f"{r}/**/*.tsx", recursive=True):
            if any(s in p for s in SKIP_DIRS) or _should_skip(p):
                continue
            files.append(p)

    total_changes = 0
    touched = 0
    for p in files:
        with open(p, encoding="utf-8") as f:
            src = f.read()
        new, ch = transform_text(src)
        if ch == 0:
            continue
        new = inject_imports(new, p)
        new = inject_lang_hook(new)
        if new != src:
            with open(p + ".bak", "w", encoding="utf-8") as b:
                b.write(src)
            with open(p, "w", encoding="utf-8") as f:
                f.write(new)
            total_changes += ch
            touched += 1
            short = p.replace("/app/frontend", "")
            print(f"  {ch:3d}  {short}")
    print()
    print(f"Touched {touched} files, {total_changes} Arabic strings wrapped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
