import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polyline, Defs, LinearGradient as SvgGrad, Stop, Polygon, Circle, Rect } from 'react-native-svg';
import { LP } from './theme';

const { width: SCREEN } = Dimensions.get('window');

/* ─────── KPI GLASS CARD ─────── */
export function KpiCard({ icon, label, value, sub, color = LP.GOLD, flex = 1 }: any) {
  return (
    <View style={[st.kpi, { flex }]}>
      <View style={[st.kpiIcon, { backgroundColor: color + '20', borderColor: color + '55' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={st.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={st.kpiLabel} numberOfLines={1}>{label}</Text>
      {!!sub && <Text style={[st.kpiSub, { color }]} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

/* ─────── SPARKLINE ─────── */
export function Sparkline({ data, color = LP.GOLD, height = 60, fill = true }: any) {
  const w = SCREEN - 60;
  if (!data || data.length === 0) {
    return <View style={{ height, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: LP.MUTED, fontSize: 11 }}>لا بيانات</Text></View>;
  }
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const stepX = w / Math.max(data.length - 1, 1);
  const points = data.map((v: number, i: number) => {
    const x = i * stepX;
    const y = height - ((v - min) / (max - min || 1)) * (height - 10) - 4;
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${w},${height}`;
  const gradId = `spark-${color.replace('#', '')}`;
  return (
    <Svg width={w} height={height}>
      <Defs>
        <SvgGrad id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.35" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGrad>
      </Defs>
      {fill && <Polygon points={areaPoints} fill={`url(#${gradId})`} />}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

/* ─────── BAR MINI CHART ─────── */
export function BarChart({ data, color = LP.GOLD, height = 80, labels }: any) {
  const w = SCREEN - 60;
  if (!data || data.length === 0) return <View style={{ height, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: LP.MUTED }}>لا بيانات</Text></View>;
  const max = Math.max(1, ...data);
  const gap = 4;
  const barW = (w - gap * (data.length - 1)) / data.length;
  return (
    <View>
      <Svg width={w} height={height}>
        {data.map((v: number, i: number) => {
          const h = (v / max) * (height - 14);
          const x = i * (barW + gap);
          const y = height - h - 2;
          return (
            <Rect key={i} x={x} y={y} width={barW} height={h} rx={3}
              fill={color} opacity={0.85} />
          );
        })}
      </Svg>
      {labels && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          {labels.map((l: string, i: number) => <Text key={i} style={{ color: LP.MUTED, fontSize: 9 }}>{l}</Text>)}
        </View>
      )}
    </View>
  );
}

/* ─────── HORIZONTAL BAR ─────── */
export function HBar({ label, value, max, color = LP.GOLD, secondary }: any) {
  const pct = Math.max(2, Math.min(100, (value / (max || 1)) * 100));
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: LP.TEXT, fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' }}>{label}</Text>
        <Text style={{ color, fontSize: 12, fontWeight: '900' }}>{value.toLocaleString('ar-SA')}</Text>
        {secondary !== undefined && <Text style={{ color: LP.MUTED, fontSize: 10, marginStart: 6 }}>{secondary}</Text>}
      </View>
      <View style={{ height: 8, backgroundColor: LP.BORDER_SOFT, borderRadius: 4, overflow: 'hidden' }}>
        <LinearGradient colors={[color, color + 'AA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ width: `${pct}%`, height: '100%', borderRadius: 4 }} />
      </View>
    </View>
  );
}

/* ─────── RATING BREAKDOWN ─────── */
export function RatingBreakdown({ distribution, total, avg }: any) {
  const tot = total || distribution.reduce((a: number, b: number) => a + b, 0) || 1;
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <View style={{ alignItems: 'center', width: 82 }}>
        <Text style={{ color: LP.GOLD, fontSize: 32, fontWeight: '900' }}>{Number(avg || 0).toFixed(1)}</Text>
        <View style={{ flexDirection: 'row', gap: 1 }}>
          {[1,2,3,4,5].map(i => <Ionicons key={i} name="star" size={11} color={(avg || 0) >= i ? LP.GOLD : LP.BORDER} />)}
        </View>
        <Text style={{ color: LP.MUTED, fontSize: 10, marginTop: 2 }}>{tot} تقييم</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        {[5, 4, 3, 2, 1].map((star, idx) => {
          const cnt = distribution[idx] || 0;
          const pct = (cnt / tot) * 100;
          return (
            <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: LP.MUTED, fontSize: 10, width: 12 }}>{star}</Text>
              <Ionicons name="star" size={10} color={LP.GOLD} />
              <View style={{ flex: 1, height: 6, backgroundColor: LP.BORDER_SOFT, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: star >= 4 ? LP.SUCCESS : star === 3 ? LP.WARN : LP.DANGER }} />
              </View>
              <Text style={{ color: LP.MUTED, fontSize: 10, width: 22, textAlign: 'left' }}>{cnt}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ─────── ENTITY PILL (for interconnected navigation) ─────── */
export function EntityPill({ image, name, subtitle, icon, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={st.pill}>
      {image ? (
        <Image source={{ uri: image }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" />
      ) : (
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: LP.GOLD + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon || 'person'} size={16} color={LP.GOLD} />
        </View>
      )}
      <View style={{ flex: 1, marginHorizontal: 8 }}>
        <Text style={{ color: LP.TEXT, fontSize: 12, fontWeight: '800', textAlign: 'right' }} numberOfLines={1}>{name}</Text>
        {!!subtitle && <Text style={{ color: LP.MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-back" size={16} color={LP.MUTED} />
    </TouchableOpacity>
  );
}

/* ─────── SECTION HEADER ─────── */
export function Section({ icon, title, action }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10, gap: 6 }}>
      <Ionicons name={icon} size={16} color={LP.GOLD} />
      <Text style={{ color: LP.GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right', flex: 1 }}>{title}</Text>
      {action}
    </View>
  );
}

const st = StyleSheet.create({
  kpi: {
    backgroundColor: LP.CARD_2,
    borderWidth: 1,
    borderColor: LP.BORDER_SOFT,
    borderRadius: 14,
    padding: 10,
    minHeight: 88,
  },
  kpiIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 6 },
  kpiValue: { color: LP.TEXT, fontSize: 18, fontWeight: '900', textAlign: 'right' },
  kpiLabel: { color: LP.MUTED, fontSize: 10, textAlign: 'right', marginTop: 1 },
  kpiSub: { fontSize: 9, fontWeight: '700', marginTop: 3, textAlign: 'right' },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT,
    padding: 8, borderRadius: 12, marginBottom: 6,
  },
});
