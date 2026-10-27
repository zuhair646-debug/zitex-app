p = '/app/backend/translate.py'; s = open(p).read()
old = '    @router.get("/translate/cache/stats")'
assert old in s
s = s.replace(old, '''    @router.get("/translate/rules")
    async def translate_rules():
        """Current translation-rules version — devices wipe their local cache when it changes."""
        return {"rules": _RULES_VERSION}

''' + old, 1)
open(p, 'w').write(s)

NEW_LOAD = '''async function loadDiskOnce() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    // Server-side translation rules version: when it changes, old device translations are stale → drop them.
    let rules: string | null = null;
    try {
      const r = await fetch(`${BACKEND}/api/translate/rules`);
      if (r.ok) rules = (await r.json())?.rules || null;
    } catch { /* offline → keep the cache */ }
    const stored = await AsyncStorage.getItem(`${CACHE_KEY}:rules`);
    if (rules && stored !== rules) {
      await AsyncStorage.multiRemove([CACHE_KEY]);
      await AsyncStorage.setItem(`${CACHE_KEY}:rules`, rules);
      return;
    }
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) Object.assign(memCache, JSON.parse(raw));
  } catch { /* ignore */ }
}'''
OLD_LOAD = '''async function loadDiskOnce() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) Object.assign(memCache, JSON.parse(raw));
  } catch { /* ignore */ }
}'''
for f in ['/app/frontend/src/components/TranslatableName.tsx', '/app/frontend/src/components/Translatable.tsx']:
    s = open(f).read()
    assert OLD_LOAD in s, f
    s = s.replace(OLD_LOAD, NEW_LOAD)
    s = s.replace("'@zenrex_dyn_tr_v6'", "'@zenrex_dyn_tr_v7'").replace("'@zenrex_dyn_tr_multi_v4'", "'@zenrex_dyn_tr_multi_v5'")
    open(f, 'w').write(s)
print('ok')
