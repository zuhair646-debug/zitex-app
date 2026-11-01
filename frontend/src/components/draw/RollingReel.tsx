/** Slot-style name reel: spins fast, slows down, lands on the server-chosen winner (same 4s timing as the video). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { tSync } from '../../useAutoT';
import { curLang } from '../../i18n';

export const ROLL_MS = 4000;

type Props = { names: string[]; winner: { k: number; name: string; phone: string; n: number }; compact?: boolean; testID?: string };

export default function RollingReel({ names, winner, compact, testID }: Props) {
  const s = useStyles();
  const [shown, setShown] = useState(names[0] || '…');
  const [landed, setLanded] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true, delay = 45, i = 0;
    const t0 = Date.now();
    const tick = () => {
      if (!alive) return;
      if (Date.now() - t0 >= ROLL_MS - 80) {
        setShown(winner.name); setLanded(true);
        Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
        return;
      }
      i += 1;
      setShown(names.length ? names[(i * 7 + winner.k * 13) % names.length] : '…');
      delay = Math.min(420, delay * 1.11);
      setTimeout(tick, delay);
    };
    tick();
    return () => { alive = false; };
  }, [names, winner, pop]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return (
    <Animated.View testID={testID} style={[s.box, compact && s.boxCompact, landed && s.boxWin, { transform: [{ scale }] }]}>
      {landed ? <Text style={s.rank}>{tSync('الفائز رقم', curLang())} {winner.k}</Text> : null}
      <Text style={[s.name, compact && s.nameCompact, landed && s.nameWin]} numberOfLines={1}>{shown}</Text>
      {landed ? <Text style={s.meta}>{'\u2066' + winner.phone + '\u2069'}  •  {tSync('مشارك رقم', curLang())} {winner.n}</Text> : null}
    </Animated.View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    box: { borderRadius: 18, borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.surface, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minHeight: 110 },
    boxCompact: { paddingVertical: 10, minHeight: 72 },
    boxWin: { borderWidth: 3, backgroundColor: colors.brandTertiary },
    rank: { color: colors.brand, fontWeight: '800', fontSize: 12, marginBottom: 2 },
    name: { color: colors.onSurface, fontSize: 26, fontWeight: '900', textAlign: 'center' },
    nameCompact: { fontSize: 20 },
    nameWin: { color: colors.brand },
    meta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  }), [themeKey]);
}
