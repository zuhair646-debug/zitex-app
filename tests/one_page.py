import asyncio, json, sys, urllib.request
from playwright.async_api import async_playwright
BASE = 'https://mobile-builder-146.preview.emergentagent.com'
LANG = sys.argv[1]; ROUTE = sys.argv[2]; PHONE = sys.argv[3] if len(sys.argv) > 3 else '0500000000'; PW = sys.argv[4] if len(sys.argv) > 4 else 'test1234'


async def main():
    req = urllib.request.Request(BASE + '/api/auth/login', data=json.dumps({'phone': PHONE, 'password': PW}).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})
    j = json.load(urllib.request.urlopen(req))
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={'width': 390, 'height': 844})
        reqs, logs = [], []
        page.on('request', lambda rq: reqs.append(rq.url[-30:] + ' ' + (rq.post_data or '')[:150]) if 'translate' in rq.url else None)
        page.on('console', lambda m: logs.append(m.text[:160]) if m.type in ('error', 'warning') else None)
        await page.goto(BASE + '/login')
        await page.evaluate("([t,u,l]) => { localStorage.setItem('token', t); localStorage.setItem('user', u); localStorage.setItem('app_lang', l); }", [j['token'], json.dumps(j.get('user', {})), LANG])
        await page.goto(BASE + ROUTE); await page.wait_for_timeout(int(sys.argv[5]) if len(sys.argv) > 5 else 10000)
        print((await page.inner_text('#root'))[:700]); print('REQS', reqs[:8]); print('LOGS', logs[:6])
        await b.close()
asyncio.run(main())
