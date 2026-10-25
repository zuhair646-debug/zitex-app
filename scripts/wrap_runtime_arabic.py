"""Second pass: wrap Arabic literals in runtime expression contexts with tSync(…, curLang())."""
import os
import re

FRONT = '/app/frontend'
AR = r"'((?:[^'\\\n]|\\.)*[\u0600-\u06FF](?:[^'\\\n]|\\.)*)'"
W = lambda m_lit: f"tSync('{m_lit}', curLang())"  # noqa: E731
PATS = [
    (re.compile(r"(\breturn\s+)" + AR + r"(\s*;)"), lambda m: m.group(1) + W(m.group(2)) + m.group(3)),
    (re.compile(r"(\|\|\s*|\?\?\s*)" + AR), lambda m: m.group(1) + W(m.group(2))),
    (re.compile(r"(\?\s*)" + AR + r"(\s*:\s*)" + AR), lambda m: m.group(1) + W(m.group(2)) + m.group(3) + W(m.group(4))),
    (re.compile(r"(Alert\.alert\(\s*)" + AR), lambda m: m.group(1) + W(m.group(2))),
    (re.compile(r"(Alert\.alert\(\s*tSync\('[^']*', [^)]*\)\)\s*,\s*)" + AR), lambda m: m.group(1) + W(m.group(2))),
    (re.compile(r"(\{\s*text:\s*)" + AR), lambda m: m.group(1) + W(m.group(2))),
]
SKIP = {'i18n.tsx', 'useAutoT.tsx'}


def main():
    total = 0
    for base in (f'{FRONT}/app', f'{FRONT}/src'):
        for root, _d, fs in os.walk(base):
            for f in fs:
                if not f.endswith('.tsx') or f in SKIP:
                    continue
                p = os.path.join(root, f)
                s = open(p, encoding='utf-8').read()
                n = 0
                for rx, fn in PATS:
                    s, k = rx.subn(fn, s)
                    n += k
                if not n:
                    continue
                rel = os.path.relpath(f'{FRONT}/src', root)
                rel = rel if rel.startswith('.') else './' + rel
                m = re.search(r"import \{([^}]*)\} from '([^']*useAutoT)';", s)
                if m:
                    have = [x.strip() for x in m.group(1).split(',') if x.strip()]
                    if 'tSync' not in have:
                        s = s.replace(m.group(0), f"import {{ {', '.join(have + ['tSync'])} }} from '{m.group(2)}';", 1)
                else:
                    s = f"import {{ tSync }} from '{rel}/useAutoT';\n" + s
                m = re.search(r"import \{([^}]*)\} from '([^']*/i18n)';", s)
                if m:
                    have = [x.strip() for x in m.group(1).split(',') if x.strip()]
                    if 'curLang' not in have:
                        s = s.replace(m.group(0), f"import {{ {', '.join(have + ['curLang'])} }} from '{m.group(2)}';", 1)
                else:
                    s = f"import {{ curLang }} from '{rel}/i18n';\n" + s
                open(p, 'w', encoding='utf-8').write(s)
                print(f'{n:3d}  {p}')
                total += n
    print('TOTAL', total)


if __name__ == '__main__':
    main()
