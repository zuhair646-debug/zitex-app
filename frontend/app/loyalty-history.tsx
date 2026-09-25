import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { LoyaltyWidget } from '../src/components/PaymentAndLoyalty';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';

const SOURCE_ICON: any = {
  order: 'cart', service: 'construct', competition: 'trophy',
  review: 'star', referral: 'people', birthday: 'gift',
  checkout: 'card', admin: 'shield',
};
const SOURCE_LABEL: any = {
  order: 'شراء منتج', service: 'حجز صيانة', competition: 'مسابقة',
  review: 'تقييم', referral: 'دعوة صديق', birthday: 'عيد الميلاد',
  checkout: 'استبدال', admin: 'إدارة',
};

export default function LoyaltyHistoryScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiCall('/api/loyalty/history');
        setTxs(d.transactions || []);
      } catch (e) {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={s.title}>نقاط الولاء</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        <LoyaltyWidget apiCall={apiCall} />

        <View style={s.perkGrid}>
          <View style={s.perkCard}>
            <Ionicons name="rocket" size={20} color={GOLD} />
            <Text style={s.perkTitle}>اكسب نقاط</Text>
            <Text style={s.perkDesc}>على كل ريال تنفقه</Text>
          </View>
          <View style={s.perkCard}>
            <Ionicons name="gift" size={20} color={GOLD} />
            <Text style={s.perkTitle}>استبدل</Text>
            <Text style={s.perkDesc}>نقاطك بخصومات</Text>
          </View>
          <View style={s.perkCard}>
            <Ionicons name="medal" size={20} color={GOLD} />
            <Text style={s.perkTitle}>ارتقِ</Text>
            <Text style={s.perkDesc}>لمستويات أعلى بمزايا</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>سجل النقاط</Text>
        {loading && <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />}
        {!loading && txs.length === 0 && (
          <Text style={{ color: MUTED, textAlign: 'center', padding: 30 }}>لا توجد معاملات بعد</Text>
        )}
        {!loading && txs.map((t: any, i: number) => (
          <View key={t.id || i} style={s.txRow}>
            <View style={[s.txIcon, { backgroundColor: (t.kind === 'earn' ? '#10B981' : '#EF4444') + '25' }]}>
              <Ionicons name={SOURCE_ICON[t.source] || 'sparkles'} size={16} color={t.kind === 'earn' ? '#10B981' : '#EF4444'} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <Text style={s.txDesc}>{t.description || SOURCE_LABEL[t.source] || t.source}</Text>
              <Text style={s.txMeta}>{SOURCE_LABEL[t.source] || t.source} · {(t.created_at || '').slice(0, 10)}</Text>
            </View>
            <Text style={[s.txAmount, { color: t.kind === 'earn' ? '#10B981' : '#EF4444' }]}>
              {t.kind === 'earn' ? '+' : ''}{t.points}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: GOLD, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  perkGrid: { flexDirection: 'row', gap: 8, marginTop: 6 },
  perkCard: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 12, alignItems: 'center' },
  perkTitle: { color: TEXT, fontSize: 12, fontWeight: '900', marginTop: 6 },
  perkDesc: { color: MUTED, fontSize: 10, marginTop: 2, textAlign: 'center' },
  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right', marginTop: 20, marginBottom: 10 },
  txRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 12, borderRadius: 12, marginBottom: 6 },
  txIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  txDesc: { color: TEXT, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  txMeta: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '900' },
});
