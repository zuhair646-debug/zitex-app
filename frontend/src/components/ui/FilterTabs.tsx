/**
 * FilterTabs — the ONE horizontal options/filter bar used across the app.
 *
 * Why it exists (Android RTL bugs seen on real devices):
 *  - Horizontal ScrollView in RTL on Android clips / hides labels while swiping.
 *    → we always lay the row out LTR and reverse the items in RTL, then start scrolled to the end.
 *  - Fixed heights + adjustsFontSizeToFit made labels tiny or cut in half with big system fonts.
 *    → no fixed heights, no auto-shrinking; height grows with the text, font scaling capped.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Animated, LayoutChangeEvent, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing } from '../../theme/tokens';
import { useT } from '../../i18n';
import { useTheme } from '../../theme/ThemeContext';

export type FilterTabItem<K extends string> = { key: K; label: string; icon?: keyof typeof Ionicons.glyphMap; count?: number };

export function FilterTabs<K extends string>({ items, value, onChange, testIDPrefix = 'tab', size = 'md' }: {
  items: FilterTabItem<K>[]; value: K; onChange: (k: K) => void; testIDPrefix?: string; size?: 'md' | 'lg';
}) {
  const { isRTL } = useT();
  const { themeKey } = useTheme();
  const styles = useMemo(makeStyles, [themeKey]);
  const ref = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, { x: number; w: number }>>({});
  const viewW = useRef(0);
  const ordered = isRTL ? [...items].reverse() : items;

  const centerOn = (k: string, animated = true) => {
    const l = layouts.current[k];
    if (!l || !viewW.current) return;
    ref.current?.scrollTo({ x: Math.max(0, l.x + l.w / 2 - viewW.current / 2), animated });
  };
  useEffect(() => { centerOn(value); }, [value]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
        onLayout={(e) => { viewW.current = e.nativeEvent.layout.width; centerOn(value, false); }}
        onContentSizeChange={() => {
          // RTL: the list starts at its right edge; then bring the active tab into view.
          if (isRTL) ref.current?.scrollToEnd({ animated: false });
          requestAnimationFrame(() => centerOn(value, false));
        }}
        keyboardShouldPersistTaps="handled"
      >
        {ordered.map((it) => (
          <Tab key={it.key} item={it} active={it.key === value} size={size} testID={`${testIDPrefix}-${it.key}`}
            onLayout={(e) => {
              layouts.current[it.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
              if (it.key === value) centerOn(value, false);
            }}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(it.key); }} />
        ))}
      </ScrollView>
    </View>
  );
}

function Tab({ item, active, onPress, onLayout, testID, size }: {
  item: FilterTabItem<string>; active: boolean; onPress: () => void; onLayout: (e: LayoutChangeEvent) => void; testID: string; size: 'md' | 'lg';
}) {
  const { themeKey } = useTheme();
  const styles = useMemo(makeStyles, [themeKey]);
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.spring(a, { toValue: active ? 1 : 0, useNativeDriver: false, friction: 8, tension: 90 }).start(); }, [active]);
  const bg = a.interpolate({ inputRange: [0, 1], outputRange: [colors.surfaceSecondary, colors.brand] });
  const border = a.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.brand] });
  const fg = active ? colors.onBrandPrimary : colors.onSurface;
  return (
    <Pressable testID={testID} onLayout={onLayout} onPress={onPress} hitSlop={4}
      onPressIn={() => Animated.spring(press, { toValue: 0.94, useNativeDriver: true, speed: 40 }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 30 }).start()}>
      <Animated.View style={{ transform: [{ scale: press }] }}>
        <Animated.View style={[styles.tab, size === 'lg' && styles.tabLg, { backgroundColor: bg, borderColor: border }]}>
          {!!item.icon && <Ionicons name={item.icon} size={size === 'lg' ? 18 : 15} color={active ? colors.onBrandPrimary : colors.brand} />}
          <Text style={[styles.label, size === 'lg' && styles.labelLg, { color: fg }, active && styles.labelActive]}
            numberOfLines={1} maxFontSizeMultiplier={1.25}>{item.label}</Text>
          {item.count != null && (
            <View style={[styles.count, active && styles.countActive]}>
              <Text style={[styles.countText, { color: active ? colors.brand : colors.onSurfaceSecondary }]} maxFontSizeMultiplier={1.2}>{item.count}</Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const makeStyles = () => StyleSheet.create({
  wrap: { flexShrink: 0 },
  scroll: { flexGrow: 0, ...(Platform.OS === 'web' ? null : { direction: 'ltr' as const }) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
  },
  tabLg: { minHeight: 46, paddingHorizontal: 18 },
  label: { fontSize: 14, fontWeight: '600', textAlignVertical: 'center' },
  labelLg: { fontSize: 15 },
  labelActive: { fontWeight: '800' },
  count: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.surfaceTertiary, alignItems: 'center' },
  countActive: { backgroundColor: colors.onBrandPrimary },
  countText: { fontSize: 12, lineHeight: 16, fontWeight: '800', includeFontPadding: false },
});
