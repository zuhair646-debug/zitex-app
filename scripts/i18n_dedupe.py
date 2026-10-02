"""
Deduplicate keys within each language block of i18n.tsx.
Keeps the FIRST occurrence (preserves hand-written translations over auto-fill).
"""
import re
import sys

I18N = "/app/frontend/src/i18n.tsx"
LANGS = ['ar', 'en', 'ur', 'fa', 'he', 'es', 'fr', 'de', 'it', 'pt',
         'ru', 'tr', 'zh', 'ja', 'ko', 'hi', 'bn', 'id', 'ms', 'th']


def find_block(content: str, lang: str):
    pattern = re.compile(rf"\n  {lang}:\s*\{{", re.MULTILINE)
    m = pattern.search(content)
    if not m:
        return None, None
    start = m.end() - 1
    depth = 0
    i = start
    while i < len(content):
        c = content[i]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return start + 1, i
        i += 1
    return None, None


def escape_single(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def dedupe_block(block: str) -> tuple[str, int]:
    pat = re.compile(r"'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'")
    seen: set[str] = set()
    pairs: list[tuple[str, str]] = []
    dupes = 0
    for m in pat.finditer(block):
        k = m.group(1).replace("\\'", "'")
        v = m.group(2).replace("\\'", "'")
        if '.' not in k or len(k) > 80:
            continue
        if k in seen:
            dupes += 1
            continue
        seen.add(k)
        pairs.append((k, v))
    # Rebuild as single pairs-per-line
    lines = [f"    '{escape_single(k)}': '{escape_single(v)}',  // dedup v2" for k, v in pairs]
    return "\n" + "\n".join(lines) + "\n  ", dupes


def main() -> int:
    with open(I18N, encoding="utf-8") as f:
        content = f.read()
    for lang in LANGS:
        s, e = find_block(content, lang)
        if s is None:
            print(f"[{lang}] missing")
            continue
        block = content[s:e]
        new_block, dupes = dedupe_block(block)
        if dupes == 0:
            continue
        content = content[:s] + new_block + content[e:]
        print(f"[{lang}] removed {dupes} duplicates")
    with open(I18N, "w", encoding="utf-8") as f:
        f.write(content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
