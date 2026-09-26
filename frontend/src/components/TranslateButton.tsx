/**
 * TranslateButton — Twitter-style per-post translation button
 * Tap once → translate to the user's current UI language.
 * Tap again → show original.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { colors } from '../theme/tokens';

interface Props {
  text: string;
  sourceLang?: string;   // auto-detect if omitted
  targetLangOverride?: string;
  textStyle?: any;
  compact?: boolean;
}

const BACKEND = process.env.EXPO_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function TranslateButton({ text, sourceLang, targetLangOverride, textStyle, compact }: Props) {
  const { t, lang } = useT();
  const target = targetLangOverride || lang;
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // Show nothing if target language already matches source hint
  if (sourceLang && sourceLang === target) return null;
  if (!text || text.trim().length < 3) return null;

  const doTranslate = async () => {
    if (translated) {
      setShowOriginal(v => !v);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target_lang: target, source_lang: sourceLang }),
      });
      const j = await res.json();
      if (j?.translated) {
        setTranslated(j.translated);
        setShowOriginal(false);
      }
    } catch (e) {
      // silent fail — button stays available for retry
    } finally {
      setLoading(false);
    }
  };

  const displayText = translated && !showOriginal ? translated : text;
  const isTranslated = !!translated && !showOriginal;

  return (
    <>
      <Text style={textStyle}>{displayText}</Text>
      <TouchableOpacity
        onPress={doTranslate}
        activeOpacity={0.7}
        style={[styles.btn, compact && styles.btnCompact]}
        hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <>
            <Ionicons
              name={isTranslated ? 'return-up-back' : 'language'}
              size={13}
              color={colors.brand}
            />
            <Text style={styles.btnText}>
              {loading
                ? t('t.translating', 'جاري الترجمة...')
                : isTranslated
                  ? t('t.showOriginal', 'إظهار النص الأصلي')
                  : t('t.translate', 'ترجم')}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    marginTop: 4,
  },
  btnCompact: { paddingVertical: 2, marginTop: 2 },
  btnText: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: '700',
  },
});
