import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../_layout';
import { colors, spacing, radius } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { TX, tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';
import ZenMap, { ZenMapHandle } from '../../src/components/ZenMap';
import SwipeButton from '../../src/components/driver/SwipeButton';
import OfferSheet from '../../src/components/driver/OfferSheet';
import ActiveDelivery from '../../src/components/driver/ActiveDelivery';
import ProofModal from '../../src/components/driver/ProofModal';
import ZenBrand from '../../src/components/driver/ZenBrand';
import { PrimaryButton, SecondaryButton } from '../../src/components/ui';
import { useLive } from '../../src/utils/live';
import { startBeacon, stopBeacon } from '../../src/utils/driverTracking';
import { notify } from '../../src/utils/notify';

type Perm = 'ok' | 'ask' | 'blocked';

export default function DriverHome() {
  const s = useStyles();
  const { lang } = useT();
  const { apiCall } = useAuth();
  const map = useRef<ZenMapHandle>(null);
  const [home, setHome] = useState<any>(null);
  const [open, setOpen] = useState<any[]>([]);
  const [me, setMe] = useState<{ lat: number; lng: number; heading: number } | null>(null);
  const [perm, setPerm] = useState<Perm | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [eta, setEta] = useState<{ min: number; km: number } | null>(null);
  const [following, setFollowing] = useState(true);
  const [conn, setConn] = useState(true);
  const [queue, setQueue] = useState<any>(null);
  const pickupAll = async () => {
    setBusy(true);
    try { await apiCall('/api/driver/queue/pickup', { method: 'POST' }); await load(); setFollowing(true); }
    catch (e: any) { notify(tSync('تنبيه', lang), e.message); }
    finally { setBusy(false); }
  };
  const lastRoute = useRef(0);

  const load = useCallback(async () => {
    try {
      const h = await apiCall('/api/driver/home');
      setHome(h);
      setQueue(await apiCall('/api/driver/queue').catch(() => null));
      if (h.online && !h.active.length) setOpen(await apiCall('/api/driver/available-orders').catch(() => []));
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLive((m) => {
    if (m.t === 'offer') setHome((h: any) => h && ({ ...h, offer: m.offer }));
    else if (m.t === 'offer_gone') setHome((h: any) => h && ({ ...h, offer: h.offer?.id === m.offer_id ? null : h.offer }));
    else if (m.t === 'assigned' || m.t === 'order_update') load();
    else if (m.t === 'connected') setConn(true);
    else if (m.t === 'disconnected') setConn(false);
  });

  const active = home?.active?.[0];

  // Map content follows state
  useEffect(() => {
    if (!home) return;
    const list: any[] = [];
    if (active) {
      if (active.store?.lat) list.push({ id: 'store', kind: 'store', lat: active.store.lat, lng: active.store.lng });
      if (active.customer?.lat) list.push({ id: 'cust', kind: 'customer', lat: active.customer.lat, lng: active.customer.lng });
    } else if (home.offer?.order) {
      const o = home.offer.order;
      if (o.store?.lat) list.push({ id: 'store', kind: 'store', lat: o.store.lat, lng: o.store.lng });
      if (o.customer?.lat) list.push({ id: 'cust', kind: 'customer', lat: o.customer.lat, lng: o.customer.lng });
    }
    map.current?.send({ type: 'markers', list });
    if (!active) { map.current?.send({ type: 'route', coords: [] }); setEta(null); }
    if (home.online && !active) apiCall('/api/driver/hotzones').then((r) => map.current?.send({ type: 'heat', points: r.points })).catch(() => {});
    else map.current?.send({ type: 'heat', points: [] });
  }, [home]);

  // Route + ETA (own routing engine) — refresh on step change or every 20s
  useEffect(() => {
    if (!active || !me) return;
    const tgt = ['to_store', 'at_store'].includes(active.step) ? active.store : active.customer;
    if (!tgt?.lat || Date.now() - lastRoute.current < 20000) return;
    lastRoute.current = Date.now();
    apiCall(`/api/map/route?from_lat=${me.lat}&from_lng=${me.lng}&to_lat=${tgt.lat}&to_lng=${tgt.lng}`).then((r) => {
      map.current?.send({ type: 'route', coords: r.coords });
      setEta({ min: Math.max(1, Math.round(r.duration_s / 60)), km: r.distance_m / 1000 });
    }).catch(() => {});
  }, [active?.id, active?.step, me]);
  useEffect(() => { lastRoute.current = 0; }, [active?.step]);

  const onLoc = useCallback((c: Location.LocationObjectCoords) => {
    const p = { lat: c.latitude, lng: c.longitude, heading: c.heading || 0 };
    setMe(p);
    map.current?.send({ type: 'driver', loc: p });
  }, []);

  // Location permission (check → explain → ask → settings)
  const checkPerm = useCallback(async () => {
    const p = await Location.getForegroundPermissionsAsync();
    const st: Perm = p.granted ? 'ok' : p.canAskAgain ? 'ask' : 'blocked';
    setPerm(st);
    return st;
  }, []);
  useEffect(() => { checkPerm(); }, []);
  useEffect(() => {
    if (perm === 'ok' && home?.online) startBeacon(onLoc).catch(() => {});
    else if (perm === 'ok') Location.getCurrentPositionAsync({}).then((p) => { onLoc(p.coords); map.current?.send({ type: 'center', lat: p.coords.latitude, lng: p.coords.longitude, zoom: 16.5 }); }).catch(() => {});
  }, [perm, home?.online]);
  useEffect(() => { map.current?.send({ type: 'follow', value: following }); }, [following]);

  const askPerm = async () => {
    const r = await Location.requestForegroundPermissionsAsync();
    if (r.granted && Platform.OS !== 'web') {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (!bg.granted && bg.canAskAgain) await Location.requestBackgroundPermissionsAsync().catch(() => {});
    }
    await checkPerm();
  };

  const toggleOnline = async () => {
    if (!home) return;
    const v = !home.online;
    if (v && (await checkPerm()) !== 'ok') return;
    setBusy(true);
    try {
      await apiCall('/api/driver/online', { method: 'POST', body: JSON.stringify({ online: v }) });
      if (!v) await stopBeacon();
      await load();
    } catch (e: any) { notify(tSync('تنبيه', lang), e.message); }
    finally { setBusy(false); }
  };

  const accept = async () => {
    if (!home?.offer) return;
    setBusy(true);
    try { await apiCall(`/api/driver/offers/${home.offer.id}/accept`, { method: 'POST' }); await load(); setFollowing(true); }
    catch (e: any) { notify(tSync('تنبيه', lang), e.message); await load(); }
    finally { setBusy(false); }
  };
  const decline = async () => {
    if (!home?.offer) return;
    await apiCall(`/api/driver/offers/${home.offer.id}/decline`, { method: 'POST' }).catch(() => {});
    setHome({ ...home, offer: null });
  };
  const claim = async (oid: string) => {
    try { await apiCall(`/api/driver/orders/${oid}/claim`, { method: 'POST' }); await load(); }
    catch (e: any) { notify(tSync('تنبيه', lang), e.message); load(); }
  };
  const step = async (st: string) => {
    try { await apiCall(`/api/driver/orders/${active.id}/step`, { method: 'POST', body: JSON.stringify({ step: st }) }); await load(); }
    catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  };
  const complete = async (p: any) => {
    const r = await apiCall(`/api/driver/orders/${active.id}/complete`, { method: 'POST', body: JSON.stringify(p) });
    setProofOpen(false);
    notify(tSync('✅ تم التسليم', lang), `${tSync('ربحك من الرحلة', lang)}: ${Number(r.earnings).toFixed(2)} ${tSync('ر.س', lang)}`);
    await load();
  };
  const issue = async (t: string) => {
    await apiCall(`/api/driver/orders/${active.id}/issue`, { method: 'POST', body: JSON.stringify({ type: t }) }).catch(() => {});
    notify(tSync('تم إرسال البلاغ للمتجر', lang));
  };
  const sos = async () => {
    await apiCall('/api/driver/sos', { method: 'POST', body: JSON.stringify({ type: 'sos', lat: me?.lat || 0, lng: me?.lng || 0 }) }).catch(() => {});
    notify(tSync('🚨 تم إرسال الاستغاثة', lang), tSync('تم إبلاغ المتجر بموقعك. للطوارئ اتصل 911', lang));
  };

  return (
    <View style={s.root}>
      <ZenMap ref={map} style={StyleSheet.absoluteFill} testID="driver-map" brand={false}
        onEvent={(e) => { if (e.type === 'follow') setFollowing(e.value); }} />

      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <View style={s.topRow} pointerEvents="box-none">
          <View style={s.chip} testID="driver-today-chip">
            <Ionicons name="cash-outline" size={16} color={colors.brand} />
            <Text style={s.chipTxt}>{Number(home?.today_earnings || 0).toFixed(2)} {tSync('ر.س', lang)}</Text>
            <Text style={s.chipSub}>· {home?.today_trips || 0} {tSync('رحلة', lang)}</Text>
          </View>
          <ZenBrand />
          <TouchableOpacity testID="driver-sos" style={s.sos} onPress={sos}><Text style={s.sosTxt}>SOS</Text></TouchableOpacity>
        </View>
        {!conn && home?.online ? <View style={s.banner}><TX style={s.bannerTxt}>جاري إعادة الاتصال…</TX></View> : null}
      </SafeAreaView>

      <View style={s.fabs} pointerEvents="box-none">
        <TouchableOpacity testID="driver-recenter" style={[s.fab, following && { borderColor: colors.brand }]}
          onPress={() => { setFollowing(true); if (me) map.current?.send({ type: 'center', lat: me.lat, lng: me.lng, zoom: 16 }); }}>
          <Ionicons name="locate" size={22} color={following ? colors.brand : colors.onSurface} />
        </TouchableOpacity>
      </View>

      <View style={s.bottom}>
        {!home ? null : home.offer ? (
          <OfferSheet offer={home.offer} onAccept={accept} onDecline={decline} busy={busy} />
        ) : active ? (
          <>
            {active.plan_seq ? (
              <View style={s.stopTag}><Text style={s.stopTxt}>{tSync('التوصيلة', lang)} {active.plan_seq} / {(queue?.orders || []).length || home.active.length}</Text></View>
            ) : null}
            <ActiveDelivery order={active} eta={eta} navApp={home.nav_app} onStep={step} onDeliver={() => setProofOpen(true)} onIssue={issue} />
          </>
        ) : queue?.orders?.length && !queue.started ? (
          <View style={s.idle} testID="driver-queue">
            <View style={s.statusRow}><Ionicons name="calendar" size={20} color={colors.brand} />
              <TX style={s.statusTxt}>طلبات ورديتك اليوم</TX></View>
            <Text style={s.permTxt}>{queue.orders.length} {tSync('طلب', lang)}{queue.shift?.start ? ` · ${tSync('تبدأ الساعة', lang)} ${queue.shift.start}` : ''}{queue.shift?.slot ? ` · ${queue.shift.slot}` : ''}</Text>
            <FlatList data={queue.orders} keyExtractor={(o: any) => o.id} style={{ maxHeight: 150 }}
              renderItem={({ item }: any) => (
                <View style={s.qRow}><Text style={s.qSeq}>{item.plan_seq}</Text><Text style={s.qAddr} numberOfLines={1}>{item.customer?.address}</Text>
                  {item.cod ? <Ionicons name="cash" size={14} color={colors.brand} /> : null}</View>
              )} />
            <SwipeButton testID="driver-queue-pickup" label={tSync('اسحب: استلمت كل الطلبات — ابدأ المسار', lang)} onConfirm={pickupAll} loading={busy} />
          </View>
        ) : (
          <View style={s.idle}>
            {home.status !== 'approved' ? (
              <View style={s.permBox}><Ionicons name="hourglass" size={28} color={colors.brand} /><TX style={s.permTitle}>حسابك قيد المراجعة</TX><TX style={s.permTxt}>سيتم إشعارك فور موافقة المتجر على مستنداتك.</TX></View>
            ) : perm && perm !== 'ok' ? (
              <View style={s.permBox} testID="driver-perm">
                <Ionicons name="location" size={28} color={colors.brand} />
                <TX style={s.permTitle}>شارك موقعك لتستقبل الطلبات</TX>
                <TX style={s.permTxt}>نرسل لك أقرب الطلبات، ويشوف العميل وصولك لحظة بلحظة.</TX>
                {perm === 'ask' ? <PrimaryButton label={tSync('السماح بالموقع', lang)} icon="location" onPress={askPerm} />
                  : <SecondaryButton label={tSync('فتح الإعدادات', lang)} icon="settings" onPress={() => Linking.openSettings()} />}
              </View>
            ) : (
              <>
                <View style={s.statusRow}>
                  <View style={[s.dot, { backgroundColor: home.online ? colors.success : colors.onSurfaceTertiary }]} />
                  <TX style={s.statusTxt}>{home.online ? 'متصل — بانتظار الطلبات' : 'غير متصل'}</TX>
                </View>
                {home.online && open.length ? (
                  <FlatList data={open} keyExtractor={(o) => o.id} horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 96 }}
                    contentContainerStyle={{ gap: spacing.sm }}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={s.openCard} onPress={() => claim(item.id)} testID={`open-order-${item.id}`}>
                        <Text style={s.openFee}>{Number(item.delivery_fee || 0).toFixed(0)} {tSync('ر.س', lang)}</Text>
                        <Text style={s.openAddr} numberOfLines={2}>{item.address}</Text>
                        <TX style={s.openTake}>اضغط للأخذ</TX>
                      </TouchableOpacity>
                    )} />
                ) : null}
                <SwipeButton testID="driver-online-swipe" label={tSync(home.online ? 'اسحب لقطع الاتصال' : 'اسحب لبدء العمل', lang)}
                  tone={home.online ? 'error' : 'success'} onConfirm={toggleOnline} loading={busy} />
              </>
            )}
          </View>
        )}
      </View>
      {active ? <ProofModal visible={proofOpen} order={active} onClose={() => setProofOpen(false)} onSubmit={complete} /> : null}
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    top: { position: 'absolute', top: 0, left: 0, right: 0 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 44, borderWidth: 1, borderColor: colors.brand },
    chipTxt: { color: colors.onSurface, fontWeight: '900', fontSize: 16 },
    chipSub: { color: colors.onSurfaceTertiary, fontSize: 13 },
    sos: { width: 52, height: 44, borderRadius: radius.pill, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
    sosTxt: { color: colors.onError, fontWeight: '900' },
    banner: { alignSelf: 'center', marginTop: spacing.sm, backgroundColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
    bannerTxt: { color: colors.onWarning, fontWeight: '700', fontSize: 12 },
    fabs: { position: 'absolute', right: spacing.lg, bottom: 300 },
    fab: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    idle: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderColor: colors.border },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
    dot: { width: 10, height: 10, borderRadius: 5 },
    statusTxt: { color: colors.onSurface, fontSize: 16, fontWeight: '800' },
    permBox: { alignItems: 'center', gap: spacing.sm },
    permTitle: { color: colors.onSurface, fontSize: 17, fontWeight: '900', textAlign: 'center' },
    permTxt: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
    openCard: { width: 170, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.brand },
    openFee: { color: colors.brand, fontWeight: '900', fontSize: 16 },
    openAddr: { color: colors.onSurfaceSecondary, fontSize: 12 },
    openTake: { color: colors.onSurface, fontSize: 11, fontWeight: '700', marginTop: 2 },
    stopTag: { alignSelf: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginBottom: 6 },
    stopTxt: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 12 },
    qRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
    qSeq: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, color: colors.onBrandPrimary, textAlign: 'center', lineHeight: 24, fontWeight: '900', overflow: 'hidden' },
    qAddr: { flex: 1, color: colors.onSurface, fontSize: 13 },
  }), [themeKey]);
}
