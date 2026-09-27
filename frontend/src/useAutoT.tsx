/**
 * useAutoT — Reactive auto-translation for any hardcoded string.
 *
 * v3 strategy (June 2026):
 *   1. Check the pre-baked static JSON dictionary (i18n-generated.json) — INSTANT
 *   2. Check in-memory + AsyncStorage cache — INSTANT
 *   3. Fall back to /api/translate — background, warms cache
 *
 * The static JSON is generated offline by /app/scripts/bulk_translate.py.
 * That script scans every <TX>, useAutoT(), tSync() usage in the source,
 * ships the strings to Claude Haiku 4.5 in bulk, and stores the results.
 * Refresh it whenever a batch of new Arabic strings is added.
 */
import React, { useEffect, useState } from 'react';
import { Text, TextProps } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT, type Lang } from './i18n';
// Pre-baked translations. Structure: { source_ar: { en, fa, hi, zh, ... } }
// Do not edit by hand — regenerate via scripts/bulk_translate.py.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STATIC_TRANSLATIONS: Record<string, Partial<Record<Lang, string>>> = require('./i18n-generated.json');

const CACHE_KEY = '@zenrex_autot_cache_v2';
const memoryCache: Record<string, Record<string, string>> = {}; // lang → { source: translated }
let cacheLoaded = false;
const inflight: Set<string> = new Set();

async function loadCacheOnce() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      Object.assign(memoryCache, obj);
    }
  } catch { /* ignore */ }
}

async function persistCache() {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache)); } catch { /* ignore */ }
}

function staticLookup(source: string, targetLang: Lang): string | undefined {
  const entry = STATIC_TRANSLATIONS[source];
  if (!entry) return undefined;
  const t = entry[targetLang];
  return t && t.trim() ? t : undefined;
}

async function translate(source: string, targetLang: Lang): Promise<string> {
  if (!source || !source.trim()) return source;
  if (targetLang === 'ar') return source;
  // Fast path — pre-baked
  const staticHit = staticLookup(source, targetLang);
  if (staticHit) return staticHit;
  memoryCache[targetLang] = memoryCache[targetLang] || {};
  if (memoryCache[targetLang][source]) return memoryCache[targetLang][source];
  const inflightKey = `${targetLang}::${source}`;
  if (inflight.has(inflightKey)) return source;
  inflight.add(inflightKey);
  try {
    const base = (process.env.EXPO_PUBLIC_BACKEND_URL || (globalThis as any).EXPO_BACKEND_URL || '').toString();
    const url = `${base}/api/translate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: source, target_lang: targetLang, source_lang: 'ar' }),
    });
    if (!res.ok) throw new Error('translate failed');
    const data = await res.json();
    const translated = data?.translated || data?.translated_text || data?.translation || source;
    memoryCache[targetLang][source] = translated;
    setTimeout(() => persistCache(), 300);
    return translated;
  } catch {
    return source;
  } finally {
    inflight.delete(inflightKey);
  }
}

/**
 * Hook: returns the translated string for the CURRENT lang.
 * If the pre-baked dictionary has a translation, returns it INSTANTLY on first render — no flash.
 */
export function useAutoT(source: string): string {
  const { lang } = useT();
  const initial = (): string => {
    if (lang === 'ar' || !source) return source;
    const s = staticLookup(source, lang);
    if (s) return s;
    return memoryCache[lang]?.[source] || source;
  };
  const [translated, setTranslated] = useState<string>(initial);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (lang === 'ar' || !source) { setTranslated(source); return; }
      const s = staticLookup(source, lang);
      if (s) { if (alive) setTranslated(s); return; }
      await loadCacheOnce();
      const cached = memoryCache[lang]?.[source];
      if (cached) { if (alive) setTranslated(cached); return; }
      const t = await translate(source, lang);
      if (alive) setTranslated(t);
    })();
    return () => { alive = false; };
  }, [source, lang]);

  return translated;
}

/**
 * Component wrapper: <TX>الوضع الليلي</TX> → renders translated text.
 */
export function TX({ children, ...rest }: { children: string } & TextProps) {
  const translated = useAutoT(String(children ?? ''));
  return <Text {...rest}>{translated}</Text>;
}

/**
 * Non-hook synchronous string translator, safe to call inside callbacks/map/renderItem.
 * Returns pre-baked translation if available, otherwise cached, otherwise source.
 */
export function tSync(source: string, lang: Lang): string {
  if (!source || lang === 'ar') return source;
  const s = staticLookup(source, lang);
  if (s) return s;
  const cached = memoryCache[lang]?.[source];
  if (cached) return cached;
  // Warm the cache in background (no-op if pre-baked exists — checked above)
  translate(source, lang).catch(() => {});
  return source;
}
