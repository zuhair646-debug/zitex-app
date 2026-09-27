import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { SegmentedControl, EmptyState, SkeletonBox, Badge, PrimaryButton, SecondaryButton } from '../../src/components/ui';
import { useT } from '../../src/i18n';

type OrderFilter = 'new' | 'processing' | 'ready' | 'delivering' | 'done' | 'all';

const STATUS_TONE: Record<string, any> = {
  pending: 'warning', processing: 'info', ready: 'gold',
  out_for_delivery: 'info', delivered: 'success', cancelled: 'error',
};

export default function MerchantOrders() {
  const { t, lang } = useT();
  const s = useSStyles();
  const { apiCall } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<OrderFilter>('all');

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/orders'); setOrders(Array.isArray(d) ? d : []); }
    catch (e: any) { Alert.alert(t('mo.common.error'), e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id: string, next: string) => {
    try {
      await apiCall(`/api/merchant/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: next }) });
      load();
    } catch (e: any) { Alert.alert(t('mo.common.error'), e.message); }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'new') return orders.filter(o => o.status === 'pending');
    if (filter === 'processing') return orders.filter(o => o.status === 'processing');
    if (filter === 'ready') return orders.filter(o => o.status === 'ready' || o.status === 'out_for_delivery');
    if (filter === 'done') return orders.filter(o => o.status === 'delivered' || o.status === 'cancelled');
    return orders;
  }, [orders, filter]);

  const counts = useMemo(() => ({
    new: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    ready: orders.filter(o => o.status === 'ready' || o.status === 'out_for_delivery').length,
    done: orders.filter(o => o.status === 'delivered' || o.status === 'cancelled').length,
    all: orders.length,
  }), [orders]);

  const money = (n: number) => new Intl.NumberFormat('en').format(n || 0);
  const dateFmt = (d: any) => {
    try {
      const localeMap: any = { ar: 'ar', en: 'en', fa: 'fa-IR', hi: 'hi-IN', zh: 'zh-CN' };
      const l = localeMap[lang] || 'en';
      return new Date(d).toLocaleString(l, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };
  const statusLabel = (st: string) => t(`os.${st}`, st === 'pending' ? t('mo.orders.status.new') : st);
  const currency = t('common.currency');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t('mo.orders.title')}</Text>
            <Text style={s.subtitle}>{t('mo.orders.stat', { n: orders.length, newCount: counts.new })}</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={load} activeOpacity={0.7}>
            <Ionicons name="refresh" size={20} color={colors.onSurface} />
          </TouchableOpacity>
        </View>

        <SegmentedControl<OrderFilter>
          options={['new', 'processing', 'ready', 'done', 'all']}
          value={filter}
          onChange={setFilter}
          labels={{
            new: t('mo.orders.f.new', { n: counts.new }),
            processing: t('mo.orders.f.processing', { n: counts.processing }),
            ready: t('mo.orders.f.ready', { n: counts.ready }),
            done: t('mo.orders.f.done', { n: counts.done }),
            all: t('mo.orders.f.all', { n: counts.all }),
          }}
        />

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <SkeletonBox height={130} /><SkeletonBox height={130} /><SkeletonBox height={130} />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title={t('mo.orders.emptyTitle')}
            description={t('mo.orders.emptyDesc')}
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.id}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
            renderItem={({ item: o }) => (
              <View style={s.card}>
                {/* Top row: ID + status + amount */}
                <View style={s.topRow}>
                  <View style={s.idPill}>
                    <Ionicons name="receipt" size={14} color={colors.brand} />
                    <Text style={s.orderId}>#{String(o.id).slice(-6).toUpperCase()}</Text>
                  </View>
                  <Badge label={statusLabel(o.status)} tone={STATUS_TONE[o.status] || 'default'} />
                  <View style={{ flex: 1 }} />
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.amount}>{money(o.total)} <Text style={s.currency}>{currency}</Text></Text>
                  </View>
                </View>

                {/* Customer */}
                <View style={s.custRow}>
                  <Ionicons name="person" size={14} color={colors.onSurfaceSecondary} />
                  <Text style={s.custName}>{o.customer_name || t('mo.orders.customer')}</Text>
                  <Text style={s.dotSep}>•</Text>
                  <Text style={s.custMeta}>{t('mo.orders.itemsCount', { n: o.items?.length || 0 })}</Text>
                  <Text style={s.dotSep}>•</Text>
                  <Text style={s.custMeta}>{dateFmt(o.created_at)}</Text>
                </View>

                {/* Delivery info */}
                {o.delivery_type && (
                  <View style={s.deliveryRow}>
                    <Ionicons
                      name={o.delivery_type === 'pickup' ? 'storefront' : 'bicycle'}
                      size={14} color={colors.onSurfaceSecondary}
                    />
                    <Text style={s.deliveryText}>
                      {o.delivery_type === 'pickup' ? t('mo.orders.pickup') : t('mo.orders.delivery')}
                      {o.driver_name ? ` • ${t('mo.orders.driverPrefix')}: ${o.driver_name}` : ''}
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={s.actions}>
                  {o.status === 'pending' && (
                    <View style={{ flex: 1 }}>
                      <PrimaryButton size="sm" label={t('mo.orders.a.acceptPrepare')} icon="checkmark-circle"
                        onPress={() => changeStatus(o.id, 'processing')} />
                    </View>
                  )}
                  {o.status === 'processing' && (
                    <View style={{ flex: 1 }}>
                      <PrimaryButton size="sm" label={t('mo.orders.a.setReady')} icon="cube"
                        onPress={() => changeStatus(o.id, 'ready')} />
                    </View>
                  )}
                  {o.status === 'ready' && (
                    <View style={{ flex: 1 }}>
                      <PrimaryButton size="sm" label={t('mo.orders.a.outForDelivery')} icon="bicycle"
                        onPress={() => changeStatus(o.id, 'out_for_delivery')} />
                    </View>
                  )}
                  {o.status === 'out_for_delivery' && (
                    <View style={{ flex: 1 }}>
                      <PrimaryButton size="sm" label={t('mo.orders.a.markDelivered')} icon="checkmark-done"
                        onPress={() => changeStatus(o.id, 'delivered')} />
                    </View>
                  )}
                  {o.status !== 'cancelled' && o.status !== 'delivered' && (
                    <View style={{ flex: 1 }}>
                      <SecondaryButton size="sm" fullWidth label={t('mo.orders.a.cancel')} icon="close"
                        onPress={() => Alert.alert(t('mo.orders.cancel.title'), t('mo.orders.cancel.body'), [
                          { text: t('mo.orders.cancel.no'), style: 'cancel' },
                          { text: t('mo.orders.cancel.yes'), style: 'destructive', onPress: () => changeStatus(o.id, 'cancelled') },
                        ])} />
                    </View>
                  )}
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
  },
  title: { ...typography.displaySmall, color: colors.onSurface },
  subtitle: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  idPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm,
  },
  orderId: { ...typography.labelMedium, color: colors.brand },
  amount: { ...typography.titleMedium, color: colors.onSurface, fontWeight: '800' },
  currency: { ...typography.caption, color: colors.onSurfaceSecondary },

  custRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  custName: { ...typography.bodyMedium, color: colors.onSurface, fontWeight: '600' },
  dotSep: { color: colors.onSurfaceTertiary, fontSize: 12 },
  custMeta: { ...typography.caption, color: colors.onSurfaceSecondary },

  deliveryRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  deliveryText: { ...typography.caption, color: colors.onSurfaceSecondary },

  actions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap',
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
}), [themeKey]);
}
