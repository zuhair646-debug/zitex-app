B = '/app/frontend/app/'
IMP = "import TranslatableName from '../../src/components/TranslatableName';\n"
E = {
 'merchant/services.tsx': [("<Text style={s.name}>{lang === 'ar' ? (sv.name_ar || sv.name) : (sv.name || sv.name_ar)}</Text>",
                            "<TranslatableName text={lang === 'ar' ? (sv.name_ar || sv.name) : (sv.name || sv.name_ar)} style={s.name} />")],
 'merchant/competitions.tsx': [("<Text style={s.prize}>{c.prize}</Text>", "<TranslatableName text={c.prize} style={s.prize} />")],
 'merchant/returns.tsx': [("<Text style={s.cardTitle} numberOfLines={1}>{r.product_name}</Text>",
                           "<TranslatableName text={r.product_name} style={s.cardTitle} numberOfLines={1} containerStyle={{ flexShrink: 1 }} />")],
 'merchant/service-bookings.tsx': [("<Text style={s.title}>{booking.service_name}</Text>", "<TranslatableName text={booking.service_name} style={s.title} />")],
}
for f, pairs in E.items():
    p = B + f; s = open(p).read()
    for a, b in pairs:
        if a not in s: print('MISS', f); continue
        s = s.replace(a, b)
    if 'components/TranslatableName' not in s:
        s = IMP + s
    open(p, 'w').write(s)
print('ok')
