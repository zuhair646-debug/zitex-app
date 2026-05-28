import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const SECTION_GROUPS = [
  {
    title: '🛒 المتجر',
    items: [
      { id: 'products', title: 'المنتجات', icon: 'cube', color: '#8833FF', route: '/merchant/products' },
      { id: 'orders', title: 'الطلبات', icon: 'receipt', color: '#3B82F6', route: '/merchant/orders', badge_key: 'pending_orders' },
      { id: 'customers', title: 'العملاء', icon: 'people', color: '#0EA5E9', route: '/merchant/customers' },
      { id: 'banners', title: 'البانرات', icon: 'image', color: '#6366F1', route: '/merchant/banners' },
    ],
  },
  {
    title: '📣 السوشال ميديا والتسويق',
    items: [
      { id: 'social', title: 'إدارة المحتوى', icon: 'megaphone', color: '#EC4899', route: '/merchant/social' },
      { id: 'competitions', title: 'المسابقات', icon: 'trophy', color: '#F97316', route: '/merchant/competitions' },
    ],
  },
  {
    title: '🛠️ الخدمات والصيانة',
    items: [
      { id: 'services', title: 'الخدمات', icon: 'construct', color: '#10B981', route: '/merchant/services' },
      { id: 'bookings', title: 'الحجوزات', icon: 'calendar', color: '#F59E0B', route: '/merchant/bookings', badge_key: 'pending_bookings' },
    ],
  },
  {
    title: '👨‍💼 الموظفون والإعدادات',
    items: [
      { id: 'employees', title: 'الموظفون', icon: 'people-circle', color: '#EF4444', route: '/merchant/employees' },
      { id: 'support-settings', title: 'الدعم الفني', icon: 'headset', color: '#10B981', route: '/merchant/support-settings' },
    ],
  },
  {
    title: '🚚 التوصيل',
    items: [
      { id: 'branches', title: 'الفروع', icon: 'storefront', color: '#06B6D4', route: '/merchant/branches' },
      { id: 'drivers', title: 'السائقون', icon: 'car', color: '#14B8A6', route: '/merchant/drivers' },
      { id: 'delivery-settings', title: 'تسعير التوصيل', icon: 'pricetag', color: '#A855F7', route: '/merchant/delivery-settings' },
    ],
  },
];

export default function MerchantDashboard() {
  const router = useRouter();
  const { user, apiCall, logout } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/stats'); setStats(d); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (user?.role !== 'merchant') {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.err}>الدخول مرفوض</Text><TouchableOpacity onPress={() => router.replace('/(tabs)')} style={s.btn}><Text style={s.btnText}>الرئيسية</Text></TouchableOpacity></View></SafeAreaView>;
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.welcome}>أهلاً، {user?.name}</Text>
          <Text style={s.subtitle}>لوحة تحكم التاجر</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)' as any)} style={s.iconBtn}><Ionicons name="home-outline" size={22} color="#0A0A0A" /></TouchableOpacity>
        <TouchableOpacity testID="logout-btn" onPress={() => { logout(); router.replace('/login'); }} style={s.iconBtn}><Ionicons name="log-out-outline" size={22} color="#EF4444" /></TouchableOpacity>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {/* Hero stats */}
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>إيرادات اليوم</Text>
          <Text style={s.heroValue}>{stats?.today_revenue?.toFixed(0) || 0} <Text style={s.heroCurrency}>ر.س</Text></Text>
          <Text style={s.heroSubtle}>إجمالي الإيرادات: {stats?.total_revenue?.toFixed(0) || 0} ر.س</Text>
        </View>

        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: '#DBEAFE' }]}>
            <Ionicons name="receipt" size={18} color="#3B82F6" />
            <Text style={s.statVal}>{stats?.total_orders || 0}</Text>
            <Text style={s.statLbl}>إجمالي الطلبات</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="alert-circle" size={18} color="#EF4444" />
            <Text style={s.statVal}>{stats?.pending_orders || 0}</Text>
            <Text style={s.statLbl}>طلبات معلقة</Text>
          </View>
        </View>
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: '#D1FAE5' }]}>
            <Ionicons name="cube" size={18} color="#10B981" />
            <Text style={s.statVal}>{stats?.total_products || 0}</Text>
            <Text style={s.statLbl}>المنتجات</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#FCE7F3' }]}>
            <Ionicons name="people" size={18} color="#EC4899" />
            <Text style={s.statVal}>{stats?.total_customers || 0}</Text>
            <Text style={s.statLbl}>العملاء</Text>
          </View>
        </View>

        {/* Grouped sections */}
        {SECTION_GROUPS.map(group => (
          <View key={group.title}>
            <Text style={s.sectionTitle}>{group.title}</Text>
            <View style={s.grid}>
              {group.items.map(sec => {
                const badge = (sec as any).badge_key ? stats?.[(sec as any).badge_key] : null;
                return (
                  <TouchableOpacity
                    testID={`nav-${sec.id}`}
                    key={sec.id}
                    style={s.gridItem}
                    onPress={() => router.push(sec.route as any)}
                  >
                    <View style={[s.iconBox, { backgroundColor: sec.color + '20' }]}>
                      <Ionicons name={sec.icon as any} size={26} color={sec.color} />
                      {badge && badge > 0 ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
                    </View>
                    <Text style={s.gridText}>{sec.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  welcome: { fontSize: 17, fontWeight: '800', color: '#0A0A0A' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  iconBtn: { padding: 8, marginLeft: 4 },
  heroCard: { backgroundColor: '#8833FF', padding: 20, borderRadius: 18, marginBottom: 12 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  heroValue: { color: 'white', fontSize: 38, fontWeight: '900', marginTop: 4 },
  heroCurrency: { fontSize: 18, fontWeight: '700' },
  heroSubtle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, padding: 14, borderRadius: 14 },
  statLbl: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  statVal: { fontSize: 22, fontWeight: '900', color: '#0A0A0A', marginTop: 6 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', marginTop: 18, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '47%', backgroundColor: 'white', padding: 14, borderRadius: 14, alignItems: 'center' },
  iconBox: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
  gridText: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', textAlign: 'center' },
  err: { color: '#EF4444', fontSize: 16, marginBottom: 16 },
  btn: { backgroundColor: '#8833FF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: 'white', fontWeight: '700' },
});
