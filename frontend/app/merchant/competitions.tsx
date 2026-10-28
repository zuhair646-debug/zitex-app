import { useEffect, useState, useCallback } from 'react';
import { useT, curLang } from '../../src/i18n';
import { tSync, tf } from '../../src/useAutoT';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import TranslatableName from '../../src/components/TranslatableName';
import { useAuth } from '../_layout';

const APPROVAL_COLORS: any = { pending: '#F59E0B', approved: '#10B981', auto_approved: '#8833FF', rejected: '#EF4444' };

export default function MerchantCompetitions() {
  const { lang } = useT();

  const router = useRouter();
  const { apiCall } = useAuth();
  const [comps, setComps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/competitions'); setComps(d); } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = (id: string) => Alert.alert(tSync('حذف المسابقة؟', lang), tSync('لا يمكن التراجع', curLang()), [{ text: tSync('إلغاء', curLang()), style: 'cancel' }, { text: tSync('حذف', curLang()), style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/competitions/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); } } }]);

  const draw = (c: any) => Alert.alert(tSync('السحب على الفائزين', lang), tf('سيتم اختيار {0} فائز عشوائياً من {1} مشارك وإنهاء المسابقة', lang, [c.prize_count || 1, c.joined_count || 0]), [
    { text: tSync('إلغاء', curLang()), style: 'cancel' },
    { text: tSync('ابدأ السحب', curLang()), onPress: async () => {
      try { const r = await apiCall(`/api/competitions/${c.id}/draw`, { method: 'POST' }); Alert.alert('🏆', (r.winners || []).map((w: any) => w.user_name).join('\n')); load(); }
      catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
    } },
  ]);

  const delivered = async (cid: string, uid: string) => {
    try { await apiCall(`/api/merchant/competitions/${cid}/winners/${uid}/delivered`, { method: 'POST' }); load(); }
    catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };

  const PRIZE: Record<string, [string, string]> = { pending: ['بانتظار طلب الفائز', '#F59E0B'], claimed: ['طلب الاستلام', '#3B82F6'], delivered: ['تم التسليم', '#10B981'] };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>{tSync('المسابقات', lang)} ({comps.length})</Text>
        <TouchableOpacity testID="new-comp" onPress={() => router.push('/merchant/competition-form')} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
          {comps.length === 0 ? <Text style={s.empty}>{tSync('ما في مسابقات لحد الآن', lang)}</Text> : comps.map(c => {
            const ap = c.approval_status || (c.requires_approval ? 'pending' : 'auto_approved');
            return (
              <View key={c.id} style={s.card}>
                <View style={s.row}>
                  <TranslatableName text={c.title} style={s.compTitle} numberOfLines={1} />
                  <TouchableOpacity onPress={() => del(c.id)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity>
                </View>
                <TranslatableName text={c.prize} style={s.prize} />
                <View style={s.statRow}>
                  <View style={[s.badge, { backgroundColor: APPROVAL_COLORS[ap] + '20' }]}>
                    <Text style={[s.badgeText, { color: APPROVAL_COLORS[ap] }]}>{tSync(ap === 'auto_approved' ? 'عامة' : ap === 'pending' ? 'بانتظار الموافقة' : ap === 'rejected' ? 'مرفوضة' : 'معتمدة', lang)}</Text>
                  </View>
                  <Text style={s.joined}>{tf('{0} مشارك', lang, [c.joined_count || 0])}</Text>
                </View>
                {c.approval_note ? <Text style={s.note}>Note: {c.approval_note}</Text> : null}
                {(c.winners || []).length > 0 && (
                  <View style={s.winners}>
                    <Text style={s.winTitle}>🏆 {tSync('الفائزون', lang)}</Text>
                    {c.winners.map((w: any) => {
                      const st = PRIZE[w.prize_status || 'pending'];
                      return (
                        <View key={w.user_id} style={s.winRow}>
                          <View style={{ flex: 1 }}>
                            <TranslatableName text={w.user_name || ''} style={s.winName} noToggle />
                            <Text style={s.joined}>{w.user_phone}{w.claim_method ? ` • ${tSync(w.claim_method === 'delivery' ? 'توصيل' : 'من الفرع', lang)}` : ''}{w.claim_address ? ` • ${w.claim_address}` : ''}</Text>
                          </View>
                          {w.prize_status === 'claimed' ? (
                            <TouchableOpacity testID={`deliver-${c.id}-${w.user_id}`} style={s.smallBtn} onPress={() => delivered(c.id, w.user_id)}>
                              <Text style={s.smallBtnText}>{tSync('تأكيد التسليم', lang)}</Text>
                            </TouchableOpacity>
                          ) : <Text style={[s.badgeText, { color: st[1] }]}>{tSync(st[0], lang)}</Text>}
                        </View>
                      );
                    })}
                  </View>
                )}
                <View style={s.actions}>
                  <TouchableOpacity testID={`edit-comp-${c.id}`} style={s.actBtn} onPress={() => router.push(`/merchant/competition-form?id=${c.id}` as any)}>
                    <Ionicons name="create-outline" size={16} color="#8833FF" /><Text style={s.actText}>{tSync('تعديل', lang)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`stats-comp-${c.id}`} style={s.actBtn} onPress={() => router.push(`/merchant/competition-analytics?id=${c.id}` as any)}>
                    <Ionicons name="stats-chart" size={16} color="#8833FF" /><Text style={s.actText}>{tSync('الإحصائيات', lang)}</Text>
                  </TouchableOpacity>
                  {c.status !== 'ended' && (c.joined_count || 0) > 0 && (
                    <TouchableOpacity testID={`draw-comp-${c.id}`} style={[s.actBtn, s.drawBtn]} onPress={() => draw(c)}>
                      <Ionicons name="shuffle" size={16} color="white" /><Text style={[s.actText, { color: 'white' }]}>{tSync('سحب الفائزين', lang)}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  compTitle: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', flex: 1, marginRight: 8 },
  prize: { fontSize: 13, color: '#8833FF', fontWeight: '600' },
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  joined: { fontSize: 12, color: '#6B7280' },
  note: { fontSize: 12, color: '#EF4444', marginTop: 6, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 14 },
  winners: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#FFFBEB', gap: 6 },
  winTitle: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  winRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  winName: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  smallBtn: { backgroundColor: '#10B981', paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 8 },
  smallBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#8833FF' },
  drawBtn: { backgroundColor: '#8833FF' },
  actText: { color: '#8833FF', fontSize: 13, fontWeight: '700' },
});
