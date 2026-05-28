import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';

export default function GroupBuysScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const { t, lang } = useT();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/group-buys'); setItems(d); }
    catch (e: any) { Alert.alert(t('common.error'), e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const join = async (gid: string) => {
    setJoining(gid);
    try {
      const r = await apiCall(`/api/group-buys/${gid}/join`, { method: 'POST' });
      setJoined(prev => new Set([...prev, gid]));
      Alert.alert(t('common.success'), r.min_reached ? t('gb.activated') : '✅ ' + t('gb.joined'));
      load();
    } catch (e: any) { Alert.alert(t('common.error'), e.message); }
    finally { setJoining(null); }
  };

  const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>👥 {t('gb.title')}</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={s.heroBox}>
        <Ionicons name="people" size={32} color="white" />
        <Text style={s.heroTitle}>{t('gb.subtitle')}</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 14 }}>
          {items.length === 0 && <Text style={s.empty}>{t('gb.empty')}</Text>}
          {items.map(g => {
            const dl = daysLeft(g.end_date);
            const minReached = g.participant_count >= g.min_participants;
            const isJoined = joined.has(g.id);
            const product = g.product || {};
            const orig = product.original_price || 0;
            const saved = orig - g.group_price;
            const savedPct = orig ? Math.round((saved / orig) * 100) : 0;
            return (
              <View key={g.id} style={s.card}>
                <View style={{ flexDirection: 'row' }}>
                  {product.image && <Image source={{ uri: product.image }} style={s.img} />}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.gTitle}>{g.title}</Text>
                    <Text style={s.gProduct} numberOfLines={1}>{lang === 'ar' ? product.name_ar : product.name_en}</Text>
                    <View style={s.priceRow}>
                      <Text style={s.gPrice}>{g.group_price} {t('common.currency')}</Text>
                      {orig > g.group_price && <Text style={s.gOrig}>{orig}</Text>}
                      {savedPct > 0 && <View style={s.discountBadge}><Text style={s.discountText}>-{savedPct}%</Text></View>}
                    </View>
                  </View>
                </View>
                <View style={s.statsRow}>
                  <View style={s.stat}><Ionicons name="people" size={14} color="#8833FF" /><Text style={s.statText}>{g.participant_count}/{g.min_participants} {t('gb.participants')}</Text></View>
                  <View style={s.stat}><Ionicons name="time" size={14} color="#F59E0B" /><Text style={s.statText}>{dl} {t('comp.daysLeft')}</Text></View>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${Math.min(100, g.progress_pct || 0)}%`, backgroundColor: minReached ? '#10B981' : '#8833FF' }]} />
                </View>
                <TouchableOpacity disabled={isJoined || joining === g.id} onPress={() => join(g.id)} style={[s.joinBtn, isJoined && { backgroundColor: '#10B981' }]}>
                  {joining === g.id ? <ActivityIndicator color="white" size="small" /> : <Text style={s.joinText}>{isJoined ? '✓ ' + t('gb.joined') : t('gb.join')}</Text>}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white' },
  title: { fontSize: 17, fontWeight: '800' },
  heroBox: { backgroundColor: '#8833FF', padding: 20, alignItems: 'center' },
  heroTitle: { color: 'white', fontSize: 14, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 14, marginBottom: 10 },
  img: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#F3F4F6' },
  gTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A' },
  gProduct: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  gPrice: { fontSize: 18, fontWeight: '900', color: '#8833FF' },
  gOrig: { fontSize: 13, color: '#9CA3AF', textDecorationLine: 'line-through' },
  discountBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  discountText: { color: '#DC2626', fontSize: 11, fontWeight: '800' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  progressBar: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginVertical: 10, overflow: 'hidden' },
  progressFill: { height: '100%' },
  joinBtn: { backgroundColor: '#8833FF', padding: 12, borderRadius: 10, alignItems: 'center' },
  joinText: { color: 'white', fontWeight: '800', fontSize: 14 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
});
