import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';

const STATUSES: Record<string, string> = {
  pending: 'قيد المراجعة',
  confirmed: 'مؤكد',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغى',
};
const SCOLOR: Record<string, string> = {
  pending: colors.warning,
  confirmed: colors.info,
  in_progress: colors.brand,
  completed: colors.success,
  cancelled: colors.error,
};

export default function MerchantBookings() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/api/merchant/bookings');
      setBookings(Array.isArray(d) ? d : []);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateStatus = (id: string, current: string) => {
    Alert.alert('تحديث الحالة', 'اختر الحالة الجديدة', [
      ...Object.keys(STATUSES).filter(s => s !== current).map(s => ({
        text: STATUSES[s],
        onPress: async () => {
          try {
            await apiCall(`/api/merchant/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: s }) });
            load();
          } catch (e: any) { Alert.alert('خطأ', e.message); }
        }
      })),
      { text: 'إلغاء', style: 'cancel' as const },
    ]);
  };

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  const counts = Object.keys(STATUSES).reduce((acc: Record<string, number>, s) => {
    acc[s] = bookings.filter(b => b.status === s).length;
    return acc;
  }, {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={s.title}>الحجوزات ({bookings.length})</Text>
          <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={s.iconBtn}>
            <Ionicons name="refresh" size={20} color={colors.brand} />
          </TouchableOpacity>
        </View>

        {/* Status tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          <TouchableOpacity onPress={() => setFilter('all')} style={[s.tab, filter === 'all' && s.tabActive]}>
            <Text style={[s.tabLabel, filter === 'all' && s.tabLabelActive]}>الكل ({bookings.length})</Text>
          </TouchableOpacity>
          {Object.keys(STATUSES).map(st => (
            <TouchableOpacity key={st} onPress={() => setFilter(st)} style={[s.tab, filter === st && s.tabActive]}>
              <View style={[s.dot, { backgroundColor: SCOLOR[st] }]} />
              <Text style={[s.tabLabel, filter === st && s.tabLabelActive]}>{STATUSES[st]} ({counts[st] || 0})</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.md }}
          >
            {filtered.length === 0 ? (
              <View style={{ alignItems: 'center', padding: spacing['3xl'], gap: spacing.md }}>
                <Ionicons name="calendar-outline" size={64} color={colors.brandTertiary} />
                <Text style={s.empty}>لا توجد حجوزات{filter !== 'all' ? ` بحالة "${STATUSES[filter]}"` : ' بعد'}</Text>
              </View>
            ) : filtered.map(b => (
              <View key={b.id} style={s.card}>
                <View style={s.row}>
                  <Text style={s.svc}>{b.service_name || b.name || 'حجز'}</Text>
                  <TouchableOpacity onPress={() => updateStatus(b.id, b.status)} style={[s.statusBadge, { backgroundColor: (SCOLOR[b.status] || colors.brand) + '30', borderColor: SCOLOR[b.status] || colors.brand }]}>
                    <Text style={[s.statusText, { color: SCOLOR[b.status] || colors.brand }]}>{STATUSES[b.status] || b.status}</Text>
                    <Ionicons name="chevron-down" size={11} color={SCOLOR[b.status] || colors.brand} />
                  </TouchableOpacity>
                </View>
                <View style={s.detailRow}>
                  <Ionicons name="person" size={12} color={colors.onSurfaceTertiary} />
                  <Text style={s.customer}>{b.customer_name || '—'} · {b.customer_phone || b.phone || '—'}</Text>
                </View>
                {!!b.device_model && (
                  <View style={s.detailRow}>
                    <Ionicons name="phone-portrait" size={12} color={colors.onSurfaceTertiary} />
                    <Text style={s.device}>{b.device_model}</Text>
                  </View>
                )}
                {!!b.issue_desc && <Text style={s.issue} numberOfLines={3}>{b.issue_desc}</Text>}
                {!!b.scheduled_at && (
                  <View style={s.detailRow}>
                    <Ionicons name="time" size={12} color={colors.brand} />
                    <Text style={s.scheduled}>{b.scheduled_at}</Text>
                  </View>
                )}
                {!!b.total_fee && (
                  <View style={s.priceRow}>
                    <Text style={s.priceLabel}>المجموع</Text>
                    <Text style={s.price}>{b.total_fee} ر.س</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  iconBtn: { padding: spacing.sm, borderRadius: radius.md },
  title: { ...typography.titleLarge, color: colors.onSurface },
  tabsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm, flexDirection: 'row' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabLabel: { ...typography.labelMedium, color: colors.onSurfaceSecondary },
  tabLabelActive: { color: colors.onBrandPrimary },
  dot: { width: 6, height: 6, borderRadius: 3 },
  card: {
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderSubtle, gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  svc: { ...typography.titleSmall, color: colors.onSurface, flex: 1, textAlign: 'right' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1 },
  statusText: { ...typography.labelSmall, fontSize: 11, fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  customer: { ...typography.bodySmall, color: colors.onSurfaceSecondary, textAlign: 'right' },
  device: { ...typography.caption, color: colors.onSurfaceTertiary, textAlign: 'right' },
  issue: { ...typography.bodySmall, color: colors.onSurface, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  scheduled: { ...typography.caption, color: colors.brand, fontWeight: '700', textAlign: 'right' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  priceLabel: { ...typography.caption, color: colors.onSurfaceSecondary },
  price: { ...typography.titleSmall, color: colors.brand },
  empty: { ...typography.bodyMedium, color: colors.onSurfaceTertiary, textAlign: 'center' },
});
