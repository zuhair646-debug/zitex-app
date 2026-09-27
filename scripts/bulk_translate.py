"""
Extract every Arabic hardcoded string used with <TX>, useAutoT(), or tSync()
across the Expo app, translate them in bulk via the backend API for the
5 primary target languages (en, fa, hi, zh), and write them to
/app/frontend/src/i18n-generated.json for instant runtime lookup.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import requests

FRONTEND = "/app/frontend"
OUT = os.path.join(FRONTEND, "src", "i18n-generated.json")
BACKEND = os.environ.get("BULK_TRANSLATE_BASE", "http://localhost:8001")
TARGETS = ["en", "fa", "hi", "zh"]

PATTERNS = [
    re.compile(r"<TX[^>]*>([^<]{2,120})</TX>", re.MULTILINE),
    re.compile(r"useAutoT\(\s*'([^']{2,120})'\s*\)"),
    re.compile(r'useAutoT\(\s*"([^"]{2,120})"\s*\)'),
    re.compile(r"tSync\(\s*'([^']{2,120})'"),
    re.compile(r'tSync\(\s*"([^"]{2,120})"'),
    # Any single-quoted Arabic literal
    re.compile(r"'([^']{2,120})'"),
    # Any double-quoted Arabic literal
    re.compile(r'"([^"]{2,120})"'),
    # Any backtick literal WITHOUT ${...} interpolation
    re.compile(r"`([^`${}]{2,120})`"),
]


def walk_source(base: str):
    for root, _dirs, files in os.walk(base):
        for f in files:
            if f.endswith((".tsx", ".ts", ".jsx", ".js")):
                yield os.path.join(root, f)


def has_arabic(s: str) -> bool:
    return any("\u0600" <= c <= "\u06FF" for c in s)


def extract_strings() -> list[str]:
    strings: set[str] = set()
    for path in list(walk_source(os.path.join(FRONTEND, "app"))) + list(walk_source(os.path.join(FRONTEND, "src"))):
        try:
            with open(path, encoding="utf-8") as fp:
                content = fp.read()
        except Exception:
            continue
        for pat in PATTERNS:
            for m in pat.findall(content):
                s = m.strip()
                if len(s) >= 2 and has_arabic(s) and not s.startswith("{"):
                    strings.add(s)
    return sorted(strings, key=lambda x: (len(x), x))


def bulk_translate(texts: list[str], target: str) -> dict[str, str]:
    r = requests.post(
        f"{BACKEND}/api/translate/bulk",
        json={"texts": texts, "target_lang": target},
        timeout=180,
    )
    r.raise_for_status()
    return r.json().get("translations", {})


def main() -> int:
    print("Scanning source for Arabic strings…")
    strings = extract_strings()
    print(f"  found {len(strings)} unique Arabic strings")

    # Load existing to preserve any manually-verified entries
    existing: dict[str, dict[str, str]] = {}
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding="utf-8") as fp:
                existing = json.load(fp)
        except Exception:
            existing = {}

    out: dict[str, dict[str, str]] = existing
    # Ensure structure: out[source] = {lang: translation, ...}
    for s in strings:
        out.setdefault(s, {})

    for lang in TARGETS:
        missing = [s for s in strings if lang not in out.get(s, {}) or not out[s][lang]]
        print(f"[{lang}] pending: {len(missing)}")
        if not missing:
            continue
        # Chunk to keep single LLM call reasonable (backend chunks internally too)
        CHUNK = 60
        done = 0
        for i in range(0, len(missing), CHUNK):
            batch = missing[i:i + CHUNK]
            t0 = time.time()
            try:
                tr = bulk_translate(batch, lang)
            except Exception as e:
                print(f"  chunk {i}: FAILED {e}")
                continue
            for k, v in tr.items():
                if v and v.strip():
                    out.setdefault(k, {})[lang] = v.strip()
            done += len(batch)
            dt = time.time() - t0
            print(f"  {lang} progress {done}/{len(missing)}  (chunk {len(batch)} in {dt:.1f}s)")
            # Persist after each chunk so we don't lose work on crash
            with open(OUT, "w", encoding="utf-8") as fp:
                json.dump(out, fp, ensure_ascii=False, indent=2, sort_keys=True)
    print(f"Done. Wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
