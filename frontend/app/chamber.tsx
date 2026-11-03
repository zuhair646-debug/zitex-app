/** Chamber of Commerce officer portal — bottom bar: current competitions · past draws · settings. */
import { useT, curLang } from '../src/i18n';
import { tSync, tf } from '../src/useAutoT';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, RefreshControl, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import TranslatableName from '../src/components/TranslatableName';
import { useAuth } from './_layout';
import AccountPrefs from '../src/components/AccountPrefs';
import ConfirmSheet from '../src/components/ConfirmSheet';
import { notify } from '../src/utils/notify';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';

type Tab = 'current' | 'past' | 'settings';
const L = (x: string) => tSync(x, curLang());
const day = (v?: string) => (v ? String(v).slice(0, 10) : '—');
const LOG_LABEL: Record<string, string> = {
  assign: 'إسناد الإشراف', permit_change: 'تصحيح رقم التصريح', request: 'طلب نقل الإشراف',
  accepted: 'قبول نقل الإشراف', rejected: 'رفض نقل الإشراف', cancelled: 'إلغاء طلب النقل',
};

export default function ChamberScreen() {
  const { isRTL } = useT(); // re-render when language or on-demand translations change
  const s = useStyles();
  const router = useRouter();
  const { apiCall, user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('current');
  const [comps, setComps] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [decide, setDecide] = useState<null | { req: any; decision: 'accept' | 'reject' }>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const load = async () => {
    try {
      const [c, r] = await Promise.all([apiCall('/api/chamber/competitions'), apiCall('/api/draws/officer-requests').catch(() => [])]);
      setComps(c); setRequests(r);
    } catch (e: any) { notify(L('خطأ'), e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openComp = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try { setSelected(await apiCall(`/api/chamber/competitions/${id}/full`)); }
    catch (e: any) { notify(L('خطأ'), e.message); }
    finally { setOpening(null); }
  };

  const goStudio = () => { const id = selected?.id; setSelected(null); router.push({ pathname: '/draw-studio', params: { id } } as any); };

  const runDecision = async () => {
    if (!decide) return;
    const { req, decision } = decide; setDecide(null);
    try {
      await apiCall(`/api/draws/${req.competition_id}/officer-request/${decision}`, { method: 'POST' });
      notify(L(decision === 'accept' ? 'تم قبول الإشراف' : 'تم رفض الطلب'));
      load();
    } catch (e: any) { notify(L('خطأ'), e.message); }
  };

  const doLogout = async () => { setConfirmLogout(false); await logout(); router.replace('/login'); };

  const stateLabel = (c: any) => L(({ open: 'المشاركة مفتوحة', ready: 'جاهزة للسحب', drawn: 'تم السحب', waiting: 'بانتظار موعد السحب', likes: 'الفائزون حسب الإعجابات', soon: 'قريباً' } as any)[c?.phase || 'soon']);
  const stateColor = (c: any) => ({ open: colors.success, ready: colors.warning, drawn: colors.onSurfaceSecondary, waiting: colors.info, likes: colors.warning, soon: colors.info } as any)[c?.phase || 'soon'];

  const current = comps.filter(c => c.phase !== 'drawn');
  const past = comps.filter(c => c.phase === 'drawn');

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color={colors.brand} /></View>;

  const card = (c: any) => (
    <TouchableOpacity testID={`chamber-comp-${c.id}`} key={c.id} style={s.compCard} onPress={() => openComp(c.id)} activeOpacity={0.8}>
      <View style={s.compHeader}>
        <View style={[s.statusPill, { backgroundColor: stateColor(c) + '22' }]}>
          <View style={[s.statusDot, { backgroundColor: stateColor(c) }]} />
          <Text style={[s.statusText, { color: stateColor(c) }]}>{stateLabel(c)}</Text>
        </View>
        <Text style={s.drawCount}>{tf('{0} سحوبات', curLang(), [c.draws || 0])}</Text>
      </View>
      <TranslatableName text={c.title} style={s.compTitle} />
      <View style={s.compMeta}>
        <View style={s.metaItem}><Ionicons name="people" size={14} color={colors.onSurfaceSecondary} /><Text style={s.metaText}>{tf('{0} مشارك', curLang(), [c.total_participants || 0])}</Text></View>
        <View style={s.metaItem}><Ionicons name="trophy" size={14} color={colors.warning} /><Text style={s.metaText}>{tf('{0} جوائز', curLang(), [c.prize_count || 0])}</Text></View>
        <View style={s.metaItem}><Ionicons name="calendar" size={14} color={colors.onSurfaceSecondary} /><Text style={s.metaText}>{day(c.draw_opens_at || c.end_date)}</Text></View>
      </View>
      {c.winners?.length > 0 && (
        <View style={s.winnersPreview}>
          <Ionicons name="trophy" size={14} color={colors.warning} />
          <Text style={s.winnersNames} numberOfLines={2}>{c.winners.map((w: any) => w.user_name).join('، ')}</Text>
        </View>
      )}
      <View style={s.viewMore}>
        {opening === c.id ? <ActivityIndicator size="small" color={colors.brand} /> : (
          <><Text style={s.viewMoreText}>{L(c.phase === 'drawn' ? 'الإثبات والفائزون' : 'عرض التفاصيل وإجراء السحب')}</Text>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.brand} /></>
        )}
      </View>
    </TouchableOpacity>
  );

  const empty = (icon: any, text: string) => (
    <View style={s.empty}><Ionicons name={icon} size={40} color={colors.onSurfaceTertiary} /><Text style={s.emptyTxt}>{L(text)}</Text></View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <View style={s.headerLogo}><Ionicons name="shield-checkmark" size={24} color={colors.brand} /></View>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>{L('الغرفة التجارية')}</Text>
          <Text style={s.headerSub}>{L(tab === 'current' ? 'المسابقات الحالية' : tab === 'past' ? 'المسابقات السابقة' : 'الإعدادات')}</Text>
        </View>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
        {tab === 'current' && (
          <>
            {requests.map(r => (
              <View key={r.competition_id} style={s.reqCard} testID={`chamber-request-${r.competition_id}`}>
                <View style={s.rowStart}><Ionicons name="mail-unread" size={18} color={colors.warning} /><Text style={s.reqTitle}>{L('طلب إشراف جديد')}</Text></View>
                <TranslatableName text={r.title} style={s.compTitle} />
                <Text style={s.metaText}>{tf('من: {0} • تصريح: {1} • {2} مشارك', curLang(), [r.requested_by, r.permit_number || '—', r.participants])}</Text>
                {r.from_officer ? <Text style={s.metaText}>{tf('المشرف الحالي: {0}', curLang(), [r.from_officer])}</Text> : null}
                <Text style={s.reqReason}>{L('السبب:')} {r.reason}</Text>
                <View style={s.row}>
                  <TouchableOpacity testID={`chamber-request-reject-${r.competition_id}`} style={s.btnAlt} onPress={() => setDecide({ req: r, decision: 'reject' })}><Text style={s.btnAltTxt}>{L('رفض')}</Text></TouchableOpacity>
                  <TouchableOpacity testID={`chamber-request-accept-${r.competition_id}`} style={s.btn} onPress={() => setDecide({ req: r, decision: 'accept' })}><Text style={s.btnTxt}>{L('قبول الإشراف')}</Text></TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={s.statsRow}>
              <View style={s.statCard}><Text style={s.statNum}>{current.length}</Text><Text style={s.statLabel}>{L('الحالية')}</Text></View>
              <View style={s.statCard}><Text style={s.statNum}>{current.filter(c => c.phase === 'ready').length}</Text><Text style={s.statLabel}>{L('جاهزة للسحب')}</Text></View>
              <View style={s.statCard}><Text style={s.statNum}>{current.reduce((a, c) => a + (c.total_participants || 0), 0)}</Text><Text style={s.statLabel}>{L('عدد المشاركين')}</Text></View>
            </View>
            {current.length ? current.map(card) : empty('trophy-outline', 'لا توجد مسابقات حالية مسندة لك')}
          </>
        )}
        {tab === 'past' && (
          <>
            <View style={s.statsRow}>
              <View style={s.statCard}><Text style={s.statNum}>{past.length}</Text><Text style={s.statLabel}>{L('تم السحب')}</Text></View>
              <View style={s.statCard}><Text style={s.statNum}>{past.reduce((a, c) => a + (c.winners?.length || 0), 0)}</Text><Text style={s.statLabel}>{L('الفائزون')}</Text></View>
              <View style={s.statCard}><Text style={s.statNum}>{past.reduce((a, c) => a + (c.draws || 0), 0)}</Text><Text style={s.statLabel}>{L('السحوبات الموثقة')}</Text></View>
            </View>
            {past.length ? past.map(card) : empty('archive-outline', 'لا توجد مسابقات تم السحب عليها بعد')}
          </>
        )}
        {tab === 'settings' && (
          <>
            <View style={s.profile}>
              <View style={s.avatar}><Ionicons name="person" size={26} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.compTitle}>{user?.name || '—'}</Text>
                <Text style={s.metaText}>{'\u2066' + (user?.phone || '') + '\u2069'} • {L('موظف الغرفة التجارية')}</Text>
              </View>
            </View>
            <AccountPrefs testPrefix="chamber" />
            <TouchableOpacity testID="chamber-logout" style={s.logoutRow} onPress={() => Platform.OS === 'web' ? (window.confirm(L('هل أنت متأكد؟')) && doLogout()) : setConfirmLogout(true)}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} /><Text style={s.logoutTxt}>{L('تسجيل الخروج')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <View style={s.tabBar}>
        {([['current', 'trophy', 'الحالية', requests.length], ['past', 'archive', 'السابقة', 0], ['settings', 'settings', 'الإعدادات', 0]] as const).map(([k, icon, label, badge]) => (
          <TouchableOpacity key={k} testID={`chamber-tab-${k}`} style={s.tabItem} onPress={() => setTab(k)}>
            <View>
              <Ionicons name={(tab === k ? icon : `${icon}-outline`) as any} size={22} color={tab === k ? colors.brand : colors.onSurfaceTertiary} />
              {badge ? <View style={s.badge}><Text style={s.badgeTxt}>{badge}</Text></View> : null}
            </View>
            <Text style={[s.tabTxt, tab === k && { color: colors.brand, fontWeight: '800' }]}>{L(label)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Competition detail */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity testID="close-detail" onPress={() => setSelected(null)} style={s.closeBtn}><Ionicons name="close" size={24} color={colors.onSurface} /></TouchableOpacity>
            <TranslatableName text={selected?.title || ''} style={s.modalTitle} containerStyle={{ flex: 1 }} />
            <View style={{ width: 44 }} />
          </View>
          {selected ? (
            <ScrollView contentContainerStyle={s.modalContent}>
              <View style={[s.detailStatus, { backgroundColor: stateColor(selected) + '18' }]}>
                <Text style={[s.detailStatusText, { color: stateColor(selected) }]}>{stateLabel(selected)}</Text>
              </View>
              <View style={s.detailGrid}>
                {([
                  ['الجائزة', String(selected.prize || '—')], ['عدد الجوائز', String(selected.prize_count || 1)],
                  ['تاريخ البداية', day(selected.start_date || selected.created_at)], ['آخر يوم للمشاركة', day(selected.end_date)],
                  ['موعد السحب', day(selected.draw_opens_at || selected.draw_date)], ['رقم التصريح', selected.permit_number || '—'],
                  ['منضم', String(selected.participants_count || 0)], ['السحوبات الموثقة', String(selected.draws || 0)],
                ] as const).map(([k, v]) => (
                  <View key={k} style={s.detailItem}><Text style={s.detailLabel}>{L(k)}</Text><Text style={s.detailVal} numberOfLines={2}>{v}</Text></View>
                ))}
              </View>

              {selected.competition_type === 'ugc_video' ? (
                <View testID="chamber-draw-locked" style={s.lockedBox}><Ionicons name="videocam" size={18} color={colors.onSurfaceSecondary} />
                  <Text style={s.lockedText}>{L('مسابقة فيديو: الفائزون يُختارون تلقائياً حسب الإعجابات بعد الانتهاء — لا يوجد سحب')}</Text></View>
              ) : selected.draw_ready || selected.winners_finalized_at ? (
                <TouchableOpacity testID="chamber-draw-btn" style={s.drawBtn} onPress={goStudio}>
                  <Ionicons name={selected.winners_finalized_at ? 'videocam' : 'dice'} size={22} color={colors.onBrandPrimary} />
                  <Text style={s.drawBtnText}>{L(selected.winners_finalized_at ? 'استوديو السحب: الإثبات وإعادة السحب' : 'افتح استوديو السحب')}</Text>
                </TouchableOpacity>
              ) : (
                <View testID="chamber-draw-locked" style={s.lockedBox}><Ionicons name="lock-closed" size={18} color={colors.onSurfaceSecondary} />
                  <Text style={s.lockedText}>{selected.entry_open
                    ? tf('المشاركة مفتوحة حتى {0} — السحب يفتح بعدها', curLang(), [day(selected.end_date)])
                    : tf('السحب يفتح في {0}', curLang(), [day(selected.draw_opens_at)])}</Text></View>
              )}

              {selected.winners?.length > 0 && (
                <View style={s.section}>
                  <Text style={s.histTitle}>{L('الفائزون المعتمدون')}</Text>
                  {selected.winners.map((w: any, i: number) => (
                    <View key={i} style={s.histCard}>
                      <View style={s.histHeader}><Text style={s.histNum}>#{i + 1} {w.user_name}</Text><Text style={s.histDate}>{day(w.won_at || selected.winners_finalized_at)}</Text></View>
                      <Text style={s.histBy}>{L(w.prize_status === 'delivered' ? 'تم التسليم' : w.prize_status === 'claimed' ? 'طلب الاستلام' : 'بانتظار الاستلام')}</Text>
                    </View>
                  ))}
                </View>
              )}

              {selected.officer_log?.length > 0 && (
                <View style={s.section}>
                  <Text style={s.histTitle}>{L('سجل الإشراف والتصريح')}</Text>
                  {[...selected.officer_log].reverse().map((g: any, i: number) => (
                    <View key={i} style={s.histCard} testID={`officer-log-${i}`}>
                      <View style={s.histHeader}><Text style={s.histNum}>{L(LOG_LABEL[g.action] || g.action)}</Text><Text style={s.histDate}>{day(g.at)}</Text></View>
                      {g.from_officer || g.to_officer ? <Text style={s.histBy}>{g.from_officer || '—'} {isRTL ? '←' : '→'} {g.to_officer || '—'}</Text> : null}
                      {g.permit_old !== g.permit_new && (g.permit_old || g.permit_new) ? <Text style={s.histBy}>{L('التصريح')}: {g.permit_old || '—'} {isRTL ? '←' : '→'} {g.permit_new || '—'}</Text> : null}
                      {g.reason ? <Text style={s.histBy}>{L('السبب:')} {g.reason}</Text> : null}
                      <Text style={s.histBy}>{L('بواسطة:')} {g.by}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={s.section}>
                <Text style={s.histTitle}>{tf('آخر المشاركين ({0} من {1})', curLang(), [selected.participants?.length || 0, selected.participants_count || 0])}</Text>
                {(selected.participants || []).map((p: any, i: number) => (
                  <View key={p.id || i} style={s.participantRow}>
                    <Text style={s.pNum}>{i + 1}</Text>
                    <View style={s.pInfo}><Text style={s.pName} numberOfLines={1}>{p.user_name || '—'}</Text></View>
                    <Text style={s.pDate}>{day(p.joined_at || p.created_at)}</Text>
                    {selected.winners?.some((w: any) => w.user_id === p.user_id) && <View style={s.winBadge}><Ionicons name="trophy" size={12} color={colors.warning} /></View>}
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <ConfirmSheet visible={!!decide} testID="chamber-decide"
        title={L(decide?.decision === 'accept' ? 'قبول الإشراف على المسابقة' : 'رفض طلب الإشراف')}
        message={decide?.decision === 'accept'
          ? tf('ستصبح المشرف الرسمي على «{0}» برقم تصريح {1}، ويُسجَّل ذلك في سجل المسابقة.', curLang(), [decide?.req?.title || '', decide?.req?.permit_number || '—'])
          : L('سيبقى الإشراف كما هو، ويُبلَّغ التاجر برفضك.')}
        confirmText={L(decide?.decision === 'accept' ? 'قبول' : 'رفض')} cancelText={L('تراجع')} danger={decide?.decision === 'reject'}
        onCancel={() => setDecide(null)} onConfirm={runDecision} />
      <ConfirmSheet visible={confirmLogout} title={L('تسجيل الخروج')} message={L('هل أنت متأكد؟')} confirmText={L('تسجيل الخروج')} cancelText={L('إلغاء')} danger
        onCancel={() => setConfirmLogout(false)} onConfirm={doLogout} />
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerLogo: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceSecondary },
  list: { padding: 16, paddingBottom: 32 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.brand },
  statLabel: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2, textAlign: 'center' },
  compCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  drawCount: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: '500' },
  compTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 6 },
  compMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.onSurfaceSecondary },
  winnersPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.warningSoft, borderRadius: 8, padding: 8, marginBottom: 8 },
  winnersNames: { fontSize: 12, color: colors.warning, flex: 1, fontWeight: '600' },
  viewMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 10, minHeight: 34, borderTopWidth: 1, borderTopColor: colors.border },
  viewMoreText: { fontSize: 13, fontWeight: '700', color: colors.brand },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  emptyTxt: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: 'center' },
  reqCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 2, borderColor: colors.warning, gap: 4 },
  reqTitle: { color: colors.warning, fontWeight: '800', fontSize: 14 },
  reqReason: { color: colors.onSurface, fontSize: 13, marginVertical: 6 },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: colors.onBrandPrimary, fontWeight: '800' },
  btnAlt: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  btnAltTxt: { color: colors.onSurface, fontWeight: '800' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  logoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 14, backgroundColor: colors.errorSoft, marginTop: 16 },
  logoutTxt: { color: colors.error, fontWeight: '800', fontSize: 15 },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 24 : 10 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  tabTxt: { fontSize: 11, color: colors.onSurfaceTertiary, fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, flex: 1, textAlign: 'center' },
  modalContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  detailStatus: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginBottom: 16 },
  detailStatusText: { fontSize: 14, fontWeight: '700' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  detailItem: { width: '48%', backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  detailLabel: { fontSize: 11, color: colors.onSurfaceSecondary, marginBottom: 4, fontWeight: '600' },
  detailVal: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  lockedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  lockedText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.onSurfaceSecondary },
  drawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 18, marginBottom: 20 },
  drawBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '800' },
  section: { marginBottom: 20 },
  histTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 12 },
  histCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, gap: 2 },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  histNum: { fontSize: 14, fontWeight: '700', color: colors.brand, flexShrink: 1 },
  histDate: { fontSize: 12, color: colors.onSurfaceSecondary },
  histBy: { fontSize: 12, color: colors.onSurfaceSecondary },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  pNum: { width: 34, fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: '500' },
  pInfo: { flex: 1 },
  pName: { fontSize: 14, fontWeight: '500', color: colors.onSurface },
  pDate: { fontSize: 11, color: colors.onSurfaceTertiary },
  winBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.warningSoft, alignItems: 'center', justifyContent: 'center', marginStart: 8 },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable; themeKey triggers the rebuild
}
