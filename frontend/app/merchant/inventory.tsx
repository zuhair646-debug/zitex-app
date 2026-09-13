import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  Alert, RefreshControl, StatusBar, TextInput, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography, shadows } from '../../src/theme/tokens';
import { Chip, EmptyState, SkeletonBox, PrimaryButton, Badge } from '../../src/components/ui';

type Item = {
  product_id: string;
  product_name: string;
  product_image?: string | null;
  price?: number;
  branch_id: string;
  branch_name: string;
  quantity: number;
  stock_store: number;
  stock_app: number;
  inventory_mode: 'combined' | 'separate';
  min_alert: number;
  inventory_type: 'store' | 'app' | 'both';
  is_low: boolean;
  is_out: boolean;
};

type Overview = {
  totals: {
    total_units: number;
    store_units: number;
    app_units: number;
    low_stock: number;
    out_of_stock: number;
  };
  items: Item[];
};

const CHANNEL_TABS = [
  { key: 'all', label: 'الكل', icon: 'apps' },
  { key: 'store', label: 'المتجر', icon: 'storefront' },
  { key: 'app', label: 'التطبيق', icon: 'phone-portrait' },
  { key: 'alerts', label: 'تنبيهات', icon: 'warning' },
] as const;

export default function MerchantInventory() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'all' | 'store' | 'app' | 'alerts'>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Item | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/api/merchant/inventory');
      setData(d);
    } catch (e: any) {
      Alert.alert('خطأ', e.message || 'تعذّر تحميل المخزون');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (tab === 'store') items = items.filter(i => i.inventory_type === 'store' || i.inventory_type === 'both');
    else if (tab === 'app') items = items.filter(i => i.inventory_type === 'app' || i.inventory_type === 'both');
    else if (tab === 'alerts') items = items.filter(i => i.is_low || i.is_out);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(i => (i.product_name || '').toLowerCase().includes(q) || (i.branch_name || '').toLowerCase().includes(q));
    }
    return items;
  }, [data, tab, query]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const quickAdjust = async (item: Item, channel: 'store' | 'app' | 'combined', delta: number) => {
    try {
      await apiCall(`/api/merchant/inventory/${item.branch_id}/${item.product_id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta, channel, reason: 'تعديل يدوي سريع' }),
      });
      load();
    } catch (e: any) { Alert.alert('خطأ', e.message || 'فشل التعديل'); }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>إدارة المخزون</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.iconBtn}>
            <Ionicons name="refresh" size={20} color={colors.brand} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Totals */}
          <View style={styles.statsRow}>
            <StatCard label="الوحدات" value={data?.totals.total_units ?? 0} icon="cube" tone="brand" />
            <StatCard label="بالمتجر" value={data?.totals.store_units ?? 0} icon="storefront" tone="info" />
            <StatCard label="بالتطبيق" value={data?.totals.app_units ?? 0} icon="phone-portrait" tone="success" />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="تنبيهات" value={data?.totals.low_stock ?? 0} icon="warning" tone="warning" />
            <StatCard label="نفدت" value={data?.totals.out_of_stock ?? 0} icon="alert-circle" tone="error" />
            <StatCard label="عناصر" value={data?.items.length ?? 0} icon="list" tone="brand" />
          </View>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث بالمنتج أو الفرع…"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.searchInput}
            />
          </View>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {CHANNEL_TABS.map(t => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key as any)}
                style={[styles.tab, tab === t.key && styles.tabActive]}
              >
                <Ionicons name={t.icon as any} size={14} color={tab === t.key ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
                {t.key === 'alerts' && (data?.totals.low_stock ?? 0) > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{data!.totals.low_stock}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* List */}
          {loading ? (
            <View style={{ padding: spacing.lg, gap: spacing.md }}>
              {[1, 2, 3].map(i => <SkeletonBox key={i} height={90} />)}
            </View>
          ) : filtered.length === 0 ? (
            <EmptyState icon="cube-outline" title="لا عناصر" description={tab === 'alerts' ? 'كل منتجاتك في وضع صحي 🎉' : 'أضف مخزوناً من صفحة الفروع'} />
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {filtered.map(item => (
                <View key={`${item.branch_id}-${item.product_id}`} style={styles.card}>
                  <View style={styles.cardHead}>
                    {item.product_image ? (
                      <Image source={{ uri: item.product_image }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Ionicons name="cube" size={22} color={colors.onSurfaceTertiary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName} numberOfLines={1}>{item.product_name}</Text>
                      <Text style={styles.branchName} numberOfLines={1}>
                        <Ionicons name="business" size={11} color={colors.onSurfaceTertiary} /> {item.branch_name}
                      </Text>
                      <View style={styles.modeRow}>
                        <View style={[styles.modePill, item.inventory_mode === 'separate' ? styles.modePillSep : styles.modePillCombined]}>
                          <Text style={styles.modePillText}>{item.inventory_mode === 'separate' ? 'مخازن مفصولة' : 'مخزن موحّد'}</Text>
                        </View>
                        {item.is_out && <Badge label="نفدت" tone="error" />}
                        {!item.is_out && item.is_low && <Badge label="منخفض" tone="warning" />}
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setEditing(item)} style={styles.editBtn}>
                      <Ionicons name="create-outline" size={18} color={colors.brand} />
                    </TouchableOpacity>
                  </View>

                  {/* Stock rows */}
                  {item.inventory_mode === 'separate' ? (
                    <>
                      <StockRow
                        label="مخزون المتجر (POS)"
                        icon="storefront"
                        value={item.stock_store}
                        threshold={item.min_alert}
                        onMinus={() => quickAdjust(item, 'store', -1)}
                        onPlus={() => quickAdjust(item, 'store', 1)}
                      />
                      <StockRow
                        label="مخزون التطبيق"
                        icon="phone-portrait"
                        value={item.stock_app}
                        threshold={item.min_alert}
                        onMinus={() => quickAdjust(item, 'app', -1)}
                        onPlus={() => quickAdjust(item, 'app', 1)}
                      />
                    </>
                  ) : (
                    <StockRow
                      label="المخزون الموحّد"
                      icon="cube"
                      value={item.quantity}
                      threshold={item.min_alert}
                      onMinus={() => quickAdjust(item, 'combined', -1)}
                      onPlus={() => quickAdjust(item, 'combined', 1)}
                    />
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
          apiCall={apiCall}
        />
      )}
    </View>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: 'brand' | 'info' | 'success' | 'warning' | 'error' }) {
  const toneColors: Record<string, { bg: string; fg: string }> = {
    brand: { bg: colors.brandTertiary, fg: colors.brand },
    info: { bg: colors.infoSoft, fg: colors.info },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    error: { bg: colors.errorSoft, fg: colors.error },
  };
  const t = toneColors[tone];
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon as any} size={18} color={t.fg} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StockRow({ label, icon, value, threshold, onMinus, onPlus }: any) {
  const low = value <= threshold;
  const out = value === 0;
  return (
    <View style={styles.stockRow}>
      <View style={styles.stockLabel}>
        <Ionicons name={icon} size={14} color={colors.onSurfaceSecondary} />
        <Text style={styles.stockLabelText}>{label}</Text>
      </View>
      <View style={styles.stockControls}>
        <TouchableOpacity onPress={onMinus} style={styles.stockBtn}>
          <Ionicons name="remove" size={16} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.stockValue, out && { color: colors.error }, !out && low && { color: colors.warning }]}>{value}</Text>
        <TouchableOpacity onPress={onPlus} style={styles.stockBtn}>
          <Ionicons name="add" size={16} color={colors.onSurface} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EditModal({ item, onClose, onSaved, apiCall }: { item: Item; onClose: () => void; onSaved: () => void; apiCall: any }) {
  const [mode, setMode] = useState<'combined' | 'separate'>(item.inventory_mode);
  const [store, setStore] = useState(String(item.stock_store));
  const [apps, setApps] = useState(String(item.stock_app));
  const [combined, setCombined] = useState(String(item.quantity));
  const [minAlert, setMinAlert] = useState(String(item.min_alert));
  const [type, setType] = useState<'store' | 'app' | 'both'>(item.inventory_type);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body: any = {
        inventory_mode: mode,
        min_alert: parseInt(minAlert || '0', 10) || 0,
        inventory_type: type,
      };
      if (mode === 'separate') {
        body.stock_store = parseInt(store || '0', 10) || 0;
        body.stock_app = parseInt(apps || '0', 10) || 0;
      } else {
        body.quantity = parseInt(combined || '0', 10) || 0;
      }
      await apiCall(`/api/merchant/branches/${item.branch_id}/inventory/${item.product_id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (e: any) {
      Alert.alert('خطأ', e.message || 'فشل الحفظ');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>تعديل المخزون</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.onSurfaceSecondary} /></TouchableOpacity>
          </View>
          <Text style={styles.modalProduct}>{item.product_name}</Text>
          <Text style={styles.modalBranch}>{item.branch_name}</Text>

          {/* Mode toggle */}
          <Text style={styles.fieldLabel}>نمط المخزون</Text>
          <View style={styles.segment}>
            <TouchableOpacity onPress={() => setMode('combined')} style={[styles.segmentBtn, mode === 'combined' && styles.segmentBtnActive]}>
              <Text style={[styles.segmentText, mode === 'combined' && styles.segmentTextActive]}>موحّد</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('separate')} style={[styles.segmentBtn, mode === 'separate' && styles.segmentBtnActive]}>
              <Text style={[styles.segmentText, mode === 'separate' && styles.segmentTextActive]}>مفصول</Text>
            </TouchableOpacity>
          </View>

          {mode === 'combined' ? (
            <>
              <Text style={styles.fieldLabel}>الكمية</Text>
              <TextInput value={combined} onChangeText={setCombined} keyboardType="number-pad" style={styles.input} placeholderTextColor={colors.onSurfaceTertiary} />
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>مخزون المتجر (POS)</Text>
              <TextInput value={store} onChangeText={setStore} keyboardType="number-pad" style={styles.input} placeholderTextColor={colors.onSurfaceTertiary} />
              <Text style={styles.fieldLabel}>مخزون التطبيق</Text>
              <TextInput value={apps} onChangeText={setApps} keyboardType="number-pad" style={styles.input} placeholderTextColor={colors.onSurfaceTertiary} />
            </>
          )}

          <Text style={styles.fieldLabel}>حد التنبيه</Text>
          <TextInput value={minAlert} onChangeText={setMinAlert} keyboardType="number-pad" style={styles.input} placeholderTextColor={colors.onSurfaceTertiary} />

          <Text style={styles.fieldLabel}>قناة البيع</Text>
          <View style={styles.segment}>
            {(['store', 'app', 'both'] as const).map(t => (
              <TouchableOpacity key={t} onPress={() => setType(t)} style={[styles.segmentBtn, type === t && styles.segmentBtnActive]}>
                <Text style={[styles.segmentText, type === t && styles.segmentTextActive]}>{t === 'store' ? 'متجر' : t === 'app' ? 'تطبيق' : 'الاثنين'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <PrimaryButton label={saving ? 'يحفظ…' : 'حفظ التغييرات'} onPress={save} disabled={saving} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  iconBtn: { padding: spacing.sm, borderRadius: radius.md },
  headerTitle: { ...typography.titleLarge, color: colors.onSurface },
  statsRow: {
    flexDirection: 'row', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg,
  },
  statCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    alignItems: 'center',
  },
  statIcon: {
    width: 34, height: 34, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statValue: { ...typography.titleMedium, color: colors.onSurface },
  statLabel: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  searchInput: { flex: 1, color: colors.onSurface, ...typography.bodyMedium, textAlign: 'right' },
  tabsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, flexDirection: 'row' },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabLabel: { ...typography.labelMedium, color: colors.onSurfaceSecondary },
  tabLabelActive: { color: colors.onBrandPrimary },
  tabBadge: {
    backgroundColor: colors.error, borderRadius: radius.pill,
    paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2,
  },
  tabBadgeText: { color: '#fff', ...typography.labelSmall, fontSize: 10 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderSubtle,
    padding: spacing.md, gap: spacing.sm,
  },
  cardHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  thumb: { width: 56, height: 56, borderRadius: radius.md },
  thumbPlaceholder: { backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  productName: { ...typography.titleSmall, color: colors.onSurface, textAlign: 'right' },
  branchName: { ...typography.caption, color: colors.onSurfaceTertiary, marginTop: 2, textAlign: 'right' },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  modePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  modePillCombined: { backgroundColor: colors.brandTertiary },
  modePillSep: { backgroundColor: colors.infoSoft },
  modePillText: { ...typography.labelSmall, color: colors.onSurface, fontSize: 10 },
  editBtn: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  stockRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
  },
  stockLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockLabelText: { ...typography.bodySmall, color: colors.onSurfaceSecondary },
  stockControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stockBtn: {
    width: 28, height: 28, borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  stockValue: { ...typography.titleMedium, color: colors.onSurface, minWidth: 30, textAlign: 'center' },
  modalRoot: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, gap: spacing.sm,
    maxHeight: '90%',
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { ...typography.titleLarge, color: colors.onSurface },
  modalProduct: { ...typography.titleSmall, color: colors.brand, marginTop: spacing.xs },
  modalBranch: { ...typography.caption, color: colors.onSurfaceTertiary, marginBottom: spacing.md },
  fieldLabel: { ...typography.labelMedium, color: colors.onSurfaceSecondary, marginTop: spacing.md, textAlign: 'right' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.onSurface, ...typography.bodyMedium,
    backgroundColor: colors.surfaceTertiary, textAlign: 'right', marginTop: 6,
  },
  segment: {
    flexDirection: 'row', backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md, padding: 4, marginTop: 6,
  },
  segmentBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.labelMedium, color: colors.onSurfaceSecondary },
  segmentTextActive: { color: colors.onBrandPrimary },
});
