B = '/app/frontend/app/merchant/'
IMP = "import TranslatableName from '../../src/components/TranslatableName';\n"
E = {
 'loyalty-programs.tsx': [
   ("""<Text style={[s.typePillText, { color: p.brand_color }]}>{
                        p.type === 'telco' ? 'اتصالات' :""", """<Text style={[s.typePillText, { color: p.brand_color }]}>{tSync(
                        p.type === 'telco' ? 'اتصالات' :"""),
   ("""                        p.type === 'internal' ? 'داخلي' : p.type
                      }</Text>""", """                        p.type === 'internal' ? 'داخلي' : (p.type || ''), lang)
                      }</Text>"""),
   ("<TX style={s.cardTitle}>{p.name_ar || ''}</TX>", "<TranslatableName text={p.name_ar || ''} style={s.cardTitle} />"),
   ("<TX style={s.cardSub} numberOfLines={2}>{p.description_ar || ''}</TX>", "<TranslatableName text={p.description_ar || ''} style={s.cardSub} numberOfLines={2} inline={false} />"),
 ],
 'team.tsx': [("<Text style={s.meta}>{e.job_title || e.department || tSync('موظف', curLang())} • {e.phone}</Text>",
               "<Text style={s.meta}>{tSync(e.job_title || e.department || 'موظف', curLang())} • {e.phone}</Text>")],
 'employees.tsx': [
   ("<Text style={s.empName}>{e.name} {!e.active && <TX style={s.inactive}>(معطّل)</TX>}</Text>",
    "<View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><TranslatableName text={e.name} style={s.empName} />{!e.active && <TX style={s.inactive}> (معطّل)</TX>}</View>"),
   ("<Text style={[s.permLbl, active && s.permLblActive]}>{b.name}{b.is_main ? ' ⭐' : ''}</Text>",
    "<Text style={[s.permLbl, active && s.permLblActive]}>{tSync(b.name || '', lang)}{b.is_main ? ' ⭐' : ''}</Text>"),
 ],
}
for f, pairs in E.items():
    p = B + f; s = open(p).read()
    for a, b in pairs:
        if a not in s: print('MISS', f, a[:50]); continue
        s = s.replace(a, b)
    if 'components/TranslatableName' not in s and 'TranslatableName' in s:
        s = IMP + s
    open(p, 'w').write(s)
print('ok')
