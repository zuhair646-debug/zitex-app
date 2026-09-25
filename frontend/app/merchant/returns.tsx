import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';
const OK = '#10B981';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const BLUE = '#3B82F6';

const STATE_META: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: 'بانتظار المراجعة', color: AMBER, icon: 'time' },
  approved:   { label: 'تم القبول',        color: BLUE,  icon: 'checkmark-circle' },
  rejected:   { label: 'مرفوض',            color: RED,   icon: 'close-circle' },
  picked_up:  { label: 'تم الاستلام',      color: BLUE,  icon: 'cube' },
  inspecting: { label: 'قيد الفحص',        color: AMBER, icon: 'search' },
  resolved:   { label: 'تم الحل',          color: OK,    icon: 'checkmark-done' },
  refunded:   { label: 'تم الاسترداد',     color: OK,    icon: 'cash' },
  closed:     { label: 'مغلق',             color: MUTED, icon: 'lock-closed' },
};

export default function MerchantReturnsScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [rmas, setRmas] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | 'request_info' | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [inspectMode, setInspectMode] = useState<null | string>(null);
  const [inspectNote, setInspectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiCall(`/api/merchant/rmas${filter ? `?state=${filter}` : ''}`);
      setRmas(d.rmas || []);
      setCounts(d.counts || {});
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر التحميل');
    } finally {
      setLoading(false);
    }
  }, [apiCall, filter]);

  useEffect(() => { load(); }, [load]);

  const submitDecision = async () => {
    if (!selected || !decision) return;
    setSaving(true);
    try {
      await apiCall(`/api/merchant/rmas/${selected.id}/decision`, {
        method: 'PUT',
        body: JSON.stringify({
          decision,
          merchant_note: decisionNote,
          refund_amount: refundAmount ? Number(refundAmount) : null,
          reverse_pickup_carrier: 'smsa',
        }),
      });
      setDecision(null); setDecisionNote(''); setRefundAmount(''); setSelected(null);
      await load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message);
    } finally { setSaving(false); }
  };

  const submitInspection = async () => {
    if (!selected || !inspectMode) return;
    setSaving(true);
    try {
      await apiCall(`/api/merchant/rmas/${selected.id}/inspection`, {
        method: 'PUT',
        body: JSON.stringify({
          disposition: inspectMode,
          inspector_note: inspectNote,
          inspection_photos: [],
          final_refund_amount: refundAmount ? Number(refundAmount) : null,
        }),
      });
      setInspectMode(null); setInspectNote(''); setRefundAmount(''); setSelected(null);
      await load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message);
    } finally { setSaving(false); }
  };

  const TABS = [
    { code: '', label: 'الكل', count: Object.values(counts).reduce((a: number, b: any) => a + Number(b || 0), 0) },
    { code: 'pending', label: 'بانتظار المراجعة', count: counts.pending || 0 },
    { code: 'approved', label: 'مقبولة', count: counts.approved || 0 },
    { code: 'inspecting', label: 'قيد الفحص', count: counts.inspecting || 0 },
    { code: 'resolved', label: 'مكتملة', count: counts.resolved || 0 },
    { code: 'rejected', label: 'مرفوضة', count: counts.rejected || 0 },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>الإرجاع والضمان</Text>
          <Text style={s.sub}>إدارة طلبات الإرجاع والاستبدال والضمان</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 6 }}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.code || 'all'}
            onPress={() => setFilter(t.code)}
            style={[s.tab, filter === t.code && s.tabActive]}>
            <Text style={[s.tabText, filter === t.code && { color: BG }]}>{t.label}</Text>
            <View style={[s.tabBadge, filter === t.code && { backgroundColor: BG + '30' }]}>
              <Text style={[s.tabBadgeText, filter === t.code && { color: BG }]}>{t.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {rmas.length === 0 && (
            <View style={{ padding: 40 }}>
              <Text style={{ color: MUTED, textAlign: 'center' }}>لا توجد طلبات في هذه الحالة</Text>
            </View>
          )}
          {rmas.map((r) => {
            const meta = STATE_META[r.state] || STATE_META.pending;
            return (
              <TouchableOpacity key={r.id} onPress={() => setSelected(r)} style={s.card}>
                <View style={{ flexDirection: 'row' }}>
                  {r.product_image ? (
                    <Image source={{ uri: r.product_image.startsWith('http') ? r.product_image : (process.env.EXPO_PUBLIC_BACKEND_URL || '') + r.product_image }} style={s.thumb} />
                  ) : (
                    <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="cube" size={22} color={MUTED} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{r.product_name}</Text>
                    <Text style={s.cardSub}>{r.customer_name} · {r.customer_phone}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={[s.pill, { backgroundColor: meta.color + '25', borderColor: meta.color }]}>
                        <Ionicons name={meta.icon as any} size={10} color={meta.color} />
                        <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <View style={[s.pill, { backgroundColor: CARD, borderColor: BORDER }]}>
                        <Text style={[s.pillText, { color: TEXT }]}>{r.type === 'warranty' ? 'ضمان' : r.type === 'exchange' ? 'استبدال' : 'إرجاع'}</Text>
                      </View>
                    </View>
                    <Text style={s.reasonText} numberOfLines={2}>{r.reason_label_ar} — {r.reason_text}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* RMA Details Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {selected && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ color: GOLD, fontSize: 16, fontWeight: '900', flex: 1, textAlign: 'right' }}>
                      تفاصيل الطلب #{selected.id.slice(-6)}
                    </Text>
                    <TouchableOpacity onPress={() => setSelected(null)}><Ionicons name="close" size={22} color={TEXT} /></TouchableOpacity>
                  </View>

                  <View style={s.detailBox}>
                    <DetailRow icon="person" label="العميل" value={`${selected.customer_name} · ${selected.customer_phone}`} />
                    <DetailRow icon="cube" label="المنتج" value={selected.product_name} />
                    <DetailRow icon="alert-circle" label="السبب" value={selected.reason_label_ar} />
                    <DetailRow icon="chatbubbles" label="تفاصيل العميل" value={selected.reason_text || '—'} />
                    <DetailRow icon="cash" label="المبلغ" value={`${(selected.unit_price * selected.qty).toFixed(2)} ر.س`} />
                    <DetailRow icon="card" label="طريقة الاسترداد" value={
                      selected.refund_route === 'original_payment_method' ? 'إعادة إلى نفس طريقة الدفع' :
                      selected.refund_route === 'wallet' ? 'رصيد في المحفظة' : 'المحفظة أو التحويل البنكي'
                    } />
                    {selected.imei_or_serial && <DetailRow icon="barcode" label="IMEI/الرقم التسلسلي" value={selected.imei_or_serial} />}
                    {selected.media?.length > 0 && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={s.label}>الصور/الفيديو المرفقة</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {selected.media.map((m: string, i: number) => (
                            <Image key={i} source={{ uri: m.startsWith('http') ? m : (process.env.EXPO_PUBLIC_BACKEND_URL || '') + m }} style={s.media} />
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Actions based on state */}
                  {selected.state === 'pending' && (
                    <View style={{ marginTop: 14, gap: 8 }}>
                      <Text style={s.sectionTitle}>القرار</Text>
                      <TouchableOpacity onPress={() => setDecision('approve')} style={[s.actBtn, { backgroundColor: OK }]}>
                        <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                        <Text style={s.actText}>موافقة وطلب استلام عكسي</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setDecision('request_info')} style={[s.actBtn, { backgroundColor: AMBER }]}>
                        <Ionicons name="help-buoy" size={18} color="#FFF" />
                        <Text style={s.actText}>طلب معلومات إضافية</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setDecision('reject')} style={[s.actBtn, { backgroundColor: RED }]}>
                        <Ionicons name="close-circle" size={18} color="#FFF" />
                        <Text style={s.actText}>رفض الطلب</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {(selected.state === 'approved' || selected.state === 'picked_up' || selected.state === 'inspecting') && (
                    <View style={{ marginTop: 14, gap: 8 }}>
                      <Text style={s.sectionTitle}>بعد الفحص</Text>
                      <TouchableOpacity onPress={() => setInspectMode('refund')} style={[s.actBtn, { backgroundColor: OK }]}>
                        <Ionicons name="cash" size={18} color="#FFF" />
                        <Text style={s.actText}>استرداد المبلغ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setInspectMode('exchange')} style={[s.actBtn, { backgroundColor: BLUE }]}>
                        <Ionicons name="swap-horizontal" size={18} color="#FFF" />
                        <Text style={s.actText}>استبدال بمنتج جديد</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setInspectMode('repair')} style={[s.actBtn, { backgroundColor: '#8B5CF6' }]}>
                        <Ionicons name="construct" size={18} color="#FFF" />
                        <Text style={s.actText}>إصلاح ضمن الضمان</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setInspectMode('return_to_customer')} style={[s.actBtn, { backgroundColor: MUTED }]}>
                        <Ionicons name="arrow-undo" size={18} color="#FFF" />
                        <Text style={s.actText}>إعادة للعميل (رفض بعد الفحص)</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {selected.audit && selected.audit.length > 0 && (
                    <>
                      <Text style={s.sectionTitle}>السجل</Text>
                      {selected.audit.map((a: any, i: number) => (
                        <View key={i} style={s.auditRow}>
                          <Text style={{ color: MUTED, fontSize: 10 }}>{(a.at || '').slice(0, 16).replace('T', ' ')}</Text>
                          <Text style={{ color: TEXT, fontSize: 12, textAlign: 'right', flex: 1, marginHorizontal: 8 }}>
                            {a.actor === 'customer' ? '👤' : '🏪'} {a.action} {a.note ? `— ${a.note}` : ''}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Decision confirmation */}
      <Modal visible={!!decision} transparent animationType="fade" onRequestClose={() => setDecision(null)}>
        <View style={s.overlay}>
          <View style={s.confirmBox}>
            <Text style={{ color: GOLD, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>
              {decision === 'approve' ? 'موافقة على الطلب' : decision === 'reject' ? 'رفض الطلب' : 'طلب معلومات إضافية'}
            </Text>
            {decision === 'approve' && (
              <>
                <Text style={s.label}>مبلغ الاسترداد المعتمد (اتركه فارغاً للمبلغ الأصلي)</Text>
                <TextInput style={s.input} keyboardType="decimal-pad"
                  value={refundAmount} onChangeText={setRefundAmount} placeholder={String(selected ? selected.unit_price * selected.qty : 0)} placeholderTextColor={MUTED} />
              </>
            )}
            <Text style={s.label}>ملاحظة للعميل</Text>
            <TextInput style={[s.input, { minHeight: 60 }]} multiline
              value={decisionNote} onChangeText={setDecisionNote} placeholder="اختياري" placeholderTextColor={MUTED} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setDecision(null)} style={[s.confirmBtn, { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }]}>
                <Text style={{ color: TEXT, fontWeight: '900' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitDecision} style={[s.confirmBtn, { backgroundColor: GOLD }]} disabled={saving}>
                {saving ? <ActivityIndicator color={BG} /> : <Text style={{ color: BG, fontWeight: '900' }}>تأكيد</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Inspection confirmation */}
      <Modal visible={!!inspectMode} transparent animationType="fade" onRequestClose={() => setInspectMode(null)}>
        <View style={s.overlay}>
          <View style={s.confirmBox}>
            <Text style={{ color: GOLD, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>نتيجة الفحص</Text>
            {inspectMode === 'refund' && (
              <>
                <Text style={s.label}>مبلغ الاسترداد النهائي</Text>
                <TextInput style={s.input} keyboardType="decimal-pad"
                  value={refundAmount} onChangeText={setRefundAmount} placeholder={String(selected ? selected.unit_price * selected.qty : 0)} placeholderTextColor={MUTED} />
              </>
            )}
            <Text style={s.label}>ملاحظات الفني</Text>
            <TextInput style={[s.input, { minHeight: 60 }]} multiline
              value={inspectNote} onChangeText={setInspectNote} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setInspectMode(null)} style={[s.confirmBtn, { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }]}>
                <Text style={{ color: TEXT, fontWeight: '900' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitInspection} style={[s.confirmBtn, { backgroundColor: GOLD }]} disabled={saving}>
                {saving ? <ActivityIndicator color={BG} /> : <Text style={{ color: BG, fontWeight: '900' }}>تأكيد</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const DetailRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={s.detailRow}>
    <Ionicons name={icon as any} size={14} color={GOLD} />
    <Text style={{ color: MUTED, fontSize: 11, marginHorizontal: 6 }}>{label}:</Text>
    <Text style={{ color: TEXT, fontSize: 12, flex: 1, textAlign: 'right' }}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right', marginHorizontal: 10 },
  sub: { color: MUTED, fontSize: 10, textAlign: 'right', marginHorizontal: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tabActive: { backgroundColor: GOLD, borderColor: GOLD },
  tabText: { color: TEXT, fontSize: 11, fontWeight: '900' },
  tabBadge: { backgroundColor: BG, paddingHorizontal: 6, borderRadius: 999, minWidth: 20, alignItems: 'center' },
  tabBadgeText: { color: TEXT, fontSize: 10, fontWeight: '900' },
  card: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 8 },
  thumb: { width: 58, height: 58, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  cardTitle: { color: TEXT, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  cardSub: { color: GOLD, fontSize: 10, textAlign: 'right', marginTop: 2 },
  reasonText: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 4, lineHeight: 14 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 9, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', borderTopWidth: 1, borderColor: BORDER },
  label: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, color: TEXT, textAlign: 'right' },
  detailBox: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 12, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right', marginTop: 14, marginBottom: 6 },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: 12 },
  actText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  media: { width: 80, height: 80, borderRadius: 8, backgroundColor: CARD },
  confirmBox: { backgroundColor: BG, margin: 20, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: BORDER },
  confirmBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center' },
  auditRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 8, borderRadius: 8, marginTop: 4 },
});
