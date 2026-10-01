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
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  onToggle?: (showingTranslation: boolean, translated?: string) => void;
}

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_BACKEND_URL || '';

const CACHE_KEY = '@zenrex_dyn_tr_v2';
const memCache: Record<string, string> = {}; // `${lang}::${text}` → translated (identical-to-source stored as same text)
const inflight: Map<string, Promise<string | null>> = new Map();
let diskLoaded = false;

async function loadDiskOnce() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
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
  onToggle,
}: Props) {
  const { lang, isRTL } = useT();
  const original = (text || '').toString();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState<'original' | 'translated'>('original');
  const [loading, setLoading] = useState(false);
  const toastedSameRef = useRef(false);

  // Reset when source text or lang changes
  useEffect(() => {
    setTranslated(null);
    setShowing('original');
    setLoading(false);
    toastedSameRef.current = false;
  }, [original, lang]);

  // Preload from cache without triggering LLM
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!original) return;
      // Even when sourceLang === lang we skip, but we do want to warm when they differ
      if (sourceLang && sourceLang === lang) return;
      await loadDiskOnce();
      const key = `${lang}::${original}`;
      if (memCache[key] !== undefined && alive) setTranslated(memCache[key]);
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
      if (translated === original && !toastedSameRef.current) {
        toastedSameRef.current = true;
        showToast('هذا الاسم لا يتغيّر عند الترجمة');
      }
      onToggle?.(true, translated);
      return;
    }
    setLoading(true);
    const tr = await fetchTranslation(original, lang, sourceLang);
    setLoading(false);
    if (tr !== null) {
      setTranslated(tr);
      setShowing('translated');
      if (tr === original && !toastedSameRef.current) {
        toastedSameRef.current = true;
        showToast('هذا الاسم لا يتغيّر عند الترجمة');
      }
      onToggle?.(true, tr);
    } else {
      // Hard network / server failure — do NOT revert silently
      showToast('تعذّر الاتصال بخدمة الترجمة. حاول مجددًا.');
    }
  }, [original, lang, showing, translated, sourceLang, onToggle]);

  // Decide whether to show the globe icon.
  // Rule: show whenever we DON'T have a confirmed match between source and target lang.
  // Even if the UI is Arabic, if the text was authored in English the user still
  // benefits from a translate option.
  const sameLang = !!sourceLang && sourceLang === lang;
  const tooShort = !original || original.trim().length < 2;
  const hideIcon = sameLang || tooShort;

  const displayText = showing === 'translated' && translated !== null ? translated : original;
  const isTr = showing === 'translated' && translated !== null;

  const IconBtn = (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.6}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[
        styles.iconBtn,
        isTr && styles.iconBtnActive,
        isRTL ? { marginRight: 6 } : { marginLeft: 6 },
      ]}
      accessibilityLabel={isTr ? 'رجوع للنص الأصلي' : 'ترجمة'}
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
              {isTr ? 'الأصلي' : 'ترجم'}
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
      <Text style={[style, isTr ? translatedStyle : null]} numberOfLines={numberOfLines}>
        {displayText}
      </Text>
      {hideIcon ? null : <View style={{ marginTop: 2 }}>{IconBtn}</View>}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
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
