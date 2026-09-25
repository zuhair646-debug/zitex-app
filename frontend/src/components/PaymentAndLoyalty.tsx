import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';

/**
 * PaymentMethodsRibbon — sticky bottom ribbon showing all supported payment
 * methods for the merchant. Tap to open info sheet with fees, ETA, notes.
 * Shows Saudi payment methods (Mada, Tabby, Tamara, Apple Pay, STC Pay, etc.)
 */
export default function PaymentMethodsRibbon({ apiCall, mode = 'full' }: any) {
  const [payments, setPayments] = useState<any[]>([]);
  const [shipping, setShipping] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiCall('/api/checkout/options');
        setPayments(d.payments || []);
        setShipping(d.shipping || []);
        setLoyalty(d.loyalty || null);
      } catch (e) {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <View style={s.ribbon}><ActivityIndicator color={GOLD} /></View>;
  if (payments.length === 0) return null;

  return (
    <>
      <BlurView intensity={40} tint="dark" style={s.ribbon}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <Ionicons name="shield-checkmark" size={12} color={GOLD} />
          <Text style={s.ribbonTitle}>طرق الدفع المدعومة</Text>
          <View style={{ flex: 1 }} />
          <Text style={s.ribbonHint}>اضغط للتفاصيل</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {payments.map((p: any) => (
            <TouchableOpacity key={p.code} onPress={() => setSelected(p)}
              style={[s.tile, { borderColor: p.brand_color }]}>
              <Text style={{ fontSize: 16 }}>{p.logo}</Text>
              <Text style={[s.tileName, { color: p.brand_color }]} numberOfLines={1}>{p.name_ar}</Text>
              {p.sama_licensed && (
                <View style={s.samaBadge}>
                  <Ionicons name="shield-checkmark" size={8} color="#FFF" />
                </View>
              )}
              {p.is_bnpl && (
                <View style={s.bnplBadge}>
                  <Text style={s.bnplText}>قسّط</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={s.legalText}>
          {payments.some((p: any) => p.sama_licensed) && '🛡 مرخّص من مؤسسة النقد (SAMA) · '}
          {payments.length} خيار للدفع
        </Text>
      </BlurView>

      {/* Info sheet */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            {selected && (
              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[s.bigIcon, { backgroundColor: selected.brand_color + '25', borderColor: selected.brand_color }]}>
                    <Text style={{ fontSize: 28 }}>{selected.logo}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontSize: 18, fontWeight: '900', textAlign: 'right' }}>{selected.name_ar}</Text>
                    <Text style={{ color: MUTED, fontSize: 11, textAlign: 'right' }}>{selected.name_en}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelected(null)}><Ionicons name="close" size={22} color={TEXT} /></TouchableOpacity>
                </View>

                <View style={{ marginTop: 14, gap: 8 }}>
                  {selected.sama_licensed && (
                    <View style={s.infoChip}><Ionicons name="shield-checkmark" size={14} color="#059669" /><Text style={s.infoText}>مرخّص من مؤسسة النقد العربي السعودي (SAMA)</Text></View>
                  )}
                  {selected.is_bnpl && (
                    <View style={s.infoChip}>
                      <Ionicons name="calendar" size={14} color={GOLD} />
                      <Text style={s.infoText}>تقسيط على {selected.installments || 4} دفعات{selected.max_amount ? ` حتى ${Number(selected.max_amount).toLocaleString('ar-SA')} ر.س` : ''}</Text>
                    </View>
                  )}
                  {selected.cod && (
                    <View style={s.infoChip}><Ionicons name="cash" size={14} color="#059669" /><Text style={s.infoText}>ادفع نقداً عند استلام الطلب</Text></View>
                  )}
                  {!!selected.note && (
                    <View style={s.infoChip}><Ionicons name="information-circle" size={14} color={GOLD} /><Text style={s.infoText}>{selected.note}</Text></View>
                  )}
                </View>

                <Text style={s.legalFooter}>
                  🔐 معاملاتك محمية بتشفير من طرف إلى طرف · هذه الطريقة يوفرها التاجر عبر بوابة دفع معتمدة
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * LoyaltyWidget — beautiful loyalty balance widget for user profile
 */
export function LoyaltyWidget({ apiCall, onOpenHistory }: any) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try { const d = await apiCall('/api/loyalty/balance'); setData(d); } catch (e) {}
    })();
  }, []);

  if (!data) return null;
  const tierMeta: any = {
    bronze:   { label: 'برونزي', color: '#CD7F32', icon: 'medal' },
    silver:   { label: 'فضّي',   color: '#C0C0C0', icon: 'medal' },
    gold:     { label: 'ذهبي',   color: GOLD,     icon: 'medal' },
    platinum: { label: 'بلاتيني', color: '#E5E4E2', icon: 'diamond' },
  };
  const meta = tierMeta[data.tier] || tierMeta.bronze;
  const progressPct = data.next_tier
    ? Math.min(100, ((data.balance) / (data.balance + data.points_to_next)) * 100)
    : 100;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onOpenHistory} style={s.loyaltyCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[s.tierBadge, { backgroundColor: meta.color + '25', borderColor: meta.color }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: MUTED, fontSize: 11, textAlign: 'right' }}>رصيد نقاط الولاء</Text>
          <Text style={{ color: TEXT, fontSize: 22, fontWeight: '900', textAlign: 'right' }}>{Number(data.balance).toLocaleString('ar-SA')} <Text style={{ color: meta.color, fontSize: 12 }}>نقطة</Text></Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <View style={[s.miniPill, { backgroundColor: meta.color + '25', borderColor: meta.color }]}>
              <Text style={[s.miniPillText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {data.next_tier && (
              <Text style={{ color: MUTED, fontSize: 10 }}>{data.points_to_next} نقطة للمستوى التالي</Text>
            )}
          </View>
          {data.next_tier && (
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: meta.color }]} />
            </View>
          )}
        </View>
        <Ionicons name="chevron-back" size={16} color={MUTED} />
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  ribbon: {
    borderTopWidth: 1, borderTopColor: BORDER,
    backgroundColor: 'rgba(11,12,16,0.9)',
    padding: 10, overflow: 'hidden',
  },
  ribbonTitle: { color: GOLD, fontSize: 11, fontWeight: '900', marginStart: 4 },
  ribbonHint: { color: MUTED, fontSize: 9 },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, backgroundColor: CARD,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
    position: 'relative',
  },
  tileName: { fontSize: 11, fontWeight: '900' },
  samaBadge: { backgroundColor: '#059669', width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginStart: 2 },
  bnplBadge: { backgroundColor: GOLD, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999, marginStart: 2 },
  bnplText: { color: BG, fontSize: 8, fontWeight: '900' },
  legalText: { color: MUTED, fontSize: 9, textAlign: 'center', marginTop: 6 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%', borderTopWidth: 1, borderColor: BORDER },
  handle: { width: 46, height: 4, borderRadius: 2, backgroundColor: '#3A3D48', alignSelf: 'center', marginTop: 8 },
  bigIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 10, borderRadius: 12 },
  infoText: { color: TEXT, fontSize: 12, flex: 1, textAlign: 'right', lineHeight: 18 },
  legalFooter: { color: MUTED, fontSize: 10, textAlign: 'center', marginTop: 16, lineHeight: 14 },

  loyaltyCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 14, marginVertical: 6 },
  tierBadge: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  miniPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  miniPillText: { fontSize: 10, fontWeight: '900' },
  progressTrack: { height: 4, backgroundColor: BORDER, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
