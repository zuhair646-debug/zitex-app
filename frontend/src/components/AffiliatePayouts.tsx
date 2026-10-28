import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../app/_layout';
import { TX, tSync } from '../useAutoT';
import { useT } from '../i18n';

const STATUS: Record<string, [string, string]> = { pending: ['قيد المراجعة', '#F59E0B'], paid: ['تم التحويل', '#10B981'], rejected: ['مرفوض', '#EF4444'] };

/** Marketer side: available balance, payout request (IBAN), history. */
export function MarketerPayouts({ affiliateId }: { affiliateId: string }) {
  const { apiCall } = useAuth();
  const { lang } = useT();
  const [data, setData] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/affiliate/payouts'); setData((d || []).find((x: any) => x.affiliate_id === affiliateId) || null); } catch {}
  }, [affiliateId]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    try {
      await apiCall('/api/affiliate/payouts', { method: 'POST', body: JSON.stringify({ affiliate_id: affiliateId, amount: parseFloat(amount) || 0, iban, account_name: name }) });
      setAmount(''); Alert.alert(tSync('✅ تم', lang), tSync('تم إرسال طلب الصرف للتاجر', lang)); load();
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
    finally { setBusy(false); }
  };

  if (!data) return <ActivityIndicator color="#F5C518" style={{ margin: 16 }} />;
  return (
    <View style={s.card}>
      <TX style={s.title}>💰 أرباحي وطلبات الصرف</TX>
      <View style={s.row}>
        <View style={s.stat}><TX style={s.statLabel}>المتاح للسحب</TX><Text style={s.statVal}>{data.available.toFixed(2)}</Text></View>
        <View style={s.stat}><TX style={s.statLabel}>تم صرفه</TX><Text style={s.statVal}>{data.paid_total.toFixed(2)}</Text></View>
      </View>
      <TextInput testID="payout-amount" style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={tSync('المبلغ (ر.س)', lang)} placeholderTextColor="#777" />
      <TextInput testID="payout-iban" style={s.input} value={iban} onChangeText={setIban} autoCapitalize="characters" placeholder="SA0000000000000000000000" placeholderTextColor="#777" />
      <TextInput testID="payout-name" style={s.input} value={name} onChangeText={setName} placeholder={tSync('اسم صاحب الحساب', lang)} placeholderTextColor="#777" />
      <TouchableOpacity testID="payout-submit" style={s.btn} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#0A0A0A" /> : <TX style={s.btnTxt}>طلب صرف</TX>}
      </TouchableOpacity>
      {data.requests.map((r: any) => (
        <View key={r.id} style={s.req}>
          <Text style={s.reqAmt}>{Number(r.amount).toFixed(2)} {tSync('ر.س', lang)}</Text>
          <Text style={[s.reqStatus, { color: STATUS[r.status]?.[1] }]}>{tSync(STATUS[r.status]?.[0] || r.status, lang)}</Text>
          <Text style={s.reqMeta}>{(r.created_at || '').slice(0, 10)}{r.transfer_ref ? ` • #${r.transfer_ref}` : ''}</Text>
        </View>
      ))}
    </View>
  );
}

/** Merchant side: pending payout requests → record manual transfer or reject. */
export function MerchantPayouts() {
  const { apiCall } = useAuth();
  const { lang } = useT();
  const [list, setList] = useState<any[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setList(await apiCall('/api/merchant/affiliate/payouts')); } catch {} }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, ok: boolean) => {
    try {
      await apiCall(`/api/merchant/affiliate/payouts/${id}/${ok ? 'approve' : 'reject'}`, { method: 'POST', body: JSON.stringify({ transfer_ref: refs[id] || '' }) });
      load();
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };

  if (!list.length) return null;
  return (
    <View style={s.card}>
      <TX style={s.title}>🏦 طلبات صرف العمولات</TX>
      {list.map((r) => (
        <View key={r.id} style={s.req}>
          <Text style={s.reqAmt}>{r.marketer_name} — {Number(r.amount).toFixed(2)} {tSync('ر.س', lang)}</Text>
          <Text style={s.reqMeta}>{r.iban} • {r.account_name}</Text>
          {r.status === 'pending' ? (
            <View style={{ gap: 6, marginTop: 6 }}>
              <TextInput testID={`payout-ref-${r.id}`} style={s.input} value={refs[r.id] || ''} onChangeText={(v) => setRefs({ ...refs, [r.id]: v })} placeholder={tSync('رقم الحوالة البنكية', lang)} placeholderTextColor="#777" />
              <View style={s.row}>
                <TouchableOpacity testID={`payout-approve-${r.id}`} style={[s.btn, { flex: 1 }]} onPress={() => decide(r.id, true)}>
                  <Ionicons name="checkmark" size={16} color="#0A0A0A" /><TX style={s.btnTxt}>تم التحويل</TX>
                </TouchableOpacity>
                <TouchableOpacity testID={`payout-reject-${r.id}`} style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={() => decide(r.id, false)}>
                  <TX style={[s.btnTxt, { color: '#EF4444' }]}>رفض</TX>
                </TouchableOpacity>
              </View>
            </View>
          ) : <Text style={[s.reqStatus, { color: STATUS[r.status]?.[1] }]}>{tSync(STATUS[r.status]?.[0] || r.status, lang)}{r.transfer_ref ? ` • #${r.transfer_ref}` : ''}</Text>}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { margin: 16, padding: 16, borderRadius: 16, backgroundColor: '#161616', borderWidth: 1, borderColor: '#2A2A2A', gap: 8 },
  title: { color: '#F5C518', fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#0F0F0F' },
  statLabel: { color: '#999', fontSize: 12 },
  statVal: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 4 },
  input: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', paddingHorizontal: 12, color: '#FFF', backgroundColor: '#0F0F0F' },
  btn: { minHeight: 46, borderRadius: 10, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' },
  btnTxt: { color: '#0A0A0A', fontWeight: '800', fontSize: 14 },
  req: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  reqAmt: { color: '#FFF', fontWeight: '700' },
  reqStatus: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  reqMeta: { color: '#888', fontSize: 11, marginTop: 2 },
});
