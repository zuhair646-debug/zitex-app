import re
B = '/app/frontend/'
p = B + 'app/merchant/product-analytics.tsx'; s = open(p).read()
# wrap whole conditional label expressions once
s = s.replace("{kind === 'service' ? 'الخدمة' : kind === 'competition' ? 'المسابقة' : kind === 'post' ? tSync('المنشور', curLang()) : tSync('المنتج', curLang())}",
              "{tSync(kind === 'service' ? 'الخدمة' : kind === 'competition' ? 'المسابقة' : kind === 'post' ? 'المنشور' : 'المنتج', lang)}")
s = s.replace("{kind === 'service' ? 'حجوزات' : kind === 'competition' ? 'مشاركون' : kind === 'post' ? tSync('إعجاب', curLang()) : tSync('سلة', curLang())}",
              "{tSync(kind === 'service' ? 'حجوزات' : kind === 'competition' ? 'مشاركون' : kind === 'post' ? 'إعجاب' : 'سلة', lang)}")
s = s.replace("{kind === 'service' ? 'مكتمل' : kind === 'competition' ? 'دخل' : kind === 'post' ? tSync('مشاركات', curLang()) : tSync('بيعات', curLang())}",
              "{tSync(kind === 'service' ? 'مكتمل' : kind === 'competition' ? 'دخل' : kind === 'post' ? 'مشاركات' : 'مبيعات', lang)}")
s = s.replace("<Text style={[s.compareName, { color: GOLD }]} numberOfLines={2}>{pName(p, lang)} ← {kind === 'service' ? tSync('هذه الخدمة', lang) : kind === 'competition' ? tSync('هذه المسابقة', lang) : kind === 'post' ? tSync('هذا المنشور', curLang()) : tSync('هذا المنتج', curLang())}</Text>",
              "<View style={{ flex: 1 }}><TranslatableName text={pName(p, lang)} style={[s.compareName, { color: GOLD }] as any} numberOfLines={2} /><Text style={[s.compareName, { color: MUTED, fontSize: 10 }]}>← {tSync(kind === 'service' ? 'هذه الخدمة' : kind === 'competition' ? 'هذه المسابقة' : kind === 'post' ? 'هذا المنشور' : 'هذا المنتج', lang)}</Text></View>")
# hero pill: find the expression ending with ': L.heroPill' and wrap the display
s = re.sub(r"\{(\s*kind === [^{}]*?: L\.heroPill\s*)\}", lambda m: "{tSync(String(" + m.group(1) + "), lang)}", s, count=1)
# user names
s = re.sub(r"<Text style=\{s\.userName\}>\{(\w+)\.user_name\}</Text>", r"<TranslatableName text={\1.user_name} style={s.userName} />", s)
s = re.sub(r"<Text style=\{s\.userName\}>\{(\w+)\.user_name\} <Text", r"<Text style={s.userName}>{tSync(\1.user_name || '', lang)} <Text", s)
s = s.replace("· {b.address}</Text>", "· {tSync(b.address || '', lang)}</Text>")
s = s.replace("<Text style={s.miniPillText}>{b.payment_method}</Text>", "<Text style={s.miniPillText}>{tSync(b.payment_method || '', lang)}</Text>")
s = s.replace("{sp.platform}</Text>", "{tSync(sp.platform || '', lang)}</Text>")
s = s.replace("fontWeight: '900' }}>{r.platform}</Text>", "fontWeight: '900' }}>{tSync(r.platform || '', lang)}</Text>")
s = s.replace("<Text style={s.miniPillText}>{w.city}</Text>", "<Text style={s.miniPillText}>{tSync(w.city || '', lang)}</Text>")
open(p, 'w').write(s)

f = B + 'src/components/live-preview/DetailSheets.tsx'; s = open(f).read()
s = s.replace("const label = n.type === 'positive' ? '👍 إيجابي' : n.type === 'warning' ? '⚠️ تحذير' : n.type === 'improvement' ? tSync('📈 يحتاج تحسين', curLang()) : tSync('💬 عام', curLang());",
              "const label = tSync(n.type === 'positive' ? '👍 إيجابي' : n.type === 'warning' ? '⚠️ تحذير' : n.type === 'improvement' ? '📈 يحتاج تحسين' : '💬 عام', curLang());")
s = s.replace("<Text style={{ color: LP.MUTED, fontSize: 10, marginStart: 4 }}>{n.supervisor_name}</Text>",
              "<TranslatableName text={n.supervisor_name} style={{ color: LP.MUTED, fontSize: 10, marginStart: 4 }} />")
s = s.replace("tSync('العنوان', curLang())", "tSync('عنوان الفرع', curLang())")
open(f, 'w').write(s)

f = B + 'src/components/live-preview/MerchantSocialFeed.tsx'; s = open(f).read()
for v in ['u', 'sh']:
    s = s.replace("<Text style={s.userName}>{%s.user_name || tSync('مستخدم', curLang())}</Text>" % v,
                  "<TranslatableName text={%s.user_name || tSync('مستخدم', curLang())} style={s.userName} />" % v)
open(f, 'w').write(s)
print('ok')
