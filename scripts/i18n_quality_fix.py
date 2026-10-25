"""
i18n quality fix — June 2026.

Modes:
  static   : review + correct the static dictionary in src/i18n.tsx (19 langs)
  generated: clean + review + correct src/i18n-generated.json (19 langs)
  new      : translate source strings used in code but missing from the JSON

Uses Claude (Emergent LLM key) with strict rules, validates every answer
(script, placeholders, currency) and logs to /tmp/i18n_fix_<mode>.log.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

FRONT = '/app/frontend'
I18N = f'{FRONT}/src/i18n.tsx'
GEN = f'{FRONT}/src/i18n-generated.json'
KEY = os.environ['EMERGENT_LLM_KEY']
MODEL = ('anthropic', 'claude-sonnet-4-6')
LANGS = ['en', 'ur', 'fa', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'tr', 'zh', 'ja', 'ko', 'hi', 'bn', 'id', 'ms', 'th']
NAMES = {
    'en': 'English', 'ur': 'Urdu', 'fa': 'Persian (Farsi)', 'he': 'Hebrew', 'es': 'Spanish', 'fr': 'French',
    'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'tr': 'Turkish',
    'zh': 'Simplified Chinese', 'ja': 'Japanese', 'ko': 'Korean', 'hi': 'Hindi (Devanagari script)',
    'bn': 'Bengali (Bengali script)', 'id': 'Indonesian', 'ms': 'Malay', 'th': 'Thai',
}
AR = re.compile(r'[\u0600-\u06FF]')
SCRIPTS = {
    'arab': r'[\u0600-\u06FF]', 'heb': r'[\u0590-\u05FF]', 'cyr': r'[\u0400-\u04FF]',
    'cjk': r'[\u4E00-\u9FFF]', 'kana': r'[\u3040-\u30FF]', 'hangul': r'[\uAC00-\uD7AF]',
    'deva': r'[\u0900-\u0963\u0966-\u097F]', 'beng': r'[\u0980-\u09FF]', 'thai': r'[\u0E00-\u0E7F]',
    'geo': r'[\u10A0-\u10FF]',
}
ALLOWED = {
    'en': [], 'es': [], 'fr': [], 'de': [], 'it': [], 'pt': [], 'tr': [], 'id': [], 'ms': [],
    'ur': ['arab'], 'fa': ['arab'], 'he': ['heb'], 'ru': ['cyr'], 'zh': ['cjk'], 'ja': ['cjk', 'kana'],
    'ko': ['hangul', 'cjk'], 'hi': ['deva'], 'bn': ['beng'], 'th': ['thai'],
}
NATIVE = {'ur': 'arab', 'fa': 'arab', 'he': 'heb', 'ru': 'cyr', 'zh': 'cjk', 'ja': 'kana|cjk', 'ko': 'hangul',
          'hi': 'deva', 'bn': 'beng', 'th': 'thai'}
KNOWN = {
    'pf.walletTotal': 'must mean MONEY balance of a wallet (not equilibrium)',
    'cc.status.open': 'status adjective "open (accepting entries)", not a verb',
    'cc.status.ended': 'status adjective "ended"',
    'pf.modeLight': 'means light THEME (light mode), not a lamp/brightness',
    'pf.modeDark': 'means dark THEME',
    'cs.promoTag': 'must be translated (expert repair)',
    'mh.hello': 'friendly greeting "Hello"',
    'a.winners': 'contest winners',
    'merchant.pickupBranch': 'pickup from branch (collect order in store)',
    'mo.orders.pickup': 'pickup from branch (collect order in store)',
}
PH = re.compile(r'\{[a-zA-Z_0-9]+\}')

RULES = """STRICT RULES:
- App: "Zenrex Store", a Saudi electronics/phones store app (customers, merchant dashboard, POS, delivery, contests).
- Write ONLY in the target language and its normal script. Never leave Arabic words. Never mix in another script
  (e.g. no Devanagari letters inside Bengali, no Urdu in Hindi, no Japanese in Hebrew).
