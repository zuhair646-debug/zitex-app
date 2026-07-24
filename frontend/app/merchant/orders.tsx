import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const STATUS_COLORS: any = { pending: '#F59E0B', processing: '#3B82F6', shipped: '#8833FF', delivered: '#10B981', cancelled: '#EF4444' };

export default function MerchantOrders() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/orders'); setOrders(d); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateStatus = (id: string, current: string) => {
    Alert.alert('Update Status', 'Choose new status:', [
      ...STATUSES.filter(s => s !== current).map(s => ({ text: s, onPress: async () => {
        try { await apiCall(`/api/merchant/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: s }) }); load(); } catch (e: any) { Alert.alert('Error', e.message); }
      }})),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Orders ({filtered.length})</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
        {['all', ...STATUSES].map(st => (
          <TouchableOpacity key={st} testID={`f-${st}`} onPress={() => setFilter(st)} style={[s.chip, filter === st && s.chipActive]}>
            <Text style={[s.chipText, filter === st && s.chipTextActive]}>{st}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {filtered.length === 0 ? <Text style={s.empty}>No orders</Text> : filtered.map(o => (
            <View key={o.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.orderNo}>#{o.id.slice(-8).toUpperCase()}</Text>
                <TouchableOpacity testID={`status-${o.id}`} onPress={() => updateStatus(o.id, o.status)} style={[s.statusBadge, { backgroundColor: STATUS_COLORS[o.status] + '20' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[o.status] }]}>{o.status}</Text>
                  <Ionicons name="chevron-down" size={12} color={STATUS_COLORS[o.status]} />
                </TouchableOpacity>
              </View>
              <Text style={s.customer}>{o.customer_name || 'Customer'} • {o.customer_phone || o.phone || '-'}</Text>
              <Text style={s.address} numberOfLines={2}>{o.address}</Text>
              <View style={s.row}>
                <Text style={s.items}>{(o.items || []).length} item(s)</Text>
                <Text style={s.total}>{o.total?.toFixed(2)} SAR</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  filterRow: { padding: 12, flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  chipActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  chipText: { fontSize: 12, color: '#374151', textTransform: 'capitalize' },
  chipTextActive: { color: 'white', fontWeight: '600' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNo: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  customer: { fontSize: 13, color: '#6B7280', marginVertical: 2 },
  address: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  items: { fontSize: 12, color: '#6B7280' },
  total: { fontSize: 16, fontWeight: '800', color: '#8833FF' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 14 },
});
