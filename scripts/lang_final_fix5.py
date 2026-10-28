B = '/app/frontend/app/'
IMP = "import TranslatableName from '../../src/components/TranslatableName';\n"
PERM_AR = "{ pos: 'نقطة البيع', inventory: 'المخزون', invoices: 'الفواتير', orders: 'الطلبات', products: 'المنتجات', customers: 'العملاء', reports: 'التقارير', settings: 'الإعدادات', marketing: 'التسويق', employees: 'الموظفون', delivery: 'التوصيل', services: 'الخدمات', social: 'التواصل الاجتماعي', competitions: 'المسابقات', returns: 'المرتجعات', support: 'الدعم' }"
E = {
 'merchant/services.tsx': [("<Text style={s.desc} numberOfLines={2}>{tSync(sv.desc || '', curLang())}</Text>",
                            "<TranslatableName text={sv.desc || ''} style={s.desc} numberOfLines={2} inline={false} />")],
 'merchant/customers.tsx': [("<Text style={s.email}>{c.email || 'No email'}</Text>", "<Text style={s.email}>{c.email || tSync('لا يوجد بريد', lang)}</Text>")],
 'merchant/employees.tsx': [
   ("<Text style={s.permTagText}>{tSync(perms.labels[p] || p, lang)", "<Text style={s.permTagText}>{tSync(perms.labels[p] || PERM_AR[p] || p, lang)"),
   ("<Text style={[s.permLbl, form.permissions.includes(p) && s.permLblActive]}>{perms.labels[p]}</Text>",
    "<Text style={[s.permLbl, form.permissions.includes(p) && s.permLblActive]}>{tSync(perms.labels[p] || PERM_AR[p] || p, lang)}</Text>"),
 ],
 'merchant/drivers.tsx': [("{d.vehicle_info ? tSync(d.vehicle_info, curLang()) : tSync('لا توجد مركبة', curLang())}",
                           "{d.vehicle_info || tSync('لا توجد مركبة', curLang())}")],
}
for f, pairs in E.items():
    p = B + f; s = open(p).read()
    for a, b in pairs:
        if a not in s: print('MISS', f, a[:50]); continue
        s = s.replace(a, b)
    if f == 'merchant/employees.tsx' and 'const PERM_AR' not in s:
        lines = s.split('\n'); i = max(k for k, l in enumerate(lines) if l.startswith('import '))
        while not lines[i].rstrip().endswith(';'): i += 1
        lines.insert(i + 1, f"\nconst PERM_AR: Record<string, string> = {PERM_AR};"); s = '\n'.join(lines)
    if 'TranslatableName' in s and 'components/TranslatableName' not in s:
        s = IMP + s
    open(p, 'w').write(s)
print('ok')
