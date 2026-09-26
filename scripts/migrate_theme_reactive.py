#!/usr/bin/env python3
"""
Migrate all screens to theme-reactive styles.
Handles:
  Pattern A (module-level):  const styles = StyleSheet.create({...});  → hook + useTheme
  Pattern B (hook already):  function useSStyles() { return useMemo(..., []) } → add themeKey dep
"""
import os, re, sys, pathlib

ROOT = pathlib.Path('/app/frontend/app')
TARGET_DIRS = [
    ROOT / 'merchant',
    ROOT / 'driver',
    ROOT / '(tabs)',
    ROOT,  # also root-level screens like chamber.tsx, orders.tsx, etc.
]

def get_import_relative_path(file_path: pathlib.Path) -> str:
    """Compute relative import path to src/theme/ThemeContext from a given file."""
    rel = os.path.relpath('/app/frontend/src/theme/ThemeContext', file_path.parent)
    # normalize slashes for windows-safety (none here)
    if not rel.startswith('.'):
        rel = './' + rel
    return rel

def already_has_usetheme_import(text: str) -> bool:
    return bool(re.search(r"from\s+['\"][^'\"]+ThemeContext['\"]", text)) and 'useTheme' in text

def already_has_themekey_dep(text: str) -> bool:
    """Check if any useMemo(...., [themeKey]) exists."""
    return bool(re.search(r"useMemo\(.*?\[.*themeKey.*\]", text, re.DOTALL))

def add_usetheme_import(text: str, file_path: pathlib.Path) -> str:
    if already_has_usetheme_import(text):
        return text
    rel = get_import_relative_path(file_path)
    # Insert after the last top import line
    lines = text.split('\n')
    last_import_idx = -1
    for i, l in enumerate(lines):
        if re.match(r"^\s*import\s+", l):
            last_import_idx = i
    if last_import_idx == -1:
        return text
    insert = f"import {{ useTheme }} from '{rel}';"
    lines.insert(last_import_idx + 1, insert)
    return '\n'.join(lines)

def migrate_hook_pattern(text: str) -> tuple[str, int]:
    """Add themeKey dep to `useMemo(() => StyleSheet.create({...}), [])` inside `function useSStyles()` etc.
    Also adds `const { themeKey } = useTheme();` on the first line of that function.
    """
    changes = 0
    
    # First: convert `}), []);` inside a useSStyles-like function into `}), [themeKey]);`
    # We match the pattern flexibly across multi-line
    hook_fn_regex = re.compile(
        r"(function\s+(?:useSStyles|useStyles|useStylesStyles|useMerchantStyles|useDriverStyles|useAdminStyles)\s*\(\s*\)\s*\{\s*\n)(.*?)(\}\s*\)\s*,\s*\[\s*\]\s*\)\s*;)",
        re.DOTALL,
    )
    def repl(m):
        nonlocal changes
        head, body, tail = m.group(1), m.group(2), m.group(3)
        # If body already has 'themeKey', skip
        if 'themeKey' in body:
            return m.group(0)
        # Inject themeKey ref at start of function body
        # Find the `return useMemo(` occurrence
        new_body = body
        if 'const { themeKey }' not in body:
            new_body = "  const { themeKey } = useTheme();\n" + body
        new_tail = tail.replace('[]', '[themeKey]')
        changes += 1
        return head + new_body + new_tail
    text = hook_fn_regex.sub(repl, text)
    return text, changes

