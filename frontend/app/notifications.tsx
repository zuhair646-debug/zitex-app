import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';

export default function NotificationsScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/notifications'); setItems(d); }
    catch (e) { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    try { await apiCall(`/api/notifications/${id}/read`, { method: 'POST' }); load(); } catch {}
  };
  const markAll = async () => {
    try { await apiCall('/api/notifications/read-all', { method: 'POST' }); load(); } catch {}
  };

  const openNotification = (n: any) => {
    markRead(n.id);
    const d = n.data || {};
    if (d.type === 'order' && d.order_id) router.push(`/track-order/${d.order_id}` as any);
    else if (d.type === 'group_buy' && d.group_buy_id) router.push('/group-buys' as any);
    else if (d.type === 'competition' && d.competition_id) router.push(`/competition/${d.competition_id}` as any);
  };

  const timeAgo = (iso?: string) => {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} س`;
    return `${Math.floor(diff / 86400)} ي`;
  };

  const unread = items.filter((i: any) => !i.read).length;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>🔔 {t('notif.title')} {unread > 0 && <Text style={{ color: '#EF4444' }}>({unread})</Text>}</Text>
        {unread > 0 ? <TouchableOpacity onPress={markAll}><Text style={s.markAll}>✓ تم</Text></TouchableOpacity> : <View style={{ width: 22 }} />}
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 14 }}>
          {items.length === 0 && <Text style={s.empty}>{t('notif.empty')}</Text>}
          {items.map(n => (
            <TouchableOpacity key={n.id} style={[s.card, !n.read && s.cardUnread]} onPress={() => openNotification(n)}>
              {!n.read && <View style={s.dot} />}
              <View style={{ flex: 1 }}>
                <Text style={s.nTitle}>{n.title}</Text>
                <Text style={s.nBody}>{n.body}</Text>
                <Text style={s.nTime}>{timeAgo(n.created_at)}</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white' },
  title: { fontSize: 17, fontWeight: '800' },
  markAll: { color: '#8833FF', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 8, gap: 10 },
  cardUnread: { backgroundColor: '#EFE6FF' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  nTitle: { fontSize: 14, fontWeight: '800', color: '#0A0A0A' },
  nBody: { fontSize: 12, color: '#374151', marginTop: 2 },
  nTime: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
});
