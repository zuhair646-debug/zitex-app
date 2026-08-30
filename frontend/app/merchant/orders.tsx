import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { SegmentedControl, EmptyState, SkeletonBox, Badge, PrimaryButton, SecondaryButton } from '../../src/components/ui';

type OrderFilter = 'new' | 'processing' | 'ready' | 'delivering' | 'done' | 'all';

const STATUS_LABEL: Record<string, string> = {
  pending: 'جديد', processing: 'قيد التنفيذ', ready: 'جاهز',
  out_for_delivery: 'في الطريق', delivered: 'تم التسليم', cancelled: 'ملغى',
};
const STATUS_TONE: Record<string, any> = {
  pending: 'warning', processing: 'info', ready: 'gold',
  out_for_delivery: 'info', delivered: 'success', cancelled: 'error',
};

export default function MerchantOrders() {
  const { apiCall } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<OrderFilter>('new');

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/orders'); setOrders(Array.isArray(d) ? d : []); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id: string, next: string) => {
    try {
      await apiCall(`/api/merchant/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: next }) });
      load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
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
  const dateFmt = (d: any) => { try { return new Date(d).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>الطلبات</Text>
            <Text style={s.subtitle}>{orders.length} طلب • {counts.new} جديد</Text>
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
            new: `جديد (${counts.new})`,
            processing: `قيد التنفيذ (${counts.processing})`,
            ready: `جاهز (${counts.ready})`,
            done: `مكتمل (${counts.done})`,
            all: `الكل (${counts.all})`,
          }}
        />

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <SkeletonBox height={130} /><SkeletonBox height={130} /><SkeletonBox height={130} />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="لا توجد طلبات"
            description="حين يبدأ العملاء بالطلب، ستظهر هنا للمتابعة"
          />
        ) : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            {filtered.map(o => (
              <View key={o.id} style={s.card}>
                {/* Top row: ID + status + amount */}
                <View style={s.topRow}>
                  <View style={s.idPill}>
                    <Ionicons name="receipt" size={14} color={colors.brand} />
                    <Text style={s.orderId}>#{String(o.id).slice(-6).toUpperCase()}</Text>
                  </View>
                  <Badge label={STATUS_LABEL[o.status] || o.status} tone={STATUS_TONE[o.status] || 'default'} />
                  <View style={{ flex: 1 }} />
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.amount}>{money(o.total)} <Text style={s.currency}>ر.س</Text></Text>
                  </View>
                </View>

                {/* Customer */}
                <View style={s.custRow}>
                  <Ionicons name="person" size={14} color={colors.onSurfaceSecondary} />
                  <Text style={s.custName}>{o.customer_name || 'عميل'}</Text>
                  <Text style={s.dotSep}>•</Text>
                  <Text style={s.custMeta}>{o.items?.length || 0} منتج</Text>
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
                      {o.delivery_type === 'pickup' ? 'استلام من الفرع' : 'توصيل'}
                      {o.driver_name ? ` • السائق: ${o.driver_name}` : ''}
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={s.actions}>
                  {o.status === 'pending' && (
                    <PrimaryButton size="sm" label="قبول وتجهيز" icon="checkmark-circle"
                      onPress={() => changeStatus(o.id, 'processing')} />
                  )}
                  {o.status === 'processing' && (
                    <PrimaryButton size="sm" label="وضع جاهز" icon="cube"
                      onPress={() => changeStatus(o.id, 'ready')} />
                  )}
                  {o.status === 'ready' && (
                    <PrimaryButton size="sm" label="خرج للتوصيل" icon="bicycle"
                      onPress={() => changeStatus(o.id, 'out_for_delivery')} />
                  )}
                  {o.status === 'out_for_delivery' && (
                    <PrimaryButton size="sm" label="تم التسليم" icon="checkmark-done"
                      onPress={() => changeStatus(o.id, 'delivered')} />
                  )}
                  {o.status !== 'cancelled' && o.status !== 'delivered' && (
                    <SecondaryButton size="sm" fullWidth={false} label="إلغاء" icon="close"
                      onPress={() => Alert.alert('إلغاء الطلب', 'هل أنت متأكد؟', [
                        { text: 'لا', style: 'cancel' },
                        { text: 'نعم', style: 'destructive', onPress: () => changeStatus(o.id, 'cancelled') },
                      ])} />
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
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
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs,
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
});
