B = '/app/'
p = B + 'backend/translate.py'; s = open(p).read()
old = """        bad = [w for w in re.findall(r'[A-Za-z][A-Za-z0-9\\-]*', text)
               if not re.search(r'\\d', w) and not (w.isupper() and len(w) <= 4)"""
assert old in s, 'tr1'
s = s.replace(old, """        bad = [w for w in re.findall(r'[A-Za-z0-9][A-Za-z0-9\\-]*', text)
               if re.search(r'[A-Za-z]', w) and not re.search(r'\\d', w) and not (w.replace('-', '').isupper() and len(w) <= 6)""")
old = "(strict_note if tag.startswith('r') and (req.target_lang == 'ar' or req.target_lang in _NATIVE) else '')"
assert old in s, 'tr2'
s = s.replace(old, "(strict_note if tag.startswith('r') and (req.target_lang == 'ar' or req.target_lang in _NATIVE) and req.target_lang not in ('zh', 'ja', 'ko') else '')")
open(p, 'w').write(s)

p = B + 'frontend/src/components/TranslatableName.tsx'; s = open(p).read()
old = '''    const out: Record<string, string> = j?.translations || {};
    texts.forEach((tx) => {
      const tr = (out[tx] ?? '').toString().trim();
      const ok = !!tr && !(lang !== 'ar' && lang !== 'fa' && lang !== 'ur' && AR_RX.test(tr));'''
assert old in s, 'tn1'
s = s.replace(old, '''    const out: Record<string, string> = j?.translations || {};
    const failed = new Set<string>(j?.failed || []);
    texts.forEach((tx) => {
      const tr = (out[tx] ?? '').toString().trim();
      // Failed lines come back as the source — never cache them as final (retry next time).
      const ok = !!tr && !failed.has(tx) && !(lang !== 'ar' && lang !== 'fa' && lang !== 'ur' && AR_RX.test(tr));''')
s = s.replace("@zenrex_dyn_tr_v5", "@zenrex_dyn_tr_v6")
s = s.replace("isRTL ? { marginRight: 6 } : { marginLeft: 6 },", "{ marginStart: 6 },")
open(p, 'w').write(s)
p = B + 'frontend/src/components/Translatable.tsx'; s = open(p).read()
s = s.replace("isRTL ? { marginRight: 6 } : { marginLeft: 6 },", "{ marginStart: 6 },")
open(p, 'w').write(s)

p = B + 'frontend/app/merchant/orders.tsx'; s = open(p).read()
old = """      const localeMap: any = { ar: 'ar', en: 'en', fa: 'fa-IR', hi: 'hi-IN', zh: 'zh-CN' };
      const l = localeMap[lang] || 'en';"""
assert old in s, 'ord'
s = s.replace(old, """      const localeMap: any = { ar: 'ar-SA', fa: 'fa-IR', hi: 'hi-IN', zh: 'zh-CN', ur: 'ur-PK', bn: 'bn-BD', he: 'he-IL' };
      const l = localeMap[lang] || lang || 'en';""")
open(p, 'w').write(s)

IMP = "import TranslatableName from '../../src/components/TranslatableName';\n"
p = B + 'frontend/app/merchant/marketer-stats.tsx'; s = open(p).read()
old = "<Text style={s.title}>{a.name || tSync('المسوّق', curLang())}</Text>"
assert old in s, 'ms'
s = s.replace(old, "<TranslatableName text={a.name || tSync('المسوّق', curLang())} style={s.title} />")
if 'components/TranslatableName' not in s:
    s = IMP + s
open(p, 'w').write(s)
p = B + 'frontend/app/merchant/branches.tsx'; s = open(p).read()
old = """                        <Text style={s.cardAddress} numberOfLines={2}>
                          {b.address}{b.city ? ` • ${b.city}` : ''}
                        </Text>"""
assert old in s, 'br'
s = s.replace(old, """                        <TranslatableName text={`${b.address || ''}${b.city ? ` • ${b.city}` : ''}`} style={s.cardAddress} numberOfLines={2} containerStyle={{ flexShrink: 1 }} iconSize={11} />""")
if 'components/TranslatableName' not in s:
    s = IMP + s
open(p, 'w').write(s)
p = B + 'frontend/app/merchant/live-preview.tsx'; s = open(p).read()
s = s.replace("<Text style={s.topSplitApp}>App {t.app_orders}</Text>", "<Text style={s.topSplitApp}>{tSync('التطبيق', lang)} {t.app_orders}</Text>")
open(p, 'w').write(s)
print('ok')
