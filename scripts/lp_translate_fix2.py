import re
B = '/app/frontend/'
p = B + 'app/merchant/product-analytics.tsx'; s = open(p).read()
R = [
("<Text style={s.kpiLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>", "<Text style={s.kpiLabel} numberOfLines={1} adjustsFontSizeToFit>{tSync(String(label ?? ''), curLang())}</Text>"),
("{value}<Text style={{ fontSize: 10, color: MUTED }}> {unit || ''}</Text>", "{value}<Text style={{ fontSize: 10, color: MUTED }}> {unit ? tSync(unit, curLang()) : ''}</Text>"),
("{!!sub && <Text style={[s.kpiSub, { color }]} numberOfLines={1} adjustsFontSizeToFit>{sub}</Text>}", "{!!sub && <Text style={[s.kpiSub, { color }]} numberOfLines={1} adjustsFontSizeToFit>{tSync(String(sub), curLang())}</Text>}"),
("<Text style={{ color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right' }}>{label}</Text>", "<Text style={{ color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right' }}>{tSync(String(label ?? ''), curLang())}</Text>"),
("<Text style={{ color: TEXT, fontSize: 11, fontWeight: '700' }}>{label}</Text>", "<Text style={{ color: TEXT, fontSize: 11, fontWeight: '700' }}>{tSync(String(label ?? ''), curLang())}</Text>"),
("<Text style={s.sub}>{kindLabel}</Text>", "<Text style={s.sub}>{tSync(kindLabel, lang)}</Text>"),
("sub={`${k.cart_conversion_rate}% ${L.addSubUnit}`}", "sub={`${k.cart_conversion_rate}% ${tSync(L.addSubUnit, lang)}`}"),
("sub={`${k.purchase_conversion_rate}% ${L.ordersSubUnit}`}", "sub={`${k.purchase_conversion_rate}% ${tSync(L.ordersSubUnit, lang)}`}"),
("sub={`${fmt(k.total_units)} ${L.unitLabel}`}", "sub={`${fmt(k.total_units)} ${tSync(L.unitLabel, lang)}`}"),
("t.source === 'search' ? 'بحث' : t.source\n                    }</Text>", "t.source === 'search' ? 'بحث' : (t.source || '')\n                    , lang)}</Text>"),
("<Text style={s.trafficLabel}>{\n", "<Text style={s.trafficLabel}>{tSync(\n"),
("<Text style={s.title} numberOfLines={1}>{p.name_ar}</Text>", "<TranslatableName text={pName(p, lang)} style={s.title} numberOfLines={1} containerStyle={{ flexShrink: 1 }} />"),
("<Text style={s.heroTitle} numberOfLines={2}>{p.name_ar}</Text>", "<TranslatableName text={pName(p, lang)} style={s.heroTitle} numberOfLines={2} />"),
("<Text style={s.reviewText}>{r.text}</Text>", "<TranslatableName text={r.text} style={s.reviewText} inline={false} />"),
("<Text style={s.reviewText}>{q.text}</Text>", "<TranslatableName text={q.text} style={s.reviewText} inline={false} />"),
("<Text style={s.reviewText}>{c.text}</Text>", "<TranslatableName text={c.text} style={s.reviewText} inline={false} />"),
("{p.name_ar} ← {kind === 'service' ? 'هذه الخدمة' : kind === 'competition' ? 'هذه المسابقة' :", "{pName(p, lang)} ← {kind === 'service' ? tSync('هذه الخدمة', lang) : kind === 'competition' ? tSync('هذه المسابقة', lang) :"),
("<Text style={s.compareName} numberOfLines={2}>{c.name_ar}</Text>", "<TranslatableName text={pName(c, lang)} style={s.compareName} numberOfLines={2} />"),
("import { tSync, tf, TX } from '../../src/useAutoT';", "import { tSync, tf, TX } from '../../src/useAutoT';\nimport TranslatableName from '../../src/components/TranslatableName';\n\nconst pName = (p: any, lang: string) => (lang === 'ar' ? (p?.name_ar || p?.name) : (p?.name_en || p?.name || p?.name_ar)) || '';"),
]
for a, b in R:
    if a not in s: print('MISS', a[:80])
    s = s.replace(a, b)
s = re.sub(r"(\{ code: '\w+', label: )('[^']+')", r"\1tSync(\2, lang)", s)
open(p, 'w').write(s)

f = B + 'src/components/live-preview/DetailSheets.tsx'; s = open(f).read()
s = s.replace('sub="طلب"', "sub={tSync('طلب', curLang())}")
for col in ['LP.SUCCESS', 'LP.DANGER', 'LP.TEXT']:
    s = s.replace("<Text style={{ color: %s, fontSize: 12, fontWeight: '900' }}>{r.user_name}</Text>" % col,
                  "<TranslatableName text={r.user_name} style={{ color: %s, fontSize: 12, fontWeight: '900' }} />" % col)
for v in ['b', 'd']:
    s = s.replace("<Text style={{ color: LP.TEXT, fontSize: 11, flex: 1, textAlign: 'right' }}>{%s.reason}</Text>" % v,
                  "<TranslatableName text={%s.reason} style={{ color: LP.TEXT, fontSize: 11, textAlign: 'right' }} containerStyle={{ flex: 1 }} />" % v)
s = s.replace("tSync('عنوان العميل', curLang())", "tSync('العنوان', curLang())")
open(f, 'w').write(s)

f = B + 'src/components/live-preview/MerchantSocialFeed.tsx'; s = open(f).read()
s = s.replace("<Text style={{ color: LP.GOLD, fontSize: 12, fontWeight: '900' }}>{c.user_name}</Text>",
              "<TranslatableName text={c.user_name} style={{ color: LP.GOLD, fontSize: 12, fontWeight: '900' }} />")
open(f, 'w').write(s)
f = B + 'src/components/live-preview/CompetitionDetailSheet.tsx'; s = open(f).read()
s = s.replace("<Text style={st.userName}>{p.user_name || tSync('مستخدم', curLang())}</Text>",
              "<TranslatableName text={p.user_name || tSync('مستخدم', curLang())} style={st.userName} />")
open(f, 'w').write(s)
print('done')
