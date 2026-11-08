import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { colors } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { useT } from '../../src/i18n';
import { tSync } from '../../src/useAutoT';
import { notify } from '../../src/utils/notify';
import { ScreenHeader, PrimaryButton } from '../../src/components/ui';
import { KanbanBoard, PRIORITY_COLOR } from '../../src/components/staff/Kanban';
import { PRIORITY_LABEL } from '../../src/components/staff/TicketThread';

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  todo: { label: 'للتنفيذ', color: '#64748B' },
  doing: { label: 'قيد العمل', color: '#F59E0B' },
  review: { label: 'مراجعة', color: '#A855F7' },
  done: { label: 'مكتملة', color: '#10B981' },
};
const EMPTY = { title: '', description: '', assignee_id: '', priority: 'normal', due_date: '' };

export default function MerchantTasks() {
  const s = useS();
  const router = useRouter();
  const { apiCall } = useAuth();
  const { lang } = useT();
  const [data, setData] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setData(await apiCall('/api/merchant/tasks')); } catch (e: any) { setData({ tasks: [], error: e.message }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); apiCall('/api/merchant/staff-directory').then(setStaff).catch(() => {}); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = async (t: any, dir: 1 | -1) => {
    const keys = Object.keys(TASK_STATUS);
    const next = keys[keys.indexOf(t.status) + dir];
    if (!next) return;
    setData((d: any) => ({ ...d, tasks: d.tasks.map((x: any) => x.id === t.id ? { ...x, status: next } : x) }));
    try { await apiCall(`/api/merchant/tasks/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) }); } catch (e: any) { notify(tSync('خطأ', lang), e.message); load(); }
  };

  const save = async () => {
    if (form.title.trim().length < 2) { notify(tSync('اكتب عنوان المهمة', lang)); return; }
    setSaving(true);
    try {
      await apiCall('/api/merchant/tasks', { method: 'POST', body: JSON.stringify(form) });
      setFormOpen(false); setForm(EMPTY); load();
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); } finally { setSaving(false); }
  };

  const columns = Object.entries(TASK_STATUS).map(([key, v]) => ({ key, label: tSync(v.label, lang), color: v.color }));
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={tSync('لوحة المهام', lang)} subtitle={data && !data.can_manage ? tSync('مهامي فقط', lang) : undefined}
        onBack={() => router.back()} rightIcon={data?.can_manage ? 'add-circle' : 'refresh'} onRight={data?.can_manage ? () => setFormOpen(true) : load} />
      {!data ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        : data.error ? <Text style={s.err}>{data.error}</Text> : (
        <KanbanBoard columns={columns} items={data.tasks} emptyLabel={tSync('لا توجد مهام', lang)} renderCard={(t: any) => (
          <View key={t.id} style={s.card} testID={`task-card-${t.id}`}>
            <View style={[s.prio, { backgroundColor: PRIORITY_COLOR[t.priority] || '#3B82F6' }]} />
            <Text style={s.title} numberOfLines={2}>{t.title}</Text>
            {!!t.description && <Text style={s.desc} numberOfLines={2}>{t.description}</Text>}
            <View style={s.metaRow}>
              <Text style={[s.meta, { color: PRIORITY_COLOR[t.priority] }]}>{tSync(PRIORITY_LABEL[t.priority] || 'أولوية عادية', lang)}</Text>
              {!!t.due_date && <Text style={s.meta}>📅 {t.due_date}</Text>}
              {(t.tags || []).map((g: string) => <Text key={g} style={s.tag}>#{tSync(g, lang)}</Text>)}
            </View>
            <Text style={s.who} numberOfLines={1}>👤 {t.assignee_name || tSync('لم تُسند لموظف بعد', lang)}</Text>
            <View style={s.moveRow}>
              <TouchableOpacity testID={`task-prev-${t.id}`} style={s.moveBtn} onPress={() => move(t, -1)} hitSlop={6}><Ionicons name="chevron-back" size={18} color={colors.onSurfaceSecondary} /></TouchableOpacity>
              <Text style={s.hint}>{tSync('حرّك البطاقة', lang)}</Text>
              <TouchableOpacity testID={`task-next-${t.id}`} style={s.moveBtn} onPress={() => move(t, 1)} hitSlop={6}><Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} /></TouchableOpacity>
            </View>
          </View>
        )} />
      )}

      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetBg}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setFormOpen(false)} />
          <View style={s.sheet}>
            <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
              <Text style={s.sheetTitle}>{tSync('مهمة جديدة', lang)}</Text>
              <TextInput testID="task-title" style={s.input} value={form.title} onChangeText={v => setForm({ ...form, title: v })} placeholder={tSync('عنوان المهمة', lang)} placeholderTextColor={colors.onSurfaceTertiary} />
              <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={form.description} onChangeText={v => setForm({ ...form, description: v })} placeholder={tSync('التفاصيل (اختياري)', lang)} placeholderTextColor={colors.onSurfaceTertiary} />
              <TextInput style={s.input} value={form.due_date} onChangeText={v => setForm({ ...form, due_date: v })} placeholder="2026-12-31" placeholderTextColor={colors.onSurfaceTertiary} />
              <Text style={s.label}>{tSync('الأولوية', lang)}</Text>
              <View style={s.metaRow}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                  <TouchableOpacity key={k} style={[s.opt, form.priority === k && { backgroundColor: PRIORITY_COLOR[k], borderColor: PRIORITY_COLOR[k] }]} onPress={() => setForm({ ...form, priority: k })}>
                    <Text style={[s.optTxt, form.priority === k && { color: '#FFFFFF' }]}>{tSync(v, lang)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>{tSync('إسناد إلى', lang)}</Text>
              <View style={s.metaRow}>
                {staff.map(e => (
                  <TouchableOpacity key={e.id} testID={`task-assign-${e.id}`} style={[s.opt, form.assignee_id === e.id && { backgroundColor: colors.brand, borderColor: colors.brand }]} onPress={() => setForm({ ...form, assignee_id: e.id })}>
                    <Text style={[s.optTxt, form.assignee_id === e.id && { color: colors.onBrandPrimary }]}>{e.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <PrimaryButton testID="task-save" label={tSync('إضافة المهمة', lang)} onPress={save} loading={saving} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function useS() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    err: { textAlign: 'center', color: colors.error, marginTop: 40, paddingHorizontal: 24 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, paddingStart: 16, borderWidth: 1, borderColor: colors.border, gap: 6, overflow: 'hidden' },
    prio: { position: 'absolute', top: 0, bottom: 0, start: 0, width: 4 },
    title: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
    desc: { fontSize: 12, color: colors.onSurfaceSecondary },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    meta: { fontSize: 11, fontWeight: '700', color: colors.onSurfaceSecondary },
    tag: { fontSize: 10, fontWeight: '700', color: colors.brand },
    who: { fontSize: 11, color: colors.onSurfaceTertiary },
    moveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    moveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    hint: { fontSize: 10, color: colors.onSurfaceTertiary },
    sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { maxHeight: '85%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
    sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.onSurface, textAlign: 'center' },
    input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, color: colors.onSurface, fontSize: 14 },
    label: { fontSize: 12, fontWeight: '800', color: colors.onSurfaceSecondary },
    opt: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
    optTxt: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
