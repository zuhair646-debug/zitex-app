/** Merchant fleet: live map of drivers, waiting orders (manual assign), approvals, cash, payouts, SOS/issues. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
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

type Tab = 'drivers' | 'orders' | 'requests' | 'alerts';

export default function Fleet() {
  const s = useStyles();
  const { lang, t } = useT();
  const router = useRouter();
  const { apiCall } = useAuth();
  const map = useRef<ZenMapHandle>(null);
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('drivers');
  const [assignFor, setAssignFor] = useState<any>(null);
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
      <FilterTabs items={[{ key: 'drivers', label: tSync('السائقون', lang) }, { key: 'orders', label: tSync('الطلبات', lang) },
        { key: 'requests', label: tSync('الانضمام والسحب', lang) }, { key: 'alerts', label: tSync('البلاغات', lang) }] as any} value={tab} onChange={(k: any) => setTab(k)} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 140 }}>
        {tab === 'drivers' && (approved.length ? approved.map((x: any) => (
          <View key={x.id} style={s.card} testID={`fleet-driver-${x.id}`}>
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: x.online ? colors.success : colors.onSurfaceTertiary }]} />
              <Text style={s.name}>{x.name}</Text>
              <Badge label={`★ ${x.rating}`} tone="gold" />
            </View>
            <Text style={s.sub}>{x.phone} · {x.vehicle?.model || '—'} · {x.active_orders} {tSync('طلب نشط', lang)} · {x.total_deliveries} {tSync('رحلة', lang)}</Text>
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
  }), [themeKey]);
}
