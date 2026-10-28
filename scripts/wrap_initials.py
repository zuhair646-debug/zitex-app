import re
B = '/app/frontend/'
# (file, regex of <Text style={X}>{EXPR}</Text> where EXPR is an initial of a name) — replace with NameInitial
FILES = ['app/track-order/[id].tsx', 'app/competition/[id].tsx', 'app/ugc-contest.tsx', 'app/chamber.tsx',
         'app/merchant/product-analytics.tsx', 'app/merchant/customers.tsx', 'app/merchant/live-preview.tsx',
         'app/merchant/more.tsx', 'app/merchant/marketing.tsx', 'app/merchant/social.tsx', 'app/merchant/team.tsx',
         'app/(tabs)/social.tsx', 'src/components/live-preview/CompetitionDetailSheet.tsx',
         'src/components/live-preview/MerchantSocialFeed.tsx']
RX = re.compile(r"<Text style=\{((?:[^{}]|\{[^{}]*\})+)\}>\{\(?([\w?.]+(?:_name|\.name))(?:\?\.\[0\]| \|\| [^)]*\)\.charAt\(0\)|\?\.charAt\(0\)| \|\| [^)]*\)\[0\]| \|\| [^)]*\)\.slice\(0, 1\)\.toUpperCase\(\))(?: \|\| '\?')?\}</Text>")
total = 0
for f in FILES:
    p = B + f; s = open(p).read()
    s2, n = RX.subn(lambda m: f"<NameInitial name={{{m.group(2)}}} style={{{m.group(1)}}} />", s)
    if n:
        depth = f.count('/')
        rel = ('../' * (depth - 1) if f.startswith('app/') else '../' * (depth - 2)) + ('src/components/TranslatableName' if f.startswith('app/') else 'TranslatableName')
        if f.startswith('src/components/live-preview'):
            rel = '../TranslatableName'
        m = re.search(r"import TranslatableName(, \{[^}]*\})? from '([^']+)';", s2)
        if m:
            if 'NameInitial' not in (m.group(1) or ''):
                s2 = s2.replace(m.group(0), f"import TranslatableName, {{ NameInitial }} from '{m.group(2)}';")
        else:
            lines = s2.split('\n'); i = max(k for k, l in enumerate(lines) if l.startswith('import '))
            while not lines[i].rstrip().endswith(';'): i += 1
            lines.insert(i + 1, f"import {{ NameInitial }} from '{rel}';"); s2 = '\n'.join(lines)
        open(p, 'w').write(s2)
    total += n
    print(f, n)
print('total', total)
