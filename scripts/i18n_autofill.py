"""
Auto-populate missing keys in i18n.tsx T dictionary.

Strategy:
  1. Parse i18n.tsx to extract each lang block (ar, en, fr, …).
  2. Use EN as the complete key set (source of truth).
  3. For each OTHER lang, find missing keys and translate ENGLISH values
     via /api/translate/bulk.
  4. Append the newly-translated entries to each lang block, before its
     closing brace.
  5. For Hebrew (he), which has no block, inject a new block.
  6. Normalize numeric placeholders like {n} and {name} — these must be
     preserved verbatim, so we substitute them with sentinels before the
     LLM call and restore afterwards.
"""
import re
import os
import sys
import json
import time
import requests

I18N = "/app/frontend/src/i18n.tsx"
BACKEND = "http://localhost:8001"
LANGS_ALL = ['ar', 'en', 'ur', 'fa', 'he', 'es', 'fr', 'de', 'it', 'pt',
             'ru', 'tr', 'zh', 'ja', 'ko', 'hi', 'bn', 'id', 'ms', 'th']
LANG_FULL_NAMES = {
    'ar': 'Arabic', 'en': 'English', 'ur': 'Urdu', 'fa': 'Persian',
    'he': 'Hebrew', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
    'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'tr': 'Turkish',
    'zh': 'Chinese (Simplified)', 'ja': 'Japanese', 'ko': 'Korean',
    'hi': 'Hindi', 'bn': 'Bengali', 'id': 'Indonesian', 'ms': 'Malay',
    'th': 'Thai',
}


def find_block(content: str, lang: str):
    """Return (start_idx_after_open_brace, end_idx_at_close_brace, inner_text).

    If lang doesn't exist, returns (None, None, None)."""
    pattern = re.compile(rf"\n  {lang}:\s*\{{", re.MULTILINE)
    m = pattern.search(content)
    if not m:
        return None, None, None
    # Walk balanced braces from m.end()-1
    start = m.end() - 1  # position of opening '{'
    depth = 0
    i = start
    while i < len(content):
        c = content[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return start + 1, i, content[start + 1:i]
        i += 1
    return None, None, None


def extract_pairs(block: str) -> dict[str, str]:
    """Extract 'key': 'value' or 'key': "value" pairs from a block."""
    out: dict[str, str] = {}
    # key is always single-quoted. value may be single or double quoted.
    pat = re.compile(
        r"'((?:[^'\\]|\\.)*)'\s*:\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")"
    )
    for m in pat.finditer(block):
        key = m.group(1).replace("\\'", "'")
        val = (m.group(2) if m.group(2) is not None else m.group(3)) or ""
        val = val.replace("\\'", "'").replace('\\"', '"')
        if '.' in key and len(key) <= 80:  # looks like dotted key
            out[key] = val
    return out


def mask_placeholders(s: str) -> tuple[str, dict[str, str]]:
    """Replace {n}, {name}, {price}, … with sentinels so LLM doesn't translate them."""
    mapping: dict[str, str] = {}
    def repl(m):
        tag = f"XZX{len(mapping)}XZX"
        mapping[tag] = m.group(0)
        return tag
    s2 = re.sub(r"\{[a-zA-Z_][\w]*\}", repl, s)
    return s2, mapping


def unmask_placeholders(s: str, mapping: dict[str, str]) -> str:
    for tag, orig in mapping.items():
        s = s.replace(tag, orig)
    return s


def bulk_translate(texts: list[str], target: str, source: str = 'en') -> dict[str, str]:
    r = requests.post(
        f"{BACKEND}/api/translate/bulk",
        json={"texts": texts, "target_lang": target, "source_lang": source},
        timeout=240,
    )
    r.raise_for_status()
    return r.json().get("translations", {})


def escape_single(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def inject_pairs(block: str, pairs: dict[str, str]) -> str:
    """Append new key/value pairs to the end of a block (before its closing brace)."""
    additions = []
    for k, v in pairs.items():
        additions.append(f"    '{escape_single(k)}': '{escape_single(v)}',")
    added = "\n    // ─── auto-populated by scripts/i18n_autofill.py ───\n" + "\n".join(additions) + "\n  "
    # Ensure the block ends with a newline then our additions
    stripped = block.rstrip()
    if not stripped.endswith(','):
        stripped += ','
    return stripped + '\n' + added


def main() -> int:
    with open(I18N, encoding="utf-8") as f:
        content = f.read()

    # 1) Extract EN as source
    en_start, en_end, en_block = find_block(content, 'en')
    if en_block is None:
        print("ERROR: en block not found")
        return 1
    en_pairs = extract_pairs(en_block)
    print(f"[en] {len(en_pairs)} keys (source of truth)")

    # 2) For each other target language, back-fill missing keys
    targets = [lang for lang in LANGS_ALL if lang not in ('ar', 'en')]

    # Process each lang. Re-read content each iteration since we mutate it.
    for lang in targets:
        with open(I18N, encoding="utf-8") as f:
            content = f.read()
        start, end, block = find_block(content, lang)
        existing: dict[str, str] = {}
        if block is not None:
            existing = extract_pairs(block)
        missing_keys = [k for k in en_pairs.keys() if k not in existing]
        if not missing_keys:
            print(f"[{lang}] already complete ({len(existing)} keys) — skipping")
            continue
        print(f"[{lang}] existing {len(existing)}  missing {len(missing_keys)}")

        # Prepare source values (English) with placeholder masking
        src_values: list[str] = []
        maps: list[dict[str, str]] = []
        for k in missing_keys:
            masked, mp = mask_placeholders(en_pairs[k])
            src_values.append(masked)
            maps.append(mp)

        # Translate in chunks of 60
        new_pairs: dict[str, str] = {}
        CHUNK = 60
        for i in range(0, len(src_values), CHUNK):
            batch = src_values[i:i + CHUNK]
            try:
                tr = bulk_translate(batch, lang, 'en')
            except Exception as e:
                print(f"  chunk {i} failed: {e}")
                continue
            for j, src in enumerate(batch):
                key = missing_keys[i + j]
                translated = tr.get(src, src)
                translated = unmask_placeholders(translated, maps[i + j])
                new_pairs[key] = translated
            print(f"  [{lang}] {i + len(batch)}/{len(src_values)}")

        # Inject
        if block is None:
            # Insert new block right before the closing of T.
            # Find the "};" that closes the T declaration (first "};" after
            # the "const T:" declaration).
            t_start = content.find("const T: Record")
            if t_start < 0:
                print("  cannot find const T declaration")
                continue
            close_idx = content.find("\n};", t_start)
            if close_idx < 0:
                print(f"  cannot find insertion point for new {lang} block")
                continue
            insert_at = close_idx  # just before "\n};"
            additions = []
            for k, v in new_pairs.items():
                additions.append(f"    '{escape_single(k)}': '{escape_single(v)}',")
            new_block = (
                f"\n  {lang}: {{\n"
                "    // ─── auto-populated by scripts/i18n_autofill.py ───\n"
                + "\n".join(additions)
                + "\n  },"
            )
            content = content[:insert_at] + new_block + content[insert_at:]
            print(f"  [{lang}] NEW block inserted with {len(new_pairs)} keys")
        else:
            new_block_text = inject_pairs(block, new_pairs)
            content = content[:start] + new_block_text + content[end:]
            print(f"  [{lang}] appended {len(new_pairs)} keys to existing block")

        with open(I18N, 'w', encoding="utf-8") as f:
            f.write(content)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
