import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../app/_layout';
import { colors, spacing, radius, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { useT } from '../../i18n';
import { tSync } from '../../useAutoT';
import { SectionHeader, SkeletonBox } from '../ui';

const TONE: Record<string, string> = { warning: '#F59E0B', error: '#EF4444' };
const TASK_LABEL: Record<string, string> = { todo: 'للتنفيذ', doing: 'قيد العمل', review: 'مراجعة', done: 'مكتملة' };

/** Home screen for an employee: only the specialty widgets their permissions unlock. */
export default function StaffDashboard() {
  const s = useS();
  const router = useRouter();
  const { isDark } = useTheme();
  const { lang } = useT();
  const { apiCall, logout } = useAuth();
  const [d, setD] = useState<any>(null);
  const [att, setAtt] = useState<any>({ checked_in: false });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [dash, a] = await Promise.all([
      apiCall('/api/employee/dashboard').catch(() => null),
      apiCall('/api/employee/attendance-status').catch(() => ({ checked_in: false })),
    ]);
    setD(dash); setAtt(a || { checked_in: false }); setRefreshing(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const toggleAtt = async () => {
    try {
      await apiCall(att.checked_in ? '/api/employee/check-out' : '/api/employee/check-in', { method: 'POST' });
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.hello}>{tSync('مرحباً', lang)} 👋</Text>
              <Text style={s.name} numberOfLines={1}>{d?.name || '...'}</Text>
              <Text style={s.role} testID="staff-job-title">{tSync(d?.job_title || 'موظف', lang)}</Text>
            </View>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/notifications')}><Ionicons name="notifications-outline" size={22} color={colors.onSurface} /></TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={logout} testID="staff-logout"><Ionicons name="log-out-outline" size={22} color={colors.onSurface} /></TouchableOpacity>
          </View>

          <TouchableOpacity style={s.clock} onPress={toggleAtt} activeOpacity={0.85} testID="staff-attendance">
            <View style={[s.clockIcon, { backgroundColor: att.checked_in ? colors.successSoft : colors.brandTertiary }]}>
              <Ionicons name={att.checked_in ? 'stop-circle' : 'play-circle'} size={26} color={att.checked_in ? colors.success : colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{tSync(att.checked_in ? 'أنت في الدوام — اضغط للانصراف' : 'سجّل حضورك', lang)}</Text>
              <Text style={s.cardSub}>{tSync('الحضور يُحتسب في تقارير الفريق', lang)}</Text>
            </View>
          </TouchableOpacity>

          <SectionHeader title={tSync('مهامي', lang)} action={() => router.push('/merchant/tasks' as any)} actionLabel={tSync('فتح اللوحة', lang)} />
          <View style={s.taskRow}>
            {Object.entries(TASK_LABEL).map(([k, l]) => (
              <TouchableOpacity key={k} style={s.taskBox} onPress={() => router.push('/merchant/tasks' as any)} testID={`staff-tasks-${k}`}>
                <Text style={s.taskNum}>{d?.my_tasks?.[k] ?? '—'}</Text>
                <Text style={s.taskLbl} numberOfLines={1}>{tSync(l, lang)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <SectionHeader title={tSync('لوحة تخصصك', lang)} />
          {!d ? (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}><SkeletonBox height={120} /><SkeletonBox height={120} /></View>
          ) : d.widgets.length === 0 ? (
            <Text style={s.empty}>{tSync('لا توجد أقسام مفعّلة لك بعد — تواصل مع المدير', lang)}</Text>
          ) : d.widgets.map((w: any) => (
            <TouchableOpacity key={w.key} testID={`staff-widget-${w.key}`} style={s.widget} activeOpacity={0.88} onPress={() => router.push(w.route as any)}>
              <View style={s.wHead}>
                <View style={s.wIcon}><Ionicons name={w.icon} size={20} color={colors.brand} /></View>
                <Text style={s.wTitle}>{tSync(w.title, lang)}</Text>
                <Ionicons name="open-outline" size={18} color={colors.onSurfaceTertiary} />
              </View>
              <View style={s.statsRow}>
                {w.stats.map((st: any) => (
                  <View key={st.label} style={s.stat}>
                    <Text style={[s.statVal, st.tone && { color: TONE[st.tone] }]}>{st.value}</Text>
                    <Text style={s.statLbl} numberOfLines={2}>{tSync(st.label, lang)}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function useS() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    hello: { ...typography.bodyMedium, color: colors.onSurfaceSecondary },
    name: { ...typography.displaySmall, color: colors.onSurface, marginTop: 2 },
    role: { ...typography.caption, color: colors.brand, marginTop: 2, fontWeight: '800' as any },
    iconBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    clock: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
    clockIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { ...typography.titleSmall, color: colors.onSurface },
    cardSub: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
    taskRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    taskBox: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    taskNum: { fontSize: 22, fontWeight: '900', color: colors.onSurface },
    taskLbl: { fontSize: 11, color: colors.onSurfaceSecondary, fontWeight: '700' },
    empty: { textAlign: 'center', color: colors.onSurfaceTertiary, padding: spacing.lg },
    widget: { marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
    wHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    wIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
    wTitle: { flex: 1, ...typography.titleSmall, color: colors.onSurface },
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    stat: { flexGrow: 1, flexBasis: '45%', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
    statVal: { fontSize: 20, fontWeight: '900', color: colors.onSurface },
    statLbl: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
