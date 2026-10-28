import re
B = '/app/frontend/'

def add_import(s, rel):
    if 'components/TranslatableName' in s:
        return s
    lines = s.split('\n'); i = max(k for k, l in enumerate(lines) if l.startswith('import '))
    while not lines[i].rstrip().endswith(';'):
        i += 1
    lines.insert(i + 1, f"import TranslatableName from '{rel}';")
    return '\n'.join(lines)

def edit(f, pairs, rel=None):
    p = B + f; s = open(p).read()
    for a, b in pairs:
        if a not in s:
            print('MISS', f, a[:70]); continue
        s = s.replace(a, b)
    if rel: s = add_import(s, rel)
    open(p, 'w').write(s)

# 1) noToggle prop: same auto-translation, no arrow (for chips / labels)
p = B + 'src/components/TranslatableName.tsx'; s = open(p).read()
s = s.replace("  iconOnly?: boolean;\n", "  iconOnly?: boolean;\n  /** Translate automatically but never show the arrow (chips, small labels). */\n  noToggle?: boolean;\n", 1)
s = s.replace("const hideIcon = tooShort ||", "const hideIcon = !!noToggle || tooShort ||", 1)
open(p, 'w').write(s)
print('noToggle destructure present:', 'noToggle' in s.split('const hideIcon')[0].split('export default function')[-1])

R1 = '../src/components/TranslatableName'
R2 = '../../src/components/TranslatableName'
edit('app/merchant/index.tsx', [
    ("<TranslatableName text={user?.name || t('mh.merchantFallback')} style={styles.merchantName} numberOfLines={1} iconSize={12} />",
     "{user?.name ? <TranslatableName text={user.name} style={styles.merchantName} numberOfLines={1} iconSize={12} /> : <Text style={styles.merchantName} numberOfLines={1}>{t('mh.merchantFallback')}</Text>}")])
edit('app/merchant/competitions.tsx', [("<Text style={s.title}>Competitions ({comps.length})</Text>",
     "<Text style={s.title}>{tf('المسابقات ({0})', lang, [comps.length])}</Text>")])
edit('app/service/[id].tsx', [
    ("<Text style={s.name}>{(lang === 'ar' ? (svc.name_ar || svc.name) : (svc.name || svc.name_ar))}</Text>",
     "<TranslatableName text={(lang === 'ar' ? (svc.name_ar || svc.name) : (svc.name || svc.name_ar))} style={s.name} />"),
    ("{!!svc.desc && <Text style={s.desc}>{tSync(svc.desc || '', curLang())}</Text>}",
     "{!!svc.desc && <TranslatableName text={svc.desc} style={s.desc} inline={false} />}"),
    ("<Text style={s.metaText}>{svc.turnaround}</Text>", "<TranslatableName text={String(svc.turnaround || '')} style={s.metaText} noToggle />"),
    ("<Text style={s.aboutBody}>{svc.long_description}</Text>", "<TranslatableName text={svc.long_description} style={s.aboutBody} inline={false} />"),
], R2)
edit('app/wallet.tsx', [("<Text style={s.txnDesc}>{t.description}</Text>", "<TranslatableName text={t.description} style={s.txnDesc} />")], R1)
edit('app/warranties.tsx', [("<Text style={s.productName}>{w.product_name}</Text>", "<TranslatableName text={w.product_name} style={s.productName} />"),
                            ("<Text style={s.serviceName}>{w.service_name}</Text>", "<TranslatableName text={w.service_name} style={s.serviceName} />")], R1)
edit('app/my-returns.tsx', [("<Text style={s.cardTitle} numberOfLines={1}>{r.product_name}</Text>",
                             "<TranslatableName text={r.product_name} style={s.cardTitle} numberOfLines={1} containerStyle={{ flexShrink: 1 }} />")], R1)
edit('app/addresses.tsx', [("<Text style={s.addrLabel}>{a.label}</Text>", "<TranslatableName text={a.label} style={s.addrLabel} />"),
                           ("<Text style={s.addrText}>{a.address}</Text>", "<TranslatableName text={a.address} style={s.addrText} inline={false} />")], R1)
edit('app/merchant/banners.tsx', [
    ("<Text style={s.bTitle}>{b.title_ar || b.title_en || 'Banner'}</Text>",
     "<TranslatableName text={(lang === 'ar' ? (b.title_ar || b.title_en) : (b.title_en || b.title_ar)) || tSync('بانر', lang)} style={s.bTitle} />"),
    ("{tSync('البانرات (', lang)}{banners.length})</Text>", "{tf('البانرات ({0})', lang, [banners.length])}</Text>"),
    ("<Text style={s.label}>Image URL *</Text>", "<Text style={s.label}>{tSync('رابط الصورة *', lang)}</Text>"),
    ("<Text style={s.label}>Title (Arabic)</Text>", "<Text style={s.label}>{tSync('العنوان (عربي)', lang)}</Text>"),
    ("<Text style={s.label}>Title (English)</Text>", "<Text style={s.label}>{tSync('العنوان (إنجليزي)', lang)}</Text>"),
], R2)
edit('app/merchant/product-form.tsx', [
    ("<Text style={[s.chipText, active && s.chipTextActive]}>{curLang() === 'ar' ? (c.name_ar || c.name_en) : (c.name_en || tSync(c.name_ar || '', curLang()))}</Text>",
     "<TranslatableName text={(curLang() === 'ar' ? (c.name_ar || c.name_en) : (c.name_en || c.name_ar)) || ''} style={[s.chipText, active && s.chipTextActive] as any} noToggle />"),
], R2)
edit('app/merchant/product-form.tsx', [
    ("<Text style={[s.chipText, active && s.chipTextActive]}>{curLang() === 'ar' ? (b.name_ar || b.name_en) : (b.name_en || tSync(b.name_ar || '', curLang()))}</Text>",
     "<TranslatableName text={(curLang() === 'ar' ? (b.name_ar || b.name_en) : (b.name_en || b.name_ar)) || ''} style={[s.chipText, active && s.chipTextActive] as any} noToggle />"),
])
for f in ['app/merchant/competitions.tsx', 'app/merchant/banners.tsx']:
    p = B + f; s = open(p).read(); s = s.replace("import { tSync } from '../../src/useAutoT';", "import { tSync, tf } from '../../src/useAutoT';"); open(p, 'w').write(s)
print('done')
