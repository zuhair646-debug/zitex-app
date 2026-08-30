import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ScreenHeader, PrimaryButton, EmptyState, SkeletonBox, Badge, Chip } from '../../src/components/ui';

const PERMS: { key: string; label: string; group: string }[] = [
  { key: 'all', label: 'كل الصلاحيات (Admin)', group: 'شامل' },
  { key: 'products', label: 'المنتجات', group: 'المخزون والمنتجات' },
  { key: 'inventory', label: 'المخزون', group: 'المخزون والمنتجات' },
  { key: 'orders', label: 'الطلبات', group: 'المبيعات' },
  { key: 'pos', label: 'نقاط البيع POS', group: 'المبيعات' },
  { key: 'invoices', label: 'الفواتير', group: 'المبيعات' },
  { key: 'social', label: 'السوشال ميديا', group: 'التسويق' },
  { key: 'competitions', label: 'المسابقات', group: 'التسويق' },
  { key: 'banners', label: 'البانرات', group: 'التسويق' },
  { key: 'services', label: 'الخدمات', group: 'العمليات' },
  { key: 'branches', label: 'الفروع', group: 'العمليات' },
  { key: 'drivers', label: 'السائقون', group: 'العمليات' },
  { key: 'delivery', label: 'التوصيل', group: 'العمليات' },
  { key: 'customers', label: 'العملاء', group: 'الإدارة' },
  { key: 'settings', label: 'الإعدادات', group: 'الإدارة' },
  { key: 'support', label: 'الدعم الفني', group: 'الإدارة' },
  { key: 'tasks', label: 'المهام', group: 'الإدارة' },
  { key: 'tickets_reply', label: 'الرد على التذاكر', group: 'الإدارة' },
  { key: 'roles_manage', label: 'إدارة الأدوار', group: 'الإدارة' },
];
const GROUPS = ['شامل', 'المخزون والمنتجات', 'المبيعات', 'التسويق', 'العمليات', 'الإدارة'];

export default function MerchantRoles() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/roles'); setRoles(Array.isArray(d) ? d : []); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => setEditing({ name: '', description: '', permissions: [], color: '#D4AF37' });
  const openEdit = (r: any) => { if (r.is_preset) { Alert.alert('دور جاهز', 'الأدوار الجاهزة لا يمكن تعديلها. أنشئ دوراً مخصصاً بدلاً منها.'); return; } setEditing(r); };
  const togglePerm = (k: string) => setEditing((e: any) => ({ ...e, permissions: e.permissions.includes(k) ? e.permissions.filter((x: string) => x !== k) : [...e.permissions, k] }));

  const save = async () => {
    if (!editing.name?.trim()) { Alert.alert('نقص', 'اسم الدور مطلوب'); return; }
    if (editing.permissions.length === 0) { Alert.alert('نقص', 'اختر صلاحية واحدة على الأقل'); return; }
    try {
      const payload = { name: editing.name, description: editing.description || '', permissions: editing.permissions, color: editing.color || '#D4AF37' };
      if (editing.id && !editing.is_preset) await apiCall(`/api/merchant/roles/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiCall('/api/merchant/roles', { method: 'POST', body: JSON.stringify(payload) });
      setEditing(null); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const remove = (r: any) => {
    if (r.is_preset) return;
    Alert.alert('حذف الدور', `حذف "${r.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await apiCall(`/api/merchant/roles/${r.id}`, { method: 'DELETE' }); load(); }
        catch (e: any) { Alert.alert('خطأ', e.message); }
      }}
    ]);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title="الأدوار والصلاحيات" onBack={() => router.back()} rightIcon="add" onRight={openNew} subtitle={`${roles.length} دور`} />

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <SkeletonBox height={100} /><SkeletonBox height={100} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}>
            <View style={s.info}>
              <Ionicons name="information-circle" size={16} color={colors.brand} />
              <Text style={s.infoText}>الأدوار الجاهزة (5) قابلة للاستخدام مباشرة. أنشئ أدواراً مخصصة حسب احتياجك.</Text>
            </View>
            {roles.map(r => (
              <TouchableOpacity key={r.id} style={s.card} activeOpacity={0.8} onPress={() => openEdit(r)}>
                <View style={s.cardTop}>
                  <View style={[s.dot, { backgroundColor: r.color || colors.brand }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={s.name}>{r.name}</Text>
                      {r.is_preset && <Badge label="جاهز" tone="info" />}
                    </View>
                    {!!r.description && <Text style={s.desc} numberOfLines={2}>{r.description}</Text>}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {r.permissions.slice(0, 4).map((p: string) => (
                        <Badge key={p} label={PERMS.find(x => x.key === p)?.label || p} tone="default" />
                      ))}
                      {r.permissions.length > 4 && <Badge label={`+${r.permissions.length - 4}`} tone="gold" />}
                    </View>
                  </View>
                  {!r.is_preset && (
                    <TouchableOpacity onPress={() => remove(r)} style={s.trashBtn}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <ScreenHeader title={editing?.id ? 'تعديل دور' : 'دور مخصص جديد'} onBack={() => setEditing(null)} rightIcon="checkmark" onRight={save} />
            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}>
              <Text style={s.lbl}>اسم الدور *</Text>
              <TextInput style={s.input} value={editing?.name || ''} onChangeText={t => setEditing({ ...editing, name: t })} placeholder="مثال: مسؤول تسويق متقدم" placeholderTextColor={colors.onSurfaceTertiary} />
              <Text style={s.lbl}>الوصف</Text>
              <TextInput style={s.input} value={editing?.description || ''} onChangeText={t => setEditing({ ...editing, description: t })} placeholder="مسؤول عن السوشال والحملات" placeholderTextColor={colors.onSurfaceTertiary} />

              <Text style={s.section}>🔐 الصلاحيات ({editing?.permissions?.length || 0})</Text>
              {GROUPS.map(g => (
                <View key={g}>
                  <Text style={s.groupLbl}>{g}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {PERMS.filter(p => p.group === g).map(p => (
                      <Chip key={p.key} label={p.label} active={editing?.permissions?.includes(p.key)} onPress={() => togglePerm(p.key)} />
                    ))}
                  </View>
                </View>
              ))}

              <View style={{ marginTop: spacing.lg }}>
                <PrimaryButton label="حفظ الدور" onPress={save} icon="checkmark-circle" />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  info: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandTertiaryStrong },
  infoText: { flex: 1, color: colors.onSurface, ...typography.caption, lineHeight: 18 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  name: { ...typography.titleMedium, color: colors.onSurface },
  desc: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 4, lineHeight: 18 },
  trashBtn: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.errorSoft, alignItems: 'center', justifyContent: 'center' },
  lbl: { ...typography.labelMedium, color: colors.onSurfaceSecondary },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.onSurface, fontSize: 15 },
  section: { ...typography.titleSmall, color: colors.onSurface, marginTop: spacing.md },
  groupLbl: { ...typography.labelSmall, color: colors.brand, marginTop: spacing.sm, marginBottom: 6 },
});
