/**
 * TranslatableName — compact inline name translator (June 2026, v2)
 *
 * UX contract:
 *   - Original name (as entered by merchant/customer) is ALWAYS the default.
 *   - A tiny globe icon sits next to the name whenever the viewer's current
 *     UI language is DIFFERENT from the text's source language. Tapping the
 *     icon translates to the viewer's current UI language. Tapping again
 *     restores the original.
 *   - Brand / proper-noun names (iPhone, Samsung) often translate to
 *     themselves. We treat that as a SUCCESSFUL translation — the button
 *     flips to the "undo" state and the user gets a one-time toast "لا تغيير
 *     في اللغة لهذا الاسم".
 *   - Backend / network failures show a toast error and do NOT silently
 *     revert; the button stays available for retry.
 *   - Translations are cached in-memory, on-device (AsyncStorage), AND on
 *     the backend MongoDB — one LLM call ever per text+target_lang.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, TextStyle, ViewStyle, ToastAndroid, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT, type Lang } from '../i18n';
import { colors } from '../theme/tokens';
interface Props {
  text?: string | null;
  /** Optional hint of the source language (e.g. "ar", "en"). If omitted
   *  the backend auto-detects. */
  sourceLang?: string;
  style?: TextStyle | TextStyle[];
  translatedStyle?: TextStyle | TextStyle[];
  containerStyle?: ViewStyle;
  iconSize?: number;
  inline?: boolean;
  showToggleLabel?: boolean;
  numberOfLines?: number;
  iconOnly?: boolean;
  /** Translate automatically but never show the arrow (chips, small labels). */
  noToggle?: boolean;
  onToggle?: (showingTranslation: boolean, translated?: string) => void;
}

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_BACKEND_URL || '';

const CACHE_KEY = '@zenrex_dyn_tr_v7';
const memCache: Record<string, string> = {}; // `${lang}::${text}` → translated (identical-to-source stored as same text)
const inflight: Map<string, Promise<string | null>> = new Map();
let diskLoaded = false;

async function loadDiskOnce() {
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
}
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memCache)).catch(() => {});
  }, 500);
}

function showToast(msg: string) {
  if (Platform.OS === 'android') {
    try { ToastAndroid.show(msg, ToastAndroid.SHORT); return; } catch { /* fall-through */ }
  }
  // iOS / web — use a non-blocking tiny alert fallback
  if (Platform.OS === 'ios') {
    try { Alert.alert('', msg); return; } catch { /* ignore */ }
  }
}

/** Returns:
 *   - string translation when LLM returned a translation (even if equal to source)
 *   - null on hard failure (network / server error) */
