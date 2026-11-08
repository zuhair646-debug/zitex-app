import { useT } from '../src/i18n';
import { tSync } from '../src/useAutoT';
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { LoyaltyWidget } from '../src/components/PaymentAndLoyalty';
import TranslatableName from '../src/components/TranslatableName';
import { colors, themed } from '../src/theme/tokens';

export default function WalletScreen() {
  const { lang } = useT();
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { try { const d = await apiCall('/api/wallet'); setWallet(d); } catch {} finally { setLoading(false); } })();
  }, []);

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="wallet-back" style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.title}>{tSync('المحفظة', lang)}</Text>
      </View>
      <View style={s.cards}>
        <View style={s.balanceCard}>
          <Ionicons name="wallet" size={28} color="#FFF" />
          <Text style={s.balanceLabel}>{tSync('الرصيد', lang)}</Text>
          <Text style={s.balanceVal}>{wallet?.balance || 0} {tSync('ر.س', lang)}</Text>
          <TouchableOpacity testID="topup-btn" style={s.topupBtn}><Text style={s.topupText}>{tSync('شحن الرصيد', lang)}</Text></TouchableOpacity>
        </View>
        <View style={s.pointsCard}>
          <Ionicons name="diamond" size={28} color="#F59E0B" />
          <Text style={s.pointsLabel}>{tSync('النقاط', lang)}</Text>
          <Text style={s.pointsVal}>{wallet?.points || 0}</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <LoyaltyWidget apiCall={apiCall} onOpenHistory={() => router.push('/loyalty-history' as any)} />
      </View>
      <Text style={s.sectionTitle}>{tSync('سجل المعاملات', lang)}</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
        {(wallet?.transactions || []).length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>{tSync('ما في معاملات لحد الآن', lang)}</Text></View>
        ) : (wallet?.transactions || []).map((t: any) => (
          <View key={t.id} style={s.txnRow}>
            <View style={[s.txnIcon, { backgroundColor: t.type === 'credit' ? colors.successSoft : colors.brandTertiary }]}>
              <Ionicons name={t.type === 'credit' ? 'arrow-down' : 'diamond'} size={18} color={t.type === 'credit' ? colors.success : colors.brand} />
            </View>
            <View style={s.txnInfo}>
              <TranslatableName text={t.description} style={s.txnDesc} />
              <Text style={s.txnDate}>{t.created_at?.split('T')[0]}</Text>
            </View>
            <Text style={[s.txnAmount, { color: t.type === 'credit' ? colors.success : colors.brand }]}>
              {t.type === 'credit' ? '+' : '+'}{t.amount} {tSync(t.type === 'points' ? 'نقطة' : 'ر.س', lang)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
  cards: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 24 },
  balanceCard: { flex: 2, backgroundColor: colors.brand, borderRadius: 20, padding: 20, gap: 4 },
  balanceLabel: { fontSize: 13, color: '#FFF', opacity: 0.8 },
  balanceVal: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  topupBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 8 },
  topupText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  pointsCard: { flex: 1, backgroundColor: '#FEF3C7', borderRadius: 20, padding: 20, gap: 4 },
  pointsLabel: { fontSize: 13, color: '#92400E' },
  pointsVal: { fontSize: 28, fontWeight: '800', color: '#92400E' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface, paddingHorizontal: 20, marginBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: colors.onSurfaceTertiary },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  txnIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 14, fontWeight: '500', color: colors.onSurface, marginBottom: 2 },
  txnDate: { fontSize: 12, color: colors.onSurfaceTertiary },
  txnAmount: { fontSize: 16, fontWeight: '700' },
}));
