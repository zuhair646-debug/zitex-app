"""Replace hard-coded English <Text>…</Text> labels with tSync('<arabic>', lang)."""
import asyncio
import json
import os
import re
import subprocess
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

FRONT = '/app/frontend'
rows = [l.rstrip('\n').split('\t') for l in open('/tmp/en_hard.tsv', encoding='utf-8') if '\t' in l]
uniq = sorted({r[1] for r in rows})


async def ar_map():
    chat = LlmChat(api_key=os.environ['EMERGENT_LLM_KEY'], session_id='en2ar-1',
                   system_message=('Translate each English UI label of a Saudi electronics store app (Zenrex Store) '
                                   'into natural Saudi-standard Arabic UI wording. Return ONLY a JSON object '
                                   '{english: arabic}. Keep brand names in Latin.')).with_model('anthropic', 'claude-sonnet-4-6')
    r = await chat.send_message(UserMessage(text=json.dumps(uniq, ensure_ascii=False)))
    return json.loads(re.search(r'\{.*\}', r, re.S).group(0))


M = asyncio.run(ar_map())
print('translated', len(M), 'of', len(uniq))
files = sorted({r[0] for r in rows})
for f in files:
    p = os.path.join(FRONT, f)
    s = open(p, encoding='utf-8').read()
    n = 0
    for en, ar in M.items():
        if not ar or not re.search(r'[\u0600-\u06FF]', ar):
            continue
        q = "'" + ar.replace('\\', '\\\\').replace("'", "\\'") + "'"
        s, k = re.subn(r'(<Text[^>]*>)' + re.escape(en) + r'(</Text>)', lambda m: f"{m.group(1)}{{tSync({q}, lang)}}{m.group(2)}", s)
        n += k
    if n:
        rel = os.path.relpath(f'{FRONT}/src', os.path.dirname(p))
        rel = rel if rel.startswith('.') else './' + rel
        m = re.search(r"import \{([^}]*)\} from '([^']*useAutoT)';", s)
        if m:
            have = [x.strip() for x in m.group(1).split(',') if x.strip()]
            if 'tSync' not in have:
                s = s.replace(m.group(0), f"import {{ {', '.join(have + ['tSync'])} }} from '{m.group(2)}';", 1)
        else:
            s = f"import {{ tSync }} from '{rel}/useAutoT';\n" + s
        if not re.search(r"import \{[^}]*\buseT\b[^}]*\} from", s):
            s = f"import {{ useT }} from '{rel}/i18n';\n" + s
        open(p, 'w', encoding='utf-8').write(s)
        print(n, f)
