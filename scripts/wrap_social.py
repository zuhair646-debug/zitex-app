import re
B = '/app/frontend/'
TN = "import TranslatableName from '%s';\n"

def add_import(s, rel):
    if 'components/TranslatableName' in s:
        return s
    lines = s.split('\n'); i = max(k for k, l in enumerate(lines) if l.startswith('import '))
    while not lines[i].rstrip().endswith(';'):
        i += 1
    lines.insert(i + 1, TN % rel.strip())
    return '\n'.join(lines)

p = B + 'app/(tabs)/social.tsx'; s = open(p).read()
R = [
 ('{!!post.text && <TranslateButton text={post.text} sourceLang="ar" textStyle={s.postText} />}',
  '{!!post.text && <TranslatableName text={post.text} style={s.postText} inline={false} />}'),
 ("<Text style={[s.pollOptionText, isSelected && { fontWeight: '800' }]}>{opt.text}</Text>",
  "<TranslatableName text={opt.text} style={[s.pollOptionText, isSelected && { fontWeight: '800' }] as any} />"),
 ("{!!storyOpen?.text && <Text style={s.storyText}>{storyOpen.text}</Text>}",
  "{!!storyOpen?.text && <TranslatableName text={storyOpen.text} style={s.storyText} inline={false} />}"),
 ("<Text style={s.cmtName}>{c.user_name} {c.is_merchant_reply && <TX style={s.merchantTag}>✓ التاجر</TX>}</Text>",
  "<View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><TranslatableName text={c.user_name} style={s.cmtName} />{c.is_merchant_reply && <TX style={s.merchantTag}> ✓ التاجر</TX>}</View>"),
 ("<Text style={s.cmtText}>{c.text}</Text>", "<TranslatableName text={c.text} style={s.cmtText} inline={false} />"),
]
for a, b in R:
    assert a in s, a[:60]; s = s.replace(a, b)
s = add_import(s, '../../src/components/TranslatableName')
if 'TranslateButton' in s and s.count('TranslateButton') == 1:
    s = re.sub(r"import TranslateButton from [^\n]+\n", '', s)
open(p, 'w').write(s)

p = B + 'app/merchant/social.tsx'; s = open(p).read()
R = [
 ("{!!p.text && <Text style={s.text}>{p.text || p.content}</Text>}", "{!!p.text && <TranslatableName text={p.text || p.content} style={s.text} inline={false} />}"),
 ("<Text style={s.pollText}>{o.text}</Text>", "<TranslatableName text={o.text} style={s.pollText} />"),
 ("<Text style={s.cmtName}>{c.user_name} {c.is_merchant_reply && <TX style={s.youTag}> (أنت)</TX>}</Text>",
  "<View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><TranslatableName text={c.user_name} style={s.cmtName} />{c.is_merchant_reply && <TX style={s.youTag}> (أنت)</TX>}</View>"),
 ("<Text style={s.cmtText} numberOfLines={3}>{c.text}</Text>", "<TranslatableName text={c.text} style={s.cmtText} numberOfLines={3} inline={false} />"),
 ("<Text style={s.cmtName}>{c.user_name} {c.is_merchant_reply && <TX style={s.youTag}>✓ التاجر</TX>}</Text>",
  "<View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><TranslatableName text={c.user_name} style={s.cmtName} />{c.is_merchant_reply && <TX style={s.youTag}> ✓ التاجر</TX>}</View>"),
 ("<Text style={s.cmtText}>{c.text}</Text>", "<TranslatableName text={c.text} style={s.cmtText} inline={false} />"),
 ("{tSync('الرد على:', lang)} {replyParent.user_name}</Text>", "{tSync('الرد على:', lang)} {tSync(replyParent.user_name || '', lang)}</Text>"),
]
for a, b in R:
    assert a in s, a[:60]; s = s.replace(a, b)
s = add_import(s, '../../src/components/TranslatableName')
open(p, 'w').write(s)
print('ok')
