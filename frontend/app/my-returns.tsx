import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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

const STATE_META: Record<string, { label: string; color: string; icon: string; desc: string }> = {
  pending:    { label: 'بانتظار الموافقة',    color: AMBER, icon: 'time',            desc: 'يراجع المتجر طلبك حالياً' },
  approved:   { label: 'تمت الموافقة',        color: BLUE,  icon: 'checkmark-circle',desc: 'سيتم استلام المنتج قريباً' },
  rejected:   { label: 'مرفوض',               color: RED,   icon: 'close-circle',    desc: 'لم تتم الموافقة على الطلب' },
  picked_up:  { label: 'تم الاستلام',          color: BLUE,  icon: 'cube',            desc: 'المنتج في طريقه للفحص' },
  inspecting: { label: 'قيد الفحص',            color: AMBER, icon: 'search',          desc: 'جاري فحص المنتج' },
  resolved:   { label: 'تم الحل',              color: OK,    icon: 'checkmark-done',  desc: 'تم استكمال طلبك' },
  refunded:   { label: 'تم الاسترداد',         color: OK,    icon: 'cash',            desc: 'المبلغ في محفظتك' },
  closed:     { label: 'مغلق',                 color: MUTED, icon: 'lock-closed',     desc: '' },
};

export default function MyReturnsScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [rmas, setRmas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiCall('/api/my/rmas');
      setRmas(d.rmas || []);
    } catch (e: any) { Alert.alert('خطأ', e?.message); }
    finally { setLoading(false); }
  }, [apiCall]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>طلبات الإرجاع والضمان</Text>
          <Text style={s.sub}>{rmas.length} طلب</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {rmas.length === 0 && (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Ionicons name="return-up-back" size={40} color={MUTED} />
              <Text style={{ color: MUTED, textAlign: 'center', marginTop: 10 }}>لا توجد طلبات إرجاع</Text>
              <Text style={{ color: MUTED, textAlign: 'center', fontSize: 11, marginTop: 4 }}>يمكنك تقديم طلب إرجاع من صفحة طلبات الشراء</Text>
              <TouchableOpacity onPress={() => router.push('/orders')} style={s.emptyBtn}>
                <Text style={{ color: BG, fontWeight: '900' }}>طلباتي</Text>
              </TouchableOpacity>
            </View>
          )}

          {rmas.map((r) => {
            const meta = STATE_META[r.state] || STATE_META.pending;
            return (
              <TouchableOpacity key={r.id} onPress={() => router.push(`/rma-detail?id=${r.id}` as any)} style={s.card}>
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
                    <Text style={s.cardSub}>{r.reason_label_ar}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={[s.pill, { backgroundColor: meta.color + '25', borderColor: meta.color }]}>
                        <Ionicons name={meta.icon as any} size={10} color={meta.color} />
                        <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                      <Text style={{ color: MUTED, fontSize: 10 }}>{(r.created_at || '').slice(0, 10)}</Text>
                    </View>
                    {!!meta.desc && <Text style={s.desc}>{meta.desc}</Text>}
                  </View>
                  <Ionicons name="chevron-back" size={16} color={MUTED} />
                </View>
              </TouchableOpacity>
            );
          })}
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
  card: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 8 },
  thumb: { width: 58, height: 58, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  cardTitle: { color: TEXT, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  cardSub: { color: GOLD, fontSize: 10, textAlign: 'right', marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 9, fontWeight: '900' },
  desc: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 4 },
  emptyBtn: { backgroundColor: GOLD, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, marginTop: 12 },
});
