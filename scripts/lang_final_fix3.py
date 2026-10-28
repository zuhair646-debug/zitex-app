B = '/app/frontend/app/merchant/'
IMP = "import TranslatableName from '../../src/components/TranslatableName';\n"
E = {
 'competitions.tsx': [
   ("{ap === 'auto_approved' ? 'PUBLIC' : ap.toUpperCase()}", "{tSync(ap === 'auto_approved' ? 'عامة' : ap === 'pending' ? 'بانتظار الموافقة' : ap === 'rejected' ? 'مرفوضة' : 'معتمدة', lang)}"),
   ("<Text style={s.joined}>{c.joined_count || 0} joined</Text>", "<Text style={s.joined}>{tf('{0} مشارك', lang, [c.joined_count || 0])}</Text>"),
 ],
 'services-catalog.tsx': [
   ("<TX style={s.rowTitle}>{m.name_ar || ''}</TX>", "<TranslatableName text={m.name_ar || ''} style={s.rowTitle} noToggle />"),
   ("<TX style={s.rowDesc} numberOfLines={2}>{m.description_ar || ''}</TX>", "<TranslatableName text={m.description_ar || ''} style={s.rowDesc} numberOfLines={2} noToggle inline={false} />"),
 ],
 'roles.tsx': [
   ("<TX style={s.name}>{r.name || ''}</TX>", "<TranslatableName text={r.name || ''} style={s.name} />"),
   ("{!!r.description && <TX style={s.desc} numberOfLines={2}>{r.description || ''}</TX>}", "{!!r.description && <TranslatableName text={r.description || ''} style={s.desc} numberOfLines={2} inline={false} />}"),
 ],
 'drivers.tsx': [
   ("<Text style={s.phone}>{d.phone} • {d.vehicle_info || tSync('لا توجد مركبة', curLang())}</Text>",
    "<Text style={s.phone}>{d.phone} • {d.vehicle_info ? tSync(d.vehicle_info, curLang()) : tSync('لا توجد مركبة', curLang())}</Text>"),
 ],
 'returns.tsx': [
   ("<Text style={s.cardSub}>{r.customer_name} · {r.customer_phone}</Text>",
    "<View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><TranslatableName text={r.customer_name} style={s.cardSub} /><Text style={s.cardSub}> · {r.customer_phone}</Text></View>"),
   ("<Text style={s.reasonText} numberOfLines={2}>{tSync(r.reason_label_ar || '', lang)} — {r.reason_text}</Text>",
    "<View><Text style={s.reasonText} numberOfLines={1}>{tSync(r.reason_label_ar || '', lang)}</Text>{!!r.reason_text && <TranslatableName text={r.reason_text} style={s.reasonText} numberOfLines={2} inline={false} />}</View>"),
 ],
}
for f, pairs in E.items():
    p = B + f; s = open(p).read()
    for a, b in pairs:
        if a not in s: print('MISS', f, a[:50]); continue
        s = s.replace(a, b)
    if 'components/TranslatableName' not in s:
        s = IMP + s
    open(p, 'w').write(s)
print('ok')
