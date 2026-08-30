import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const APPROVAL_COLORS: any = { pending: '#F59E0B', approved: '#10B981', auto_approved: '#8833FF', rejected: '#EF4444' };

export default function MerchantCompetitions() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [comps, setComps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/competitions'); setComps(d); } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = (id: string) => Alert.alert('حذف المسابقة؟', 'لا يمكن التراجع', [{ text: 'إلغاء', style: 'cancel' }, { text: 'حذف', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/competitions/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('خطأ', e.message); } } }]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Competitions ({comps.length})</Text>
        <TouchableOpacity testID="new-comp" onPress={() => router.push('/merchant/competition-form')} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {comps.length === 0 ? <Text style={s.empty}>No competitions yet</Text> : comps.map(c => {
            const ap = c.approval_status || (c.requires_approval ? 'pending' : 'auto_approved');
            return (
              <View key={c.id} style={s.card}>
                <View style={s.row}>
                  <Text style={s.compTitle} numberOfLines={1}>{c.title}</Text>
                  <TouchableOpacity onPress={() => del(c.id)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity>
                </View>
                <Text style={s.prize}>{c.prize}</Text>
                <View style={s.statRow}>
                  <View style={[s.badge, { backgroundColor: APPROVAL_COLORS[ap] + '20' }]}>
                    <Text style={[s.badgeText, { color: APPROVAL_COLORS[ap] }]}>{ap === 'auto_approved' ? 'PUBLIC' : ap.toUpperCase()}</Text>
                  </View>
                  <Text style={s.joined}>{c.joined_count || 0} joined</Text>
                </View>
                {c.approval_note ? <Text style={s.note}>Note: {c.approval_note}</Text> : null}
              </View>
            );
          })}
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
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  compTitle: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', flex: 1, marginRight: 8 },
  prize: { fontSize: 13, color: '#8833FF', fontWeight: '600' },
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  joined: { fontSize: 12, color: '#6B7280' },
  note: { fontSize: 12, color: '#EF4444', marginTop: 6, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 14 },
});
