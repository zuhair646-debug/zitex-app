import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT, curLang } from '../src/i18n';
import { useAuth } from './_layout';
import { TX, tSync } from '../src/useAutoT';
import { FilterTabs } from '../src/components/ui/FilterTabs';

export default function OrdersScreen() {
  const { lang } = useT();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const data = await apiCall('/api/orders'); setOrders(data); } catch (e) {} finally { setLoading(false); }
    })();
  }, []);

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter || (filter === 'completed' && o.status === 'delivered'));
  const statusColor = (s: string) => (s === 'completed' || s === 'delivered') ? '#10B981' : s === 'cancelled' ? '#EF4444' : '#F59E0B';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="orders-back" style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={s.title}>{tSync('طلباتي', lang)}</Text>
      </View>
      <FilterTabs
        testIDPrefix="filter"
        value={filter}
        onChange={setFilter}
        items={['all', 'processing', 'completed', 'cancelled'].map(f => ({
          key: f, label: tSync(f === 'all' ? 'الكل' : f === 'processing' ? 'قيد التنفيذ' : f === 'completed' ? 'مكتمل' : 'ملغى', lang),
        }))}
      />
      {loading ? <ActivityIndicator size="large" color="#F5C518" style={{ marginTop: 40 }} /> :
        filtered.length === 0 ? (
          <View style={s.empty}><Ionicons name="bag-outline" size={48} color="#A1A1AA" /><Text style={s.emptyText}>{tSync('لا توجد طلبات', lang)}</Text></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
            {filtered.map((o) => (
              <View key={o.id} style={s.orderCard}>
                <View style={[s.statusBar, { backgroundColor: statusColor(o.status) }]}>
                  <Ionicons name={(o.status === 'completed' || o.status === 'delivered') ? 'checkmark-circle' : o.status === 'cancelled' ? 'close-circle' : 'time'} size={16} color="#FFF" />
                  <Text style={s.statusBarText}>{tSync(({ pending: 'قيد الانتظار', processing: 'قيد التنفيذ', ready: 'جاهز', in_transit: 'في الطريق', out_for_delivery: 'في الطريق', delivered: 'تم التسليم', completed: 'مكتمل', cancelled: 'ملغى' } as Record<string, string>)[o.status] || o.status, lang)}</Text>
                </View>
                <Text style={s.orderId}>{tSync('طلب', lang)} #{o.id?.slice(-8)}</Text>
                <View style={s.orderRow}><Text style={s.orderLabel}>{tSync('الدفع', lang)}</Text><Text style={s.orderVal}>{tSync(({ cod: 'الدفع عند الاستلام', cash_on_delivery: 'الدفع عند الاستلام', cash: 'نقداً', card: 'بطاقة ائتمان/مدى', mada: 'مدى', apple_pay: 'Apple Pay', tamara: 'تمارا (تقسيط)', tabby: 'تابي (تقسيط)', wallet: 'المحفظة' } as Record<string, string>)[o.payment_method] || o.payment_method || 'نقداً', lang)}</Text></View>
                <View style={s.orderRow}><Text style={s.orderLabel}>{tSync('المنتجات', lang)}</Text><Text style={s.orderVal}>{o.items?.length || 0} {tSync('منتج', lang)}</Text></View>
                <View style={s.orderRow}><Text style={s.orderLabel}>{tSync('التوصيل', lang)}</Text><Text style={s.orderVal}>{tSync(o.delivery_type === 'pickup' ? 'استلام من الفرع' : 'توصيل', lang)}</Text></View>
                <View style={[s.orderRow, s.totalRow]}><Text style={s.totalLabel}>{tSync('الإجمالي', lang)}</Text><Text style={s.totalVal}>{o.total} {tSync('ر.س', lang)}</Text></View>
                {(o.status === 'completed' || o.status === 'delivered') && (
                  <TouchableOpacity
                    onPress={() => router.push(`/create-return?order_id=${o.id}` as any)}
                    style={s.returnBtn}
                    testID={`return-${o.id}`}
                  >
                    <Ionicons name="return-up-back" size={14} color="#F5C518" />
                    <TX style={s.returnBtnText}>طلب إرجاع أو ضمان</TX>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: '#F9F9FB', borderWidth: 1, borderColor: '#E4E4E7' },
  filterActive: { backgroundColor: '#F5C518', borderColor: '#F5C518' },
  filterText: { fontSize: 13, fontWeight: '500', color: '#52525B' },
  filterTextActive: { color: '#FFF' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 16, color: '#52525B' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  orderCard: { backgroundColor: '#F9F9FB', borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
  statusBarText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  orderId: { fontSize: 12, color: '#A1A1AA', paddingHorizontal: 14, paddingTop: 10 },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6 },
  orderLabel: { fontSize: 13, color: '#52525B' },
  orderVal: { fontSize: 13, color: '#0A0A0A', fontWeight: '500' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#E4E4E7', marginTop: 4, paddingVertical: 10 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  totalVal: { fontSize: 16, fontWeight: '800', color: '#F5C518' },
  returnBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E4E4E7', backgroundColor: '#FFF' },
  returnBtnText: { color: '#F5C518', fontSize: 13, fontWeight: '800' },
});
