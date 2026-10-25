"""Re-translate ambiguous short labels with an explicit meaning hint (all 19 languages)."""
import asyncio
import json
import sys

sys.argv = ['x']
import i18n_quality_fix as Q  # noqa: E402
from emergentintegrations.llm.chat import UserMessage  # noqa: E402

HINTS = {
    'سحب عام': 'competition type "General prize draw" (lottery), NOT withdrawal (zh 普通抽奖)',
    'عامة': 'competition type "General" (zh 通用)',
    'إضافة فرع': '"Add branch" (store branch; zh 添加分店)',
    'عمليات المشاركة': 'post tab "Shares" (times the post was shared; de Geteilt)',
    '🔗 المشاركات عبر الروابط ({0})': '"🔗 Link shares ({0})"',
}

G = json.load(open(Q.GEN, encoding='utf-8'))
for k in HINTS:
    G.setdefault(k, {})


async def one(lang, sem):
    items = [{'id': str(i), 'ar': k, 'meaning': h} for i, (k, h) in enumerate(HINTS.items())]
    async with sem:
        c = Q.chat(f'hint-{lang}', f"You are a senior native {Q.NAMES[lang]} UI localizer.\n{Q.RULES}\n"
                   "Translate each item according to its 'meaning' (short UI label, natural app wording). "
                   "Return ONLY a JSON object {id: translation}.")
        out = Q.parse_json(await c.send_message(UserMessage(text=json.dumps(items, ensure_ascii=False))))
    keys = list(HINTS)
    n = 0
    for i, v in out.items():
        if str(i).isdigit() and int(i) < len(keys) and isinstance(v, str) and Q.valid(lang, keys[int(i)], v):
            G[keys[int(i)]][lang] = v
            n += 1
    return lang, n


async def main():
    sem = asyncio.Semaphore(10)
    for lang, n in await asyncio.gather(*[one(l, sem) for l in Q.LANGS]):
        print(lang, n, end=' | ')
    json.dump(G, open(Q.GEN, 'w', encoding='utf-8'), ensure_ascii=False, indent=2, sort_keys=True)


asyncio.run(main())
