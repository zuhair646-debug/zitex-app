/** Merchant fleet: live map of drivers, waiting orders (manual assign), approvals, cash, payouts, SOS/issues. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { colors, spacing, radius } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { TX, tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';
import ZenMap, { ZenMapHandle } from '../../src/components/ZenMap';
import { FilterTabs, ScreenHeader, Badge, EmptyState, SecondaryButton } from '../../src/components/ui';
import { useLive } from '../../src/utils/live';
import { notify } from '../../src/utils/notify';

type Tab = 'drivers' | 'orders' | 'plan' | 'requests' | 'alerts';

export default function Fleet() {
  const s = useStyles();
  const { lang, t, isRTL } = useT();
  const router = useRouter();
  const { apiCall } = useAuth();
  const map = useRef<ZenMapHandle>(null);
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('drivers');
  const [assignFor, setAssignFor] = useState<any>(null);
  const [shiftFor, setShiftFor] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [moveFor, setMoveFor] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [planOffset, setPlanOffset] = useState(1);
  const planDate = new Date(Date.now() + 3 * 3600e3 + planOffset * 86400e3).toISOString().slice(0, 10);
  const loadPlan = useCallback(async (run = false) => {
    try {
      if (run) await apiCall('/api/merchant/delivery/plan/run', { method: 'POST', body: JSON.stringify({ date: planDate }) });
      setPlan(await apiCall(`/api/merchant/delivery/plan?date=${planDate}`));
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  }, [planDate]);
  useEffect(() => { if (tab === 'plan') loadPlan(); }, [tab, planDate]);
  useEffect(() => { apiCall('/api/delivery/settings').then((x: any) => setSlots(x.scheduled_slots || [])).catch(() => {}); }, []);
  const saveShift = async () => {
    const x = shiftFor; setShiftFor(null);
    await post(`/api/merchant/drivers/${x.id}/shift`, { pools: x.pools, slot: x.shift?.slot || '', start: x.shift?.start || '08:00' });
  };
  const locs = useRef<Record<string, any>>({});

  const load = useCallback(async () => {
    try { setD(await apiCall('/api/merchant/fleet')); } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const draw = useCallback((data: any) => {
    const list = (data?.drivers || []).filter((x: any) => x.online && (locs.current[x.user_id] || x.loc)?.lat).map((x: any) => {
      const l = locs.current[x.user_id] || x.loc;
      return { id: x.user_id, kind: 'other', label: '🛵', lat: l.lat, lng: l.lng };
    });
    (data?.waiting_orders || []).forEach((o: any) => o.store?.lat && list.push({ id: `o${o.id}`, kind: 'store', lat: o.store.lat, lng: o.store.lng }));
    map.current?.send({ type: 'markers', list });
  }, []);
  useEffect(() => {
    draw(d);
    if (d) map.current?.send({ type: 'fit', points: (d.drivers || []).filter((x: any) => x.loc?.lat).map((x: any) => [x.loc.lng, x.loc.lat]) });
  }, [d]);

  useLive((m) => {
    if (m.t === 'driver_loc') { locs.current[m.driver_id] = m; draw(d); }
    else if (['driver_online', 'order_update', 'unassigned'].includes(m.t)) load();
    else if (m.t === 'sos') { notify('🚨 SOS', `${m.name}`); load(); }
    else if (m.t === 'issue') load();
  }, { fleet: true });

  const post = async (url: string, body: any = {}) => {
    try { await apiCall(url, { method: 'POST', body: JSON.stringify(body) }); await load(); }
    catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  };

  const drivers = d?.drivers || [];
  const approved = drivers.filter((x: any) => x.status === 'approved');
  const pending = drivers.filter((x: any) => x.status === 'pending');
  const online = approved.filter((x: any) => x.online);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScreenHeader title={t('mo.fleet.title')} onBack={() => router.back()} rightIcon="refresh" onRight={load} />
      <ZenMap ref={map} style={s.map} testID="fleet-map" />
      <View style={s.kpis}>
        <Kpi s={s} v={online.length} l={tSync('متصل', lang)} />
        <Kpi s={s} v={(d?.waiting_orders || []).length} l={tSync('بانتظار سائق', lang)} />
        <Kpi s={s} v={pending.length} l={tSync('طلبات انضمام', lang)} />
        <Kpi s={s} v={(d?.issues || []).length} l={tSync('بلاغات', lang)} alert />
      </View>
      <FilterTabs items={[{ key: 'drivers', label: tSync('السائقون', lang) }, { key: 'orders', label: tSync('الطلبات', lang) }, { key: 'plan', label: tSync('الجدولة', lang) },
        { key: 'requests', label: tSync('الانضمام والسحب', lang) }, { key: 'alerts', label: tSync('البلاغات', lang) }] as any} value={tab} onChange={(k: any) => setTab(k)} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 240 }}>
        {tab === 'drivers' && (approved.length ? approved.map((x: any) => (
          <View key={x.id} style={s.card} testID={`fleet-driver-${x.id}`}>
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: x.online ? colors.success : colors.onSurfaceTertiary }]} />
              <Text style={s.name}>{x.name}</Text>
              <Badge label={`★ ${x.rating}`} tone="gold" />
            </View>
            <Text style={s.sub}>{x.phone} · {x.vehicle?.model || '—'} · {x.active_orders} {tSync('طلب نشط', lang)} · {x.total_deliveries} {tSync('رحلة', lang)}</Text>
            <TouchableOpacity testID={`fleet-shift-${x.id}`} style={s.shiftRow} onPress={() => setShiftFor({ ...x, shift: { ...(x.shift || {}) }, pools: [...(x.pools || [])] })}>
              <Ionicons name="time" size={14} color={colors.brand} />
              <Text style={s.shiftTxt}>{(x.pools || []).map((p: string) => tSync(p === 'express' ? 'سريع' : 'مجدول', lang)).join(' + ')}{x.shift?.slot ? ` · ${x.shift.slot}` : ''}{x.shift?.start ? ` · ${x.shift.start}` : ''}</Text>
              <Ionicons name="create-outline" size={14} color={colors.onSurfaceTertiary} />
            </TouchableOpacity>
            {x.cash_in_hand > 0 ? (
              <TouchableOpacity style={s.cash} onPress={() => post(`/api/merchant/drivers/${x.id}/settle-cash`)}>
                <Ionicons name="cash" size={16} color={colors.onBrandPrimary} />
                <Text style={s.cashTxt}>{tSync('كاش بحوزته', lang)} {x.cash_in_hand.toFixed(2)} — {tSync('تم الاستلام', lang)}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )) : <EmptyState icon="car-outline" title={tSync('لا يوجد سائقون معتمدون', lang)} />)}

        {tab === 'orders' && ((d?.waiting_orders || []).length ? d.waiting_orders.map((o: any) => (
          <View key={o.id} style={s.card}>
            <View style={s.row}><Text style={s.name}>#{o.id.slice(-6).toUpperCase()}</Text><Text style={s.fee}>{Number(o.total).toFixed(2)} {tSync('ر.س', lang)}</Text></View>
            <Text style={s.sub} numberOfLines={2}>{o.customer?.address}</Text>
            <SecondaryButton label={tSync('تعيين سائق', lang)} icon="person-add" onPress={() => setAssignFor(o)} />
          </View>
        )) : <EmptyState icon="checkmark-done-outline" title={tSync('كل الطلبات الجاهزة لها سائق', lang)} />)}

        {tab === 'plan' && (<>
          <View style={s.row}>
            <TouchableOpacity testID="plan-prev" style={[s.chip, s.navBtn]} onPress={() => setPlanOffset((v) => Math.max(0, v - 1))}><Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={18} color={colors.brand} /></TouchableOpacity>
            <Text style={[s.name, { textAlign: 'center' }]}>{planOffset === 0 ? tSync('اليوم', lang) : planOffset === 1 ? tSync('الغد', lang) : ''} {plan?.date || planDate}</Text>
            <TouchableOpacity testID="plan-next" style={[s.chip, s.navBtn]} onPress={() => setPlanOffset((v) => Math.min(7, v + 1))}><Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.brand} /></TouchableOpacity>
          </View>
          <View style={s.row}>
            <Text style={s.sub}>{tSync('التوزيع التلقائي يتم مساء اليوم السابق، ويمكنك التوزيع يدوياً الآن', lang)}</Text>
            <SecondaryButton testID="plan-run" label={tSync('وزّع الآن', lang)} icon="shuffle" onPress={() => loadPlan(true)} />
          </View>
          {(plan?.groups || []).length ? plan.groups.map((g: any) => (
            <View key={g.driver_user_id || 'none'} style={s.card}>
              <Text style={[s.name, !g.driver_user_id && { color: colors.error }]}>{g.driver_user_id ? g.driver_name : tSync('بدون سائق (أضف سائقين لهذه الفترة)', lang)} · {g.orders.length}</Text>
              {g.orders.map((o: any) => (
                <TouchableOpacity key={o.id} testID={`plan-order-${o.id}`} style={s.pick} onPress={() => setMoveFor(o)}>
                  <Text style={s.pickTxt}>{o.seq ?? '—'}. {o.address}</Text><Text style={s.sub}>{o.slot}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )) : <EmptyState icon="calendar-outline" title={tSync('لا توجد طلبات مجدولة للغد بعد', lang)} />}
        </>)}

        {tab === 'requests' && (<>
          {pending.map((x: any) => (
            <View key={x.id} style={s.card}>
              <Text style={s.name}>{x.name}</Text>
              <Text style={s.sub}>{x.phone} · {x.vehicle?.type || ''} {x.vehicle?.model || ''} {x.vehicle?.plate || ''}</Text>
              <Text style={s.sub}>{tSync('المستندات', lang)}: {Object.keys(x.docs || {}).length}/4</Text>
              <View style={s.row}>
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.success }]} onPress={() => post(`/api/merchant/drivers/${x.id}/approve`, { approve: true })}><TX style={s.btnTxt}>قبول</TX></TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.error }]} onPress={() => post(`/api/merchant/drivers/${x.id}/approve`, { approve: false })}><TX style={s.btnTxt}>رفض</TX></TouchableOpacity>
              </View>
            </View>
          ))}
          {(d?.payouts || []).map((p: any) => (
            <View key={p.id} style={s.card}>
              <View style={s.row}><Text style={s.name}>{p.driver_name}</Text><Text style={s.fee}>{Number(p.amount).toFixed(2)} {tSync('ر.س', lang)}</Text></View>
              <TX style={s.sub}>طلب سحب أرباح</TX>
              <View style={s.row}>
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.success }]} onPress={() => post(`/api/merchant/driver-payouts/${p.id}`, { paid: true })}><TX style={s.btnTxt}>تم التحويل</TX></TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: colors.error }]} onPress={() => post(`/api/merchant/driver-payouts/${p.id}`, { paid: false })}><TX style={s.btnTxt}>رفض</TX></TouchableOpacity>
              </View>
            </View>
          ))}
          {!pending.length && !(d?.payouts || []).length ? <EmptyState icon="file-tray-outline" title={tSync('لا توجد طلبات', lang)} /> : null}
        </>)}

        {tab === 'alerts' && ((d?.issues || []).length ? d.issues.map((i: any) => (
          <View key={i.id} style={[s.card, i.type === 'sos' && { borderColor: colors.error }]}>
            <View style={s.row}><Text style={[s.name, i.type === 'sos' && { color: colors.error }]}>{i.type === 'sos' ? '🚨 SOS' : i.type}</Text><Text style={s.sub}>{new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>
            <Text style={s.sub}>{i.driver_name}{i.order_id ? ` · #${i.order_id.slice(-6).toUpperCase()}` : ''}</Text>
            <SecondaryButton label={tSync('تم الحل', lang)} icon="checkmark" onPress={() => post(`/api/merchant/driver-issues/${i.id}/resolve`)} />
          </View>
        )) : <EmptyState icon="shield-checkmark-outline" title={tSync('لا توجد بلاغات', lang)} />)}
      </ScrollView>

      <Modal visible={!!shiftFor} transparent animationType="fade" onRequestClose={() => setShiftFor(null)}>
        <View style={s.overlay}>
          <View style={s.modal} testID="shift-modal">
            <Text style={s.name}>{shiftFor?.name}</Text>
            <TX style={s.sub}>نوع الطلبات</TX>
            <View style={s.row}>{(['express', 'standard'] as const).map((p) => {
              const on = shiftFor?.pools?.includes(p);
              return (
                <TouchableOpacity key={p} testID={`pool-${p}`} style={[s.chip, on && s.chipOn]} onPress={() => setShiftFor({ ...shiftFor, pools: on ? shiftFor.pools.filter((x: string) => x !== p) : [...shiftFor.pools, p] })}>
                  <Text style={[s.chipTxt, on && { color: colors.onBrandPrimary }]}>{tSync(p === 'express' ? 'سريع (حار)' : 'مجدول (عادي)', lang)}</Text>
                </TouchableOpacity>);
            })}</View>
            <TX style={s.sub}>الوردية</TX>
            <View style={[s.row, { flexWrap: 'wrap', justifyContent: 'flex-start' }]}>{[{ label: '' }, ...slots].map((sl: any) => (
              <TouchableOpacity key={sl.label || 'all'} style={[s.chip, (shiftFor?.shift?.slot || '') === sl.label && s.chipOn]}
                onPress={() => setShiftFor({ ...shiftFor, shift: { ...shiftFor.shift, slot: sl.label, start: sl.start || shiftFor.shift?.start } })}>
                <Text style={[s.chipTxt, (shiftFor?.shift?.slot || '') === sl.label && { color: colors.onBrandPrimary }]}>{sl.label ? tSync(sl.label, lang) : tSync('كل الفترات', lang)}</Text>
              </TouchableOpacity>
            ))}</View>
            <TX style={s.sub}>بداية الدوام</TX>
            <TextInput testID="shift-start" style={s.input} value={shiftFor?.shift?.start || ''} placeholder="08:00" placeholderTextColor={colors.onSurfaceTertiary}
              onChangeText={(t) => setShiftFor({ ...shiftFor, shift: { ...shiftFor.shift, start: t } })} />
            <SecondaryButton testID="shift-save" label={tSync('حفظ', lang)} icon="save" onPress={saveShift} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!moveFor} transparent animationType="fade" onRequestClose={() => setMoveFor(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMoveFor(null)}>
          <View style={s.modal}>
            <TX style={s.name}>نقل الطلب إلى سائق</TX>
            {approved.map((x: any) => (
              <TouchableOpacity key={x.id} testID={`move-to-${x.user_id}`} style={s.pick} onPress={async () => { const o = moveFor; setMoveFor(null);
                try { await apiCall('/api/merchant/delivery/plan/move', { method: 'POST', body: JSON.stringify({ order_id: o.id, driver_user_id: x.user_id }) }); loadPlan(); } catch (e: any) { notify(tSync('خطأ', lang), e.message); } }}>
                <Text style={s.pickTxt}>{x.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!assignFor} transparent animationType="fade" onRequestClose={() => setAssignFor(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setAssignFor(null)}>
          <View style={s.modal}>
            <TX style={s.name}>اختر السائق</TX>
            {online.length ? online.map((x: any) => (
              <TouchableOpacity key={x.id} style={s.pick} onPress={() => { const o = assignFor; setAssignFor(null); post(`/api/merchant/orders/${o.id}/assign`, { driver_user_id: x.user_id }); }}>
                <Text style={s.pickTxt}>{x.name}</Text><Text style={s.sub}>{x.active_orders} {tSync('طلب نشط', lang)}</Text>
              </TouchableOpacity>
            )) : <TX style={s.sub}>لا يوجد سائق متصل الآن</TX>}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function Kpi({ s, v, l, alert }: any) {
  return <View style={s.kpi}><Text style={[s.kpiV, alert && v > 0 && { color: colors.error }]}>{v}</Text><Text style={s.kpiL}>{l}</Text></View>;
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    map: { height: 260, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
    kpis: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
    kpi: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    kpiV: { color: colors.brand, fontSize: 20, fontWeight: '900' },
    kpiL: { color: colors.onSurfaceTertiary, fontSize: 11 },
    card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 6, borderWidth: 1, borderColor: colors.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
    dot: { width: 10, height: 10, borderRadius: 5 },
    name: { color: colors.onSurface, fontWeight: '800', fontSize: 15, flex: 1 },
    sub: { color: colors.onSurfaceTertiary, fontSize: 12 },
    fee: { color: colors.brand, fontWeight: '900' },
    cash: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
    cashTxt: { color: colors.onBrandPrimary, fontWeight: '700', fontSize: 12 },
    btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
    btnTxt: { color: colors.onSuccess, fontWeight: '800' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
    modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    pick: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: 'row', justifyContent: 'space-between' },
    pickTxt: { color: colors.onSurface, fontWeight: '700' },
    shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    shiftTxt: { color: colors.brand, fontSize: 12, fontWeight: '700', flex: 1 },
    chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: 6 },
    chipOn: { backgroundColor: colors.brand },
    navBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 0 },
    chipTxt: { color: colors.brand, fontWeight: '700', fontSize: 13 },
    input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, padding: 12 },
  }), [themeKey]);
}
