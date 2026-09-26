#!/usr/bin/env python3
"""
Global i18n migration — wrap every hardcoded Arabic string in the app with <TX>
so it auto-translates to the currently selected language.

Strategy:
- Find every JSX Text element whose literal children contain Arabic characters
- Rewrite:   <Text style={s.x}>نص عربي</Text>  →  <TX style={s.x}>نص عربي</TX>
- Find title="نص عربي" / label="نص عربي" props for common components → wrap with a small runtime helper via t()
  (limited to safe patterns; complex expressions like ternaries are left alone)
- Add `import { TX, useAutoT } from '.../useAutoT'` where needed

Excluded:
- src/i18n.tsx (translation source itself)
- src/useAutoT.tsx (the helper file)
- All *.py, backend files
- Config files
- Non-tsx code

Reports which files changed and which strings were wrapped.
"""
import os, re, pathlib

ROOT = pathlib.Path('/app/frontend')
SRC = pathlib.Path('/app/frontend/src')
APP = pathlib.Path('/app/frontend/app')

# Match Arabic range in Unicode
AR_RE = re.compile(r"[\u0600-\u06FF]")


def has_arabic(s: str) -> bool:
    return bool(AR_RE.search(s))


def get_relative_import(from_file: pathlib.Path) -> str:
    rel = os.path.relpath('/app/frontend/src/useAutoT', from_file.parent)
    if not rel.startswith('.'):
        rel = './' + rel
    return rel


def already_imports_tx(text: str) -> bool:
    return bool(re.search(r"from\s+['\"][^'\"]*useAutoT['\"]", text))


def add_tx_import(text: str, path: pathlib.Path, need_TX: bool, need_useAutoT: bool) -> str:
    if not need_TX and not need_useAutoT:
        return text
    if already_imports_tx(text):
        # Ensure both names are imported
        m = re.search(r"import\s+\{\s*([^}]+)\s*\}\s+from\s+['\"]([^'\"]*useAutoT)['\"]", text)
        if m:
            names = [x.strip() for x in m.group(1).split(',') if x.strip()]
            changed = False
            if need_TX and 'TX' not in names:
                names.append('TX'); changed = True
            if need_useAutoT and 'useAutoT' not in names:
                names.append('useAutoT'); changed = True
            if changed:
                new_import = f"import {{ {', '.join(names)} }} from '{m.group(2)}'"
                return text.replace(m.group(0), new_import)
        return text
    rel = get_relative_import(path)
    names = []
    if need_TX: names.append('TX')
    if need_useAutoT: names.append('useAutoT')
    insert = f"\nimport {{ {', '.join(names)} }} from '{rel}';"
    lines = text.split('\n')
    last_import_idx = -1
    for i, l in enumerate(lines):
        if re.match(r"^\s*import\s+", l):
            last_import_idx = i
    if last_import_idx == -1:
        return text
    lines.insert(last_import_idx + 1, insert.strip())
    return '\n'.join(lines)


# ─── Rewrite <Text ...>Arabic</Text> → <TX ...>Arabic</TX> ─────────────
TEXT_JSX_RE = re.compile(
    # Group 1: Text opening tag (may span multiple lines)
    # Group 2: Text content (literal Arabic, but might have JSX expression braces)
    r"<Text(\s[^>]*)?>([^<{}]*?[\u0600-\u06FF][^<{}]*?)</Text>",
    re.DOTALL,
)

def replace_text_with_tx(text: str) -> tuple[str, int]:
    count = 0
    def repl(m):
        nonlocal count
        attrs = m.group(1) or ''
        content = m.group(2)
        # Skip if content is just whitespace or numeric
        if not content.strip() or not has_arabic(content):
            return m.group(0)
        count += 1
        return f"<TX{attrs}>{content}</TX>"
    return TEXT_JSX_RE.sub(repl, text), count


# ─── Rewrite common props like title="Arabic" / label="Arabic" / placeholder="Arabic" ──
# We handle these on select known component names to avoid breaking backend/other props
PROP_RE = re.compile(
    r'(<(?:PrimaryButton|SecondaryButton|GhostButton|Chip|Badge|ScreenHeader|SectionHeader|ListItem|StatCard|ActionCard|EmptyState)\b[^>]*?)\b(label|title|subtitle|actionLabel|placeholder|desc|description)="([^"\{\}\n]*?[\u0600-\u06FF][^"\{\}\n]*?)"',
    re.DOTALL,
)

def replace_prop_arabic(text: str) -> tuple[str, int]:
    count = 0
    def repl(m):
        nonlocal count
        prefix = m.group(1)
        prop = m.group(2)
        value = m.group(3)
        if not has_arabic(value):
            return m.group(0)
        count += 1
        # Wrap the string using useAutoT: prop={useAutoT("ARABIC")}
        return f'{prefix}{prop}={{useAutoT("{value}")}}'
    return PROP_RE.sub(repl, text), count


def process_file(path: pathlib.Path):
    try:
        text = path.read_text(encoding='utf-8')
    except Exception as e:
        return None
    original = text

    if not has_arabic(text):
        return {'skipped': 'no arabic'}

    # Skip specific files
    name_lc = str(path).lower()
    if 'useautot' in name_lc or '/i18n.' in name_lc:
        return {'skipped': 'source file'}

    # 1. Replace <Text>Arabic</Text> → <TX>...</TX>
    text2, n_text = replace_text_with_tx(text)
    # 2. Replace prop="Arabic" → prop={useAutoT("Arabic")}
    text3, n_prop = replace_prop_arabic(text2)

    total = n_text + n_prop
    if total == 0:
        return {'skipped': 'no arabic in JSX'}

    # Add imports
    text3 = add_tx_import(text3, path,
                          need_TX=n_text > 0,
                          need_useAutoT=n_prop > 0)

    if text3 != original:
        path.write_text(text3, encoding='utf-8')
        return {'texts': n_text, 'props': n_prop}
    return {'skipped': 'no changes'}


def main():
    total_files = 0
    total_texts = 0
    total_props = 0
    skipped = 0
    for target in [APP, SRC]:
        for f in target.rglob('*.tsx'):
            r = process_file(f)
            if r is None:
                continue
            if 'skipped' in r:
                skipped += 1
                continue
            total_files += 1
            total_texts += r['texts']
            total_props += r['props']
            print(f"✅ {f.relative_to(ROOT)}: texts={r['texts']} props={r['props']}")
    print()
    print(f"📊 Modified: {total_files} files, texts={total_texts}, props={total_props}, skipped={skipped}")


if __name__ == '__main__':
    main()
