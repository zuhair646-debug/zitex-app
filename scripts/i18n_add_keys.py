"""Add missing static keys (all 20 langs) via LLM, using set_static from i18n_quality_fix."""
import asyncio
import json
import sys

sys.argv = ['x']
import i18n_quality_fix as Q  # noqa: E402
from emergentintegrations.llm.chat import UserMessage  # noqa: E402

NEW = {
    'gb.subtitle': ('اشترِ مع الآخرين واحصل على سعر أقل', 'Buy together with others and get a lower price'),
    'gb.activated': ('🎉 اكتمل العدد! تم تفعيل السعر الجماعي', '🎉 Group complete! The group price is now active'),
    'gb.joined': ('انضممت للمجموعة', 'Joined'),
    'gb.participants': ('مشارك', 'participants'),
    'comp.daysLeft': ('يوم متبقٍ', 'days left'),
    'points.value': ('قيمة النقاط', 'Points value'),
    'points.earnRate': ('اكسب نقطة واحدة عن كل 1 ر.س تنفقه', 'Earn 1 point for every 1 SAR you spend'),
    'points.history': ('سجل النقاط', 'Points history'),
}

src = open(Q.I18N, encoding='utf-8').read()
for k, (ar, en) in NEW.items():
    src = Q.set_static(src, 'ar', k, ar)
    src = Q.set_static(src, 'en', k, en)


async def one(lang, sem):
    items = {k: {'ar': ar, 'en': en} for k, (ar, en) in NEW.items()}
    async with sem:
        c = Q.chat(f'newkeys-{lang}', f"You are a native {Q.NAMES[lang]} UI localizer.\n{Q.RULES}\n"
                   "Translate each item (key → {ar, en}). Return ONLY a JSON object {key: translation}.")
        return lang, Q.parse_json(await c.send_message(UserMessage(text=json.dumps(items, ensure_ascii=False))))


async def main():
    global src
    sem = asyncio.Semaphore(10)
    for lang, out in await asyncio.gather(*[one(l, sem) for l in Q.LANGS if l != 'en']):
        for k, v in out.items():
            if k in NEW and isinstance(v, str) and Q.valid(lang, NEW[k][0], v):
                src = Q.set_static(src, lang, k, v)
        print(lang, len(out), end=' | ')
    open(Q.I18N, 'w', encoding='utf-8').write(src)


asyncio.run(main())
