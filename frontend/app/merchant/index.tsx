import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography, gradients } from '../../src/theme/tokens';
import {
  StatCard, ActionCard, SectionHeader, PrimaryButton, EmptyState, SkeletonBox, Badge,
} from '../../src/components/ui';

export default function MerchantHome() {
  const router = useRouter();
  const { user, apiCall, logout } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([
        apiCall('/api/merchant/stats').catch(() => null),
        apiCall('/api/merchant/orders?limit=5').catch(() => []),
      ]);
      setStats(s);
      setRecentOrders(Array.isArray(o) ? o.slice(0, 5) : []);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const money = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n || 0);
  const orderStatusTone = (s: string): any =>
    s === 'pending' ? 'warning' : s === 'processing' ? 'info' : s === 'ready' ? 'gold' : s === 'delivered' ? 'success' : s === 'cancelled' ? 'error' : 'default';
  const orderStatusLabel = (s: string) =>
    ({ pending: 'قيد الانتظار', processing: 'قيد التنفيذ', ready: 'جاهز', out_for_delivery: 'في الطريق', delivered: 'تم التسليم', cancelled: 'ملغى' }[s] || s);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>مرحباً 👋</Text>
              <Text style={styles.merchantName}>{user?.name || 'التاجر'}</Text>
              <Text style={styles.merchantRole}>لوحة تحكم Zitex</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={logout} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={22} color={colors.onSurface} />
            </TouchableOpacity>
          </View>

          {/* Hero Metric — Big Card */}
          <LinearGradient
            colors={gradients.brandGold as any}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>إجمالي مبيعات اليوم</Text>
              <Ionicons name="trending-up" size={20} color={colors.onBrandPrimary} />
            </View>
            {loading ? <SkeletonBox height={40} width="60%" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
              : <Text style={styles.heroValue}>{money(stats?.today_revenue || 0)} <Text style={styles.heroCurrency}>ر.س</Text></Text>}
            <View style={styles.heroFooter}>
              <View style={styles.heroPill}>
                <Ionicons name="wallet" size={12} color={colors.onBrandPrimary} />
                <Text style={styles.heroPillText}>إجمالي: {money(stats?.total_revenue || 0)} ر.س</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <StatCard icon="receipt" label="طلبات نشطة" value={stats?.pending_orders ?? '—'} tone="gold"
              onPress={() => router.push('/merchant/orders')} />
            <StatCard icon="cube" label="منتجات" value={stats?.total_products ?? '—'} tone="default"
              onPress={() => router.push('/merchant/products')} />
          </View>
          <View style={styles.statsGrid}>
            <StatCard icon="people" label="عملاء" value={stats?.total_customers ?? '—'} tone="success"
              onPress={() => router.push('/merchant/customers')} />
            <StatCard icon="trophy" label="مسابقات" value={stats?.pending_competitions_approval ?? 0} tone={stats?.pending_competitions_approval > 0 ? 'warning' : 'default'}
              onPress={() => router.push('/merchant/competitions')} />
          </View>

          {/* Quick Actions */}
          <SectionHeader title="إجراءات سريعة" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow} style={{ flexGrow: 0 }}>
            <ActionCard icon="add-circle" label="إضافة منتج" onPress={() => router.push('/merchant/product-form')} />
            <ActionCard icon="megaphone" label="منشور جديد" onPress={() => router.push('/merchant/social')} />
            <ActionCard icon="trophy" label="إنشاء مسابقة" onPress={() => router.push('/merchant/competition-form')} />
            <ActionCard icon="image" label="إضافة بانر" onPress={() => router.push('/merchant/banners')} />
            <ActionCard icon="people-circle" label="إضافة موظف" onPress={() => router.push('/merchant/employees')} />
            <ActionCard icon="settings" label="إعدادات الدعم" onPress={() => router.push('/merchant/support-settings')} />
          </ScrollView>

          {/* Recent Orders */}
          <SectionHeader
            title="أحدث الطلبات"
            subtitle={recentOrders.length > 0 ? `${recentOrders.length} طلبات تحتاج انتباهك` : undefined}
            action={() => router.push('/merchant/orders')}
            actionLabel="عرض الكل"
          />

          {loading ? (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              <SkeletonBox height={72} /><SkeletonBox height={72} /><SkeletonBox height={72} />
            </View>
          ) : recentOrders.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="لا توجد طلبات بعد"
              description="ستظهر هنا كل الطلبات الجديدة من عملائك"
              actionLabel="عرض المنتجات"
              onAction={() => router.push('/merchant/products')}
            />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              {recentOrders.map((o: any) => (
                <TouchableOpacity
                  key={o.id} activeOpacity={0.85}
                  onPress={() => router.push(`/merchant/orders?id=${o.id}` as any)}
                  style={styles.orderCard}
                >
                  <View style={styles.orderIconWrap}>
                    <Ionicons name="cart" size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 }}>
                      <Text style={styles.orderId}>#{String(o.id).slice(-6).toUpperCase()}</Text>
                      <Badge label={orderStatusLabel(o.status)} tone={orderStatusTone(o.status)} />
                    </View>
                    <Text style={styles.orderCustomer} numberOfLines={1}>
                      {o.customer_name || 'عميل'} • {o.items?.length || 0} منتج
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderAmount}>{money(o.total)}</Text>
                    <Text style={styles.orderCurrency}>ر.س</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
  },
  greeting: { ...typography.bodyMedium, color: colors.onSurfaceSecondary },
  merchantName: { ...typography.displaySmall, color: colors.onSurface, marginTop: 2 },
  merchantRole: { ...typography.caption, color: colors.brand, marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  dot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error, borderWidth: 2, borderColor: colors.surface },

  hero: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.lg,
    padding: spacing.xl, borderRadius: radius.xl,
    shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { ...typography.labelMedium, color: colors.onBrandPrimary, opacity: 0.85 },
  heroValue: { fontSize: 40, fontWeight: '900', color: colors.onBrandPrimary, marginTop: spacing.sm },
  heroCurrency: { fontSize: 20, fontWeight: '700' },
  heroFooter: { marginTop: spacing.md, flexDirection: 'row' },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  heroPillText: { ...typography.labelSmall, color: colors.onBrandPrimary, fontWeight: '700' },

  statsGrid: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  quickRow: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },

  orderCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  orderIconWrap: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  orderId: { ...typography.labelMedium, color: colors.onSurface },
  orderCustomer: { ...typography.caption, color: colors.onSurfaceSecondary },
  orderAmount: { ...typography.titleSmall, color: colors.brand },
  orderCurrency: { ...typography.caption, color: colors.onSurfaceSecondary },
});
