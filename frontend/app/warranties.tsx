import { useT, curLang } from '../src/i18n';
import { tSync, tf } from '../src/useAutoT';
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import TranslatableName from '../src/components/TranslatableName';

export default function WarrantiesScreen() {
  useT(); // re-render when language or on-demand translations change
  const router = useRouter();
  const { apiCall } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { const d = await apiCall('/api/warranties'); setItems(d); } catch {} finally { setLoading(false); } })(); }, []);

  const daysLeft = (end: string) => { const d = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000); return d > 0 ? d : 0; };

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color="#F5C518" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="warr-back" style={s.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>{tSync('الضمانات', curLang())}</Text>
      </View>
      {items.length === 0 ? (
        <View style={s.empty}><Ionicons name="shield-checkmark-outline" size={48} color="#A1A1AA" /><Text style={s.emptyText}>{tSync('ما في ضمانات نشطة', curLang())}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {items.map(w => (
            <View key={w.id} style={s.card}>
              <View style={s.cardTop}>
                <View style={[s.statusBadge, { backgroundColor: (w.status === 'active' && daysLeft(w.end_date) > 0) ? '#DCFCE7' : '#FEF2F2' }]}>
                  <Ionicons name={(w.status === 'active' && daysLeft(w.end_date) > 0) ? 'shield-checkmark' : 'shield'} size={14} color={(w.status === 'active' && daysLeft(w.end_date) > 0) ? '#10B981' : '#EF4444'} />
                  <Text style={[s.statusText, { color: (w.status === 'active' && daysLeft(w.end_date) > 0) ? '#10B981' : '#EF4444' }]}>{tSync((w.status === 'active' && daysLeft(w.end_date) > 0) ? 'ساري' : 'منتهي', curLang())}</Text>
                </View>
                {daysLeft(w.end_date) > 0 && <Text style={s.daysLeft}>{tf('متبقي {0} يوم', curLang(), [daysLeft(w.end_date)])}</Text>}
              </View>
              <TranslatableName text={w.product_name} style={s.productName} />
              <TranslatableName text={w.service_name} style={s.serviceName} />
              <View style={s.infoRow}><Text style={s.infoLabel}>{tSync('مدة الضمان', curLang())}</Text><Text style={s.infoVal}>{tf('{0} يوم', curLang(), [w.warranty_days])}</Text></View>
              <View style={s.infoRow}><Text style={s.infoLabel}>{tSync('تاريخ البداية', curLang())}</Text><Text style={s.infoVal}>{w.start_date}</Text></View>
              <View style={s.infoRow}><Text style={s.infoLabel}>{tSync('تاريخ الانتهاء', curLang())}</Text><Text style={s.infoVal}>{w.end_date}</Text></View>
              <View style={s.progressWrap}>
                <View style={s.progressBar}><View style={[s.progressFill, daysLeft(w.end_date) <= 0 && { backgroundColor: '#6B7280' }, { width: `${Math.max(0, 100 - (daysLeft(w.end_date) / w.warranty_days * 100))}%` }]} /></View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' }, load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 16, color: '#52525B' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  daysLeft: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
  productName: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 2 },
  serviceName: { fontSize: 13, color: '#F5C518', fontWeight: '500', marginBottom: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { fontSize: 13, color: '#52525B' }, infoVal: { fontSize: 13, fontWeight: '500', color: '#0A0A0A' },
  progressWrap: { marginTop: 10 },
  progressBar: { height: 6, backgroundColor: '#E4E4E7', borderRadius: 3 },
  progressFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },
});
