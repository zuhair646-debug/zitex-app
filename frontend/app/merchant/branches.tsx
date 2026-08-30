import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, RefreshControl, Switch, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography, shadows } from '../../src/theme/tokens';
import { PrimaryButton, SecondaryButton, EmptyState, SkeletonBox, Badge, ScreenHeader, StatCard, Chip } from '../../src/components/ui';

interface Branch {
  id: string; name: string; address: string; city?: string; district?: string;
  phone?: string; email?: string; branch_code?: string;
  lat: number; lng: number; open_hours?: string; published: boolean;
  is_main?: boolean; working_days?: string[]; manager_id?: string;
}

const DAYS = [
  { key: 'sat', label: 'السبت' }, { key: 'sun', label: 'الأحد' }, { key: 'mon', label: 'الاثنين' },
  { key: 'tue', label: 'الثلاثاء' }, { key: 'wed', label: 'الأربعاء' }, { key: 'thu', label: 'الخميس' }, { key: 'fri', label: 'الجمعة' },
];

export default function MerchantBranches() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const [statsCache, setStatsCache] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/api/merchant/branches');
      const list = Array.isArray(d) ? d : [];
      setBranches(list);
      // Load stats for each in parallel
      const stats: any = {};
      await Promise.all(list.map(async (b: Branch) => {
        try { stats[b.id] = await apiCall(`/api/merchant/branches/${b.id}/stats`); } catch {}
      }));
      setStatsCache(stats);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setEditing({
    name: '', address: '', city: '', district: '', phone: '', email: '',
    lat: 24.7136, lng: 46.6753, open_hours: '9:00 AM - 11:00 PM',
    published: true, is_main: branches.length === 0, working_days: ['sat','sun','mon','tue','wed','thu'],
  });

  const openEdit = (b: Branch) => setEditing(b);

  const save = async () => {
    if (!editing?.name?.trim() || !editing?.address?.trim()) {
      Alert.alert('نقص', 'اسم الفرع والعنوان مطلوبان'); return;
    }
    const payload = {
      name: editing.name, address: editing.address, city: editing.city || '',
      district: editing.district || '', phone: editing.phone || '', email: editing.email || '',
      lat: editing.lat ?? 24.7136, lng: editing.lng ?? 46.6753,
      open_hours: editing.open_hours || '9:00 AM - 11:00 PM',
      published: editing.published !== false, is_main: !!editing.is_main,
      working_days: editing.working_days || ['sat','sun','mon','tue','wed','thu'],
      branch_code: editing.branch_code || '',
      manager_id: editing.manager_id || '',
    };
    try {
      if (editing.id) await apiCall(`/api/merchant/branches/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiCall('/api/merchant/branches', { method: 'POST', body: JSON.stringify(payload) });
      setEditing(null); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const remove = (b: Branch) => Alert.alert('حذف الفرع', `حذف "${b.name}"؟`, [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: async () => {
      try { await apiCall(`/api/merchant/branches/${b.id}`, { method: 'DELETE' }); load(); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
    }},
  ]);

  const totalRevenue = Object.values(statsCache).reduce((a: number, s: any) => a + (s?.revenue_month || 0), 0);
  const totalPending = Object.values(statsCache).reduce((a: number, s: any) => a + (s?.pending_orders || 0), 0);
  const totalEmp = Object.values(statsCache).reduce((a: number, s: any) => a + (s?.employees || 0), 0);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title="الفروع" onBack={() => router.back()} rightIcon="add" onRight={openNew} subtitle={`${branches.length} فرع`} />

        {/* Summary stats */}
        <View style={s.summaryRow}>
          <StatCard icon="business" label="الفروع" value={branches.length} tone="gold" />
          <StatCard icon="cash" label="مبيعات الشهر" value={new Intl.NumberFormat('en').format(totalRevenue)} tone="success" />
        </View>
        <View style={s.summaryRow}>
          <StatCard icon="receipt" label="طلبات معلقة" value={totalPending} tone={totalPending > 0 ? 'warning' : 'default'} />
          <StatCard icon="people-circle" label="موظفون" value={totalEmp} tone="info" />
        </View>

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <SkeletonBox height={140} /><SkeletonBox height={140} />
          </View>
        ) : branches.length === 0 ? (
          <EmptyState
            icon="business-outline"
            title="لا توجد فروع بعد"
            description="أضف أول فرع لبدء إدارة عملياتك متعددة المواقع"
            actionLabel="إضافة فرع" onAction={openNew}
          />
        ) : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            {branches.map(b => {
              const st = statsCache[b.id] || {};
              return (
                <View key={b.id} style={s.card}>
                  <View style={s.cardTop}>
                    <View style={s.cardIcon}>
                      <Ionicons name={b.is_main ? 'star' : 'business'} size={22} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={s.cardName}>{b.name}</Text>
                        {b.is_main && <Badge label="الرئيسي" tone="gold" />}
                        {!!b.branch_code && <Badge label={b.branch_code} tone="info" />}
                        {!b.published && <Badge label="مغلق" tone="error" />}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="location" size={11} color={colors.onSurfaceSecondary} />
                        <Text style={s.cardAddress} numberOfLines={2}>
                          {b.address}{b.city ? ` • ${b.city}` : ''}
                        </Text>
                      </View>
                      {b.phone && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="call" size={11} color={colors.onSurfaceSecondary} />
                          <Text style={s.cardMeta}>
                            {b.phone}{b.open_hours ? `  •  ${b.open_hours}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={s.statsRow}>
                    <View style={s.miniStat}>
                      <Text style={s.miniLabel}>الموظفون</Text>
                      <Text style={s.miniValue}>{st.employees ?? '—'}</Text>
                    </View>
                    <View style={s.divider} />
                    <View style={s.miniStat}>
                      <Text style={s.miniLabel}>الطلبات</Text>
                      <Text style={s.miniValue}>{st.total_orders ?? '—'}</Text>
                    </View>
                    <View style={s.divider} />
                    <View style={s.miniStat}>
                      <Text style={s.miniLabel}>معلق</Text>
                      <Text style={[s.miniValue, { color: st.pending_orders > 0 ? colors.warning : colors.onSurface }]}>{st.pending_orders ?? '—'}</Text>
                    </View>
                    <View style={s.divider} />
                    <View style={s.miniStat}>
                      <Text style={s.miniLabel}>مبيعات الشهر</Text>
                      <Text style={[s.miniValue, { color: colors.brand }]}>{st.revenue_month != null ? new Intl.NumberFormat('en').format(st.revenue_month) : '—'}</Text>
                    </View>
                  </View>

                  <View style={s.actions}>
                    <SecondaryButton size="sm" label="تعديل" icon="create" onPress={() => openEdit(b)} />
                    <TouchableOpacity onPress={() => remove(b)} style={s.trashBtn}>
                      <Ionicons name="trash" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Edit Modal */}
      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <ScreenHeader
              title={editing?.id ? 'تعديل فرع' : 'فرع جديد'}
              onBack={() => setEditing(null)}
              rightIcon="checkmark" onRight={save}
            />
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}>
              <Field label="اسم الفرع *" value={editing?.name || ''} onChange={v => setEditing({ ...editing, name: v })} placeholder="مثال: فرع الرياض - العليا" />
              <Field label="الرمز الداخلي" value={editing?.branch_code || ''} onChange={v => setEditing({ ...editing, branch_code: v })} placeholder="تلقائي: BR-001" />
              <Field label="العنوان *" value={editing?.address || ''} onChange={v => setEditing({ ...editing, address: v })} placeholder="شارع، حي، مبنى" multiline />
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}><Field label="المدينة" value={editing?.city || ''} onChange={v => setEditing({ ...editing, city: v })} placeholder="الرياض" /></View>
                <View style={{ flex: 1 }}><Field label="الحي" value={editing?.district || ''} onChange={v => setEditing({ ...editing, district: v })} placeholder="العليا" /></View>
              </View>
              <Field label="رقم الهاتف" value={editing?.phone || ''} onChange={v => setEditing({ ...editing, phone: v })} placeholder="+966 5X XXX XXXX" keyboardType="phone-pad" />
              <Field label="البريد الإلكتروني" value={editing?.email || ''} onChange={v => setEditing({ ...editing, email: v })} placeholder="branch@zitex.sa" keyboardType="email-address" />
              <Field label="ساعات العمل" value={editing?.open_hours || ''} onChange={v => setEditing({ ...editing, open_hours: v })} placeholder="9:00 AM - 11:00 PM" />

              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}><Field label="خط العرض (Lat)" value={String(editing?.lat ?? '')} onChange={v => setEditing({ ...editing, lat: parseFloat(v) || 0 })} keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}><Field label="خط الطول (Lng)" value={String(editing?.lng ?? '')} onChange={v => setEditing({ ...editing, lng: parseFloat(v) || 0 })} keyboardType="numeric" /></View>
              </View>

              <View>
                <Text style={s.fieldLabel}>أيام العمل</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
                  {DAYS.map(d => {
                    const active = (editing?.working_days || []).includes(d.key);
                    return (
                      <Chip key={d.key} label={d.label} active={active} onPress={() => {
                        const cur = editing?.working_days || [];
                        setEditing({ ...editing, working_days: active ? cur.filter(x => x !== d.key) : [...cur, d.key] });
                      }} />
                    );
                  })}
                </View>
              </View>

              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>الفرع الرئيسي</Text>
                  <Text style={s.switchHint}>مقر الشركة الأساسي</Text>
                </View>
                <Switch value={!!editing?.is_main} onValueChange={v => setEditing({ ...editing, is_main: v })}
                  trackColor={{ false: colors.surfaceTertiary, true: colors.brand }} thumbColor={colors.onBrandPrimary} />
              </View>

              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchLabel}>مفعّل / مرئي للعملاء</Text>
                  <Text style={s.switchHint}>عند إيقافه لا يظهر للعملاء</Text>
                </View>
                <Switch value={editing?.published !== false} onValueChange={v => setEditing({ ...editing, published: v })}
                  trackColor={{ false: colors.surfaceTertiary, true: colors.brand }} thumbColor={colors.onBrandPrimary} />
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <PrimaryButton label={editing?.id ? 'حفظ التغييرات' : 'إنشاء الفرع'} onPress={save} icon="checkmark-circle" />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType }: any) {
  return (
    <View>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceTertiary}
        multiline={multiline} keyboardType={keyboardType}
        style={[s.input, multiline && { minHeight: 68, textAlignVertical: 'top', paddingTop: 12 }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  summaryRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardIcon: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  cardName: { ...typography.titleMedium, color: colors.onSurface },
  cardAddress: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 4, lineHeight: 18 },
  cardMeta: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm,
  },
  miniStat: { flex: 1, alignItems: 'center' },
  miniLabel: { fontSize: 10, color: colors.onSurfaceSecondary, fontWeight: '600' },
  miniValue: { ...typography.labelLarge, color: colors.onSurface, marginTop: 2 },
  divider: { width: 1, height: 28, backgroundColor: colors.border },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  trashBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.errorSoft, alignItems: 'center', justifyContent: 'center',
  },

  fieldLabel: { ...typography.labelMedium, color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.onSurface, fontSize: 15,
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  switchLabel: { ...typography.bodyLarge, color: colors.onSurface, fontWeight: '600' },
  switchHint: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
});