async function fetchTranslation(text: string, target: Lang, source?: string): Promise<string | null> {
  const key = `${target}::${text}`;
  if (memCache[key] !== undefined) return memCache[key];
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      const res = await fetch(`${BACKEND}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target_lang: target, source_lang: source }),
      });
      if (!res.ok) {
        return null;
      }
      const j = await res.json();
      const tr = (j?.translated ?? '').toString().trim();
      // Accept EVERY translation, including identical-to-source (brand names).
      if (!tr) return null;
      memCache[key] = tr;
      schedulePersist();
      return tr;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

// ───────────── Automatic translation (batched) ─────────────
const BRAND_RX = /^(iphone|ipad|macbook|airpods|apple|samsung|galaxy|huawei|xiaomi|redmi|oppo|vivo|realme|honor|nokia|sony|lg|lenovo|hp|dell|asus|acer|pro|max|ultra|plus|mini|lite|note|fold|flip|watch|pad|tab|buds|gb|tb|mah|5g|4g|usb|type-c|zenrex|store|pos|sar|smsa|aramex|spl|tabby|tamara|stc|mada|apple pay|x)$/i;
const AR_RX = /[\u0600-\u06FF]/;

// Script that each language is written in.
const LANG_SCRIPT: Record<string, RegExp> = {
  ar: /[\u0600-\u06FF]/, ur: /[\u0600-\u06FF]/, fa: /[\u0600-\u06FF]/, he: /[\u0590-\u05FF]/,
  ru: /[\u0400-\u04FF]/, zh: /[\u4E00-\u9FFF]/, ja: /[\u3040-\u30FF\u4E00-\u9FFF]/, ko: /[\uAC00-\uD7AF]/,
  hi: /[\u0900-\u097F]/, bn: /[\u0980-\u09FF]/, th: /[\u0E00-\u0E7F]/,
};
const ANY_NON_LATIN = /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u09FF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;
/** Latin words that are not pure codes (M3, 128GB, XPS, USB-C). */
const latinWords = (s: string) =>
  (s.match(/[A-Za-z][A-Za-z0-9\-]*/g) || []).filter((w) => !/\d/.test(w) && !(w === w.toUpperCase() && w.replace('-', '').length <= 4));

/** Does `text` need translating to be fully in `lang`? The viewer's language is always the target. */
export function needsTranslation(text: string, lang: Lang): boolean {
  const s = (text || '').trim();
  if (s.length < 2) return false;
  const hasAr = AR_RX.test(s);
  if (hasAr && /[A-Za-z]{2,}/.test(s)) return true; // mixed Arabic + English → one clean phrase
  const native = LANG_SCRIPT[lang];
  if (native) {
    // Non-Latin target (ar, ur, fa, he, ru, zh, ja, ko, hi, bn, th)
    if (latinWords(s).length > 0) return true; // English words / brands → target script
    if (lang === 'ar') return false;
    if (lang === 'ur' || lang === 'fa') return hasAr; // Arabic text → Urdu / Persian
    // Any letters from another script
    const stripped = s.replace(new RegExp(native.source, 'g'), '');
    return ANY_NON_LATIN.test(stripped);
  }
  // Latin-script targets
  if (ANY_NON_LATIN.test(s)) return true;
  if (lang === 'en') return false;
  return latinWords(s).filter((w) => !BRAND_RX.test(w)).length > 0; // English words → French, Spanish…
}

type Waiter = { resolve: (v: string | null) => void };
const queues: Record<string, Map<string, Waiter[]>> = {};
const timers: Record<string, ReturnType<typeof setTimeout> | null> = {};

async function flush(lang: Lang) {
  const q = queues[lang];
  timers[lang] = null;
  if (!q || !q.size) return;
  queues[lang] = new Map();
  const texts = Array.from(q.keys());
  const settle = (j: any, batch: string[]) => {
    const out: Record<string, string> = j?.translations || {};
    const failed = new Set<string>(j?.failed || []);
    batch.forEach((tx) => {
      if (!(tx in out)) return;
      const tr = (out[tx] ?? '').toString().trim();
      // Failed lines come back as the source — never cache them as final (retry next time).
      const ok = !!tr && !failed.has(tx) && !(lang !== 'ar' && lang !== 'fa' && lang !== 'ur' && AR_RX.test(tr));
      if (ok) { memCache[`${lang}::${tx}`] = tr; }
      q.get(tx)?.forEach((w) => w.resolve(ok ? tr : null));
      q.delete(tx);
    });
  };
  const post = async (batch: string[], cacheOnly: boolean) => {
    const res = await fetch(`${BACKEND}/api/translate/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch, target_lang: lang, cache_only: cacheOnly }),
    });
    return res.ok ? res.json() : null;
  };
  try {
    // 1) cached translations come back instantly
    const fast = await post(texts, true);
    settle(fast, texts);
    // 2) the rest in small parallel chunks so short names never wait for long posts
    const rest = texts.filter((tx) => q.has(tx));
    const chunks: string[][] = [];
    for (let i = 0; i < rest.length; i += 12) chunks.push(rest.slice(i, i + 12));
    await Promise.all(chunks.map(async (c) => {
      try { settle(await post(c, false), c); } catch { /* resolved below */ }
    }));
    schedulePersist();
  } catch { /* network error */ }
  q.forEach((ws) => ws.forEach((w) => w.resolve(null)));
}

/** Queue a text for automatic translation; many calls on one screen become one request. */
export async function autoTranslate(text: string, lang: Lang): Promise<string | null> {
  await loadDiskOnce();
  const key = `${lang}::${text}`;
  if (memCache[key] !== undefined) return memCache[key];
  return new Promise((resolve) => {
    queues[lang] = queues[lang] || new Map();
    const list = queues[lang].get(text) || [];
    list.push({ resolve });
    queues[lang].set(text, list);
    if (!timers[lang]) timers[lang] = setTimeout(() => flush(lang), 80);
  });
}

