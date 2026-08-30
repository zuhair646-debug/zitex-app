import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ScreenHeader, StatCard, EmptyState, SkeletonBox, Badge, PrimaryButton } from '../../src/components/ui';

export default function MerchantTeam() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/team/overview'); setTeam(Array.isArray(d) ? d : []); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000); // Auto-refresh every 30s
    return () => clearInterval(iv);
  }, [load]);

  const online = team.filter(e => e.online).length;
  const totalHoursToday = Math.round(team.reduce((a, e) => a + (e.total_today_minutes || 0), 0) / 60 * 10) / 10;

  const fmtMin = (m: number) => {
    if (!m) return '—';
    const h = Math.floor(m / 60); const mm = m % 60;
    return h > 0 ? `${h}س ${mm}د` : `${mm}د`;
  };

  const timeSince = (iso: string) => {
    if (!iso) return '—';
    try {
      const diff = (Date.now() - new Date(iso).getTime()) / 60000;
      if (diff < 1) return 'الآن';
      if (diff < 60) return `منذ ${Math.round(diff)} د`;
      if (diff < 1440) return `منذ ${Math.round(diff / 60)} س`;
      return `منذ ${Math.round(diff / 1440)} يوم`;
    } catch { return '—'; }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title="الفريق" onBack={() => router.back()} rightIcon="refresh" onRight={load} subtitle={`${online} متصل الآن • ${team.length} موظف`} />

        <View style={s.summaryRow}>
          <StatCard icon="radio-button-on" label="متصل الآن" value={online} tone={online > 0 ? 'success' : 'default'} />
          <StatCard icon="time" label="ساعات اليوم" value={`${totalHoursToday}`} tone="gold" />
        </View>

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <SkeletonBox height={110} /><SkeletonBox height={110} /><SkeletonBox height={110} />
          </View>
        ) : team.length === 0 ? (
          <EmptyState icon="people-outline" title="لا يوجد موظفون" description="أضف موظفين لبدء مراقبة الفريق"
            actionLabel="إضافة موظف" onAction={() => router.push('/merchant/employees')} />
        ) : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
          >
            {team.map(e => (
              <View key={e.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={[s.avatar, e.online && { backgroundColor: colors.success + '33' }]}>
                    <Text style={[s.avatarText, e.online && { color: colors.success }]}>{(e.name || 'M').slice(0, 1).toUpperCase()}</Text>
                    {e.online && <View style={s.onlineDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={s.name}>{e.name}</Text>
                      {e.online ? <Badge label="🟢 متصل" tone="success" /> : <Badge label="غير متصل" tone="default" />}
                    </View>
                    <Text style={s.meta}>{e.job_title || e.department || 'موظف'} • {e.phone}</Text>
                  </View>
                </View>

                <View style={s.statsRow}>
                  {e.online && (
                    <View style={s.miniStat}>
                      <Text style={s.miniLbl}>الجلسة الحالية</Text>
                      <Text style={[s.miniVal, { color: colors.success }]}>{fmtMin(e.current_session_minutes)}</Text>
                    </View>
                  )}
                  <View style={s.miniStat}>
                    <Text style={s.miniLbl}>مجموع اليوم</Text>
                    <Text style={s.miniVal}>{fmtMin(e.total_today_minutes)}</Text>
                  </View>
                  <View style={s.miniStat}>
                    <Text style={s.miniLbl}>آخر نشاط</Text>
                    <Text style={s.miniVal} numberOfLines={1}>{e.last_action || '—'}</Text>
                    <Text style={s.miniHint}>{timeSince(e.last_action_at)}</Text>
                  </View>
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
  summaryRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  avatarText: { fontSize: 20, fontWeight: '900', color: colors.onSurface },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surfaceSecondary },
  name: { ...typography.titleMedium, color: colors.onSurface },
  meta: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm },
  miniStat: { flex: 1, alignItems: 'center' },
  miniLbl: { fontSize: 10, color: colors.onSurfaceSecondary, fontWeight: '600' },
  miniVal: { ...typography.labelLarge, color: colors.onSurface, marginTop: 2 },
  miniHint: { fontSize: 9, color: colors.onSurfaceTertiary, marginTop: 1 },
});
