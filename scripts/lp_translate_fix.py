"""Wrap dynamic names/texts in the merchant Live Preview with TranslatableName
and route hardcoded Arabic labels through tSync/tf. Exact, asserted replacements."""
import re, sys

TN = "TranslatableName"

def apply(path, pairs, regex_pairs=()):
    src = open(path, encoding='utf-8').read()
    for old, new in pairs:
        n = src.count(old)
        if n == 0:
            print(f"!! NOT FOUND in {path}: {old[:90]}")
            continue
        src = src.replace(old, new)
    for rx, new in regex_pairs:
        src, n = re.subn(rx, new, src)
        if n == 0:
            print(f"!! REGEX NOT FOUND in {path}: {rx[:90]}")
    open(path, 'w', encoding='utf-8').write(src)
    print("ok", path)

LP = '/app/frontend/app/merchant/live-preview.tsx'
apply(LP, [
    ("import { TX, tSync, tf } from '../../src/useAutoT';",
     "import { TX, tSync, tf } from '../../src/useAutoT';\nimport TranslatableName from '../../src/components/TranslatableName';\n\n"
     "/** Product name in the viewer's language (merchant-entered field), auto-unified by TranslatableName. */\n"
     "const pName = (p: any, lang: string) => (lang === 'ar' ? (p?.name_ar || p?.name) : (p?.name_en || p?.name || p?.name_ar)) || '';"),
    ("<TX style={s.topName} numberOfLines={1}>{t.name || ''}</TX>",
     "<TranslatableName text={t.name || ''} style={s.topName} numberOfLines={1} iconSize={11} />"),
    ("<Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'right' }}>{lang === 'ar' ? f.name_ar : (f.name_en || f.name_ar)}</Text>",
     "<TranslatableName text={pName(f, lang)} numberOfLines={1} iconSize={11} style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'right', flexShrink: 1 }} />"),
    ("<Text style={s.pName} numberOfLines={2}>{lang === 'ar' ? (item.name_ar || item.name) : (item.name_en || item.name || item.name_ar)}</Text>",
     "<TranslatableName text={pName(item, lang)} style={s.pName} numberOfLines={2} iconSize={12} />"),
    ("<Text style={s.svcName2}>{item.title || item.name}</Text>",
     "<TranslatableName text={item.title || item.name} style={s.svcName2} />"),
    ("<Text style={s.svcDesc2} numberOfLines={2}>{item.description || item.desc}</Text>",
     "<TranslatableName text={item.description || item.desc} style={s.svcDesc2} numberOfLines={2} inline={false} />"),
    ("<Text style={s.compTitle} numberOfLines={1}>{item.title}</Text>",
     "<TranslatableName text={item.title} style={s.compTitle} numberOfLines={1} containerStyle={{ flexShrink: 1 }} />"),
    ("<Text style={s.compPrize}>🎁 {item.prize}{item.prize_count > 1 ? tf(' ({0} جوائز)', lang, [item.prize_count]) : ''}</Text>",
     "<View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={s.compPrize}>🎁 </Text><TranslatableName text={item.prize} style={s.compPrize} /><Text style={s.compPrize}>{item.prize_count > 1 ? tf(' ({0} جوائز)', lang, [item.prize_count]) : ''}</Text></View>"),
    ("<Text style={s.sheetTitle} numberOfLines={1}>📊 {lang === 'ar' ? data.product.name_ar : (data.product.name_en || data.product.name_ar)}</Text>",
     "<TranslatableName text={`📊 ${pName(data.product, lang)}`} style={s.sheetTitle} numberOfLines={1} containerStyle={{ flexShrink: 1 }} />"),
    ("<Text style={s.visitorName}>{tb.name}</Text>\n                      <Text style={s.visitorMeta}>{tb.city} ·",
     "<TranslatableName text={tb.name} style={s.visitorName} />\n                      <Text style={s.visitorMeta}>{tSync(tb.city || '', lang)} ·"),
    ("{labelMap[ps.source] || ps.source}</Text>", "{tSync(labelMap[ps.source] || ps.source || '', lang)}</Text>"),
    ("<Text style={s.cmpName} numberOfLines={2}>{lang === 'ar' ? it.name_ar : (it.name_en || it.name_ar)}</Text>",
     "<TranslatableName text={pName(it, lang)} style={s.cmpName} numberOfLines={2} iconSize={11} />"),
    ("""<Text style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 8 }}>
            {service.title || service.name}
          </Text>""",
     """<TranslatableName text={service.title || service.name} style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right' }} containerStyle={{ marginBottom: 8 }} />"""),
    ("<Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>{t.name}</Text>",
     "<TranslatableName text={t.name} style={{ color: '#FFF', fontSize: 12, fontWeight: '800', textAlign: 'right' }} />"),
    ("""<Text style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 8 }}>
            {competition.title}
          </Text>""",
     """<TranslatableName text={competition.title} style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right' }} containerStyle={{ marginBottom: 8 }} />"""),
    ("<Text style={s.barLabel}>{row.city}</Text>", "<Text style={s.barLabel}>{tSync(row.city || '', lang)}</Text>"),
    ("<Text style={s.commentAuthor}>{c.user_name}</Text>\n                  <Text style={s.commentText}>{c.text}</Text>",
     "<TranslatableName text={c.user_name} style={s.commentAuthor} />\n                  <TranslatableName text={c.text} style={s.commentText} inline={false} />"),
    ("<Text style={s.listRowText}>{r.user_name}: {r.comment}</Text>",
     "<TranslatableName text={`${r.user_name}: ${r.comment}`} style={s.listRowText} inline={false} />"),
    ("<Text style={s.luxeRowName} numberOfLines={1}>{name}</Text>",
     "<TranslatableName text={name} style={s.luxeRowName} numberOfLines={1} containerStyle={{ flexShrink: 1 }} />"),
    ("<Text style={s.luxeRowSub} numberOfLines={1}>{subtitle}</Text>",
     "<TranslatableName text={subtitle} style={s.luxeRowSub} numberOfLines={1} />"),
    ("<Text style={s.sheetTitle}>{entity.name}</Text>", "<TranslatableName text={entity.name} style={s.sheetTitle} />"),
    ("<Text style={[s.detailValue, r.color ? { color: r.color } : null]}>{r.value}</Text>",
     "<TranslatableName text={String(r.value ?? '')} style={[s.detailValue, r.color ? { color: r.color } : null] as any} containerStyle={{ flexShrink: 1 }} />"),
    # Hardcoded Arabic inside template strings
    ("`راتب شهري: ${K(entity.salary_monthly)} ${tSync(\" ر.س\", lang)}` : entity.salary_type === 'hourly' ? `أجر بالساعة: ${K(entity.hourly_rate)} ${tSync(\" ر.س\", lang)}` : 'عمولة على التوصيلات'",
     "tf('راتب شهري: {0} ر.س', lang, [K(entity.salary_monthly)]) : entity.salary_type === 'hourly' ? tf('أجر بالساعة: {0} ر.س', lang, [K(entity.hourly_rate)]) : tSync('عمولة على التوصيلات', lang)"),
    ("`راتب شهري: ${K(entity.salary_monthly)} ${tSync(\" ر.س\", lang)}` : `أجر بالساعة: ${K(entity.hourly_rate)} ${tSync(\" ر.س\", lang)}`",
     "tf('راتب شهري: {0} ر.س', lang, [K(entity.salary_monthly)]) : tf('أجر بالساعة: {0} ر.س', lang, [K(entity.hourly_rate)])"),
    ("value: `${K(entity.week_deliveries)} توصيلة · ${K(entity.week_earnings)} ${tSync(\" ر.س\", lang)}`",
     "value: tf('{0} توصيلة · {1} ر.س', lang, [K(entity.week_deliveries), K(entity.week_earnings)])"),
    ("value: `${K(entity.month_deliveries)} توصيلة · ${K(entity.month_earnings)} ${tSync(\" ر.س\", lang)}`",
     "value: tf('{0} توصيلة · {1} ر.س', lang, [K(entity.month_deliveries), K(entity.month_earnings)])"),
    ("value: `${K(entity.year_deliveries)} توصيلة · ${K(entity.year_earnings)} ${tSync(\" ر.س\", lang)}`",
     "value: tf('{0} توصيلة · {1} ر.س', lang, [K(entity.year_deliveries), K(entity.year_earnings)])"),
    ("primaryLabel=\"توصيلة\"", "primaryLabel={tSync('توصيلة', lang)}"),
    ("secondaryValue={`${d.today_deliveries} اليوم`}", "secondaryValue={tf('{0} اليوم', lang, [d.today_deliveries])}"),
    ("subtitle={`${b.city} · ${b.employees_count} موظف · ${b.open_hours}`}",
     "subtitle={`${tSync(b.city || '', lang)} · ${tf('{0} موظف', lang, [b.employees_count])} · ${b.open_hours}`}"),
    ("secondaryValue={`${b.orders_count} طلب`}", "secondaryValue={tf('{0} طلب', lang, [b.orders_count])}"),
    ("subtitle={`رمز: ${m.referral_code} · ${m.clicks} نقرة · ${m.conversions} تحويل`}",
     "subtitle={tf('رمز: {0} · {1} نقرة · {2} تحويل', lang, [m.referral_code, m.clicks, m.conversions])}"),
    ("secondaryValue={`${e.orders_handled} طلب`}", "secondaryValue={tf('{0} طلب', lang, [e.orders_handled])}"),
])

