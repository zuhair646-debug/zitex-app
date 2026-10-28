"""Full 20-language UI scan (Playwright). Logs in as each role, visits every screen in every
language, and reports text that is not in the selected language, plus translate-toggle checks.
Run:  python3 /app/tests/full_lang_scan.py [langs comma list]  → /app/test_reports/lang_scan.json"""
import asyncio, json, re, sys, os
from playwright.async_api import async_playwright
import urllib.request

BASE = os.environ.get('BASE', 'https://mobile-builder-146.preview.emergentagent.com')
LANGS = (sys.argv[1].split(',') if len(sys.argv) > 1 and sys.argv[1] else
         ['en', 'ar', 'ur', 'fa', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'tr', 'zh', 'ja', 'ko', 'hi', 'bn', 'id', 'ms', 'th'])
CONC = int(os.environ.get('CONC', '6'))
WAIT = int(os.environ.get('WAIT', '7000'))


def api(path, body=None, token=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537.36', **({'Authorization': f'Bearer {token}'} if token else {})})
    return json.load(urllib.request.urlopen(req, timeout=60))


def first_id(path, token=None, keys=('products', 'items', 'services', 'competitions', 'data')):
    try:
        d = api(path, token=token)
        if isinstance(d, dict):
            for k in keys:
                if isinstance(d.get(k), list): d = d[k]; break
        x = d[0]
        return str(x.get('id') or x.get('_id'))
    except Exception:
        return None


ROLES = {
    'customer': ('0500000000', 'test1234', ['/', '/competitions', '/services', '/social', '/settings', '/cart', '/orders', '/points',
                 '/wallet', '/favorites', '/notifications', '/addresses', '/search', '/loyalty-history', '/my-returns',
                 '/my-services', '/warranties', '/invoices', '/support', '/group-buys', '/about-store', '/my-affiliate',
                 '/affiliate-apply', '/appearance', '/draw', '/ugc-contest', '/create-return', 'PRODUCT', 'SERVICE', 'COMPETITION']),
    'merchant': ('0509999999', 'merchant2025', ['/merchant', '/merchant/products', '/merchant/orders', '/merchant/customers',
                 '/merchant/more', '/merchant/ai-provider', '/merchant/live-preview', '/merchant/pos', '/merchant/inventory', '/merchant/invoices',
                 '/merchant/employees', '/merchant/team', '/merchant/roles', '/merchant/drivers', '/merchant/branches',
                 '/merchant/delivery-settings', '/merchant/shipping-matrix', '/merchant/marketing', '/merchant/marketer-stats',
                 '/merchant/loyalty-programs', '/merchant/banners', '/merchant/bookings', '/merchant/service-bookings',
                 '/merchant/services', '/merchant/services-catalog', '/merchant/competitions', '/merchant/competition-form',
                 '/merchant/competition-analytics', '/merchant/social', '/merchant/post-analytics', '/merchant/returns',
                 '/merchant/support-settings', '/merchant/product-form', 'MPRODUCT_ANALYTICS']),
    'driver': ('0540001111', 'driver1234', ['/driver']),
    'chamber': ('0550000000', 'chamber2025', ['/chamber']),
    'cashier': ('0530000001', 'emp1234', ['/merchant', '/merchant/pos']),
    'marketer': ('0530000002', 'emp1234', ['/my-affiliate', '/merchant']),
}

AR = re.compile(r'[\u0600-\u06FF]')
AR_ONLY = re.compile(r'[ةيكى]')  # letters Urdu/Persian do not use
SCRIPT = {'he': r'\u0590-\u05FF', 'ru': r'\u0400-\u04FF', 'zh': r'\u4E00-\u9FFF', 'ja': r'\u3040-\u30FF\u4E00-\u9FFF',
          'ko': r'\uAC00-\uD7AF', 'hi': r'\u0900-\u097F', 'bn': r'\u0980-\u09FF', 'th': r'\u0E00-\u0E7F'}
NONLATIN = set(SCRIPT) | {'ar', 'ur', 'fa'}
ANY_FOREIGN = re.compile(r'[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u09FF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]')
ALLOW = {'zenrex', 'store'}
UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'


def latin_words(s):
    return [w for w in re.findall(r'[A-Za-z0-9][A-Za-z0-9\-]*', s)
            if re.search('[A-Za-z]', w) and not re.search(r'\d', w)
            and not (w.replace('-', '').isupper() and len(w.replace('-', '')) <= 4) and w.lower() not in ALLOW]


def problems(lang, line):
    out = []
    if lang in ('ur', 'fa'):
        if AR_ONLY.search(line): out.append('arabic')
    elif lang != 'ar' and AR.search(line):
        out.append('arabic')
    if lang in NONLATIN:
        lw = latin_words(line)
        if lw: out.append('latin:' + ','.join(lw[:4]))
        if lang in SCRIPT:
            other = re.sub('[' + SCRIPT[lang] + ']', '', line)
            if lang == 'ja': other = re.sub('[\u4E00-\u9FFF]', '', other)
            if re.search(r'[\u0400-\u04FF\u0590-\u05FF\u0900-\u09FF\u0E00-\u0E7F\u3040-\u30FF\uAC00-\uD7AF]', other) and lang not in ('zh',):
                pass
    elif ANY_FOREIGN.search(line):
        out.append('foreign-script')
    return out


async def visit(ctx, sem, role, token, user, lang, route, results):
    async with sem:
        # isolated context per visit: avoids localStorage (token/lang) races between concurrent pages
        bctx = await ctx.new_context(viewport={'width': 390, 'height': 844}, user_agent=UA)
        await bctx.add_init_script(
            "localStorage.setItem('token', %s); localStorage.setItem('user', %s); localStorage.setItem('app_lang', %s); localStorage.setItem('location_prompted', '1');"
            % (json.dumps(token), json.dumps(json.dumps(user)), json.dumps(lang)))
        page = await bctx.new_page()
        rec = {'role': role, 'lang': lang, 'route': route, 'issues': [], 'toggle': None, 'error': None}
        try:
            await page.goto(BASE + route, timeout=60000)
            await page.wait_for_timeout(WAIT)
            txt = await page.inner_text('#root')
            if 'Unexpected error' in txt or 'is not defined' in txt or 'Something went wrong' in txt:
                rec['error'] = txt[:200]
            for line in {l.strip() for l in txt.split('\n') if l.strip()}:
                p = problems(lang, line)
                if p: rec['issues'].append({'text': line[:120], 'problems': p})
            # only the toggle buttons (the old ^="translatable" prefix also matched the *-text nodes)
            tg = page.locator('[data-testid="translatable-name-toggle"], [data-testid="translatable-toggle"]')
            n = await tg.count()
            if n:
                try:
                    el = None
                    for i in range(min(n, 15)):
                        if await tg.nth(i).is_visible():
                            el = tg.nth(i); break
                    if el is None:
                        rec['toggle'] = {'count': n, 'ok': None, 'err': 'no visible toggle'}
                    else:
                        txt_el = el.locator('xpath=ancestor::*[.//*[@data-testid="translatable-name-text" or @data-testid="translatable-text"]][1]//*[@data-testid="translatable-name-text" or @data-testid="translatable-text"]').first
                        async def read():
                            return (await txt_el.inner_text()).strip()
                        async def click_and_wait(prev):
                            await el.scroll_into_view_if_needed(timeout=3000)
                            await el.click(timeout=4000)
                            cur = prev
                            for _ in range(20):
                                await page.wait_for_timeout(400)
                                cur = await read()
                                if cur != prev: break
                            return cur
                        before = await read()
                        mid = await click_and_wait(before)
                        after = await click_and_wait(mid)
                        rec['toggle'] = {'count': n, 'before': before[:80], 'mid': mid[:80], 'back': after[:80],
                                         'ok': before != mid and after == before}
                except Exception as e:
                    rec['toggle'] = {'count': n, 'ok': False, 'err': str(e)[:160]}
        except Exception as e:
            rec['error'] = str(e)[:200]
        finally:
            await bctx.close()
        results.append(rec)
        print(role, lang, route, len(rec['issues']), 'toggle', (rec['toggle'] or {}).get('ok'), flush=True)


async def main():
    results = []
    tokens = {}
    for role, (ph, pw, _) in ROLES.items():
        try:
            j = api('/api/auth/login', {'phone': ph, 'password': pw}); tokens[role] = (j['token'], j.get('user', {}))
        except Exception as e:
            print('login failed', role, e)
    ct = tokens.get('customer', (None,))[0]
    pid = first_id('/api/products'); sid = first_id('/api/services'); cid = first_id('/api/competitions')
    mpid = first_id('/api/merchant/products', tokens.get('merchant', (None,))[0])
    subst = {'PRODUCT': f'/product/{pid}', 'SERVICE': f'/service/{sid}', 'COMPETITION': f'/competition/{cid}',
             'MPRODUCT_ANALYTICS': f'/merchant/product-analytics?id={mpid}'}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = b
        sem = asyncio.Semaphore(CONC)
        tasks = []
        only = os.environ.get('ROLES_ONLY', '').split(',') if os.environ.get('ROLES_ONLY') else None
        for role, (_, _, routes) in ROLES.items():
            if role not in tokens or (only and role not in only): continue
            tok, user = tokens[role]
            for lang in LANGS:
                for r in routes:
                    if os.environ.get('ROUTES') and subst.get(r, r).split('?')[0] not in os.environ['ROUTES'].split(','): continue
                    tasks.append(visit(ctx, sem, role, tok, user, lang, subst.get(r, r), results))
        await asyncio.gather(*tasks)
        await b.close()
    agg = {}
    for r in results:
        for i in r['issues']:
            agg.setdefault(i['text'], {'problems': i['problems'], 'where': set()})['where'].add(f"{r['lang']}:{r['route']}")
    summary = {'visits': len(results), 'errors': [r for r in results if r['error']],
               'toggle_fail': [r for r in results if r['toggle'] and r['toggle'].get('ok') is False],
               'toggle_ok': sum(1 for r in results if r['toggle'] and r['toggle'].get('ok')),
               'unique_issues': len(agg),
               'issues': sorted([{'text': k, 'problems': v['problems'], 'count': len(v['where']), 'where': sorted(v['where'])[:6]}
                                 for k, v in agg.items()], key=lambda x: -x['count'])}
    summary['raw'] = results
    json.dump(summary, open(os.environ.get('OUT', '/app/test_reports/lang_scan.json'), 'w'), ensure_ascii=False, indent=1)
    print('IDS', subst)
    print('VISITS', len(results), 'UNIQUE ISSUES', len(agg), 'ERRORS', len(summary['errors']), 'TOGGLE FAIL', len(summary['toggle_fail']))

asyncio.run(main())
