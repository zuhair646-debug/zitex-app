import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';
const OK = '#10B981';

/**
 * LoyaltyRedeemPicker — customer-facing widget in checkout.
 * Shows enabled Saudi loyalty programs. User can redeem points for discount.
 * onDiscountApplied(programCode, discountSar, pointsUsed) is called after successful redeem.
 */
export default function LoyaltyRedeemPicker({
  apiCall,
  cartTotal,
  onDiscountApplied,
}: {
  apiCall: (path: string, options?: any) => Promise<any>;
  cartTotal: number;
  onDiscountApplied?: (programCode: string, discountSar: number, pointsUsed: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [points, setPoints] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [applied, setApplied] = useState<{ code: string; discount: number; points: number } | null>(null);

  useEffect(() => {
    apiCall('/api/loyalty/available')
      .then((d) => setPrograms(d.programs || []))
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, []);

  const openRedeem = (p: any) => {
    setSelected(p);
    setPoints('');
    setModalOpen(true);
  };

  const redeem = async () => {
    if (!selected) return;
    const p = parseInt(points, 10);
    if (!p || p <= 0) { Alert.alert('تنبيه', 'أدخل عدد النقاط'); return; }
    setRedeeming(true);
    try {
      const r = await apiCall(`/api/loyalty/programs/${selected.code}/redeem`, {
        method: 'POST', body: JSON.stringify({ program_code: selected.code, points: p }),
      });
      const disc = Math.min(r.discount_sar || 0, cartTotal);
      setApplied({ code: selected.code, discount: disc, points: p });
      onDiscountApplied?.(selected.code, disc, p);
      setModalOpen(false);
      Alert.alert('✅ تم الاستبدال', r.message || `تم تطبيق خصم ${disc} ر.س`);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الاستبدال');
    } finally { setRedeeming(false); }
  };

  const removeApplied = () => {
    setApplied(null);
    onDiscountApplied?.('', 0, 0);
  };

  if (loading) return null;
  if (programs.length === 0) return null;

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Ionicons name="ribbon" size={13} color={GOLD} />
        <Text style={s.title}>استبدل نقاط الولاء بخصم</Text>
        {applied && (
          <TouchableOpacity onPress={removeApplied} style={s.appliedTag}>
            <Text style={s.appliedText}>خصم {applied.discount} ر.س ✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {programs.map((p) => {
          const active = applied?.code === p.code;
          return (
            <TouchableOpacity
              key={p.code}
              onPress={() => openRedeem(p)}
              style={[s.card, { borderColor: active ? OK : p.brand_color, backgroundColor: active ? OK + '15' : (p.brand_color || GOLD) + '10' }]}>
              <Text style={{ fontSize: 22 }}>{p.logo}</Text>
              <Text style={s.name} numberOfLines={1}>{p.name_ar}</Text>
              <Text style={s.rate}>1 نقطة = {(p.conversion_rate || 0.01).toFixed(2)} ر.س</Text>
              {p.status === 'sandbox_pending' && (
                <View style={s.pendPill}><Text style={s.pendText}>وضع تجريبي</Text></View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            {selected && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={[s.logoBox, { borderColor: selected.brand_color }]}>
                    <Text style={{ fontSize: 28 }}>{selected.logo}</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.sheetTitle}>{selected.name_ar}</Text>
                    <Text style={s.sheetSub}>{selected.description_ar}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setModalOpen(false)}>
                    <Ionicons name="close" size={22} color={TEXT} />
                  </TouchableOpacity>
                </View>

                <Text style={s.label}>عدد النقاط المراد استبدالها</Text>
                <TextInput style={s.input} keyboardType="numeric"
                  value={points} onChangeText={setPoints}
                  placeholder="مثال: 500" placeholderTextColor={MUTED} />

                {points && !isNaN(Number(points)) && Number(points) > 0 && (
                  <View style={s.previewBox}>
                    <Text style={s.previewLabel}>معاينة الخصم</Text>
                    <Text style={[s.previewValue, { color: selected.brand_color }]}>
                      {(Number(points) * (selected.conversion_rate || 0.01)).toFixed(2)} ر.س
                    </Text>
                  </View>
                )}

                <TouchableOpacity onPress={redeem} style={[s.redeemBtn, { backgroundColor: selected.brand_color || GOLD }]} disabled={redeeming}>
                  {redeeming ? <ActivityIndicator color="#FFF" /> : (
                    <Text style={s.redeemText}>تطبيق الاستبدال</Text>
                  )}
                </TouchableOpacity>

                <Text style={s.legalNote}>
                  ⚠️ الاستبدال {selected.status === 'sandbox_pending' ? 'في وضع الاختبار — لن يُخصم فعلياً من رصيد نقاطك حتى يكتمل الاعتماد القانوني للتاجر مع المزوّد.' : 'يخصم النقاط من حساب البرنامج مباشرة.'}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { color: '#0A0A0A', fontSize: 12, fontWeight: '900', flex: 1, textAlign: 'right' },
  appliedTag: { backgroundColor: OK + '20', borderColor: OK, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  appliedText: { color: OK, fontSize: 10, fontWeight: '900' },
  card: { borderWidth: 1.5, borderRadius: 12, padding: 10, minWidth: 130, alignItems: 'center', position: 'relative' },
  name: { color: '#0A0A0A', fontSize: 11, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  rate: { color: '#6B7280', fontSize: 9, textAlign: 'center', marginTop: 2 },
  pendPill: { position: 'absolute', top: 4, right: 4, backgroundColor: '#F59E0B', paddingHorizontal: 4, borderRadius: 4 },
  pendText: { color: '#FFF', fontSize: 8, fontWeight: '900' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG, padding: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: BORDER },
  logoBox: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: CARD },
  sheetTitle: { color: TEXT, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  sheetSub: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 2, lineHeight: 15 },
  label: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, color: TEXT, textAlign: 'right', fontSize: 16, fontWeight: '900' },
  previewBox: { backgroundColor: CARD, borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { color: MUTED, fontSize: 11 },
  previewValue: { fontSize: 18, fontWeight: '900' },
  redeemBtn: { borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16 },
  redeemText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  legalNote: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 10, lineHeight: 14 },
});