export default function TranslatableName({
  text,
  sourceLang,
  style,
  translatedStyle,
  containerStyle,
  iconSize = 14,
  inline = true,
  showToggleLabel = false,
  numberOfLines,
  iconOnly = false,
  noToggle = false,
  onToggle,
}: Props) {
  const { lang, isRTL, t } = useT();
  const original = (text || '').toString();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState<'original' | 'translated'>('original');
  const [loading, setLoading] = useState(false);

  // Reset when source text or lang changes
  useEffect(() => {
    setTranslated(null);
    setShowing('original');
    setLoading(false);
  }, [original, lang]);

  // Preload from cache without triggering LLM
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!original) return;
      // Automatic: show the text fully in the user's language (mixed AR/EN unified).
      if (!needsTranslation(original, lang)) return;
      const tr = await autoTranslate(original, lang);
      if (alive && tr) { setTranslated(tr); setShowing('translated'); }
    })();
    return () => { alive = false; };
  }, [original, lang, sourceLang]);

  const toggle = useCallback(async () => {
    if (!original) return;
    if (showing === 'translated') {
      setShowing('original');
      onToggle?.(false, translated || undefined);
      return;
    }
    if (translated !== null) {
      setShowing('translated');
      onToggle?.(true, translated);
      return;
    }
    setLoading(true);
    const tr = await fetchTranslation(original, lang, sourceLang);
    setLoading(false);
    if (tr !== null) {
      setTranslated(tr);
      setShowing('translated');
      onToggle?.(true, tr);
    } else {
      // Hard network / server failure — do NOT revert silently
      showToast(t('tn.networkError', 'Could not reach the translation service. Please retry.'));
    }
  }, [original, lang, showing, translated, sourceLang, onToggle, t]);

  // Decide whether to show the globe icon.
  // Rule: show whenever we DON'T have a confirmed match between source and target lang.
  // Even if the UI is Arabic, if the text was authored in English the user still
  // benefits from a translate option.
  // Icon only matters when a translation exists/needed (lets the user see the original).
  const tooShort = !original || original.trim().length < 2;
  const hideIcon = !!noToggle || tooShort || translated === original || (!needsTranslation(original, lang) && translated === null);

  const displayText = showing === 'translated' && translated !== null ? translated : original;
  const isTr = showing === 'translated' && translated !== null;

  const IconBtn = (
    <TouchableOpacity
      onPress={toggle}
      testID="translatable-name-toggle"
      activeOpacity={0.6}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
      style={[
        styles.iconBtn,
        isTr && styles.iconBtnActive,
        { marginStart: 6 },
      ]}
      accessibilityLabel={isTr ? t('tn.backToOriginal', 'Back to original') : t('tn.translate', 'Translate')}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.brand} />
      ) : (
        <>
          <Ionicons
            name={isTr ? 'arrow-undo' : 'language-outline'}
            size={iconSize}
            color={isTr ? colors.brand : colors.onSurfaceSecondary}
          />
          {showToggleLabel ? (
            <Text style={styles.toggleLabel} numberOfLines={1}>
              {isTr ? t('tn.original', 'Original') : t('tn.translate', 'Translate')}
            </Text>
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );

  if (iconOnly) {
    return hideIcon ? null : IconBtn;
  }

  if (inline) {
    return (
      <View style={[styles.rowInline, containerStyle]}>
        <Text
          testID="translatable-name-text"
          style={[style, isTr ? translatedStyle : null]}
          numberOfLines={numberOfLines}
        >
          {displayText}
        </Text>
        {hideIcon ? null : IconBtn}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Text testID="translatable-name-text" style={[style, isTr ? translatedStyle : null]} numberOfLines={numberOfLines}>
        {displayText}
      </Text>
      {hideIcon ? null : <View style={{ marginTop: 2, alignSelf: 'flex-start' }}>{IconBtn}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  rowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  iconBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 26,
    minHeight: 24,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(201,166,107,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,166,107,0.25)',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(201,166,107,0.18)',
    borderColor: 'rgba(201,166,107,0.45)',
  },
  toggleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.brand,
  },
});

/** First letter of a person's name in the viewer's script (avatar circles). */
export function NameInitial({ name, style }: { name?: string | null; style?: TextStyle | TextStyle[] }) {
  const { lang } = useT();
  const src = (name || '').trim();
  const [shown, setShown] = useState<string>(src);
  useEffect(() => {
    let alive = true;
    setShown(memCache[`${lang}::${src}`] || src);
    if (src && needsTranslation(src, lang)) {
      fetchTranslation(src, lang).then((tr) => { if (alive && tr) setShown(tr); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [src, lang]);
  return <Text style={style}>{(Array.from(shown)[0] || '?').toUpperCase()}</Text>;
}
