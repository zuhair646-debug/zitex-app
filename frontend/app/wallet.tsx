import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function WalletScreen() {
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { try { const d = await apiCall('/api/wallet'); setWallet(d); } catch {} finally { setLoading(false); } })();
  }, []);

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="wallet-back" style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={s.title}>Wallet</Text>
      </View>
      <View style={s.cards}>
        <View style={s.balanceCard}>
          <Ionicons name="wallet" size={28} color="#FFF" />
          <Text style={s.balanceLabel}>Balance</Text>
          <Text style={s.balanceVal}>{wallet?.balance || 0} SAR</Text>
          <TouchableOpacity testID="topup-btn" style={s.topupBtn}><Text style={s.topupText}>Top up</Text></TouchableOpacity>
        </View>
        <View style={s.pointsCard}>
          <Ionicons name="diamond" size={28} color="#F59E0B" />
          <Text style={s.pointsLabel}>Points</Text>
          <Text style={s.pointsVal}>{wallet?.points || 0}</Text>
        </View>
      </View>
      <Text style={s.sectionTitle}>Transaction History</Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
        {(wallet?.transactions || []).length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>No transactions yet</Text></View>
        ) : (wallet?.transactions || []).map((t: any) => (
          <View key={t.id} style={s.txnRow}>
            <View style={[s.txnIcon, { backgroundColor: t.type === 'credit' ? '#DCFCE7' : '#EFE6FF' }]}>
              <Ionicons name={t.type === 'credit' ? 'arrow-down' : 'diamond'} size={18} color={t.type === 'credit' ? '#10B981' : '#8833FF'} />
            </View>
            <View style={s.txnInfo}>
              <Text style={s.txnDesc}>{t.description}</Text>
              <Text style={s.txnDate}>{t.created_at?.split('T')[0]}</Text>
            </View>
            <Text style={[s.txnAmount, { color: t.type === 'credit' ? '#10B981' : '#8833FF' }]}>
              {t.type === 'credit' ? '+' : '+'}{t.amount} {t.type === 'points' ? 'pts' : 'SAR'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  cards: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 24 },
  balanceCard: { flex: 2, backgroundColor: '#8833FF', borderRadius: 20, padding: 20, gap: 4 },
  balanceLabel: { fontSize: 13, color: '#FFF', opacity: 0.8 },
  balanceVal: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  topupBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 8 },
  topupText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  pointsCard: { flex: 1, backgroundColor: '#FEF3C7', borderRadius: 20, padding: 20, gap: 4 },
  pointsLabel: { fontSize: 13, color: '#92400E' },
  pointsVal: { fontSize: 28, fontWeight: '800', color: '#92400E' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', paddingHorizontal: 20, marginBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: '#A1A1AA' },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  txnIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 14, fontWeight: '500', color: '#0A0A0A', marginBottom: 2 },
  txnDate: { fontSize: 12, color: '#A1A1AA' },
  txnAmount: { fontSize: 16, fontWeight: '700' },
});
