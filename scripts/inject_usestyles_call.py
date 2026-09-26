#!/usr/bin/env python3
"""Post-migration: add `const s/styles = useSStyles();` to component body where the hook exists but isn't called."""
import re, pathlib

ROOT = pathlib.Path('/app/frontend/app')

def process_file(f: pathlib.Path):
    text = f.read_text()
    if 'function useSStyles()' not in text:
        return False
    # Detect the variable name used in styles: prefer 's' but check what style patterns exist
    var = 's' if re.search(r"\bs\.(\w+)", text) and 'const s = ' not in text.split('function useSStyles')[0] else 'styles'
    # Actually look at what the useSStyles function returns - if it originally was `const s = ...` we want `const s = useSStyles()`
    # Look at how styles are referenced inside export default function
    # Simpler heuristic: check StyleSheet.create in hook body — if variable is s, use s; else styles
    m = re.search(r"const\s+(styles|s)\s*=\s*useSStyles\(\)", text)
    if m:
        return False  # already has hook call
    # Search for style references
    # Check if `styles.` is used anywhere
    styles_used = bool(re.search(r"\bstyles\.\w+", text))
    s_used = bool(re.search(r"\bs\.\w+", text))
    # Prefer whichever is more common in the file body (outside the hook itself)
    var_name = None
    if styles_used and not s_used:
        var_name = 'styles'
    elif s_used and not styles_used:
        var_name = 's'
    else:
        # Both or neither — use `styles` as safe default
        var_name = 'styles' if styles_used else 's'
    
    # Inject `const {var_name} = useSStyles();` right after `export default function XXX(...) {`
    new_text, n = re.subn(
        r"(export\s+default\s+function\s+\w+\([^)]*\)\s*\{)",
        r"\1\n  const " + var_name + " = useSStyles();",
        text,
        count=1,
    )
    if n > 0 and new_text != text:
        f.write_text(new_text)
        return True
    return False

count = 0
for f in ROOT.rglob('*.tsx'):
    if 'useSStyles' in f.read_text():
        if process_file(f):
            print(f"✅ Injected hook call: {f.relative_to(ROOT.parent)}")
            count += 1
print(f"\n📊 {count} files updated")
