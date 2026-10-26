
BASE = "https://mobile-builder-146.preview.emergentagent.com"
SCAN_JS = r"""() => {
  const out = new Set();
  document.querySelectorAll('div, span').forEach(el => {
    if (el.offsetParent === null) return;
    let own = '';
    el.childNodes.forEach(n => { if (n.nodeType === 3) own += n.textContent; });
    own = own.trim();
    if (own.length > 1 && /[\u0600-\u06FF]/.test(own)) out.add(own.slice(0, 80));
  });
  return Array.from(out);
}"""
async def tap(tid, force=False):
    await page.wait_for_selector(f'[data-testid="{tid}"]', timeout=10000)
    await page.evaluate("(id) => { const e=[...document.querySelectorAll(`[data-testid=\"${id}\"]`)].filter(x=>x.offsetParent!==null)[0]; e && e.scrollIntoView({block:'center'}); }", tid)
    await page.locator(f'[data-testid="{tid}"]:visible').first.click(force=force)
    await page.wait_for_timeout(1500)
errors = []
page.on("pageerror", lambda e: errors.append(str(e)))
await page.set_viewport_size({"width": 390, "height": 844})
for LANG in ["zh", "ru"]:
  try:
    await page.goto(BASE + "/", wait_until="domcontentloaded")
    tok = await page.evaluate("""async (b) => { const r = await fetch(b + '/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({phone:'0509999999', password:'merchant2025'})}); const j = await r.json(); return j.token || j.access_token || ''; }""", BASE)
    await page.evaluate("([t,l]) => { localStorage.setItem('token', t); localStorage.setItem('app_lang', l); }", [tok, LANG])
    for rnd in range(2):
        last = rnd == 1
        # Employee notes
        await page.goto(BASE + "/merchant/live-preview", wait_until="domcontentloaded")
        await page.wait_for_timeout(6000)
        await tap("lp-section-overview")
        await tap("lp-lb-tab-employees")
        await tap("lp-leader-row-1")
        await tap("sheet-tab-notes")
        await page.wait_for_timeout(2500 if last else 15000)
        if last:
            print(f"[{LANG}] employee notes arabic:", await page.evaluate(SCAN_JS))
            await page.screenshot(path=f"/app/tests/lp_{LANG}_notes.jpg", quality=40, full_page=False)
        # Branch address
        await page.goto(BASE + "/merchant/live-preview", wait_until="domcontentloaded")
        await page.wait_for_timeout(6000)
        await tap("lp-section-overview")
        await tap("lp-lb-tab-branches")
        await tap("lp-leader-row-1")
        await page.wait_for_timeout(2000)
        if last:
            body = await page.evaluate("() => document.body.innerText")
            for kw in ["分店地址", "Адрес филиала", "标题", "Title", "Branch address"]:
                print(f"[{LANG}] branch label '{kw}':", kw in body)
            print(f"[{LANG}] branch sheet arabic:", await page.evaluate(SCAN_JS))
        # Social insights
        await page.goto(BASE + "/merchant/live-preview", wait_until="domcontentloaded")
        await page.wait_for_timeout(6000)
        await tap("lp-section-social")
        await page.wait_for_timeout(2000)
        await tap("social-action-comments")
        for t in ["likers", "sharers"]:
            await tap(f"social-insights-tab-{t}")
            await page.wait_for_timeout(2500 if last else 12000)
            if last:
                print(f"[{LANG}] social {t} arabic:", await page.evaluate(SCAN_JS))
                await page.screenshot(path=f"/app/tests/lp_{LANG}_{t}.jpg", quality=40, full_page=False)
  except Exception as e:
    print(f"[{LANG}] ERROR:", e)
    await page.screenshot(path=f"/app/tests/lp_{LANG}_err.jpg", quality=40, full_page=False)
print("page errors:", errors[:5])
