# Static i18n check: lists tSync/tf/TX literal keys missing from i18n-generated.json (en/de/zh) for given files
import json, re, sys, glob
D = json.load(open('/app/frontend/src/i18n-generated.json'))
files = sys.argv[1:] or glob.glob('/app/frontend/app/**/*.tsx', recursive=True)
pat = re.compile(r"(?:tSync|tf|useAutoT)\(\s*'((?:[^'\\]|\\.)*)'")
pat2 = re.compile(r"<TX[^>]*>([^<{]+)</TX>")
for f in files:
    src = open(f).read()
    keys = set(pat.findall(src)) | set(k.strip() for k in pat2.findall(src))
    miss = []
    for k in sorted(keys):
        if not re.search(r'[\u0600-\u06FF]', k):
            continue
        e = D.get(k)
        lm = [l for l in ('en', 'de', 'zh') if not (e and e.get(l))]
        if lm:
            miss.append(f"{k} [{','.join(lm)}]")
    if miss:
        print(f"== {f.replace('/app/frontend/app/','')}: {len(miss)} missing")
        for m in miss:
            print('   ', m)
