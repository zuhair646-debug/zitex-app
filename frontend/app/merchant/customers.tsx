import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantCustomers() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/customers'); setCustomers(d); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Customers ({customers.length})</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {customers.map(c => (
            <View key={c.id} style={s.card}>
              <View style={s.avatar}><Text style={s.avatarText}>{(c.name || '?').charAt(0)}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.name}>{c.name || 'No Name'}</Text>
                <Text style={s.phone}>{c.phone}</Text>
                <Text style={s.email}>{c.email || 'No email'}</Text>
              </View>
              <View style={s.statsBox}>
                <Text style={s.statsVal}>{c.orders_count}</Text>
                <Text style={s.statsLbl}>orders</Text>
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
  card: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#8833FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontSize: 20, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  phone: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  email: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  statsBox: { alignItems: 'center', backgroundColor: '#EFE6FF', borderRadius: 10, padding: 8, minWidth: 50 },
  statsVal: { fontSize: 18, fontWeight: '800', color: '#8833FF' },
  statsLbl: { fontSize: 10, color: '#6B7280' },
});
