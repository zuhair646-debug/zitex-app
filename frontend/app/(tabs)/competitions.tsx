/** Customer Competitions section — copy #2 of every competition (copy #1 is the social feed post).
 *  Tabs: Current (open + drawn-awaiting-reveal countdowns) · Past (revealed winners + draw video). */
import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import TranslatableName from '../../src/components/TranslatableName';
import Countdown from '../../src/components/Countdown';
import { useAuth } from '../_layout';
import { useTheme } from '../../src/theme/ThemeContext';
import { colors } from '../../src/theme/tokens';
import { useT } from '../../src/i18n';
import { tSync } from '../../src/useAutoT';

const endOf = (c: any) => c.end_date && String(c.end_date).length === 10 ? `${c.end_date}T23:59:59+03:00` : c.end_date;

export default function CompetitionsScreen() {
  const s = useSStyles();
  const router = useRouter();
  const { apiCall } = useAuth();
  const { lang } = useT();
  const T = (x: string) => tSync(x, lang);
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const [current, setCurrent] = useState<any[]>([]);
  const [revealing, setRevealing] = useState<any[]>([]);
  const [past, setPast] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      apiCall('/api/competitions').catch(() => []), apiCall('/api/competitions-revealing').catch(() => []), apiCall('/api/competitions-past').catch(() => []),
    ]);
    setCurrent(a); setRevealing(b); setPast(c); setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- apiCall is recreated each render
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.brand} /></View>;

  const open = (c: any) => router.push(c.competition_type === 'ugc_video' ? `/ugc-contest?id=${c.id}` : `/competition/${c.id}` as any);
  const by = (c: any) => T(c.chamber_supervised ? 'بإشراف الغرفة التجارية' : 'سحب المتجر');

  const card = (c: any, kind: 'open' | 'reveal' | 'past') => (
    <TouchableOpacity testID={`competition-${c.id}`} key={c.id} style={s.card} onPress={() => open(c)} activeOpacity={0.85}>
      {c.cover_image ? <Image source={{ uri: c.cover_image }} style={s.cover} /> : null}
      <View style={s.body}>
        <View style={s.rowBetween}>
          <View style={[s.badge, kind === 'reveal' && { backgroundColor: 'rgba(245,197,24,0.14)' }, kind === 'past' && { backgroundColor: colors.surfaceSecondary }]}>
            <View style={[s.dot, { backgroundColor: kind === 'open' ? (c.phase === 'soon' ? '#3B82F6' : '#10B981') : kind === 'reveal' ? '#F5C518' : '#9CA3AF' }]} />
            <Text style={[s.badgeTxt, { color: kind === 'open' ? (c.phase === 'soon' ? '#60A5FA' : '#10B981') : kind === 'reveal' ? '#F5C518' : '#D1D5DB' }]}>
              {T(kind === 'reveal' ? 'تم السحب — الإعلان قريباً' : kind === 'past' ? 'أُعلنت النتائج' : c.phase === 'soon' ? 'قريباً' : 'مفتوحة للمشاركة')}
            </Text>
          </View>
          <View style={s.by}><Ionicons name={c.chamber_supervised ? 'shield-checkmark' : 'storefront'} size={12} color={colors.brand} /><Text style={s.byTxt} numberOfLines={1}>{by(c)}</Text></View>
        </View>
        <TranslatableName text={c.title} style={s.title} numberOfLines={2} />
        <View style={s.prizeRow}><Ionicons name="trophy" size={15} color="#F59E0B" /><TranslatableName text={c.prize || ''} style={s.prizeTxt} numberOfLines={1} /></View>
        {kind !== 'past' && (
          <View style={s.timer}>
            <Ionicons name="time" size={16} color={colors.brand} />
            <Text style={s.timerLbl}>{T(kind === 'reveal' ? 'إعلان الفائزين بعد' : c.phase === 'soon' ? 'تبدأ بعد' : 'تنتهي المشاركة بعد')}</Text>
            <Countdown to={kind === 'reveal' ? c.reveal_at : c.phase === 'soon' ? c.start_date : endOf(c)} style={s.timerVal} dayLabel={T('ي')} onDone={load} />
          </View>
        )}
        {kind === 'past' && (
          <>
            <Text style={s.winners} numberOfLines={2}>🏆 {(c.winners || []).map((w: any) => w.user_name).join('، ')}</Text>
            {c.has_proof || c.draw_video_url ? (
              <View style={s.watch}><Ionicons name={c.draw_video_url ? 'play-circle' : 'shield-checkmark'} size={18} color={colors.brand} />
                <Text style={s.watchTxt}>{T(c.draw_video_url ? 'شاهد فيديو السحب والإثبات' : 'شاهد إثبات السحب')}</Text></View>
            ) : null}
          </>
        )}
        {kind === 'open' && <Text style={s.meta}>{tSync('المشاركون', lang)}: {c.joined_count || 0}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><Text style={s.h1}>{T('المسابقات')}</Text></View>
      <View style={s.seg}>
        {(['current', 'past'] as const).map(k => (
          <TouchableOpacity key={k} testID={`comp-tab-${k}`} style={[s.segBtn, tab === k && s.segOn]} onPress={() => setTab(k)}>
            <Text style={[s.segTxt, tab === k && s.segTxtOn]}>{T(k === 'current' ? 'الحالية' : 'الماضية')} ({k === 'current' ? current.length + revealing.length : past.length})</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}>
        {tab === 'current' ? (
          <>
            {revealing.map(c => card(c, 'reveal'))}
            {current.map(c => card(c, 'open'))}
            {!current.length && !revealing.length && <Text style={s.empty}>{T('لا توجد مسابقات حالية')}</Text>}
          </>
        ) : (
          <>{past.map(c => card(c, 'past'))}{!past.length && <Text style={s.empty}>{T('لا توجد مسابقات سابقة بعد')}</Text>}</>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Fixed dark/gold look kept from the original screen
function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  h1: { fontSize: 24, fontWeight: '900', color: colors.brand },
  seg: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 14, backgroundColor: colors.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.border },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.brand },
  segTxt: { color: colors.onSurfaceSecondary, fontWeight: '700' },
  segTxtOn: { color: colors.onBrandPrimary, fontWeight: '900' },
  card: { marginHorizontal: 20, backgroundColor: colors.surface, borderRadius: 20, marginBottom: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cover: { width: '100%', height: 130, backgroundColor: colors.surfaceSecondary },
  body: { padding: 16, gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.14)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  by: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  byTxt: { color: colors.brand, fontSize: 11, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(245,197,24,0.14)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  prizeTxt: { fontSize: 13, fontWeight: '700', color: colors.brand, flexShrink: 1 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  timerLbl: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '600', flex: 1 },
  timerVal: { color: colors.brand, fontSize: 16, fontWeight: '900' },
  winners: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  watchTxt: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 12 },
  empty: { color: colors.onSurfaceSecondary, textAlign: 'center', marginTop: 40 },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable
}