- Keep placeholders like {n}, {name}, {price} EXACTLY as-is. Keep emoji and numbers.
- Saudi riyal currency "ر.س" / "ريال" => write "SAR".
- Keep brand/product names in Latin: Zenrex Store, iPhone, Samsung, POS, SMSA, Aramex, WhatsApp, Instagram, TikTok, Snapchat, X, Tabby, Tamara, Qitaf.
  Saudi city names: use the standard spelling in the target language.
- "الرصيد"/"Balance" means MONEY balance (e.g. es Saldo, de Guthaben, fr Solde, ja 残高, ko 잔액, ur بیلنس).
- Status words (open, pending, completed...) are STATUS adjectives, not commands.
- Weekday labels (سبت أحد اثن ثلا أرب خمي جمع / اثنين ثلاثاء ...) are DAYS OF THE WEEK: translate as the day name
  (short form if the source is short). '12ص' = 12 AM, '12ظ' = 12 PM (noon). 'ث' = seconds, 'د' = minutes, 'س' = hours.
- Use natural, standard UI wording used by big apps (Amazon, Noon) in that language; consistent terminology.
- A real line break must stay a real line break."""


def chat(session: str, system: str) -> LlmChat:
    return LlmChat(api_key=KEY, session_id=session, system_message=system).with_model(*MODEL)


def parse_json(txt: str) -> dict:
    txt = (txt or '').strip()
    m = re.search(r'\{.*\}', txt, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        # Tolerate unescaped quotes inside values: parse line by line.
        out = {}
        for line in m.group(0).split('\n'):
            lm = re.match(r'\s*"([^"]+)"\s*:\s*"(.*)"\s*,?\s*$', line)
            if lm:
                out[lm.group(1)] = lm.group(2).replace('\\n', '\n')
        return out


def bad_script(lang: str, v: str) -> list[str]:
    out = []
    for name, rx in SCRIPTS.items():
        if re.search(rx, v) and name not in ALLOWED[lang]:
            out.append(name)
    return out


def problems(lang: str, src: str, v: str | None, en: str | None = None) -> list[str]:
    if not v or not v.strip():
        return ['missing']
    p = []
    bs = bad_script(lang, v)
    if bs:
        p.append('wrong script: ' + ','.join(bs))
    if lang in ('ur', 'fa') and v.strip() == src.strip() and len(src) > 1:
        p.append('identical to Arabic source (must be real ' + NAMES[lang] + ')')
    if lang in NATIVE and not re.search('|'.join(SCRIPTS[s] for s in NATIVE[lang].split('|')), v) \
            and re.search(r'[A-Za-z]{4,}', v) and not re.fullmatch(r'[\sA-Za-z0-9.\-/+&|·•()]*(Zenrex Store|POS|SAR|iPhone|Samsung|WhatsApp|Instagram|TikTok|Snapchat|SMSA|X|Twitter)[\sA-Za-z0-9.\-/+&|·•()]*', v):
        p.append('English left instead of ' + NAMES[lang])
    if sorted(PH.findall(src)) != sorted(PH.findall(v)):
        p.append('placeholders changed')
    if '\\n' in v:
        p.append('literal backslash-n')
    return p


def valid(lang: str, src: str, v: str) -> bool:
    if not isinstance(v, str) or not v.strip():
        return False
    if bad_script(lang, v):
        return False
    if sorted(PH.findall(src)) != sorted(PH.findall(v)):
        return False
    return True


async def review_batch(lang: str, items: list[dict], tag: str, sem: asyncio.Semaphore, log) -> dict:
    """items: [{id, ar, en?, current, flag?}] → {id: corrected}"""
    system = (f"You are a senior native {NAMES[lang]} localization reviewer.\n{RULES}\n"
              "You receive JSON items: id, ar (Arabic source = meaning of truth), en (English reference, optional), "
              "current (current translation), flag (detected problem, optional).\n"
              "Return ONLY a JSON object {id: corrected_translation} containing EVERY item whose current value is wrong, "
              "inaccurate, gibberish, awkward machine translation, untranslated, wrong script, or inconsistent. "
              "Items with a flag MUST be returned corrected. Omit items that are already correct. No commentary.")
    payload = json.dumps(items, ensure_ascii=False)
    for attempt in range(3):
        async with sem:
            try:
                resp = await asyncio.wait_for(chat(f'{tag}-{lang}-{items[0]["id"]}-{attempt}', system).send_message(UserMessage(text=payload)), 240)
                out = parse_json(resp)
                log(f'  [{lang}] batch {items[0]["id"]} → {len(out)} fixes')
                if out or not any(i.get('flag') for i in items):
                    return out
            except Exception as e:  # noqa: BLE001
                log(f'  [{lang}] batch err {e}')
        await asyncio.sleep(2)
    return {}


# ───────────────────────── static dictionary ─────────────────────────
def load_static() -> tuple[str, dict]:
    src = open(I18N, encoding='utf-8').read()
    data = json.loads(os.popen(
        "node -e \"const fs=require('fs');const s=fs.readFileSync('" + I18N + "','utf8');"
        "const a=s.indexOf('const T: Record<Lang, Record<string, string>> = ')+'const T: Record<Lang, Record<string, string>> = '.length;"
        "const b=s.indexOf('\\ntype Ctx');let body=s.slice(a,b).trim().replace(/;\\s*$/,'');"
        "process.stdout.write(JSON.stringify(eval('('+body+')')))\"").read())
    return src, data


def block_range(src: str, lang: str) -> tuple[int, int]:
    m = re.search(rf'\n  {lang}: \{{\n', src)
    start = m.end()
    end = src.index('\n  },', start)
    return start, end


def js_quote(v: str) -> str:
    return "'" + v.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"


def set_static(src: str, lang: str, key: str, value: str) -> str:
    a, b = block_range(src, lang)
    block = src[a:b]
    rx = re.compile(r"(['\"])" + re.escape(key) + r"\1(\s*:\s*)(['\"])((?:\\.|(?!\3).)*)\3")
    if rx.search(block):
        block = rx.sub(lambda m: f"'{key}'{m.group(2)}{js_quote(value)}", block, count=1)
    else:
        block = block.rstrip() + f"\n    '{key}': {js_quote(value)},"
    return src[:a] + block + src[b:]


async def run_static(log):
    src, T = load_static()
    log(f'loaded static: {len(T)} langs')
    # 1) literal "\\n" → real newline escape
    src = src.replace('\\\\n', '\\n')
    sem = asyncio.Semaphore(8)
    keys = list(T['ar'].keys())
    tasks = []
    for lang in LANGS:
        items = []
        for k in keys:
            cur = T[lang].get(k, '')
            pr = [] if lang == 'en' else problems(lang, T['ar'][k], cur.replace('\\n', '\n'), T['en'].get(k))
            if lang != 'en' and cur and cur == T['en'].get(k) and re.search(r'[A-Za-z]{4,}', cur) and 'Zenrex' not in cur:
                pr.append('same as English — use the native word unless English is the standard usage')
            if lang != 'en' and k in KNOWN:
                pr.append(KNOWN[k])
            it = {'id': k, 'ar': T['ar'][k], 'en': T['en'].get(k, ''), 'current': cur.replace('\\n', '\n')}
            if pr:
                it['flag'] = '; '.join(pr)
            items.append(it)
        for i in range(0, len(items), 60):
            tasks.append((lang, items[i:i + 60]))
    results = await asyncio.gather(*[review_batch(l, b, 'st', sem, log) for l, b in tasks])
    changed = 0
    for (lang, batch), res in zip(tasks, results):
        by_id = {i['id']: i for i in batch}
        for k, v in res.items():
            if k not in by_id or not isinstance(v, str):
                continue
            if not valid(lang, by_id[k]['ar'], v):
                log(f'  [{lang}] REJECT {k}: {v}')
                continue
            if v != by_id[k]['current']:
                log(f'  [{lang}] {k}: {by_id[k]["current"]!r} → {v!r}')
                src = set_static(src, lang, k, v)
                changed += 1
    open(I18N, 'w', encoding='utf-8').write(src)
    log(f'STATIC DONE — {changed} corrections')


# ───────────────────────── generated JSON ─────────────────────────
CODE_RX = re.compile(r'\n|\$\{|=>|\{ text|tSync\(|value=|label=|</?[A-Za-z]|\);|`')


def source_corpus() -> str:
    parts = []
    for base in (f'{FRONT}/app', f'{FRONT}/src'):
        for root, _d, files in os.walk(base):
            for f in files:
                if f.endswith(('.tsx', '.ts')) and f != 'i18n.tsx':
                    parts.append(open(os.path.join(root, f), encoding='utf-8').read())
    return '\n'.join(parts)


def used_strings(corpus: str) -> set[str]:
    out = set()
    pats = [r"tSync\(\s*'((?:\\.|[^'\\])*)'", r'tSync\(\s*"((?:\\.|[^"\\])*)"', r'<TX[^>]*>([^<{]+)</TX>',
            r"useAutoT\(\s*'([^']+)'", r"tf\(\s*'((?:\\.|[^'\\])*)'"]
    for p in pats:
        for m in re.findall(p, corpus):
            s = m.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').strip()
            if AR.search(s):
                out.add(s)
    return out


async def run_generated(log, only_new=False):
    G = json.load(open(GEN, encoding='utf-8'))
    corpus = source_corpus()
    if not only_new:
        before = len(G)
        for k in list(G):
            if CODE_RX.search(k) or (k not in corpus):
                del G[k]
        log(f'cleaned junk/unused keys: {before} → {len(G)}')
    for s in used_strings(corpus):
        G.setdefault(s, {})
    # currency normalisation
    for k, tr in G.items():
        for lang, v in list(tr.items()):
            if isinstance(v, str):
                tr[lang] = v.replace('ر.س', 'SAR').replace('ريال', 'SAR')
    sem = asyncio.Semaphore(10)
    tasks = []
    for lang in LANGS:
        items = []
        for k in sorted(G):
            cur = G[k].get(lang, '')
            pr = problems(lang, k, cur)
            if only_new and not pr:
                continue
            it = {'id': str(len(items)), 'ar': k, 'current': cur, '_k': k}
            if lang != 'en' and G[k].get('en'):
                it['en'] = G[k]['en']
            if pr:
                it['flag'] = '; '.join(pr)
            items.append(it)
        for i in range(0, len(items), 70):
            tasks.append((lang, items[i:i + 70]))
    log(f'{len(tasks)} review batches')
    done = 0

    async def one(lang, batch):
        nonlocal done
        clean = [{x: v for x, v in it.items() if x != '_k'} for it in batch]
        res = await review_batch(lang, clean, 'gen', sem, log)
        done += 1
        if done % 20 == 0:
            log(f'  progress {done}/{len(tasks)}')
        return res

    results = await asyncio.gather(*[one(l, b) for l, b in tasks])
    changed = rejected = 0
    for (lang, batch), res in zip(tasks, results):
        by_id = {i['id']: i for i in batch}
        for i, v in res.items():
            it = by_id.get(str(i))
            if not it or not isinstance(v, str):
                continue
            v = v.replace('ر.س', 'SAR')
            if not valid(lang, it['_k'], v):
                rejected += 1
                log(f'  [{lang}] REJECT {it["_k"]!r}: {v!r}')
                continue
            if v != it['current']:
                G[it['_k']][lang] = v
                changed += 1
    json.dump(G, open(GEN, 'w', encoding='utf-8'), ensure_ascii=False, indent=2, sort_keys=True)
    log(f'GENERATED DONE — {changed} corrections, {rejected} rejected, {len(G)} entries')


def main():
    mode = sys.argv[1]
    logf = open(f'/tmp/i18n_fix_{mode}.log', 'w', encoding='utf-8')

    def log(m):
        logf.write(m + '\n')
        logf.flush()
    global LANGS
    if len(sys.argv) > 2:
        LANGS = sys.argv[2].split(',')
    if mode == 'static':
        asyncio.run(run_static(log))
    elif mode == 'generated':
        asyncio.run(run_generated(log))
    elif mode == 'new':
        asyncio.run(run_generated(log, only_new=True))


if __name__ == '__main__':
    main()
