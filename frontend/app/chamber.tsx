import { useT, curLang } from '../src/i18n';
import { tSync, tf } from '../src/useAutoT';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, RefreshControl, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import TranslatableName, { NameInitial } from '../src/components/TranslatableName';
import { useAuth } from './_layout';
import AccountPrefs from '../src/components/AccountPrefs';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';

export default function ChamberScreen() {
  const { isRTL } = useT(); // re-render when language or on-demand translations change
  const s = useStyles();
  const listRef = useRef<ScrollView>(null);
  const router = useRouter();
  const { apiCall, user, logout } = useAuth();
  const [comps, setComps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedComp, setSelectedComp] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<any>(null);

  const loadComps = async () => {
    try {
      const d = await apiCall('/api/chamber/competitions');
      // Filter to only competitions assigned to this chamber employee (or all if not specified)
      const myComps = d.filter((c: any) => !c.chamber_supervised || c.assigned_chamber_employee_id === user?.id);
      setComps(myComps);
    }
    catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadComps(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadComps(); setRefreshing(false); }, []);

  const openComp = async (compId: string) => {
    try {
      const full = await apiCall(`/api/chamber/competitions/${compId}/full`);
      setSelectedComp(full);
      setShowDetail(true);
      setDrawResult(null);
    } catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); }
  };

  const performDraw = async () => {
    if (!selectedComp) return;
    Alert.alert(tSync('تأكيد السحب', curLang()), tf('هل أنت متأكد من إجراء السحب رقم {0} لمسابقة "{1}"؟', curLang(), [(selectedComp.draw_history?.length || 0) + 1, selectedComp.title]), [
      { text: tSync('إلغاء', curLang()), style: 'cancel' },
      { text: tSync('اسحب الآن', curLang()), onPress: async () => {
        setDrawing(true);
        try {
          const result = await apiCall(`/api/chamber/competitions/${selectedComp.id}/draw`, { method: 'POST' });
          setDrawResult(result);
          const updated = await apiCall(`/api/chamber/competitions/${selectedComp.id}/full`);
          setSelectedComp(updated);
          loadComps();
        } catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); }
        finally { setDrawing(false); }
      }}
    ]);
  };

  const handleLogout = () => {
    const doLogout = async () => { await logout(); router.replace('/login'); };
    if (Platform.OS === 'web') { if (window.confirm(tSync('هل أنت متأكد؟', curLang()))) doLogout(); return; }
    Alert.alert(tSync('تسجيل الخروج', curLang()), tSync('هل أنت متأكد؟', curLang()), [
      { text: tSync('إلغاء', curLang()), style: 'cancel' },
      { text: tSync('تسجيل الخروج', curLang()), style: 'destructive', onPress: doLogout }
    ]);
  };

  const decideApproval = (compId: string, title: string, decision: 'approve' | 'reject') => {
    Alert.alert(tSync(decision === 'approve' ? tSync('اعتماد المسابقة', curLang()) : tSync('رفض المسابقة', curLang()), curLang()), tf('المسابقة: "{0}"', curLang(), [title]), [
      { text: tSync('إلغاء', curLang()), style: 'cancel' },
      { text: tSync(decision === 'approve' ? tSync('اعتماد', curLang()) : tSync('رفض', curLang()), curLang()), style: decision === 'reject' ? 'destructive' : 'default', onPress: async () => {
        try {
          await apiCall(`/api/chamber/competitions/${compId}/decision`, {
            method: 'POST',
            body: JSON.stringify({ decision, note: decision === 'reject' ? 'Rejected by chamber' : 'Approved by chamber' }),
          });
          loadComps();
        } catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); }
      }},
    ]);
  };

  const statusLabel = (s: string) => tSync(s === 'open' ? 'نشطة' : s === 'ended' ? 'منتهية' : 'قريباً', curLang());
  const statusColor = (st: string) => st === 'open' ? colors.success : st === 'ended' ? colors.onSurfaceTertiary : colors.info;

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerLogo}><Ionicons name="shield-checkmark" size={24} color={colors.brand} /></View>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>{tSync('الغرفة التجارية', curLang())}</Text>
          <Text style={s.headerSub}>{tSync('غرفة تحكم المسابقات', curLang())}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity testID="chamber-settings" onPress={() => listRef.current?.scrollToEnd({ animated: true })} style={s.iconBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity testID="chamber-logout" onPress={handleLogout} style={s.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.statsRow}>
        <View style={s.statCard}><Text style={s.statNum}>{comps.length}</Text><Text style={s.statLabel}>{tSync('الإجمالي', curLang())}</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>{comps.filter(c => c.status === 'open').length}</Text><Text style={s.statLabel}>{tSync('نشط', curLang())}</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>{comps.filter(c => c.status === 'ended').length}</Text><Text style={s.statLabel}>{tSync('انتهت', curLang())}</Text></View>
        <View style={s.statCard}><Text style={s.statNum}>{comps.reduce((a: number, c: any) => a + (c.total_participants || 0), 0)}</Text><Text style={s.statLabel}>{tSync('عدد المشاركين', curLang())}</Text></View>
      </View>

      <ScrollView ref={listRef} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
        <Text style={s.sectionTitle}>{tSync('المسابقات المسندة لي', curLang())}</Text>
        {comps.map((c: any) => (
          <TouchableOpacity testID={`chamber-comp-${c.id}`} key={c.id} style={s.compCard} onPress={() => openComp(c.id)}>
            <View style={s.compHeader}>
              <View style={[s.statusPill, { backgroundColor: statusColor(c.status) + '20' }]}>
                <View style={[s.statusDot, { backgroundColor: statusColor(c.status) }]} />
                <Text style={[s.statusText, { color: statusColor(c.status) }]}>{statusLabel(c.status)}</Text>
              </View>
              <Text style={s.drawCount}>{tf('{0} سحوبات', curLang(), [c.draw_history?.length || 0])}</Text>
            </View>
            <TranslatableName text={c.title} style={s.compTitle} />
            <View style={s.compMeta}>
              <View style={s.metaItem}><Ionicons name="people" size={14} color={colors.onSurfaceSecondary} /><Text style={s.metaText}>{tf('{0} مشارك', curLang(), [c.total_participants || c.joined_count || 0])}</Text></View>
              <View style={s.metaItem}><Ionicons name="trophy" size={14} color={colors.warning} /><Text style={s.metaText}>{tf('{0} جوائز', curLang(), [c.prize_count || 0])}</Text></View>
            </View>
            {c.winners?.length > 0 && (
              <View style={s.winnersPreview}>
                <Text style={s.winnersLabel}>{tSync('الفائزون:', curLang())} </Text>
                <TranslatableName text={c.winners.map((w: any) => w.user_name).join('، ')} style={s.winnersNames} inline={false} containerStyle={{ flex: 1 }} />
              </View>
            )}
            <View style={s.viewMore}><Text style={s.viewMoreText}>{tSync('عرض التفاصيل وإجراء السحب', curLang())}</Text><Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.brand} /></View>
          </TouchableOpacity>
        ))}
        <Text style={[s.sectionTitle, { marginTop: 12 }]}>{tSync('الإعدادات', curLang())}</Text>
        <AccountPrefs testPrefix="chamber" />
      </ScrollView>

      {/* Competition Detail Modal */}
      <Modal visible={showDetail} animationType="slide">
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}>
            <TouchableOpacity testID="close-detail" onPress={() => setShowDetail(false)} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </TouchableOpacity>
            <TranslatableName text={selectedComp?.title || ''} style={s.modalTitle} containerStyle={{ flex: 1 }} />
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            <View style={[s.detailStatus, { backgroundColor: statusColor(selectedComp?.status || '') + '15' }]}>
              <Text style={[s.detailStatusText, { color: statusColor(selectedComp?.status || '') }]}>{statusLabel(selectedComp?.status || '')}</Text>
            </View>

            <View style={s.detailGrid}>
              <View style={s.detailItem}><Text style={s.detailLabel}>{tSync('الجائزة', curLang())}</Text><TranslatableName text={String(selectedComp?.prize || '')} style={s.detailVal} /></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>{tSync('عدد الجوائز', curLang())}</Text><Text style={s.detailVal}>{selectedComp?.prize_count}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>{tSync('تاريخ البداية', curLang())}</Text><Text style={s.detailVal}>{selectedComp?.start_date}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>{tSync('تاريخ السحب', curLang())}</Text><Text style={s.detailVal}>{selectedComp?.draw_date}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>{tSync('الحد الأقصى للمشاركين', curLang())}</Text><Text style={s.detailVal}>{selectedComp?.max_participants}</Text></View>
              <View style={s.detailItem}><Text style={s.detailLabel}>{tSync('منضم', curLang())}</Text><Text style={s.detailVal}>{selectedComp?.participants?.length || 0}</Text></View>
            </View>

            {/* Draw Button */}
            <TouchableOpacity testID="chamber-draw-btn" style={s.drawBtn} onPress={performDraw} disabled={drawing}>
              {drawing ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <><Ionicons name="dice" size={24} color={colors.onBrandPrimary} /><Text style={s.drawBtnText}>{tf('إجراء السحب رقم {0}', curLang(), [(selectedComp?.draw_history?.length || 0) + 1])}</Text></>
              )}
            </TouchableOpacity>

            {/* Draw Result */}
            {drawResult && (
              <View style={s.resultCard}>
                <Ionicons name="trophy" size={28} color={colors.warning} />
                <Text style={s.resultTitle}>{tf('الفائزون في السحب رقم {0}', curLang(), [drawResult.draw_number])}</Text>
                <Text style={s.resultBy}>{tSync('أجرى السحب:', curLang())} {drawResult.drawn_by}</Text>
                {drawResult.winners?.map((w: any, i: number) => (
                  <View key={i} style={s.resultWinner}>
                    <View style={s.resultRank}><Text style={s.rankNum}>#{i + 1}</Text></View>
                    <TranslatableName text={w.user_name || ''} style={s.resultName} />
                    <Text style={s.resultPhone}>{w.user_phone}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Draw History */}
            {selectedComp?.draw_history?.length > 0 && (
              <View style={s.historySection}>
                <Text style={s.histTitle}>{tSync('سجل السحوبات', curLang())}</Text>
                {selectedComp.draw_history.map((dh: any, i: number) => (
                  <View key={i} style={s.histCard}>
                    <View style={s.histHeader}>
                      <Text style={s.histNum}>{tf('السحب رقم {0}', curLang(), [dh.draw_number])}</Text>
                      <Text style={s.histDate}>{dh.drawn_at?.split('T')[0]}</Text>
                    </View>
                    <Text style={s.histBy}>{tSync('بواسطة:', curLang())} {dh.drawn_by} ({dh.drawn_by_role || tSync('النظام', curLang())})</Text>
                    {dh.winners?.map((w: any, j: number) => (
                      <Text key={j} style={s.histWinner}>#{j + 1} {w.user_name} - {w.user_phone}</Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Participants */}
            <View style={s.participantsSection}>
              <Text style={s.histTitle}>{tf('كل المشاركين ({0})', curLang(), [selectedComp?.participants?.length || 0])}</Text>
              {selectedComp?.participants?.map((p: any, i: number) => (
                <View key={i} style={s.participantRow}>
                  <Text style={s.pNum}>{i + 1}</Text>
                  <View style={s.pAvatar}><NameInitial name={p.user_name} style={s.pAvatarText} /></View>
                  <View style={s.pInfo}>
                    <TranslatableName text={p.user_name || ''} style={s.pName} />
                    <Text style={s.pPhone}>{p.user_phone}</Text>
                  </View>
                  <Text style={s.pDate}>{p.joined_at?.split('T')[0]}</Text>
                  {selectedComp?.winners?.some((w: any) => w.user_name === p.user_name) && (
                    <View style={s.winBadge}><Ionicons name="trophy" size={12} color={colors.warning} /></View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerLogo: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.onSurfaceSecondary },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  logoutBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.errorSoft, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 16 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.brand },
  statLabel: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2, textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 12 },
  compCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  drawCount: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: '500' },
  compTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  compMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.onSurfaceSecondary },
  winnersPreview: { flexDirection: 'row', backgroundColor: colors.warningSoft, borderRadius: 8, padding: 8, marginBottom: 8 },
  winnersLabel: { fontSize: 12, fontWeight: '600', color: colors.warning },
  winnersNames: { fontSize: 12, color: colors.warning, flex: 1 },
  viewMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  viewMoreText: { fontSize: 13, fontWeight: '600', color: colors.brand },
  modalSafe: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, flex: 1, textAlign: 'center' },
  modalContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  detailStatus: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginBottom: 16 },
  detailStatusText: { fontSize: 14, fontWeight: '600' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  detailItem: { width: '48%', backgroundColor: colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  detailLabel: { fontSize: 11, color: colors.onSurfaceSecondary, marginBottom: 4 },
  detailVal: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  drawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 18, marginBottom: 16 },
  drawBtnText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: '700' },
  resultCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center', borderWidth: 2, borderColor: colors.warning },
  resultTitle: { fontSize: 18, fontWeight: '800', color: colors.onSurface, marginTop: 8, marginBottom: 4 },
  resultBy: { fontSize: 12, color: colors.onSurfaceSecondary, marginBottom: 16 },
  resultWinner: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  resultRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  rankNum: { color: colors.onWarning, fontSize: 12, fontWeight: '800' },
  resultName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.onSurface },
  resultPhone: { fontSize: 13, color: colors.onSurfaceSecondary },
  historySection: { marginBottom: 20 },
  histTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 12 },
  histCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  histHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  histNum: { fontSize: 14, fontWeight: '700', color: colors.brand },
  histDate: { fontSize: 12, color: colors.onSurfaceSecondary },
  histBy: { fontSize: 12, color: colors.onSurfaceSecondary, marginBottom: 6 },
  histWinner: { fontSize: 13, color: colors.onSurface, paddingVertical: 2 },
  participantsSection: { marginBottom: 20 },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  pNum: { width: 24, fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: '500' },
  pAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', marginEnd: 10 },
  pAvatarText: { fontSize: 14, fontWeight: '700', color: colors.brand },
  pInfo: { flex: 1 },
  pName: { fontSize: 14, fontWeight: '500', color: colors.onSurface },
  pPhone: { fontSize: 12, color: colors.onSurfaceSecondary },
  pDate: { fontSize: 11, color: colors.onSurfaceTertiary },
  winBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.warningSoft, alignItems: 'center', justifyContent: 'center', marginStart: 8 },
  }), [themeKey]);
}
