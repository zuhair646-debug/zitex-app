import re, os
B = '/app/frontend/'
FILES = ['app/competition/[id].tsx', 'app/driver/index.tsx', 'app/chamber.tsx', 'app/merchant/team.tsx',
         'app/merchant/delivery-settings.tsx', 'app/merchant/drivers.tsx', 'app/merchant/marketing.tsx',
         'app/merchant/competition-form.tsx', 'app/merchant/pos.tsx', 'app/merchant/product-form.tsx',
         'app/merchant/services.tsx', 'app/ugc-contest.tsx', 'app/(tabs)/settings.tsx']
RX = re.compile(r"<Text style=\{((?:[^{}]|\{[^{}]*\})+)\}( numberOfLines=\{\d\})?>\{([a-zA-Z_.?]*(?:customer_name|user_name|\.name))\}</Text>")
for f in FILES:
    p = B + f; s = open(p).read()
    s2, n = RX.subn(lambda m: f"<TranslatableName text={{{m.group(3)} || ''}} style={{{m.group(1)}}}{m.group(2) or ''} />", s)
    if n and 'components/TranslatableName' not in s2:
        depth = f.count('/') - 1
        rel = '../' * (depth + 1) + 'src/components/TranslatableName'
        lines = s2.split('\n'); last = max(i for i, l in enumerate(lines) if l.startswith('import '))
        # handle multi-line import ending
        while not lines[last].rstrip().endswith(';'):
            last += 1
        lines.insert(last + 1, f"import TranslatableName from '{rel}';")
        s2 = '\n'.join(lines)
    open(p, 'w').write(s2)
    print(f, n)
