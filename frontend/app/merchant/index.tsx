import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography, gradients } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { useT } from '../../src/i18n';
import {
  StatCard, ActionCard, SectionHeader, PrimaryButton, EmptyState, SkeletonBox, Badge,
} from '../../src/components/ui';

export default function MerchantHome() {
  const { t, isRTL } = useT();
  const styles = useStylesStyles();
  const { isDark } = useTheme();
  const router = useRouter();
  const { user, apiCall, logout } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any>({ checked_in: false });
  const [inventoryAlerts, setInventoryAlerts] = useState<any>({ totals: {}, alerts: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o, att, inv] = await Promise.all([
        apiCall('/api/merchant/stats').catch(() => null),
        apiCall('/api/merchant/orders?limit=5').catch(() => []),
        apiCall('/api/employee/attendance-status').catch(() => ({ checked_in: false })),
        apiCall('/api/merchant/inventory/alerts?limit=5').catch(() => ({ totals: {}, alerts: [] })),
      ]);
      setStats(s);
      setRecentOrders(Array.isArray(o) ? o.slice(0, 5) : []);
      setAttendance(att || { checked_in: false });
      setInventoryAlerts(inv || { totals: {}, alerts: [] });
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const toggleAttendance = async () => {
    try {
      if (attendance.checked_in) {
        const r = await apiCall('/api/employee/check-out', { method: 'POST' });
        setAttendance({ checked_in: false });
        alert(t('mh.attSuccessOut', { n: r.duration_minutes ?? 0 }));
      } else {
        await apiCall('/api/employee/check-in', { method: 'POST' });
        setAttendance({ checked_in: true, check_in: new Date().toISOString(), duration_minutes: 0 });
        alert(t('mh.attSuccessIn'));
      }
    } catch (e: any) { alert(e.message); }
  };

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const money = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n || 0);
  const orderStatusTone = (s: string): any =>
    s === 'pending' ? 'warning' : s === 'processing' ? 'info' : s === 'ready' ? 'gold' : s === 'delivered' ? 'success' : s === 'cancelled' ? 'error' : 'default';
  const orderStatusLabel = (s: string) => t(`os.${s}`, s);

  // Choose chevron direction based on RTL
  const chevronForward = isRTL ? 'chevron-back' : 'chevron-forward';
  const currency = t('common.currency');

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{t('mh.hello')}</Text>
              <Text style={styles.merchantName} numberOfLines={1}>{user?.name || t('mh.merchantFallback')}</Text>
              <Text style={styles.merchantRole} numberOfLines={1}>{t('mh.dashboardTitle')}</Text>
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
              <Text style={styles.heroLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('mh.todaySales')}</Text>
              <Ionicons name="trending-up" size={20} color={colors.onBrandPrimary} />
            </View>
            {loading ? <SkeletonBox height={40} width="60%" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
              : (
                <View style={styles.heroValueRow}>
                  <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {money(stats?.today_revenue || 0)}
                  </Text>
                  <Text style={styles.heroCurrency}>{currency}</Text>
                </View>
              )}
            <View style={styles.heroFooter}>
              <View style={styles.heroPill}>
                <Ionicons name="wallet" size={12} color={colors.onBrandPrimary} />
                <Text style={styles.heroPillText} numberOfLines={1}>
                  {t('mh.totalPrefix')}: {money(stats?.total_revenue || 0)} {currency}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Time Clock Card */}
          <TouchableOpacity style={styles.clockCard} onPress={toggleAttendance} activeOpacity={0.85}>
            <View style={[styles.clockIcon, { backgroundColor: attendance.checked_in ? colors.successSoft : colors.brandTertiary }]}>
              <Ionicons name={attendance.checked_in ? 'stop-circle' : 'play-circle'} size={26} color={attendance.checked_in ? colors.success : colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clockTitle} numberOfLines={1}>
                {attendance.checked_in ? t('mh.attCheckedIn') : t('mh.attCheckIn')}
              </Text>
              <Text style={styles.clockSubtitle} numberOfLines={2}>
                {attendance.checked_in
                  ? t('mh.attSinceMinutes', { n: attendance.duration_minutes || 0 })
                  : t('mh.attTapToStart')}
              </Text>
            </View>
            <Ionicons name={chevronForward} size={18} color={colors.onSurfaceTertiary} />
          </TouchableOpacity>

          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <StatCard icon="receipt" label={t('mh.activeOrders')} value={stats?.pending_orders ?? '—'} tone="gold"
              onPress={() => router.push('/merchant/orders')} />
            <StatCard icon="cube" label={t('mh.products')} value={stats?.total_products ?? '—'} tone="default"
              onPress={() => router.push('/merchant/products')} />
          </View>
          <View style={styles.statsGrid}>
            <StatCard icon="people" label={t('mh.customers')} value={stats?.total_customers ?? '—'} tone="success"
              onPress={() => router.push('/merchant/customers')} />
            <StatCard icon="trophy" label={t('mh.contests')} value={stats?.pending_competitions_approval ?? 0} tone={stats?.pending_competitions_approval > 0 ? 'warning' : 'default'}
              onPress={() => router.push('/merchant/competitions')} />
          </View>

          {/* Inventory Alert Banner */}
          {(inventoryAlerts?.alerts?.length ?? 0) > 0 && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/merchant/inventory')}
              style={styles.invAlertCard}
            >
              <View style={styles.invAlertIcon}>
                <Ionicons name="warning" size={22} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.invAlertTitle}>{t('mh.invAlertTitle')}</Text>
                <Text style={styles.invAlertSubtitle} numberOfLines={1}>
                  {inventoryAlerts.totals?.out_of_stock ?? 0} {t('mh.invOutOfStock')} • {inventoryAlerts.totals?.low_stock ?? 0} {t('mh.invLowStock')}
                </Text>
              </View>
              <Ionicons name={chevronForward} size={18} color={colors.warning} />
            </TouchableOpacity>
          )}

          {/* Quick Actions */}
          <SectionHeader title={t('mh.quickActions')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow} style={{ flexGrow: 0 }}>
            <ActionCard icon="add-circle" label={t('mh.qaAddProduct')} onPress={() => router.push('/merchant/product-form')} />
            <ActionCard icon="cart" label={t('mh.qaPOS')} onPress={() => router.push('/merchant/pos')} />
            <ActionCard icon="cube" label={t('mh.qaInventory')} onPress={() => router.push('/merchant/inventory')} />
            <ActionCard icon="receipt" label={t('mh.qaInvoices')} onPress={() => router.push('/merchant/invoices')} />
            <ActionCard icon="megaphone" label={t('mh.qaMarketing')} onPress={() => router.push('/merchant/marketing')} />
            <ActionCard icon="chatbubbles" label={t('mh.qaNewPost')} onPress={() => router.push('/merchant/social')} />
            <ActionCard icon="trophy" label={t('mh.qaNewCompetition')} onPress={() => router.push('/merchant/competition-form')} />
            <ActionCard icon="image" label={t('mh.qaAddBanner')} onPress={() => router.push('/merchant/banners')} />
            <ActionCard icon="people-circle" label={t('mh.qaAddEmployee')} onPress={() => router.push('/merchant/employees')} />
            <ActionCard icon="settings" label={t('mh.qaSupportSettings')} onPress={() => router.push('/merchant/support-settings')} />
          </ScrollView>

          {/* Recent Orders */}
          <SectionHeader
            title={t('mh.recentOrders')}
            subtitle={recentOrders.length > 0 ? t('mh.ordersNeedAttention', { n: recentOrders.length }) : undefined}
            action={() => router.push('/merchant/orders')}
            actionLabel={t('mh.viewAll')}
          />

          {loading ? (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              <SkeletonBox height={72} /><SkeletonBox height={72} /><SkeletonBox height={72} />
            </View>
          ) : recentOrders.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title={t('mh.noOrders')}
              description={t('mh.noOrdersDesc')}
              actionLabel={t('mh.viewProducts')}
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2, flexWrap: 'wrap' }}>
                      <Text style={styles.orderId}>#{String(o.id).slice(-6).toUpperCase()}</Text>
                      <Badge label={orderStatusLabel(o.status)} tone={orderStatusTone(o.status)} />
                    </View>
                    <Text style={styles.orderCustomer} numberOfLines={1}>
                      {o.customer_name || t('mh.customerFallback')} • {o.items?.length || 0} {t('mh.itemWord')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderAmount}>{money(o.total)}</Text>
                    <Text style={styles.orderCurrency}>{currency}</Text>
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

function useStylesStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
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
  heroLabel: { ...typography.labelMedium, color: colors.onBrandPrimary, opacity: 0.85, flex: 1 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  heroValue: { fontSize: 40, fontWeight: '900', color: colors.onBrandPrimary },
  heroCurrency: { fontSize: 20, fontWeight: '700', color: colors.onBrandPrimary },
  heroFooter: { marginTop: spacing.md, flexDirection: 'row' },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.pill, maxWidth: '100%',
  },
  heroPillText: { ...typography.labelSmall, color: colors.onBrandPrimary, fontWeight: '700' },

  statsGrid: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  invAlertCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    borderWidth: 1, borderColor: colors.warning,
  },
  invAlertIcon: {
    width: 40, height: 40, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  invAlertTitle: { ...typography.titleSmall, color: colors.onSurface },
  invAlertSubtitle: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  clockCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    padding: spacing.md, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  clockIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  clockTitle: { ...typography.titleSmall, color: colors.onSurface },
  clockSubtitle: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
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
}), [themeKey]);
}
