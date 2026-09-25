import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './_layout';

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

const STEPS = [
  { key: 'pending',   label: 'استلام الطلب',    icon: 'checkmark' },
  { key: 'approved',  label: 'الموافقة',         icon: 'checkmark-circle' },
  { key: 'picked_up', label: 'استلام المنتج',    icon: 'cube' },
  { key: 'inspecting',label: 'الفحص',            icon: 'search' },
  { key: 'refunded',  label: 'الاسترداد',        icon: 'cash' },
];

const STATE_META: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: 'بانتظار الموافقة',    color: AMBER, icon: 'time' },
  approved:   { label: 'تمت الموافقة',        color: BLUE,  icon: 'checkmark-circle' },
  rejected:   { label: 'مرفوض',               color: RED,   icon: 'close-circle' },
  picked_up:  { label: 'تم الاستلام',          color: BLUE,  icon: 'cube' },
  inspecting: { label: 'قيد الفحص',            color: AMBER, icon: 'search' },
  resolved:   { label: 'تم الحل',              color: OK,    icon: 'checkmark-done' },
  refunded:   { label: 'تم الاسترداد',         color: OK,    icon: 'cash' },
  closed:     { label: 'مغلق',                 color: MUTED, icon: 'lock-closed' },
};

export default function RMADetailScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const rmaId = String(params.id || '');
  const [r, setR] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiCall(`/api/my/rmas/${rmaId}`);
        setR(d);
      } catch (e: any) { Alert.alert('خطأ', e?.message); }
      finally { setLoading(false); }
    })();
  }, [rmaId]);

  const meta = r ? STATE_META[r.state] || STATE_META.pending : null;
  const currentStepIdx = r ? STEPS.findIndex((st) => st.key === r.state) : -1;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>تفاصيل طلب الإرجاع</Text>
          <Text style={s.sub}>{r ? `#${r.id.slice(-6)}` : ''}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
      ) : !r ? (
        <Text style={{ color: MUTED, textAlign: 'center', marginTop: 40 }}>لم يتم العثور على الطلب</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {/* Status hero */}
          <View style={[s.hero, { borderColor: meta!.color }]}>
            <View style={[s.heroIcon, { backgroundColor: meta!.color + '25', borderColor: meta!.color }]}>
              <Ionicons name={meta!.icon as any} size={26} color={meta!.color} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={[s.heroLabel, { color: meta!.color }]}>{meta!.label}</Text>
              <Text style={s.heroMeta}>{(r.updated_at || r.created_at || '').slice(0, 16).replace('T', ' ')}</Text>
            </View>
          </View>

          {/* Progress steps */}
          {r.state !== 'rejected' && (
            <View style={s.stepsBar}>
              {STEPS.map((st, i) => (
                <View key={st.key} style={s.stepCol}>
                  <View style={[s.stepDot, i <= currentStepIdx && { backgroundColor: OK, borderColor: OK }]}>
                    <Ionicons name={st.icon as any} size={12} color={i <= currentStepIdx ? '#FFF' : MUTED} />
                  </View>
                  <Text style={[s.stepLabel, i <= currentStepIdx && { color: OK }]}>{st.label}</Text>
                  {i < STEPS.length - 1 && (
                    <View style={[s.stepLine, i < currentStepIdx && { backgroundColor: OK }]} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Product */}
          <View style={s.card}>
            <View style={{ flexDirection: 'row' }}>
              {r.product_image ? (
                <Image source={{ uri: r.product_image.startsWith('http') ? r.product_image : (process.env.EXPO_PUBLIC_BACKEND_URL || '') + r.product_image }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="cube" size={22} color={MUTED} />
                </View>
              )}
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={s.pTitle}>{r.product_name}</Text>
                <Text style={s.pSub}>{r.qty} × {r.unit_price?.toFixed(2)} ر.س</Text>
                <Text style={s.reasonBadge}>{r.reason_label_ar}</Text>
              </View>
            </View>
            {!!r.reason_text && (
              <Text style={s.reasonText}>{r.reason_text}</Text>
            )}
          </View>

          {r.media && r.media.length > 0 && (
            <>
              <Text style={s.sectionTitle}>الصور المرفقة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {r.media.map((m: string, i: number) => (
                  <Image key={i} source={{ uri: m.startsWith('http') ? m : (process.env.EXPO_PUBLIC_BACKEND_URL || '') + m }} style={s.mediaThumb} />
                ))}
              </ScrollView>
            </>
          )}

          {r.merchant_note && (
            <View style={s.noteBox}>
              <Text style={s.noteTitle}>💬 ملاحظة المتجر</Text>
              <Text style={s.noteText}>{r.merchant_note}</Text>
            </View>
          )}

          {r.refund && (
            <View style={[s.card, { borderColor: OK, backgroundColor: OK + '15' }]}>
              <Text style={{ color: OK, fontSize: 13, fontWeight: '900', textAlign: 'right' }}>✅ تم الاسترداد</Text>
              <Text style={{ color: TEXT, fontSize: 12, textAlign: 'right', marginTop: 4 }}>
                المبلغ: {r.refund.amount?.toFixed(2)} ر.س
              </Text>
              <Text style={{ color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
                طريقة الاسترداد: {r.refund.route === 'wallet' ? 'المحفظة' : 'نفس وسيلة الدفع الأصلية'}
              </Text>
            </View>
          )}

          <Text style={s.sectionTitle}>سجل الطلب</Text>
          {(r.audit || []).map((a: any, i: number) => (
            <View key={i} style={s.auditRow}>
              <View style={s.auditDot}>
                <Ionicons name={a.actor === 'customer' ? 'person' : 'business'} size={11} color={GOLD} />
              </View>
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <Text style={{ color: TEXT, fontSize: 12, textAlign: 'right' }}>
                  {a.actor === 'customer' ? 'أنت' : 'المتجر'} · {a.action}
                </Text>
                {!!a.note && <Text style={{ color: MUTED, fontSize: 10, textAlign: 'right' }}>{a.note}</Text>}
                <Text style={{ color: MUTED, fontSize: 10, textAlign: 'right' }}>{(a.at || '').slice(0, 16).replace('T', ' ')}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right', marginHorizontal: 10 },
  sub: { color: MUTED, fontSize: 10, textAlign: 'right', marginHorizontal: 10 },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontSize: 15, fontWeight: '900', textAlign: 'right' },
  heroMeta: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 },
  stepsBar: { flexDirection: 'row-reverse', backgroundColor: CARD, borderRadius: 12, padding: 10, marginTop: 10, borderWidth: 1, borderColor: BORDER },
  stepCol: { flex: 1, alignItems: 'center', position: 'relative' },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: MUTED, fontSize: 9, marginTop: 4, textAlign: 'center' },
  stepLine: { position: 'absolute', top: 13, right: '55%', height: 1.5, width: '90%', backgroundColor: BORDER },
  card: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12, marginTop: 10 },
  thumb: { width: 58, height: 58, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  pTitle: { color: TEXT, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  pSub: { color: GOLD, fontSize: 11, textAlign: 'right', marginTop: 2 },
  reasonBadge: { color: RED, fontSize: 11, textAlign: 'right', marginTop: 4, fontWeight: '700' },
  reasonText: { color: TEXT, fontSize: 12, textAlign: 'right', marginTop: 8, lineHeight: 18 },
  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right', marginTop: 14, marginBottom: 6 },
  mediaThumb: { width: 90, height: 90, borderRadius: 10 },
  noteBox: { backgroundColor: '#3B82F615', borderColor: BLUE, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  noteTitle: { color: BLUE, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  noteText: { color: TEXT, fontSize: 12, textAlign: 'right', marginTop: 4, lineHeight: 18 },
  auditRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 10, borderRadius: 10, marginBottom: 4 },
  auditDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
});
