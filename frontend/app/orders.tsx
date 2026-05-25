import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function OrdersScreen() {
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

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const statusColor = (s: string) => s === 'processing' ? '#F59E0B' : s === 'completed' ? '#10B981' : '#EF4444';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="orders-back" style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={s.title}>Orders</Text>
      </View>
      <View style={s.filterRow}>
        {['all', 'processing', 'completed', 'cancelled'].map(f => (
          <TouchableOpacity key={f} testID={`filter-${f}`} style={[s.filterPill, filter === f && s.filterActive]}
            onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'processing' ? 'Processing' : f === 'completed' ? 'Completed' : 'Canceled'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        filtered.length === 0 ? (
          <View style={s.empty}><Ionicons name="bag-outline" size={48} color="#A1A1AA" /><Text style={s.emptyText}>No orders found</Text></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
            {filtered.map((o) => (
              <View key={o.id} style={s.orderCard}>
                <View style={[s.statusBar, { backgroundColor: statusColor(o.status) }]}>
                  <Ionicons name={o.status === 'completed' ? 'checkmark-circle' : o.status === 'cancelled' ? 'close-circle' : 'time'} size={16} color="#FFF" />
                  <Text style={s.statusBarText}>{o.status === 'processing' ? 'Processing' : o.status === 'completed' ? 'Completed' : 'Canceled'}</Text>
                </View>
                <Text style={s.orderId}>Order #{o.id?.slice(-8)}</Text>
                <View style={s.orderRow}><Text style={s.orderLabel}>Payment</Text><Text style={s.orderVal}>{o.payment_method || 'Cash'}</Text></View>
                <View style={s.orderRow}><Text style={s.orderLabel}>Items</Text><Text style={s.orderVal}>{o.items?.length || 0} products</Text></View>
                <View style={s.orderRow}><Text style={s.orderLabel}>Delivery</Text><Text style={s.orderVal}>{o.delivery_type}</Text></View>
                <View style={[s.orderRow, s.totalRow]}><Text style={s.totalLabel}>TOTAL</Text><Text style={s.totalVal}>{o.total} SAR</Text></View>
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
  filterActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
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
  totalVal: { fontSize: 16, fontWeight: '800', color: '#8833FF' },
});
