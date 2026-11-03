/** Winner celebration: falling confetti + trophy + winner names (pure Animated, no extra deps). */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CONFETTI = ['#F5C518', '#E8C778', '#10B981', '#3B82F6', '#EF4444', '#A855F7', '#FFFFFF'];

function Piece({ i, width, height }: { i: number; width: number; height: number }) {
  const y = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => ({
    x: Math.random() * width, size: 6 + Math.random() * 8, delay: Math.random() * 1200,
    dur: 2600 + Math.random() * 2200, drift: (Math.random() - 0.5) * 120, color: CONFETTI[i % CONFETTI.length], round: i % 3 === 0,
  }), [i, width]);
  useEffect(() => {
    const a = Animated.loop(Animated.timing(y, { toValue: 1, duration: cfg.dur, delay: cfg.delay, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [y, cfg]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', top: -20, left: cfg.x, width: cfg.size, height: cfg.round ? cfg.size : cfg.size * 1.8,
      borderRadius: cfg.round ? cfg.size : 2, backgroundColor: cfg.color,
      transform: [
        { translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
        { translateX: y.interpolate({ inputRange: [0, 1], outputRange: [0, cfg.drift] }) },
        { rotate: y.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + i * 40}deg`] }) },
      ],
    }} />
  );
}

type Props = { visible: boolean; title: string; subtitle?: string; winners: { k: number; name: string; phone?: string }[]; closeText: string; onClose: () => void };

export default function Celebration({ visible, title, subtitle, winners, closeText, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) { pop.setValue(0); Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start(); }
  }, [visible, pop]);
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={st.bg} testID="draw-celebration">
        {visible ? Array.from({ length: 48 }).map((_, i) => <Piece key={i} i={i} width={width} height={height} />) : null}
        <Animated.View style={[st.card, { transform: [{ scale: pop }] }]}>
          <View style={st.trophy}><Ionicons name="trophy" size={46} color="#1A1405" /></View>
          <Text style={st.title}>{title}</Text>
          {subtitle ? <Text style={st.sub}>{subtitle}</Text> : null}
          <ScrollView style={{ maxHeight: height * 0.38, alignSelf: 'stretch' }} contentContainerStyle={{ gap: 8 }}>
            {winners.map(w => (
              <View key={w.k} style={st.row}>
                <View style={st.rank}><Text style={st.rankTxt}>{w.k}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.name}>{w.name}</Text>
                  {w.phone ? <Text style={st.phone}>{'\u2066' + w.phone + '\u2069'}</Text> : null}
                </View>
                <Text style={st.medal}>{w.k === 1 ? '🥇' : w.k === 2 ? '🥈' : w.k === 3 ? '🥉' : '🎉'}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity testID="celebration-close" style={st.btn} onPress={onClose}><Text style={st.btnTxt}>{closeText}</Text></TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Fixed gold-on-dark palette: the celebration must look identical in light and dark themes (it is also filmed)
const st = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(8,6,2,0.86)', justifyContent: 'center', padding: 22, overflow: 'hidden' },
  card: { backgroundColor: '#17130A', borderRadius: 26, borderWidth: 2, borderColor: '#E8C778', padding: 22, alignItems: 'center', gap: 10 },
  trophy: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center', marginTop: -62, borderWidth: 4, borderColor: '#17130A' },
  title: { color: '#F5C518', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  sub: { color: '#D9CFB8', fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(245,197,24,0.10)', borderRadius: 14, padding: 12 },
  rank: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center' },
  rankTxt: { color: '#1A1405', fontWeight: '900' },
  name: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  phone: { color: '#BFB49A', fontSize: 12, marginTop: 2 },
  medal: { fontSize: 24 },
  btn: { alignSelf: 'stretch', minHeight: 50, borderRadius: 14, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  btnTxt: { color: '#1A1405', fontWeight: '900', fontSize: 16 },
});
