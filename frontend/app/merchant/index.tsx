import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantDashboard() {
  const router = useRouter();
  const { user, apiCall, logout } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/stats'); setStats(d); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (user?.role !== 'merchant') {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.err}>Access denied</Text><TouchableOpacity onPress={() => router.replace('/(tabs)')} style={s.btn}><Text style={s.btnText}>Go Home</Text></TouchableOpacity></View></SafeAreaView>;
  }

  const sections = [
    { id: 'products', title: 'Products', icon: 'cube', color: '#8833FF', route: '/merchant/products' },
    { id: 'orders', title: 'Orders', icon: 'receipt', color: '#3B82F6', route: '/merchant/orders', badge: stats?.pending_orders },
    { id: 'services', title: 'Services', icon: 'construct', color: '#10B981', route: '/merchant/services' },
    { id: 'bookings', title: 'Bookings', icon: 'calendar', color: '#F59E0B', route: '/merchant/bookings', badge: stats?.pending_bookings },
    { id: 'social', title: 'Social Posts', icon: 'megaphone', color: '#EC4899', route: '/merchant/social' },
    { id: 'competitions', title: 'Competitions', icon: 'trophy', color: '#F97316', route: '/merchant/competitions' },
    { id: 'branches', title: 'Branches', icon: 'storefront', color: '#06B6D4', route: '/merchant/branches' },
    { id: 'drivers', title: 'Drivers', icon: 'car', color: '#14B8A6', route: '/merchant/drivers' },
    { id: 'delivery-settings', title: 'Delivery Pricing', icon: 'pricetag', color: '#A855F7', route: '/merchant/delivery-settings' },
    { id: 'banners', title: 'Banners', icon: 'image', color: '#6366F1', route: '/merchant/banners' },
    { id: 'customers', title: 'Customers', icon: 'people', color: '#0EA5E9', route: '/merchant/customers' },
  ];

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View><Text style={s.welcome}>Welcome, {user?.name}</Text><Text style={s.subtitle}>Merchant Dashboard</Text></View>
        <TouchableOpacity testID="logout-btn" onPress={() => { logout(); router.replace('/login'); }} style={s.logoutBtn}><Ionicons name="log-out-outline" size="22" color="#EF4444" /></TouchableOpacity>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: '#EFE6FF' }]}><Text style={s.statLbl}>Today Revenue</Text><Text style={s.statVal}>{stats?.today_revenue?.toFixed(0) || 0} SAR</Text></View>
          <View style={[s.statCard, { backgroundColor: '#DBEAFE' }]}><Text style={s.statLbl}>Total Revenue</Text><Text style={s.statVal}>{stats?.total_revenue?.toFixed(0) || 0} SAR</Text></View>
        </View>
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: '#FEF3C7' }]}><Text style={s.statLbl}>Total Orders</Text><Text style={s.statVal}>{stats?.total_orders || 0}</Text></View>
          <View style={[s.statCard, { backgroundColor: '#FEE2E2' }]}><Text style={s.statLbl}>Pending Orders</Text><Text style={s.statVal}>{stats?.pending_orders || 0}</Text></View>
        </View>
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: '#D1FAE5' }]}><Text style={s.statLbl}>Products</Text><Text style={s.statVal}>{stats?.total_products || 0}</Text></View>
          <View style={[s.statCard, { backgroundColor: '#FCE7F3' }]}><Text style={s.statLbl}>Customers</Text><Text style={s.statVal}>{stats?.total_customers || 0}</Text></View>
        </View>
        <Text style={s.sectionTitle}>Manage</Text>
        <View style={s.grid}>
          {sections.map(sec => (
            <TouchableOpacity testID={`nav-${sec.id}`} key={sec.id} style={s.gridItem} onPress={() => router.push(sec.route as any)}>
              <View style={[s.iconBox, { backgroundColor: sec.color + '20' }]}>
                <Ionicons name={sec.icon as any} size="26" color={sec.color} />
                {sec.badge && sec.badge > 0 ? <View style={s.badge}><Text style={s.badgeText}>{sec.badge}</Text></View> : null}
              </View>
              <Text style={s.gridText}>{sec.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  welcome: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  logoutBtn: { padding: 8 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, padding: 16, borderRadius: 16 },
  statLbl: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  statVal: { fontSize: 20, fontWeight: '800', color: '#0A0A0A' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginTop: 12, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47%', backgroundColor: 'white', padding: 16, borderRadius: 16, alignItems: 'center' },
  iconBox: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  gridText: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  err: { color: '#EF4444', fontSize: 16, marginBottom: 16 },
  btn: { backgroundColor: '#8833FF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: 'white', fontWeight: '700' },
});
