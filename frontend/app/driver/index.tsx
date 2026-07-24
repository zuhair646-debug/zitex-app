import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Switch, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../_layout';

export default function DriverDashboard() {
  const router = useRouter();
  const { user, apiCall, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [available, setAvailable] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'active'|'available'|'history'>('active');
  const [history, setHistory] = useState<any[]>([]);
  const locInterval = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [p, av, ac, hi] = await Promise.all([
        apiCall('/api/driver/profile'),
        apiCall('/api/driver/available-orders'),
        apiCall('/api/driver/active-orders'),
        apiCall('/api/driver/history'),
      ]);
      setProfile(p); setAvailable(av); setActive(ac); setHistory(hi);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Push location every 15s when online
  const startLocationBeacon = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Permission', 'Location access needed for delivery tracking'); return false; }
    const sendLoc = async () => {
      try { const loc = await Location.getCurrentPositionAsync({}); await apiCall('/api/driver/location', { method: 'POST', body: JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude }) }); } catch {}
    };
    sendLoc();
    locInterval.current = setInterval(sendLoc, 15000);
    return true;
  };
  const stopLocationBeacon = () => { if (locInterval.current) clearInterval(locInterval.current); locInterval.current = null; };
  useEffect(() => () => stopLocationBeacon(), []);

  const toggleOnline = async (v: boolean) => {
    try {
      if (v) { const ok = await startLocationBeacon(); if (!ok) return; }
      else stopLocationBeacon();
      await apiCall('/api/driver/online', { method: 'POST', body: JSON.stringify({ online: v }) });
      setProfile({ ...profile, online: v });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const accept = async (oid: string) => { try { await apiCall(`/api/driver/orders/${oid}/accept`, { method: 'POST' }); load(); } catch (e: any) { Alert.alert('Error', e.message); } };
  const pickup = async (oid: string) => { try { await apiCall(`/api/driver/orders/${oid}/pickup`, { method: 'POST' }); load(); } catch (e: any) { Alert.alert('Error', e.message); } };
  const deliver = async (oid: string) => {
    Alert.alert('Confirm Delivery', 'Mark this order as delivered?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delivered', onPress: async () => { try { const r = await apiCall(`/api/driver/orders/${oid}/deliver`, { method: 'POST' }); Alert.alert('Done', `Earned ${r.earnings?.toFixed(2) || 0} SAR`); load(); } catch (e: any) { Alert.alert('Error', e.message); } } }
    ]);
  };
  const navigate = (lat?: number, lng?: number, addr?: string) => {
    if (lat && lng) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    else if (addr) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  const list = tab === 'active' ? active : tab === 'available' ? available : history;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View>
          <Text style={s.welcome}>{user?.name}</Text>
          <Text style={s.role}>Driver Dashboard</Text>
        </View>
        <TouchableOpacity onPress={() => { stopLocationBeacon(); logout(); router.replace('/login'); }}><Ionicons name="log-out-outline" size={22} color="#EF4444" /></TouchableOpacity>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
        <View style={[s.statusCard, { backgroundColor: profile?.online ? '#10B981' : '#6B7280' }]}>
          <View><Text style={s.statusLbl}>Status</Text><Text style={s.statusVal}>{profile?.online ? 'ONLINE' : 'OFFLINE'}</Text></View>
          <Switch value={!!profile?.online} onValueChange={toggleOnline} trackColor={{ true: '#fff', false: '#9CA3AF' }} thumbColor={profile?.online ? '#10B981' : '#fff'} />
        </View>
        <View style={s.statsRow}>
          <View style={s.statCard}><Text style={s.statLbl}>Today</Text><Text style={s.statVal}>{profile?.today_deliveries || 0}</Text><Text style={s.statSub}>deliveries</Text></View>
          <View style={s.statCard}><Text style={s.statLbl}>Earnings Today</Text><Text style={s.statVal}>{(profile?.today_earnings || 0).toFixed(0)}</Text><Text style={s.statSub}>SAR</Text></View>
          <View style={s.statCard}><Text style={s.statLbl}>Wallet</Text><Text style={s.statVal}>{(profile?.wallet_balance || 0).toFixed(0)}</Text><Text style={s.statSub}>SAR</Text></View>
        </View>
        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, tab === 'active' && s.tabActive]} onPress={() => setTab('active')}><Text style={[s.tabText, tab === 'active' && s.tabTextActive]}>Active ({active.length})</Text></TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab === 'available' && s.tabActive]} onPress={() => setTab('available')}><Text style={[s.tabText, tab === 'available' && s.tabTextActive]}>Available ({available.length})</Text></TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab === 'history' && s.tabActive]} onPress={() => setTab('history')}><Text style={[s.tabText, tab === 'history' && s.tabTextActive]}>History</Text></TouchableOpacity>
        </View>
        {list.length === 0 ? <Text style={s.empty}>No {tab} orders</Text> : list.map((o: any) => (
          <View key={o.id} style={s.orderCard}>
            <View style={s.row}><Text style={s.orderNo}>#{o.id?.slice(-6).toUpperCase()}</Text><Text style={[s.orderStatus, { color: o.status === 'delivered' ? '#10B981' : o.status === 'picked_up' ? '#3B82F6' : o.status === 'assigned' ? '#8833FF' : '#F59E0B' }]}>{o.status}</Text></View>
            <Text style={s.customer}>To: {o.address || '-'}</Text>
            <View style={s.row}><Text style={s.items}>{(o.items || []).length} items • {o.total?.toFixed(0)} SAR</Text><Text style={s.fee}>Fee: {(o.delivery_fee || 0).toFixed(2)} SAR</Text></View>
            {tab === 'available' && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#8833FF' }]} onPress={() => accept(o.id)}><Text style={s.actionText}>Accept Order</Text></TouchableOpacity>
            )}
            {tab === 'active' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={[s.smBtn, { backgroundColor: '#3B82F6' }]} onPress={() => navigate(o.address_lat, o.address_lng, o.address)}><Ionicons name="navigate" size={14} color="white" /><Text style={s.smBtnText}>Navigate</Text></TouchableOpacity>
                {o.status === 'assigned' && <TouchableOpacity style={[s.smBtn, { backgroundColor: '#F59E0B' }]} onPress={() => pickup(o.id)}><Text style={s.smBtnText}>Picked Up</Text></TouchableOpacity>}
                {o.status === 'picked_up' && <TouchableOpacity style={[s.smBtn, { backgroundColor: '#10B981' }]} onPress={() => deliver(o.id)}><Text style={s.smBtnText}>Delivered</Text></TouchableOpacity>}
              </View>
            )}
            {tab === 'history' && <Text style={s.earned}>Earned: {(o.driver_earnings || 0).toFixed(2)} SAR</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white' },
  welcome: { fontSize: 17, fontWeight: '800', color: '#0A0A0A' },
  role: { fontSize: 12, color: '#6B7280' },
  statusCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 16 },
  statusLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  statusVal: { color: 'white', fontSize: 24, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: 'white', padding: 12, borderRadius: 12, alignItems: 'center' },
  statLbl: { fontSize: 11, color: '#6B7280' },
  statVal: { fontSize: 22, fontWeight: '800', color: '#0A0A0A', marginVertical: 4 },
  statSub: { fontSize: 10, color: '#9CA3AF' },
  tabs: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 12, padding: 4, marginBottom: 12 },
  tab: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#8833FF' },
  tabText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  tabTextActive: { color: 'white' },
  orderCard: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderNo: { fontSize: 13, fontWeight: '800', color: '#0A0A0A' },
  orderStatus: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  customer: { fontSize: 12, color: '#374151', marginVertical: 4 },
  items: { fontSize: 12, color: '#6B7280' },
  fee: { fontSize: 13, fontWeight: '700', color: '#8833FF' },
  actionBtn: { padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  actionText: { color: 'white', fontWeight: '700' },
  smBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, borderRadius: 8, flex: 1, justifyContent: 'center' },
  smBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
  earned: { fontSize: 13, color: '#10B981', fontWeight: '700', marginTop: 4 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
});
