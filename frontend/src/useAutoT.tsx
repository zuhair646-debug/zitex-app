/**
 * useAutoT — Reactive auto-translation for any hardcoded string
 *
 * How it works:
 *   1. Given an Arabic (or any language) source string + current lang
 *   2. Returns the source immediately (so no flash of empty)
 *   3. Fires background call to /api/translate for missing translations
 *   4. Caches results in memory + AsyncStorage so subsequent renders are instant
 *   5. Reactively re-renders when translation arrives
 *
 * Usage:
 *   const label = useAutoT('الوضع الليلي');   // returns 'Night Mode' in EN, 'Modo Noturno' in PT, etc.
 *   <Text>{label}</Text>
 *
 *   // Or a wrapper component:
 *   <TX>الوضع الليلي</TX>
 */
import React, { useEffect, useState } from 'react';
import { Text, TextProps } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT, type Lang } from './i18n';

const CACHE_KEY = '@zenrex_autot_cache_v1';
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
  } catch {}
}

async function persistCache() {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache));
  } catch {}
}

async function translate(source: string, targetLang: Lang): Promise<string> {
  if (!source || !source.trim()) return source;
  if (targetLang === 'ar') return source; // assume source is Arabic
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
    // Persist in background (debounced by JS event loop)
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
 * On first mount for a new lang+source pair, returns source immediately
 * then re-renders with translation when the API returns.
 */
export function useAutoT(source: string): string {
  const { lang } = useT();
  const [translated, setTranslated] = useState<string>(() => {
    if (lang === 'ar' || !source) return source;
    return memoryCache[lang]?.[source] || source;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (lang === 'ar' || !source) {
        setTranslated(source);
        return;
      }
      await loadCacheOnce();
      const cached = memoryCache[lang]?.[source];
      if (cached) {
        if (alive) setTranslated(cached);
        return;
      }
      const t = await translate(source, lang);
      if (alive) setTranslated(t);
    })();
    return () => { alive = false; };
  }, [source, lang]);

  return translated;
}

/**
 * Component wrapper: <TX>الوضع الليلي</TX> → renders translated text.
 * All Text props are forwarded (style, numberOfLines, adjustsFontSizeToFit, etc.).
 */
export function TX({ children, ...rest }: { children: string } & TextProps) {
  const translated = useAutoT(String(children ?? ''));
  return <Text {...rest}>{translated}</Text>;
}
