"""Pass 3: catch remaining Arabic/English UI text patterns missed by earlier passes."""
import os
import re

FRONT = '/app/frontend'
ARC = '\u0600-\u06FF'
AR = re.compile(f'[{ARC}]')
SKIP = {'i18n.tsx', 'useAutoT.tsx', 'TranslatableName.tsx', 'Translatable.tsx'}
LIT = r"'((?:[^'\\\n]|\\.)*)'"


def q(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def strip_braces(line):
    out, depth = [], 0
    for ch in line:
        if ch == '{':
            depth += 1
            out.append(' ')
        elif ch == '}':
            depth -= 1
            out.append(' ')
        else:
            out.append(' ' if depth else ch)
    return ''.join(out)


def wrap_text_runs(line):
    """Wrap Arabic runs that sit in JSX text (outside {...} and outside tags)."""
    res, i, depth, n = [], 0, 0, 0
    buf = ''
    tag = False

    def flush():
        nonlocal buf, n
        if AR.search(buf) and not re.search(r"['\"`=;]", buf):
            core = buf.strip()
            lead = buf[:len(buf) - len(buf.lstrip())]
            trail = buf[len(buf.rstrip()):]
            res.append(f"{lead}{{tSync({q(core)}, lang)}}{trail}")
            n += 1
        else:
            res.append(buf)
        buf = ''
    while i < len(line):
        ch = line[i]
        if depth == 0 and not tag and ch == '<':
            flush()
            tag = True
            res.append(ch)
        elif tag:
            res.append(ch)
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
            elif ch == '>' and depth == 0:
                tag = False
        elif ch == '{':
            flush()
            depth += 1
            res.append(ch)
        elif ch == '}' and depth > 0:
            depth -= 1
            res.append(ch)
        elif depth > 0:
            res.append(ch)
        else:
            buf += ch
        i += 1
    flush()
    return ''.join(res), n


def process(src):
    n = 0
    # 1) two-language ternaries
    for pat in (r"lang === 'ar' \? " + LIT + r" : " + LIT, r"isAr \? " + LIT + r" : " + LIT):
        def rep(m):
            nonlocal n
            if not AR.search(m.group(1)):
                return m.group(0)
            n += 1
            return f"tSync('{m.group(1)}', lang)"
        src = re.sub(pat, rep, src)
    # 2) toLocaleString('ar-SA' | 'ar')
    src, k = re.subn(r"toLocaleString\('ar(?:-SA)?'", "toLocaleString(curLang() === 'ar' ? 'ar-SA' : 'en-US'", src)
    n += k
    # 3) hard-coded SAR after an expression in Text
    src, k = re.subn(r"\} SAR</Text>", "} {tSync('ر.س', lang)}</Text>", src)
    n += k
    # 4) JSX text runs (single-line & multi-line), skipping content of <TX>
    lines = src.split('\n')
    in_tx = False
    for idx, line in enumerate(lines):
        st = line.strip()
        if '<TX' in line and '</TX>' not in line:
            in_tx = True
        if in_tx:
            if '</TX>' in line:
                in_tx = False
            continue
        if not AR.search(line) or st.startswith(('//', '*', '/*', 'import')):
            continue
        prev = next((lines[j].rstrip() for j in range(idx - 1, -1, -1) if lines[j].strip()), '')
        jsx_line = ('<Text' in line or '</Text>' in line) or (prev.endswith(('>', '}')) and not re.search(r"[='\"`;(]", strip_braces(st)))
        if not jsx_line:
            continue
        # protect TX contents on the same line
        parts = re.split(r'(<TX\b[^>]*>[^<]*</TX>)', line)
        out = []
        for p in parts:
            if p.startswith('<TX'):
                out.append(p)
                continue
            if '<Text' in line or '</Text>' in line or '<' in p:
                w, k = wrap_text_runs(p)
            else:
                w, k = wrap_text_runs(p)
            out.append(w)
            n += k
        lines[idx] = ''.join(out)
    return '\n'.join(lines), n


def ensure_imports(src, path):
    rel = os.path.relpath(f'{FRONT}/src', os.path.dirname(path))
    rel = rel if rel.startswith('.') else './' + rel
    if 'tSync(' in src:
        m = re.search(r"import \{([^}]*)\} from '([^']*useAutoT)';", src)
        if m:
            have = [x.strip() for x in m.group(1).split(',') if x.strip()]
            if 'tSync' not in have:
                src = src.replace(m.group(0), f"import {{ {', '.join(have + ['tSync'])} }} from '{m.group(2)}';", 1)
        else:
            src = f"import {{ tSync }} from '{rel}/useAutoT';\n" + src
    need = [x for x in ('useT', 'curLang') if (x == 'useT' and re.search(r'\blang\b', src)) or (x == 'curLang' and 'curLang()' in src)]
    m = re.search(r"import \{([^}]*)\} from '([^']*/i18n)';", src)
    if m:
        have = [x.strip() for x in m.group(1).split(',') if x.strip()]
        add = [x for x in need if x not in have]
        if add:
            src = src.replace(m.group(0), f"import {{ {', '.join(have + add)} }} from '{m.group(2)}';", 1)
    elif need:
        src = f"import {{ {', '.join(need)} }} from '{rel}/i18n';\n" + src
    return src


total = 0
for base in (f'{FRONT}/app', f'{FRONT}/src'):
    for root, _d, fs in os.walk(base):
        for f in fs:
            if not f.endswith('.tsx') or f in SKIP:
                continue
            p = os.path.join(root, f)
            s = open(p, encoding='utf-8').read()
            new, n = process(s)
            if n:
                new = ensure_imports(new, p)
                open(p, 'w', encoding='utf-8').write(new)
                print(f'{n:3d} {p}')
                total += n
print('TOTAL', total)
