/** Animated Zenrex brand: the ZENREX wordmark shows first, then shrinks + spins into the full gold logo. */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';

const SIZE = 44;
const HOLD_TEXT = 2600;
const HOLD_LOGO = 7000;

export default function ZenBrand() {
  const s = useStyles();
  const p = useRef(new Animated.Value(0)).current; // 0 = wordmark, 1 = logo

  useEffect(() => {
    const swap = (to: number) => Animated.timing(p, { toValue: to, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(HOLD_TEXT), swap(1), Animated.delay(HOLD_LOGO), swap(0),
    ]));
    loop.start();
    return () => loop.stop();
  }, [p]);

  const textStyle = {
    opacity: p.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [
      { scale: p.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0.35], extrapolate: 'clamp' }) },
      { rotate: p.interpolate({ inputRange: [0, 0.5], outputRange: ['0deg', '-90deg'], extrapolate: 'clamp' }) },
    ],
  };
  const logoStyle = {
    opacity: p.interpolate({ inputRange: [0.35, 0.7], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { scale: p.interpolate({ inputRange: [0.35, 0.85, 1], outputRange: [0.3, 1.08, 1], extrapolate: 'clamp' }) },
      { rotate: p.interpolate({ inputRange: [0.35, 1], outputRange: ['-270deg', '0deg'], extrapolate: 'clamp' }) },
    ],
  };

  return (
    <View style={s.wrap} testID="driver-brand" pointerEvents="none">
      <Animated.Text style={[s.word, textStyle]}>ZENREX</Animated.Text>
      <Animated.Image source={require('../../../assets/images/zenrex-logo.png')} style={[s.logo, logoStyle]} resizeMode="cover" />
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    wrap: { width: 118, height: SIZE, alignItems: 'center', justifyContent: 'center' },
    word: {
      position: 'absolute', color: colors.brand, fontSize: 13, fontWeight: '900', letterSpacing: 2, overflow: 'hidden',
      fontFamily: 'serif', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand, borderRadius: 18,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    logo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: 10, borderWidth: 1, borderColor: colors.brand },
  }), [themeKey]);
}
