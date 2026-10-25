"""Fill any remaining problem entries in i18n-generated.json with small, simple batches."""
import asyncio
import json
import sys

sys.argv = ['x']
import i18n_quality_fix as Q  # noqa: E402
from emergentintegrations.llm.chat import UserMessage  # noqa: E402

G = json.load(open(Q.GEN, encoding='utf-8'))


async def fill(lang, keys, sem):
    fixed = 0
    for i in range(0, len(keys), 15):
        batch = keys[i:i + 15]
        items = [{'id': str(j), 'ar': k, 'current': G[k].get(lang, ''), 'flag': '; '.join(Q.problems(lang, k, G[k].get(lang)))}
                 for j, k in enumerate(batch)]
        async with sem:
            try:
                c = Q.chat(f'fill-{lang}-{i}', f"You are a senior native {Q.NAMES[lang]} localization reviewer.\n{Q.RULES}\n"
                           "Return ONLY a JSON object {id: corrected_translation} for EVERY item.")
                out = Q.parse_json(await c.send_message(UserMessage(text=json.dumps(items, ensure_ascii=False))))
            except Exception as e:  # noqa: BLE001
                print('err', lang, e)
                continue
        for j, v in out.items():
            if not str(j).isdigit() or int(j) >= len(batch) or not isinstance(v, str):
                continue
            k = batch[int(j)]
            v = v.replace('ر.س', 'SAR')
            if Q.valid(lang, k, v):
                G[k][lang] = v
                fixed += 1
    return lang, fixed


async def main():
    sem = asyncio.Semaphore(8)
    jobs = []
    for lang in Q.LANGS:
        keys = [k for k, t in G.items() if Q.problems(lang, k, t.get(lang))
                and not any(b in (t.get(lang) or '') for b in ('Tamara', 'iPhone', 'Telegram', 'challenge'))]
        if keys:
            jobs.append(fill(lang, keys, sem))
    for lang, n in await asyncio.gather(*jobs):
        print(lang, 'fixed', n)
    json.dump(G, open(Q.GEN, 'w', encoding='utf-8'), ensure_ascii=False, indent=2, sort_keys=True)


asyncio.run(main())