def migrate_module_level(text: str) -> tuple[str, int]:
    """Convert `const styles = StyleSheet.create({...});` at module level into
    a hook `function useSStyles() { ... }` + inject `const styles = useSStyles();` inside default export component."""
    changes = 0
    
    # Match `const styles = StyleSheet.create({\n ... \n});`
    lines = text.split('\n')
    result_lines = []
    i = 0
    styles_hook_body = None
    styles_hook_var = 'styles'
    already_added_hook_call = False
    
    # Detect the default export function to inject `const styles = useSStyles();` at its top
    export_default_regex = re.compile(r"^(export\s+default\s+function\s+\w+\([^)]*\)\s*\{)")
    
    while i < len(lines):
        line = lines[i]
        # Detect start of `const s = StyleSheet.create({` or `const styles = StyleSheet.create({`
        m = re.match(r"^(\s*)const\s+(styles|s|st|sty)\s*=\s*StyleSheet\.create\(\s*\{", line)
        if m:
            var_name = m.group(2)
            # Extract everything until matching `});` at column 0 (or matching depth)
            body_lines = [line]
            depth = line.count('{') - line.count('}')
            j = i + 1
            while j < len(lines) and depth > 0:
                body_lines.append(lines[j])
                depth += lines[j].count('{') - lines[j].count('}')
                j += 1
            # Now body_lines has the full `const s = StyleSheet.create({ ... });`
            body_text = '\n'.join(body_lines)
            # Rewrite as hook
            obj_match = re.match(r"^\s*const\s+" + var_name + r"\s*=\s*StyleSheet\.create\((.*)\)\s*;?\s*$", body_text, re.DOTALL)
            if obj_match:
                obj_literal = obj_match.group(1).strip()
                # Save for later — remember variable name
                if styles_hook_body is None:
                    styles_hook_body = obj_literal
                    styles_hook_var = var_name
                    i = j
                    changes += 1
                    continue
                # If a second module-level styles exists, keep as-is (rare)
        # For default export function, add hook call inside body
        if not already_added_hook_call and styles_hook_body is not None:
            em = export_default_regex.match(line)
            if em:
                result_lines.append(line)
                result_lines.append(f"  const {styles_hook_var} = useSStyles();")
                already_added_hook_call = True
                i += 1
                continue
        result_lines.append(line)
        i += 1
    
    if styles_hook_body is not None:
        # Append the hook to end of file
        hook_code = f"""
function useSStyles() {{
  const {{ themeKey }} = useTheme();
  return useMemo(() => StyleSheet.create({styles_hook_body}), [themeKey]);
}}
"""
        result_lines.append(hook_code)
        # Ensure useMemo is imported
        result_text = '\n'.join(result_lines)
        # Add useMemo import if missing
        if not re.search(r"from\s+['\"]react['\"]", result_text) or 'useMemo' not in result_text:
            # Add useMemo import
            m_react = re.search(r"import\s+\{([^}]+)\}\s+from\s+['\"]react['\"]", result_text)
            if m_react:
                items = [x.strip() for x in m_react.group(1).split(',') if x.strip()]
                if 'useMemo' not in items:
                    items.append('useMemo')
                    new_import = f"import {{ {', '.join(items)} }} from 'react'"
                    result_text = result_text.replace(m_react.group(0), new_import)
        return result_text, changes
    
    return '\n'.join(result_lines), changes


def process_file(file_path: pathlib.Path) -> dict:
    """Returns stats dict."""
    try:
        text = file_path.read_text(encoding='utf-8')
    except Exception as e:
        return {'error': str(e)}
    
    original = text
    stats = {'hook': 0, 'module': 0}
    
    # Skip if no StyleSheet.create
    if 'StyleSheet.create' not in text:
        return {'skipped': 'no StyleSheet'}
    
    # Skip if already reactive
    if already_has_themekey_dep(text):
        return {'skipped': 'already themeKey'}
    
    # Skip files that don't have module-level styles referencing anything themable
    # (module-level `const s = StyleSheet.create(...)` or hook)
    has_stylesheet = 'StyleSheet.create' in text
    has_tokens_ref = ('theme/tokens' in text) or ('colors.' in text)
    if not has_stylesheet:
        return {'skipped': 'no StyleSheet'}
    if not has_tokens_ref:
        return {'skipped': 'no colors ref'}
    
    # 1. Add useTheme import
    text = add_usetheme_import(text, file_path)
    
    # 2. Migrate hook pattern
    text, hc = migrate_hook_pattern(text)
    stats['hook'] = hc
    
    # 3. Migrate module-level pattern
    text, mc = migrate_module_level(text)
    stats['module'] = mc
    
    if text != original:
        file_path.write_text(text, encoding='utf-8')
        return stats
    return {'skipped': 'no changes needed'}


def main():
    total = {'hook': 0, 'module': 0, 'files_changed': 0, 'skipped': 0}
    for target in TARGET_DIRS:
        if not target.exists():
            continue
        # Only process direct tsx files in this dir (not deep subdirs to avoid double-processing)
        for f in sorted(target.glob('*.tsx')):
            result = process_file(f)
            if 'error' in result:
                print(f"❌ {f.relative_to(ROOT.parent)}: {result['error']}")
            elif 'skipped' in result:
                total['skipped'] += 1
            else:
                total['hook'] += result.get('hook', 0)
                total['module'] += result.get('module', 0)
                total['files_changed'] += 1
                print(f"✅ {f.relative_to(ROOT.parent)}: hook={result.get('hook',0)} module={result.get('module',0)}")
    print()
    print(f"📊 Total: {total['files_changed']} files changed, {total['skipped']} skipped")
    print(f"   Hook patterns migrated: {total['hook']}")
    print(f"   Module-level migrated: {total['module']}")


if __name__ == '__main__':
    main()
