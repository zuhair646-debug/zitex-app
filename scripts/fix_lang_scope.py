"""Fix tsc "Cannot find name 'lang'": inject useT() in components, curLang() in helpers."""
import collections
import re
import subprocess

FRONT = '/app/frontend'
out = subprocess.run(f'cd {FRONT} && node_modules/.bin/tsc --noEmit -p .', shell=True, capture_output=True, text=True).stdout
errs = collections.defaultdict(set)
for l in out.splitlines():
    m = re.match(r"(.+?)\((\d+),\d+\): error TS\d+: Cannot find name 'lang'", l)
    if m:
        errs[m.group(1)].add(int(m.group(2)))
FN = re.compile(r"^(\s*)(?:export\s+)?(?:default\s+)?(?:function\s+(\w+)\s*\(|const\s+(\w+)\s*(?::[^=]+)?=\s*(?:React\.memo\()?(?:async\s*)?\(|const\s+(\w+)\s*=\s*\w+\s*=>)")
for f, lines in errs.items():
    p = f'{FRONT}/{f}'
    src = open(p, encoding='utf-8').read().split('\n')
    inject, helpers = set(), set()
    for ln in lines:
        i = ln - 1
        while i >= 0:
            m = FN.match(src[i])
            if m and (m.group(2) or m.group(3) or m.group(4)):
                name = m.group(2) or m.group(3) or m.group(4)
                if name[0].isupper() and len(m.group(1)) == 0:
                    inject.add(i)
                else:
                    helpers.add(ln - 1)
                break
            i -= 1
    for i in sorted(inject, reverse=True):
        j = i
        depth = 0
        # find the line where the parameter list closes and body opens
        while True:
            depth += src[j].count('(') - src[j].count(')')
            if depth <= 0 and src[j].rstrip().endswith('{'):
                break
            j += 1
        src.insert(j + 1, '  const { lang } = useT();')
        helpers = {h + 1 if h > j else h for h in helpers}
    for h in helpers:
        src[h] = re.sub(r"\b(tSync|tf)\(((?:'(?:[^'\\]|\\.)*'|[^,()]+)), lang\b", r"\1(\2, curLang()", src[h])
    s = '\n'.join(src)
    if helpers:
        m = re.search(r"import \{([^}]*)\} from '([^']*/i18n)';", s)
        if m and 'curLang' not in m.group(1):
            s = s.replace(m.group(0), "import {%s, curLang } from '%s';" % (m.group(1).rstrip(), m.group(2)), 1)
    open(p, 'w', encoding='utf-8').write(s)
    print(f, 'components', len(inject), 'helpers', len(helpers))
