import json, re, asyncio
BASE = "https://mobile-builder-146.preview.emergentagent.com"
NONLATIN = {"ar","ur","fa","he","ru","zh","ja","ko","hi","bn","th"}
dialogs = []
page.on("dialog", lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.dismiss())))
def leftovers(s, code):
    if code in NONLATIN:
        ws = re.findall(r"[A-Za-z][A-Za-z0-9\-]*", s)
        return [w for w in ws if not re.search(r"\d", w) and not (w == w.upper() and len(w.replace('-', '')) <= 4)]
    return re.findall(r"[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u09FF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]+", s)
async def stable_texts(sel, n, maxwait=15000):
    prev = None; same = 0; waited = 0
    while waited < maxwait:
        texts = await page.evaluate("(a)=>Array.from(document.querySelectorAll(a[0])).slice(0,a[1]).map(e=>e.textContent)", [sel, n])
        if texts and texts == prev:
            same += 1
            if same >= 3: return texts
        else: same = 0
        prev = texts
        await page.wait_for_timeout(700); waited += 700
    return prev or []
async def toggle_idx(sel, tsel, idxs):
    res = []
    n = await page.locator(sel).count()
    for i in idxs:
        if i >= n: continue
        txt = page.locator(sel).nth(i)
        await txt.scroll_into_view_if_needed()
        tg = txt.locator("xpath=..").locator(f'[data-testid="{tsel}"]')
        before = await txt.text_content()
        if await tg.count() == 0:
            res.append(f"[{i}] NO-TOGGLE '{before}'"); continue
        await tg.first.click(force=True); await page.wait_for_timeout(1200)
        mid = await txt.text_content()
        await tg.first.click(force=True); await page.wait_for_timeout(1200)
        after = await txt.text_content()
        ok = mid != before and after == before
        res.append(f"[{i}] {'OK' if ok else 'FAIL'} '{before}'->'{mid}'->'{after}'")
    return res
# Main loop (paste into browser_automation; set LANGS). Login via in-page fetch, set localStorage token/app_lang.
LANGS = ["en","ar","ur","fa","he","es","fr","de","it","pt","ru","tr","zh","ja","ko","hi","bn","id","ms","th"]
async def run():
    await page.set_viewport_size({"width": 390, "height": 844})
    tok = await page.evaluate("""async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'0509999999',password:'merchant2025'})});return (await r.json()).token}""")
    for code in LANGS:
        await page.evaluate("(a)=>{localStorage.setItem('token',a[0]);localStorage.setItem('app_lang',a[1]);}", [tok, code])
        await page.goto(BASE + "/merchant/products"); await page.wait_for_selector('[data-testid="translatable-text"]', timeout=20000)
        pn = await stable_texts('[data-testid="translatable-text"]', 6)
        pt = await toggle_idx('[data-testid="translatable-text"]', "translatable-toggle", [0, 1])
        await page.goto(BASE + "/merchant/orders"); await page.wait_for_selector('[data-testid="translatable-name-text"]', timeout=20000)
        on = await stable_texts('[data-testid="translatable-name-text"]', 22)
        ct = await toggle_idx('[data-testid="translatable-name-text"]', "translatable-name-toggle", [0, 1, 15])
        print(code, pn, {p: leftovers(p, code) for p in pn + on if leftovers(p, code)}, pt, ct, dialogs)
await run()
