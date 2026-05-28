import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';

export default function PointsScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const { t } = useT();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [redeemModal, setRedeemModal] = useState(false);
  const [redeemAmt, setRedeemAmt] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/points/me'); setData(d); }
    catch (e: any) { Alert.alert(t('common.error'), e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const redeem = async () => {
    const amt = parseInt(redeemAmt);
    if (!amt || amt < 10) { Alert.alert(t('common.error'), '10 نقاط على الأقل / Minimum 10 points'); return; }
    setRedeeming(true);
    try {
      const r = await apiCall('/api/points/redeem', { method: 'POST', body: JSON.stringify({ points: amt }) });
      Alert.alert(t('common.success'), `${r.sar_credited} ${t('common.currency')}`);
      setRedeemModal(false); setRedeemAmt(''); load();
    } catch (e: any) { Alert.alert(t('common.error'), e.message); }
    finally { setRedeeming(false); }
  };

  if (loading || !data) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  const tierColor = data.tier === 'ذهبي' || data.tier === 'Gold' ? '#FFD700' : data.tier === 'فضي' || data.tier === 'Silver' ? '#C0C0C0' : '#CD7F32';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>🎖️ {t('points.title')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
        <View style={s.hero}>
          <Text style={s.heroLabel}>{t('points.balance')}</Text>
          <Text style={s.heroValue}>{data.balance}</Text>
          <View style={[s.tierBadge, { backgroundColor: tierColor }]}>
            <Text style={s.tierText}>{data.tier}</Text>
          </View>
          <Text style={s.heroSub}>{t('points.value')}: {data.value_sar} {t('common.currency')}</Text>
          <Text style={s.heroSub}>{t('points.earnRate')}</Text>
        </View>

        <TouchableOpacity style={s.redeemBtn} onPress={() => setRedeemModal(true)} disabled={data.balance < 10}>
          <Ionicons name="gift" size={20} color="white" />
          <Text style={s.redeemText}>{t('points.redeem')}</Text>
        </TouchableOpacity>

        <Text style={s.section}>📜 {t('points.history')}</Text>
        {(data.history || []).length === 0 && <Text style={s.empty}>—</Text>}
        {(data.history || []).map((h: any) => (
          <View key={h.id || h._id || Math.random()} style={s.historyItem}>
            <View style={{ flex: 1 }}>
              <Text style={s.histReason}>{h.reason}</Text>
              <Text style={s.histDate}>{new Date(h.created_at).toLocaleDateString('ar')}</Text>
            </View>
            <Text style={[s.histDelta, { color: h.delta > 0 ? '#10B981' : '#EF4444' }]}>{h.delta > 0 ? '+' : ''}{h.delta}</Text>
          </View>
        ))}
      </ScrollView>

      <Modal visible={redeemModal} transparent animationType="slide" onRequestClose={() => setRedeemModal(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('points.redeem')}</Text>
            <Text style={s.modalHint}>10 نقاط = 1 ر.س للمحفظة</Text>
            <TextInput style={s.modalInput} keyboardType="numeric" value={redeemAmt} onChangeText={setRedeemAmt} placeholder={`${data.balance} ${t('points.balance')}`} />
            <Text style={s.modalCalc}>{(parseInt(redeemAmt) || 0) * 0.1} {t('common.currency')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.modalBtn, s.modalCancel]} onPress={() => setRedeemModal(false)}><Text style={s.modalBtnText}>{t('common.cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalConfirm]} onPress={redeem} disabled={redeeming}>
                {redeeming ? <ActivityIndicator color="white" size="small" /> : <Text style={[s.modalBtnText, { color: 'white' }]}>{t('common.confirm')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white' },
  title: { fontSize: 17, fontWeight: '800' },
  hero: { backgroundColor: '#8833FF', padding: 24, borderRadius: 20, alignItems: 'center' },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  heroValue: { color: 'white', fontSize: 56, fontWeight: '900', marginTop: 6 },
  tierBadge: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 16, marginTop: 8 },
  tierText: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.95)', fontSize: 12, marginTop: 8, fontWeight: '600' },
  redeemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', padding: 14, borderRadius: 12, marginTop: 14 },
  redeemText: { color: 'white', fontWeight: '800', fontSize: 15 },
  section: { fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  empty: { color: '#9CA3AF', textAlign: 'center' },
  historyItem: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 10, marginBottom: 6, alignItems: 'center' },
  histReason: { fontSize: 13, fontWeight: '600' },
  histDate: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  histDelta: { fontSize: 16, fontWeight: '800' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: 'white', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  modalHint: { fontSize: 12, color: '#6B7280', marginBottom: 14 },
  modalInput: { backgroundColor: '#F3F4F6', padding: 14, borderRadius: 10, fontSize: 18, textAlign: 'center', fontWeight: '700' },
  modalCalc: { textAlign: 'center', color: '#10B981', fontSize: 16, fontWeight: '800', marginVertical: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  modalCancel: { backgroundColor: '#F3F4F6' },
  modalConfirm: { backgroundColor: '#8833FF' },
  modalBtnText: { fontWeight: '800' },
});
