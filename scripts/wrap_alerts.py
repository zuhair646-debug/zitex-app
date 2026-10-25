"""Pass 4: wrap Arabic literals inside Alert.alert(...) calls that are not wrapped yet."""
import os
import re

FRONT = '/app/frontend'
LIT = re.compile(r"(?<![\w(])'((?:[^'\\\n]|\\.)*[\u0600-\u06FF](?:[^'\\\n]|\\.)*)'")


def call_end(s, j):
    depth, inq = 1, None
    while j < len(s) and depth:
        c = s[j]
        if inq:
            if c == '\\':
                j += 2
                continue
            if c == inq:
                inq = None
        elif c in "'\"`":
            inq = c
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
        j += 1
    return j


def main():
    tot = 0
    for base in ('app', 'src'):
        for root, _d, fs in os.walk(f'{FRONT}/{base}'):
            for f in fs:
                if not f.endswith('.tsx') or f in ('i18n.tsx', 'useAutoT.tsx'):
                    continue
                p = os.path.join(root, f)
                s = open(p, encoding='utf-8').read()
                counter = [0]
                spans = []
                for m in re.finditer(r"Alert\.alert\(", s):
                    j = call_end(s, m.end())
                    seg = s[m.start():j]

                    def rep(mm, seg=seg):
                        pre = seg[max(0, mm.start() - 6):mm.start()]
                        if pre.endswith('tSync(') or pre.endswith('tf('):
                            return mm.group(0)
                        counter[0] += 1
                        return f"tSync('{mm.group(1)}', curLang())"
                    spans.append((m.start(), j, LIT.sub(rep, seg)))
                if not counter[0]:
                    continue
                for a, b, new in reversed(spans):
                    s = s[:a] + new + s[b:]
                rel = os.path.relpath(f'{FRONT}/src', root)
                rel = rel if rel.startswith('.') else './' + rel
                mm = re.search(r"import \{([^}]*)\} from '([^']*useAutoT)';", s)
                if mm:
                    have = [x.strip() for x in mm.group(1).split(',') if x.strip()]
                    if 'tSync' not in have:
                        s = s.replace(mm.group(0), "import { %s } from '%s';" % (', '.join(have + ['tSync']), mm.group(2)), 1)
                else:
                    s = f"import {{ tSync }} from '{rel}/useAutoT';\n" + s
                if not re.search(r"\bcurLang\b[^\n]*from '[^']*i18n'", s):
                    mm = re.search(r"import \{([^}]*)\} from '([^']*/i18n)';", s)
                    if mm:
                        s = s.replace(mm.group(0), "import {%s, curLang } from '%s';" % (mm.group(1).rstrip(), mm.group(2)), 1)
                    else:
                        s = f"import {{ curLang }} from '{rel}/i18n';\n" + s
                open(p, 'w', encoding='utf-8').write(s)
                print(counter[0], p)
                tot += counter[0]
    print('TOTAL', tot)


main()
