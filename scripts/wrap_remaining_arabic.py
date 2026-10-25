"""
Wrap remaining raw Arabic UI text:
  1. JSX text segments containing Arabic (outside <TX>)   → {tSync('…', lang)}
  2. Template literals containing Arabic + ${…}            → tf('… {0} …', lang, [expr])
Leaves i18n.tsx / useAutoT.tsx untouched. Prints a per-file count.
"""
import os
import re
import sys

FRONT = '/app/frontend'
AR = re.compile(r'[\u0600-\u06FF]')
SKIP = {'i18n.tsx', 'useAutoT.tsx', 'TranslatableName.tsx', 'Translatable.tsx'}


def q(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def parse_template(src: str, i: int):
    """src[i] == '`'. Returns (end_index_exclusive, parts[list of str|('expr', str)]) or None."""
    j = i + 1
    parts, buf = [], ''
    while j < len(src):
        c = src[j]
        if c == '\\':
            buf += src[j:j + 2]
            j += 2
            continue
        if c == '`':
            parts.append(buf)
            return j + 1, parts
        if c == '$' and j + 1 < len(src) and src[j + 1] == '{':
            depth, k = 1, j + 2
            while k < len(src) and depth:
                if src[k] == '`':
                    return None  # nested template — skip
                if src[k] in '{':
                    depth += 1
                elif src[k] == '}':
                    depth -= 1
                k += 1
            parts.append(buf)
            parts.append(('expr', src[j + 2:k - 1]))
            buf = ''
            j = k
            continue
        buf += c
        j += 1
    return None


def convert_templates(src: str) -> tuple[str, int]:
    out, i, n = [], 0, 0
    while i < len(src):
        c = src[i]
        if c == '`':
            res = parse_template(src, i)
            if res:
                end, parts = res
                texts = ''.join(p for p in parts if isinstance(p, str))
                exprs = [p[1] for p in parts if not isinstance(p, str)]
                if AR.search(texts) and exprs and '\n' not in texts and 'tSync(' not in ''.join(exprs):
                    tpl, k = '', 0
                    for p in parts:
                        if isinstance(p, str):
                            tpl += p.replace('\\n', '\n').replace('\\`', '`')
                        else:
                            tpl += '{' + str(k) + '}'
                            k += 1
                    tpl_q = q(tpl).replace('\n', '\\n')
                    out.append(f"tf({tpl_q}, lang, [{', '.join(e.strip() for e in exprs)}])")
                    n += 1
                    i = end
                    continue
                out.append(src[i:end])
                i = end
                continue
        out.append(c)
        i += 1
    return ''.join(out), n


JSX_SEG = re.compile(r'(?<=[>}])([^<>{}`\'"=\n]*[\u0600-\u06FF][^<>{}`\'"=\n]*)(?=[<{])')


def convert_jsx(src: str) -> tuple[str, int]:
    lines = src.split('\n')
    n = 0
    for idx, line in enumerate(lines):
        s = line.strip()
        if not AR.search(line) or s.startswith('//') or s.startswith('*') or '<TX' in line:
            continue
        if '<Text' not in line and '</Text>' not in line:
            continue

        def rep(m):
            nonlocal n
            seg = m.group(1)
            core = seg.strip()
            if not core or '=>' in seg or '&&' in seg or '?' in seg and ':' in seg:
                return seg
            lead = seg[:len(seg) - len(seg.lstrip())]
            trail = seg[len(seg.rstrip()):]
            n += 1
            return f"{lead}{{tSync({q(core)}, lang)}}{trail}" if True else seg
        lines[idx] = JSX_SEG.sub(rep, line)
    return '\n'.join(lines), n


def ensure_imports(src: str, path: str) -> str:
    rel = os.path.relpath(f'{FRONT}/src', os.path.dirname(path))
    if not rel.startswith('.'):
        rel = './' + rel
    need = [x for x in ('tSync', 'tf') if re.search(rf'\b{x}\(', src)]
    m = re.search(r"import \{([^}]*)\} from '([^']*useAutoT)';", src)
    if m:
        have = [x.strip() for x in m.group(1).split(',') if x.strip()]
        add = [x for x in need if x not in have]
        if add:
            src = src.replace(m.group(0), f"import {{ {', '.join(have + add)} }} from '{m.group(2)}';", 1)
    elif need:
        src = f"import {{ {', '.join(need)} }} from '{rel}/useAutoT';\n" + src
    if 'lang' in src and not re.search(r"import \{[^}]*\buseT\b[^}]*\} from", src):
        src = f"import {{ useT }} from '{rel}/i18n';\n" + src
    return src


def main(files):
    total = 0
    for p in files:
        if os.path.basename(p) in SKIP:
            continue
        src = open(p, encoding='utf-8').read()
        new, a = convert_templates(src)
        new, b = convert_jsx(new)
        if a or b:
            new = ensure_imports(new, p)
            open(p, 'w', encoding='utf-8').write(new)
            print(f'{a:3d} tpl {b:3d} jsx  {p}')
            total += a + b
    print('TOTAL', total)


if __name__ == '__main__':
    targets = sys.argv[1:]
    if not targets:
        for base in (f'{FRONT}/app', f'{FRONT}/src'):
            for root, _d, fs in os.walk(base):
                targets += [os.path.join(root, f) for f in fs if f.endswith('.tsx')]
    main(targets)
