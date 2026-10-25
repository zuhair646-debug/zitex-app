# Scans .tsx for Arabic / English string literals rendered in JSX that are not wrapped by tSync/tf/TX/t()
import re, glob, sys
files = sys.argv[1:] or sorted(glob.glob('/app/frontend/app/**/*.tsx', recursive=True))
AR = re.compile(r'[\u0600-\u06FF]')
for f in files:
    lines = open(f).read().split('\n')
    hits = []
    for i, l in enumerate(lines, 1):
        if 'StyleSheet' in l or l.strip().startswith('//') or l.strip().startswith('{/*') or 'console.' in l:
            continue
        s = re.sub(r"(tSync|tf|useAutoT|\bt)\(\s*(['`\"])(?:(?!\2).)*\2", 'X(', l)
        s = re.sub(r"<TX[^>]*>[^<]*</TX>", '', s)
        # JSX text between tags
        jsx = re.findall(r">\s*([^<>{}]*[\u0600-\u06FF][^<>{}]*)\s*<", s)
        # ternary/inline string literal inside {} in JSX: : 'ar' or ? 'ar'
        lit = re.findall(r"[?:]\s*'([^']*[\u0600-\u06FF][^']*)'", s)
        val = re.findall(r"(?:value|title|placeholder|label)=\"([^\"]*[\u0600-\u06FF][^\"]*)\"", s)
        eng = re.findall(r">\s*\{[^}]*\}\s*(user|users|To:|All [A-Z][a-z]+)\b", s)
        b = jsx + lit + val + eng
        if b:
            hits.append((i, b[:2]))
    if hits:
        print(f"== {f.replace('/app/frontend/app/', '')}")
        for i, b in hits[:15]:
            print(f"   {i}: {b}")