CD = '/app/frontend/src/components/live-preview/CompetitionDetailSheet.tsx'
apply(CD, [
    ("{t.l}</Text>", "{tSync(t.l, curLang())}</Text>"),
    ("label={SOURCE_LABEL[row.source] || row.source}", "label={tSync(SOURCE_LABEL[row.source] || row.source || '', curLang())}"),
    ("{SOURCE_LABEL[p.source] || p.source} ·", "{tSync(SOURCE_LABEL[p.source] || p.source || '', curLang())} ·"),
    ("label={c.city}", "label={tSync(c.city || '', curLang())}"),
    ("<Text style={st.heroTitle} numberOfLines={2}>{comp.title}</Text>", "<TranslatableName text={comp.title} style={st.heroTitle} numberOfLines={2} />"),
    ("<Text style={st.heroTitle}>{comp.title}</Text>", "<TranslatableName text={comp.title} style={st.heroTitle} />"),
    ("<Text style={st.winnerName}>{w.user_name}</Text>", "<TranslatableName text={w.user_name} style={st.winnerName} />"),
    ("<Text style={st.descText}>{comp.description}</Text>", "<TranslatableName text={comp.description} style={st.descText} inline={false} />"),
])

DS = '/app/frontend/src/components/live-preview/DetailSheets.tsx'
apply(DS, [
    ("{t.l}</Text>", "{tSync(t.l, curLang())}</Text>"),
    ("`راتب شهري: ${K(d.salary_monthly)} ر.س`", "tf('راتب شهري: {0} ر.س', curLang(), [K(d.salary_monthly)])"),
    ("`بالساعة: ${K(d.hourly_rate)} ر.س`", "tf('بالساعة: {0} ر.س', curLang(), [K(d.hourly_rate)])"),
    ("`عمولة (${d.commission_type})`", "tf('عمولة ({0})', curLang(), [d.commission_type])"),
    ("title={`تعليقات إيجابية (${d.positive_reviews.length})`}", "title={tf('تعليقات إيجابية ({0})', curLang(), [d.positive_reviews.length])}"),
    ("title={`تعليقات سلبية (${d.negative_reviews.length})`}", "title={tf('تعليقات سلبية ({0})', curLang(), [d.negative_reviews.length])}"),
    ("title={`طاقم الفرع (${b.staff.length})`}", "title={tf('طاقم الفرع ({0})', curLang(), [b.staff.length])}"),
    ("subtitle={`رمز: ${m.referral_code}`}", "subtitle={tf('رمز: {0}', curLang(), [m.referral_code])}"),
    ("secondary={`${K(stats.clicks || 0)} نقرة · ${K(stats.conversions || 0)} تحويل`}",
     "secondary={tf('{0} نقرة · {1} تحويل', curLang(), [K(stats.clicks || 0), K(stats.conversions || 0)])}"),
    ("subtitle={b.city}", "subtitle={tSync(b.city || '', curLang())}"),
    ("{r.user_name}</Text>", "{r.user_name}</Text>"),
])

