
import json
LANG = "ru"
BASE = "https://mobile-builder-146.preview.emergentagent.com"
URLS = {
  "product": "/merchant/product-analytics?id=6ab6de22e0ac8916314aa31a",
  "service": "/merchant/service-analytics?id=6ab6206a71b6ad54069c12cc",
  "competition": "/merchant/competition-analytics?id=6ab6206a71b6ad54069c12bc",
  "post": "/merchant/post-analytics?id=6ab70fe81e012b45f42795ed",
}
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
errors = []
page.on("pageerror", lambda e: errors.append(str(e)))
await page.set_viewport_size({"width": 390, "height": 844})
try:
    await page.goto(BASE + "/", wait_until="domcontentloaded")
    tok = await page.evaluate("""async (b) => { const r = await fetch(b + '/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({phone:'0509999999', password:'merchant2025'})}); const j = await r.json(); return j.token || j.access_token || ''; }""", BASE)
    print("token ok:", bool(tok))
    await page.evaluate("([t,l]) => { localStorage.setItem('token', t); localStorage.setItem('app_lang', l); }", [tok, LANG])
    for kind in ['service','competition','post','product']:
        url = URLS[kind]
        for rnd in range(2):
            await page.goto(BASE + url, wait_until="domcontentloaded")
            await page.wait_for_timeout(6000)
            tabs = await page.evaluate("() => Array.from(document.querySelectorAll('[data-testid^=\"pa-tab-\"]')).map(e => e.getAttribute('data-testid'))")
            res = {}
            res["overview"] = await page.evaluate(SCAN_JS)
            for t in tabs:
                if t == "pa-tab-overview":
                    continue
                await page.evaluate("(id) => document.querySelector(`[data-testid=\"${id}\"]`).scrollIntoView({block:'center'})", t)
                await page.click(f'[data-testid="{t}"]')
                await page.wait_for_timeout(1500)
                res[t] = await page.evaluate(SCAN_JS)
                if t == "pa-tab-compare" and rnd == 2 - 1:
                    await page.screenshot(path=f"/app/tests/shot_{LANG}_{kind}_compare.jpg", quality=40, full_page=False)
            if rnd == 2 - 1:
                print(f"=== {LANG} {kind} url={page.url}")
                for k, v in res.items():
                    print(f"  {k}: {v}")
            else:
                await page.wait_for_timeout(15000)
    print("page errors:", errors[:5])
except Exception as e:
    print("ERROR:", e)
    print("page errors:", errors[:5])
