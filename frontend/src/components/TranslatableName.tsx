/**
 * TranslatableName — compact inline name translator (June 2026)
 *
 * UX contract (per user requirement):
 *   - Original name (as entered by merchant/customer) is ALWAYS the default.
 *   - A tiny globe icon sits next to the name. Tapping it translates to the
 *     user's current UI language (the one they picked in Settings).
 *     The icon then becomes "↩" with a small label "رجوع للاسم الأصلي" and
 *     tapping again restores the original.
 *   - Translations are cached in-memory, in AsyncStorage, AND persisted on
 *     the backend MongoDB cache — so a given name is translated by the LLM
 *     only once in the lifetime of the app.
 *
 * Props:
 *   text            — the original name (required)
 *   sourceLang      — hint of the source language (optional)
 *   style           — base Text style for the name
 *   translatedStyle — optional Text style when showing the translation
 *   iconSize        — size of the globe icon (default 14)
 *   inline          — if true, icon sits on the same line as the name
 *                     (default true). Set to false to render icon below.
 *   showToggleLabel — if true, shows "ترجم" / "رجوع للأصل" text beside the
 *                     icon. Defaults to false for ultra-compact lists.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT, type Lang } from '../i18n';
import { colors } from '../theme/tokens';

interface Props {
  text?: string | null;
  sourceLang?: string;
  style?: TextStyle | TextStyle[];
  translatedStyle?: TextStyle | TextStyle[];
  containerStyle?: ViewStyle;
  iconSize?: number;
  inline?: boolean;
  showToggleLabel?: boolean;
  numberOfLines?: number;
  /** If true, the component ONLY renders the icon (useful when the name is rendered elsewhere). */
  iconOnly?: boolean;
  /** Called when the user toggles translation on/off. */
  onToggle?: (showingTranslation: boolean, translated?: string) => void;
}

const BACKEND =
  (process.env as Record<string, string | undefined>).EXPO_BACKEND_URL ||
  (process.env as Record<string, string | undefined>).EXPO_PUBLIC_BACKEND_URL ||
  '';

const CACHE_KEY = '@zenrex_dyn_tr_v1';
const memCache: Record<string, string> = {}; // `${lang}::${text}` → translated
const inflight: Set<string> = new Set();
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

async function fetchTranslation(text: string, target: Lang, source?: string): Promise<string | null> {
  const key = `${target}::${text}`;
  if (memCache[key]) return memCache[key];
  if (inflight.has(key)) {
    // Simple wait loop (max ~2s) so repeated requests coalesce
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (memCache[key]) return memCache[key];
    }
    return null;
  }
  inflight.add(key);
  try {
    const res = await fetch(`${BACKEND}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_lang: target, source_lang: source }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const tr = (j?.translated || '').trim();
    if (tr && tr !== text) {
      memCache[key] = tr;
      schedulePersist();
      return tr;
    }
    return null;
  } catch {
    return null;
  } finally {
    inflight.delete(key);
  }
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
      if (!original || lang === 'ar') return;
      await loadDiskOnce();
      const key = `${lang}::${original}`;
      if (memCache[key] && alive) setTranslated(memCache[key]);
    })();
    return () => { alive = false; };
  }, [original, lang]);

  const toggle = useCallback(async () => {
    if (!original) return;
    if (showing === 'translated') {
      setShowing('original');
      onToggle?.(false, translated || undefined);
      return;
    }
    if (translated) {
      setShowing('translated');
      onToggle?.(true, translated);
      return;
    }
    setLoading(true);
    const tr = await fetchTranslation(original, lang, sourceLang);
    setLoading(false);
    if (tr) {
      setTranslated(tr);
      setShowing('translated');
      onToggle?.(true, tr);
    } else {
      // No translation available (same lang or network failure) — keep original
      setShowing('original');
    }
  }, [original, lang, showing, translated, sourceLang, onToggle]);

  // When translating is pointless (empty / same language)
  const hideIcon =
    !original ||
    original.trim().length < 2 ||
    lang === 'ar' ||
    (sourceLang && sourceLang === lang);

  const displayText = showing === 'translated' && translated ? translated : original;
  const isTr = showing === 'translated' && !!translated;

  const IconBtn = (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
        <Ionicons
          name={isTr ? 'arrow-undo' : 'language-outline'}
          size={iconSize}
          color={isTr ? colors.brand : colors.onSurfaceSecondary}
        />
      )}
      {showToggleLabel && !loading ? (
        <Text style={styles.toggleLabel} numberOfLines={1}>
          {isTr ? 'الأصلي' : 'ترجم'}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  if (iconOnly) {
    return hideIcon ? null : IconBtn;
  }

  // Inline layout: name + icon on same baseline
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

  // Stacked layout: icon below the name
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
