import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LP, KM } from './theme';

const DAY_LABELS = ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];
const HOUR_LABELS = ['12ص', '3', '6', '9', '12ظ', '3', '6', '9'];

export default function OrderHeatmap({ apiCall }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await apiCall('/api/merchant/live-preview/heatmap');
        if (alive) setData(d);
      } catch (e: any) { Alert.alert('خطأ', e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <View style={{ padding: 20 }}><ActivityIndicator color={LP.GOLD} /></View>;
  if (!data) return null;

  const peakDayLabel = DAY_LABELS[data.peak_day_of_week] || '—';
  const peakHour = data.peak_hour;
  const peakHourLabel = `${peakHour === 0 ? 12 : peakHour > 12 ? peakHour - 12 : peakHour}${peakHour < 12 ? ' ص' : ' م'}`;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="flame" size={16} color={LP.GOLD} />
        <Text style={s.title}>أفضل الأوقات للطلبات</Text>
      </View>

      <View style={s.peakBox}>
        <View style={s.peakChip}>
          <Ionicons name="calendar" size={12} color={LP.GOLD} />
          <Text style={s.peakLabel}>ذروة اليوم:</Text>
          <Text style={s.peakValue}>{peakDayLabel}</Text>
        </View>
        <View style={s.peakChip}>
          <Ionicons name="time" size={12} color={LP.GOLD} />
          <Text style={s.peakLabel}>ذروة الساعة:</Text>
          <Text style={s.peakValue}>{peakHourLabel}</Text>
        </View>
      </View>

      {/* Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
        <View>
          {/* Hour labels row */}
          <View style={s.row}>
            <View style={s.dayLabel} />
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h, i) => (
              <View key={h} style={[s.hourLabelCell, { width: 3 * 15 }]}>
                <Text style={s.hourLabel}>{HOUR_LABELS[i]}</Text>
              </View>
            ))}
          </View>
          {data.grid.map((row: any[], dowIdx: number) => (
            <View key={dowIdx} style={s.row}>
              <View style={s.dayLabel}>
                <Text style={s.dayLabelText}>{DAY_LABELS[dowIdx]}</Text>
              </View>
              {row.map((cell: any) => (
                <View key={cell.hour}
                  style={[s.cell, {
                    backgroundColor: cell.intensity > 0
                      ? `rgba(245, 197, 24, ${Math.max(0.08, cell.intensity)})`
                      : LP.CARD_2,
                    borderColor: cell.intensity > 0.7 ? LP.GOLD : LP.BORDER_SOFT,
                  }]}>
                  {cell.count > 0 && cell.intensity > 0.5 && (
                    <Text style={s.cellCount}>{cell.count}</Text>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={s.legend}>
        <Text style={s.legendLabel}>أقل</Text>
        {[0.15, 0.35, 0.55, 0.75, 0.95].map(o => (
          <View key={o} style={[s.legendCell, { backgroundColor: `rgba(245, 197, 24, ${o})` }]} />
        ))}
        <Text style={s.legendLabel}>أعلى</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.legendLabel}>الذروة: {KM(data.max_value)} طلب</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: LP.CARD,
    borderWidth: 1, borderColor: LP.BORDER,
    borderRadius: 16, padding: 14, marginHorizontal: 12, marginTop: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { color: LP.GOLD, fontSize: 13, fontWeight: '900', flex: 1, textAlign: 'right' },
  peakBox: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  peakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: LP.GOLD + '15', borderWidth: 1, borderColor: LP.GOLD + '55',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  peakLabel: { color: LP.MUTED, fontSize: 10 },
  peakValue: { color: LP.GOLD, fontSize: 12, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2 },
  dayLabel: { width: 42, alignItems: 'flex-end', paddingEnd: 6 },
  dayLabelText: { color: LP.MUTED, fontSize: 10 },
  hourLabelCell: { alignItems: 'flex-start' },
  hourLabel: { color: LP.MUTED, fontSize: 9 },
  cell: {
    width: 14, height: 14, borderRadius: 3,
    borderWidth: 0.5, marginHorizontal: 0.5,
    alignItems: 'center', justifyContent: 'center',
  },
  cellCount: { color: LP.BG, fontSize: 8, fontWeight: '900' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: LP.BORDER_SOFT },
  legendCell: { width: 14, height: 10, borderRadius: 2 },
  legendLabel: { color: LP.MUTED, fontSize: 10, marginHorizontal: 3 },
});