MS = '/app/frontend/src/components/live-preview/MerchantSocialFeed.tsx'
apply(MS, [
    ("{t.l}</Text>", "{tSync(t.l, curLang())}</Text>"),
    ("{meta.label} ({list.length})</Text>", "{tSync(meta.label || '', curLang())} ({list.length})</Text>"),
    ("{tSync('شارك عبر', lang)} {meta.label} ·", "{tSync('شارك عبر', lang)} {tSync(meta.label || '', lang)} ·"),
    ("<Text style={[s.pollOptionText, isSelected && { fontWeight: '800' }]}>{opt.text}</Text>",
     "<TranslatableName text={opt.text} style={[s.pollOptionText, isSelected && { fontWeight: '800' }] as any} />"),
    ("{!!storyOpen?.text && <Text style={s.storyText}>{storyOpen.text}</Text>}",
     "{!!storyOpen?.text && <TranslatableName text={storyOpen.text} style={s.storyText} inline={false} />}"),
    ("{!!insightsPost.text && <Text style={{ color: LP.TEXT, fontSize: 13, textAlign: 'right' }} numberOfLines={3}>{insightsPost.text}</Text>}",
     "{!!insightsPost.text && <TranslatableName text={insightsPost.text} style={{ color: LP.TEXT, fontSize: 13, textAlign: 'right' }} numberOfLines={3} inline={false} />}"),
    ("<Text style={{ color: LP.TEXT, fontSize: 12, marginTop: 3, textAlign: 'right' }}>{c.text}</Text>",
     "<TranslatableName text={c.text} style={{ color: LP.TEXT, fontSize: 12, marginTop: 3, textAlign: 'right' }} inline={false} />"),
])

AE = '/app/frontend/src/components/live-preview/AlertsAndExport.tsx'
apply(AE, [("<Text style={s.alertTitle} numberOfLines={1}>{a.title}</Text>",
            "<TranslatableName text={a.title} style={s.alertTitle} numberOfLines={1} containerStyle={{ flexShrink: 1 }} />")])
LT = '/app/frontend/src/components/live-preview/LiveToastNotifications.tsx'
apply(LT, [("<Text style={[st.title, { color }]} numberOfLines={1}>{active.title}</Text>",
            "<TranslatableName text={active.title} style={[st.title, { color }] as any} numberOfLines={1} />")])
