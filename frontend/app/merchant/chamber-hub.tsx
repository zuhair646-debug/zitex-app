/** Merchant ▸ Chamber of Commerce hub: competitions under chamber supervision, officers, assignment, draw studio. */
import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { useT } from '../../src/i18n';
import { tSync, tf } from '../../src/useAutoT';
import { notify } from '../../src/utils/notify';
import { colors } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import TranslatableName from '../../src/components/TranslatableName';

export default function ChamberHub() {
  const { lang } = useT();
  const s = useStyles();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<'comps' | 'officers'>('comps');
  const [assign, setAssign] = useState<any>(null);
  const [permit, setPermit] = useState('');
  const [officer, setOfficer] = useState('');
  const [reason, setReason] = useState('');
  const [newOff, setNewOff] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const T = (x: string) => tSync(x, lang);

  const load = useCallback(async () => {
    try { setData(await apiCall('/api/draws/hub')); } catch (e: any) { notify(T('خطأ'), e.message); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- apiCall/T are recreated each render
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAssign = (c: any) => { setAssign(c); setPermit(c.permit_number || ''); setOfficer(c.officer_id || ''); setReason(''); };
  // After entries (with an officer already set) every change needs a reason; a new officer must accept first
  const controlled = !!assign && assign.has_entries && !!assign.officer_id;
  const officerChanged = !!assign && officer !== (assign.officer_id || '');
  const saveAssign = async () => {
    try {
      const r = await apiCall(`/api/draws/${assign.id}/assign`, { method: 'POST', body: JSON.stringify({ officer_id: officer, permit_number: permit, reason }) });
      setAssign(null); load();
      if (r.pending) notify(T('تم إرسال الطلب'), T('سينتقل الإشراف بعد موافقة موظف الغرفة الجديد، وتم إشعار الموظف الحالي'));
      else if (r.changed) notify(T('تم الحفظ'), controlled ? T('تم التعديل وحُفظ في سجل المسابقة') : '');
    } catch (e: any) { notify(T('خطأ'), e.message); }
  };
  const cancelRequest = async (c: any) => {
    try { await apiCall(`/api/draws/${c.id}/officer-request/cancel`, { method: 'POST' }); load(); } catch (e: any) { notify(T('خطأ'), e.message); }
  };
  const createOfficer = async () => {
    try {
      await apiCall('/api/merchant/chamber-employees', { method: 'POST', body: JSON.stringify(newOff) });
      notify(T('تم إنشاء الحساب'), tf('بيانات دخول موظف الغرفة: {0} / {1}', lang, [newOff.phone, newOff.password]));
      setNewOff(null); load();
    } catch (e: any) { notify(T('خطأ'), e.message); }
  };

  if (!data) return <View style={s.center}><ActivityIndicator color={colors.brand} size="large" /></View>;
  const supervised = data.competitions.filter((c: any) => c.chamber_supervised).length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity testID="hub-back" style={s.iconBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={s.headerTitle}>{T('الغرفة التجارية والسحوبات')}</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={s.stats}>
          {[[data.competitions.length, 'مسابقة'], [supervised, 'تحت إشراف الغرفة'], [data.officers.length, 'موظف غرفة']].map(([n, l]) => (
            <View key={String(l)} style={s.stat}><Text style={s.statNum}>{n}</Text><Text style={s.statLbl}>{T(String(l))}</Text></View>
          ))}
        </View>
        <View style={s.tabs}>
          {([['comps', 'المسابقات'], ['officers', 'موظفو الغرفة']] as const).map(([k, l]) => (
            <TouchableOpacity key={k} testID={`hub-tab-${k}`} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}><Text style={[s.tabTxt, tab === k && s.tabTxtOn]}>{T(l)}</Text></TouchableOpacity>
          ))}
        </View>

        {tab === 'comps' ? data.competitions.map((c: any) => (
          <View key={c.id} style={s.card} testID={`hub-comp-${c.id}`}>
            <TranslatableName text={c.title} style={s.title} />
            <Text style={s.meta}>{tf('{0} مشارك • {1} جوائز • {2} سحب موثّق', lang, [c.participants, c.prize_count, c.draws])}</Text>
            <View style={s.row}>
              <Ionicons name="shield-checkmark" size={14} color={c.chamber_supervised ? colors.success : colors.onSurfaceTertiary} />
              <Text style={s.meta}>{c.chamber_supervised ? `${T('تصريح')}: ${c.permit_number || '—'} • ${T('المشرف')}: ${c.officer_name || '—'}` : T('بدون إشراف الغرفة')}</Text>
            </View>
            {c.winners.length ? <Text style={s.meta}>{T('الفائزون')}: {c.winners.map((w: any) => w.user_name).join('، ')}</Text> : null}
            {c.officer_request ? (
              <View style={s.pending} testID={`hub-pending-${c.id}`}>
                <Ionicons name="time" size={16} color={colors.warning} />
                <Text style={[s.meta, { flex: 1 }]}>{tf('بانتظار موافقة {0} على الإشراف • {1}', lang, [c.officer_request.to_officer, c.officer_request.reason])}</Text>
                <TouchableOpacity testID={`hub-pending-cancel-${c.id}`} onPress={() => cancelRequest(c)} style={s.pendingBtn}><Text style={s.pendingBtnTxt}>{T('إلغاء الطلب')}</Text></TouchableOpacity>
              </View>
            ) : null}
            {c.officer_log?.length ? <Text style={s.meta}>{tf('سجل الإشراف: {0} تعديل • آخرها {1}', lang, [c.officer_log.length, String(c.officer_log[c.officer_log.length - 1].at || '').slice(0, 10)])}</Text> : null}
            <View style={s.row}>
              <TouchableOpacity testID={`hub-assign-${c.id}`} style={s.btnAlt} onPress={() => openAssign(c)}><Ionicons name="person-add" size={16} color={colors.brand} /><Text style={s.btnAltTxt}>{T('الإشراف والتصريح')}</Text></TouchableOpacity>
              <TouchableOpacity testID={`hub-studio-${c.id}`} style={s.btn} onPress={() => router.push({ pathname: '/draw-studio', params: { id: c.id } } as any)}>
                <Ionicons name="videocam" size={16} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{T('استوديو السحب')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )) : (
          <>
            <TouchableOpacity testID="hub-new-officer" style={s.btn} onPress={() => setNewOff({ name: '', phone: '', password: '', email: '' })}>
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{T('حساب موظف غرفة جديد')}</Text>
            </TouchableOpacity>
            {data.officers.map((o: any) => (
              <View key={o.id} style={s.card}>
                <Text style={s.title}>{o.name}</Text>
                <Text style={s.meta}>{o.phone}</Text>
                <Text style={s.meta}>{o.competitions.length ? `${T('مسند له')}: ${o.competitions.join('، ')}` : T('لم تُسند له مسابقة بعد')}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal transparent animationType="slide" visible={!!assign} onRequestClose={() => setAssign(null)}>
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.modalCard}>
          <Text style={s.title}>{T('الإشراف والتصريح')}</Text>
          {controlled ? (
            <View style={s.pending}>
              <Ionicons name="information-circle" size={16} color={colors.info} />
              <Text style={[s.meta, { flex: 1 }]}>{T('المسابقة فيها مشاركون: اذكر سبب التعديل. تصحيح رقم التصريح يُطبَّق فوراً، وتغيير الموظف ينتقل بعد موافقة الموظف الجديد. كل تعديل يُحفظ في سجل المسابقة، والسحوبات السابقة تحتفظ بالمشرف الذي حضرها.')}</Text>
            </View>
          ) : null}
          {assign?.open_draw_session ? <Text style={[s.meta, { color: colors.error }]}>{T('يوجد سحب جارٍ الآن — التعديل متاح بعد انتهائه')}</Text> : null}
          <Text style={s.meta}>{T('رقم تصريح الغرفة التجارية')}</Text>
          <TextInput testID="hub-permit" style={s.input} value={permit} onChangeText={setPermit} placeholder="CC-2026-0001" placeholderTextColor={colors.onSurfaceTertiary} />
          <Text style={s.meta}>{T('موظف الغرفة المسؤول — يشوف هذه المسابقة فقط')}</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            {[...(controlled ? [] : [{ id: '', name: T('بدون مشرف') }]), ...data.officers].map((o: any) => (
              <TouchableOpacity key={o.id || 'none'} testID={`hub-officer-${o.id || 'none'}`} style={[s.pick, officer === o.id && s.pickOn]} onPress={() => setOfficer(o.id)}>
                <Text style={s.pickTxt}>{o.name}{o.phone ? `  •  ${o.phone}` : ''}</Text>
                {officer === o.id ? <Ionicons name="checkmark-circle" size={18} color={colors.brand} /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
          {controlled ? (
            <TextInput testID="hub-assign-reason" style={[s.input, { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }]} value={reason} onChangeText={setReason} multiline
              placeholder={T('سبب التعديل (مثال: خطأ في رقم التصريح / الموظف في إجازة)')} placeholderTextColor={colors.onSurfaceTertiary} />
          ) : null}
          <View style={s.row}>
            <TouchableOpacity testID="hub-assign-cancel" style={s.btnAlt} onPress={() => setAssign(null)}><Text style={s.btnAltTxt}>{T('إلغاء')}</Text></TouchableOpacity>
            <TouchableOpacity testID="hub-assign-save" style={[s.btn, controlled && reason.trim().length < 5 && { opacity: 0.45 }]} disabled={controlled && reason.trim().length < 5} onPress={saveAssign}>
              <Text style={s.btnTxt}>{T(controlled && officerChanged ? 'إرسال طلب النقل' : 'حفظ')}</Text>
            </TouchableOpacity>
          </View>
        </View></KeyboardAvoidingView>
      </Modal>

      <Modal transparent animationType="slide" visible={!!newOff} onRequestClose={() => setNewOff(null)}>
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.modalCard}>
          <Text style={s.title}>{T('حساب موظف غرفة جديد')}</Text>
          {([['name', 'الاسم'], ['phone', 'رقم الجوال'], ['password', 'كلمة المرور'], ['email', 'البريد (اختياري)']] as const).map(([k, l]) => (
            <TextInput key={k} testID={`hub-off-${k}`} style={s.input} value={newOff?.[k] || ''} onChangeText={t => setNewOff({ ...newOff, [k]: t })}
              placeholder={T(l)} placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry={k === 'password'} keyboardType={k === 'phone' ? 'phone-pad' : 'default'} />
          ))}
          <View style={s.row}>
            <TouchableOpacity style={s.btnAlt} onPress={() => setNewOff(null)}><Text style={s.btnAltTxt}>{T('إلغاء')}</Text></TouchableOpacity>
            <TouchableOpacity testID="hub-off-save" style={[s.btn, !(newOff?.name && newOff?.phone && newOff?.password?.length >= 6) && { opacity: 0.45 }]}
              disabled={!(newOff?.name && newOff?.phone && newOff?.password?.length >= 6)} onPress={createOfficer}><Text style={s.btnTxt}>{T('إنشاء')}</Text></TouchableOpacity>
          </View>
        </View></KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', color: colors.onSurface, fontSize: 17, fontWeight: '800' },
    stats: { flexDirection: 'row', gap: 8 },
    stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center' },
    statNum: { color: colors.brand, fontSize: 22, fontWeight: '900' },
    statLbl: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: 'center' },
    tabs: { flexDirection: 'row', gap: 8 },
    tab: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
    tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    tabTxt: { color: colors.onSurfaceSecondary, fontWeight: '700' },
    tabTxtOn: { color: colors.onBrandPrimary, fontWeight: '800' },
    card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
    title: { color: colors.onSurface, fontSize: 16, fontWeight: '800' },
    meta: { color: colors.onSurfaceSecondary, fontSize: 12, flexShrink: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    btn: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
    btnTxt: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 13 },
    btnAlt: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
    btnAltTxt: { color: colors.brand, fontWeight: '800', fontSize: 13 },
    modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10, paddingBottom: 32 },
    input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
    pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
    pickOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
    pickTxt: { color: colors.onSurface, fontWeight: '600' },
    pending: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 10, padding: 10 },
    pendingBtn: { minHeight: 44, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.error, justifyContent: 'center' },
    pendingBtnTxt: { color: colors.error, fontWeight: '700', fontSize: 12 },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable; themeKey triggers the rebuild
}
