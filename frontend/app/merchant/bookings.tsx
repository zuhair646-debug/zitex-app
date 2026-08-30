import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const SCOLOR: any = { pending: '#F59E0B', confirmed: '#3B82F6', in_progress: '#8833FF', completed: '#10B981', cancelled: '#EF4444' };

export default function MerchantBookings() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/bookings'); setBookings(d); } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateStatus = (id: string, current: string) => {
    Alert.alert('Update Status', '', [
      ...STATUSES.filter(s => s !== current).map(s => ({ text: s, onPress: async () => { try { await apiCall(`/api/merchant/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: s }) }); load(); } catch (e: any) { Alert.alert('خطأ', e.message); } } })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>حجوزات الخدمات ({bookings.length})</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {bookings.length === 0 ? <Text style={s.empty}>No bookings yet</Text> : bookings.map(b => (
            <View key={b.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.svc}>{b.service_name}</Text>
                <TouchableOpacity onPress={() => updateStatus(b.id, b.status)} style={[s.statusBadge, { backgroundColor: SCOLOR[b.status] + '20' }]}>
                  <Text style={[s.statusText, { color: SCOLOR[b.status] }]}>{b.status}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.customer}>{b.customer_name || '-'} • {b.customer_phone || b.phone || '-'}</Text>
              <Text style={s.device}>{b.device_model || '-'}</Text>
              <Text style={s.issue} numberOfLines={2}>{b.issue_desc || '-'}</Text>
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
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  svc: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  customer: { fontSize: 13, color: '#6B7280', marginVertical: 2 },
  device: { fontSize: 12, color: '#9CA3AF' },
  issue: { fontSize: 12, color: '#374151', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 14 },
});
