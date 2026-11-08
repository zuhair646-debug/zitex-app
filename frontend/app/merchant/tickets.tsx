import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { colors } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { useT } from '../../src/i18n';
import { tSync } from '../../src/useAutoT';
import { ScreenHeader } from '../../src/components/ui';
import { KanbanBoard, PRIORITY_COLOR } from '../../src/components/staff/Kanban';
import { TicketThread, TICKET_STATUS, PRIORITY_LABEL, CATEGORY_LABEL } from '../../src/components/staff/TicketThread';

export default function MerchantTickets() {
  const s = useS();
  const router = useRouter();
  const { apiCall } = useAuth();
  const { lang } = useT();
  const [data, setData] = useState<any>(null);
  const [mine, setMine] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiCall(`/api/merchant/tickets${mine ? '?mine=true' : ''}`)); } catch (e: any) { setData({ tickets: [], error: e.message }); }
  }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const move = async (t: any, dir: 1 | -1) => {
    const keys = Object.keys(TICKET_STATUS);
    const next = keys[keys.indexOf(t.status) + dir];
    if (!next) return;
    setData((d: any) => ({ ...d, tickets: d.tickets.map((x: any) => x.id === t.id ? { ...x, status: next } : x) }));
    try { await apiCall(`/api/merchant/tickets/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) }); } catch { load(); }
  };

  const columns = Object.entries(TICKET_STATUS).map(([key, v]) => ({ key, label: tSync(v.label, lang), color: v.color }));
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={tSync('تذاكر الدعم', lang)} onBack={() => router.back()} rightIcon="refresh" onRight={load} />
      {!data?.error && <View style={s.toggleRow}>
        {[[false, 'كل التذاكر'], [true, 'المسندة إليّ']].map(([v, l]) => (
          <TouchableOpacity key={String(v)} testID={`tickets-filter-${v ? 'mine' : 'all'}`} style={[s.toggle, mine === v && s.toggleOn]} onPress={() => setMine(v as boolean)}>
            <Text style={[s.toggleTxt, mine === v && { color: colors.onBrandPrimary }]}>{tSync(l as string, lang)}</Text>
          </TouchableOpacity>
        ))}
      </View>}
      {!data ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        : data.error ? <Text style={s.err}>{data.error}</Text> : (
        <KanbanBoard columns={columns} items={data.tickets} emptyLabel={tSync('لا توجد تذاكر', lang)} renderCard={(t: any) => (
          <TouchableOpacity key={t.id} testID={`ticket-card-${t.id}`} style={s.card} onPress={() => setOpenId(t.id)} activeOpacity={0.85}>
            <View style={[s.prio, { backgroundColor: PRIORITY_COLOR[t.priority] || '#3B82F6' }]} />
            <Text style={s.subject} numberOfLines={2}>{t.subject}</Text>
            <View style={s.metaRow}>
              <Text style={s.meta}>{t.category === 'job' ? '💼 ' : ''}{tSync(CATEGORY_LABEL[t.category] || 'عام', lang)}</Text>
              <Text style={[s.meta, { color: PRIORITY_COLOR[t.priority] }]}>{tSync(PRIORITY_LABEL[t.priority] || 'أولوية عادية', lang)}</Text>
              {(t.attachments?.length > 0) && <Ionicons name="attach" size={14} color={colors.onSurfaceTertiary} />}
            </View>
            <Text style={s.who} numberOfLines={1}>👤 {t.user_name || '—'}   {t.assignee_name ? `🎧 ${t.assignee_name}` : tSync('لم تُسند لموظف بعد', lang)}</Text>
            <View style={s.moveRow}>
              <TouchableOpacity testID={`ticket-prev-${t.id}`} style={s.moveBtn} onPress={() => move(t, -1)} hitSlop={6}><Ionicons name="chevron-back" size={18} color={colors.onSurfaceSecondary} /></TouchableOpacity>
              <Text style={s.replies}>💬 {t.replies?.length ? tSync('آخر رد', lang) + ': ' + (t.replies[0]?.user_name || '') : tSync('بدون رد', lang)}</Text>
              <TouchableOpacity testID={`ticket-next-${t.id}`} style={s.moveBtn} onPress={() => move(t, 1)} hitSlop={6}><Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} /></TouchableOpacity>
            </View>
          </TouchableOpacity>
        )} />
      )}
      <TicketThread staff ticketId={openId} apiCall={apiCall} onClose={() => setOpenId(null)} onChanged={load} />
    </SafeAreaView>
  );
}

function useS() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
    toggle: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    toggleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    toggleTxt: { fontSize: 13, fontWeight: '800', color: colors.onSurfaceSecondary },
    err: { textAlign: 'center', color: colors.error, marginTop: 40, paddingHorizontal: 24 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, paddingStart: 16, borderWidth: 1, borderColor: colors.border, gap: 6, overflow: 'hidden' },
    prio: { position: 'absolute', top: 0, bottom: 0, start: 0, width: 4 },
    subject: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    meta: { fontSize: 11, fontWeight: '700', color: colors.onSurfaceSecondary },
    who: { fontSize: 11, color: colors.onSurfaceTertiary },
    moveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    moveBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    replies: { flex: 1, textAlign: 'center', fontSize: 10, color: colors.onSurfaceTertiary },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
