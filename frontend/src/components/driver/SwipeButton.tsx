/** Swipe-to-confirm pill (prevents accidental taps while driving). RTL-aware: swipes toward the leading edge in Arabic. */
import { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, I18nManager, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';

type Props = { label: string; onConfirm: () => void | Promise<void>; tone?: 'brand' | 'success' | 'error'; loading?: boolean; testID?: string };
const KNOB = 52;

export default function SwipeButton({ label, onConfirm, tone = 'brand', loading, testID }: Props) {
  const s = useStyles();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const dir = I18nManager.isRTL ? -1 : 1;
  const max = Math.max(0, w - KNOB - 8);
  const bg = tone === 'success' ? colors.success : tone === 'error' ? colors.error : colors.brand;
  const cb = useRef(onConfirm);
  cb.current = onConfirm; // pan handlers are memoized — always call the latest handler
  const fire = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await cb.current();
    Animated.timing(x, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => x.setValue(Math.min(max, Math.max(0, g.dx * dir))),
    onPanResponderRelease: (_, g) => {
      if (g.dx * dir > max * 0.75) Animated.timing(x, { toValue: max, duration: 120, useNativeDriver: false }).start(fire);
      else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
    },
  }), [max, dir]);
  const fill = x.interpolate({ inputRange: [0, Math.max(1, max)], outputRange: [KNOB + 8, w || KNOB + 8], extrapolate: 'clamp' });

  return (
    <View style={[s.track, { borderColor: bg }]} onLayout={(e) => setW(e.nativeEvent.layout.width)} testID={testID}>
      <Animated.View style={[s.fill, { width: fill, backgroundColor: bg }, I18nManager.isRTL ? { right: 0 } : { left: 0 }]} />
      <Text style={s.label} numberOfLines={1}>{label}</Text>
      {loading ? <View style={[s.knob, { backgroundColor: bg }]}><ActivityIndicator color={colors.onBrandPrimary} /></View> : (
        <Animated.View {...pan.panHandlers} style={[s.knob, { backgroundColor: bg, transform: [{ translateX: Animated.multiply(x, dir) }] }]}>
          <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={26} color={colors.onBrandPrimary} />
        </Animated.View>
      )}
      {/* Tap fallback for web/mouse & accessibility */}
      {Platform.OS === 'web' && !loading && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} testID={testID ? `${testID}-tap` : undefined}
          style={StyleSheet.absoluteFill} onLongPress={fire} delayLongPress={350} />
      )}
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    track: { height: KNOB + 8, borderRadius: 999, borderWidth: 2, backgroundColor: colors.surfaceSecondary, justifyContent: 'flex-start', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
    fill: { position: 'absolute', top: 0, bottom: 0, opacity: 0.25 },
    label: { position: 'absolute', left: KNOB + 12, right: KNOB + 12, textAlign: 'center', color: colors.onSurface, fontSize: 16, fontWeight: '800' },
    knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  }), [themeKey]);
}
