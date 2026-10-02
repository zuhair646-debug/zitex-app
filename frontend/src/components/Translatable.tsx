/**
 * Translatable — universal multi-field inline translator (June 2026)
 *
 * Accepts:
 *   value: string | string[] | { ar?: string; en?: string; [key: string]: string }
 *   joiner?: separator used when joining multiple fields (default " · ")
 *
 * When the user taps the globe:
 *   - If `value` is a single string, we send it to /api/translate as one unit
 *     (so a mixed string like "iPhone 15 شحن سريع" becomes "iPhone 15 fast
 *     charging" in a single LLM call — never a word-by-word fragment).
 *   - If `value` is an array, we send `value.join(joiner)` as ONE batched
 *     call so the LLM gets full context and style stays uniform across
 *     fields.
 *   - If `value` is an object, we use the non-empty field(s) in a
 *     deterministic order (ar → en → other), join with `joiner`, then
 *     translate.
 *
 * Tapping again restores the original representation (same join rules).
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
  TextStyle, ViewStyle, ToastAndroid, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT, type Lang } from '../i18n';
import { colors } from '../theme/tokens';

type FieldMap = { ar?: string; en?: string; [key: string]: string | undefined };
type AnyValue = string | string[] | FieldMap | null | undefined;

interface Props {
  value: AnyValue;
  sourceLang?: string;
  joiner?: string;
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
const memCache: Record<string, string> = {};
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
    try { ToastAndroid.show(msg, ToastAndroid.SHORT); return; } catch { /* ignore */ }
  }
  if (Platform.OS === 'ios') {
    try { Alert.alert('', msg); return; } catch { /* ignore */ }
  }
}

function normalize(value: AnyValue, joiner: string): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).join(joiner);
  // object: prefer ar/en in that order, then other keys
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const k of ['ar', 'en']) {
    const v = (value as FieldMap)[k];
    if (v && typeof v === 'string' && v.trim() && !seen.has(v)) {
      parts.push(v);
      seen.add(v);
    }
  }
  for (const k of Object.keys(value as FieldMap)) {
    if (k === 'ar' || k === 'en') continue;
    const v = (value as FieldMap)[k];
    if (v && typeof v === 'string' && v.trim() && !seen.has(v)) {
      parts.push(v);
      seen.add(v);
    }
  }
  return parts.join(joiner);
}

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
      if (!res.ok) return null;
      const j = await res.json();
      const tr = (j?.translated ?? '').toString().trim();
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

export default function Translatable({
  value,
  sourceLang,
  joiner = ' · ',
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
  const { lang, isRTL, t } = useT();
  const original = normalize(value, joiner);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState<'original' | 'translated'>('original');
  const [loading, setLoading] = useState(false);
  const toastedSameRef = useRef(false);

  useEffect(() => {
    setTranslated(null);
    setShowing('original');
    setLoading(false);
    toastedSameRef.current = false;
  }, [original, lang]);

  // Preload from cache
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!original) return;
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
        showToast(t('tn.sameName', 'This name does not change when translated'));
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
        showToast(t('tn.sameName', 'This name does not change when translated'));
      }
      onToggle?.(true, tr);
    } else {
      showToast(t('tn.networkError', 'Could not reach the translation service. Please retry.'));
    }
  }, [original, lang, showing, translated, sourceLang, onToggle, t]);

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
        <Text style={[style, isTr ? translatedStyle : null]} numberOfLines={numberOfLines}>
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
