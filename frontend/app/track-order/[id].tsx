/** Customer live tracking: driver moves on our own map in real time, ETA, OTP, chat, call, rating. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { colors, spacing, radius } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { TX, tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';
import ZenMap, { ZenMapHandle } from '../../src/components/ZenMap';
import { PrimaryButton } from '../../src/components/ui';
import { useLive } from '../../src/utils/live';
import { notify } from '../../src/utils/notify';

const STAGES = [
  { key: 'processing', label: 'قيد التحضير', icon: 'cube' },
  { key: 'assigned', label: 'السائق في الطريق للمتجر', icon: 'storefront' },
  { key: 'picked_up', label: 'الطلب في الطريق إليك', icon: 'bicycle' },
  { key: 'delivered', label: 'تم التسليم', icon: 'checkmark-done' },
];
const stageIdx = (st: string) => (st === 'delivered' ? 3 : st === 'picked_up' ? 2 : st === 'assigned' ? 1 : 0);

export default function TrackOrder() {
  const s = useStyles();
  const { lang } = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiCall } = useAuth();
  const map = useRef<ZenMapHandle>(null);
  const [o, setO] = useState<any>(null);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);
  const [tipAmt, setTipAmt] = useState(0);
  const [tipped, setTipped] = useState(false);
  const sendTip = async () => {
    try { await apiCall(`/api/orders/${id}/tip`, { method: 'POST', body: JSON.stringify({ amount: tipAmt }) }); setTipped(true); notify(tSync('شكراً لكرمك 🌟', lang), tSync('وصلت الإكرامية للسائق', lang)); }
    catch (e: any) { notify(tSync('تنبيه', lang), e.message); }
  };
  const fitted = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await apiCall(`/api/orders/${id}/live`);
      setO(d); setRated(d.rated);
      const list: any[] = [];
      if (d.store?.lat) list.push({ id: 'store', kind: 'store', lat: d.store.lat, lng: d.store.lng });
      if (d.customer?.lat) list.push({ id: 'cust', kind: 'customer', lat: d.customer.lat, lng: d.customer.lng });
      map.current?.send({ type: 'markers', list });
      if (d.driver?.loc) map.current?.send({ type: 'driver', loc: d.driver.loc });
      map.current?.send({ type: 'route', coords: d.route || [] });
      if (!fitted.current) {
        fitted.current = true;
        map.current?.send({ type: 'fit', points: [d.driver?.loc && [d.driver.loc.lng, d.driver.loc.lat], d.customer?.lat && [d.customer.lng, d.customer.lat], d.store?.lat && [d.store.lng, d.store.lat]].filter(Boolean), padding: 80 });
      }
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  }, [id]);
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]); // ETA/route refresh; position is live

  useLive((m) => {
    if (m.t === 'driver_loc') map.current?.send({ type: 'driver', loc: { lat: m.lat, lng: m.lng, heading: m.heading } });
    else if (m.t === 'order_update' && m.order_id === id) load();
    else if (m.t === 'near' && m.order_id === id) setO((x: any) => x && ({ ...x, near: true }));
  }, { orderId: id });

  const rate = async () => {
    if (!stars) return;
    try { await apiCall(`/api/orders/${id}/rate-driver`, { method: 'POST', body: JSON.stringify({ stars }) }); setRated(true); notify(tSync('شكراً لتقييمك 🌟', lang)); }
    catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  };

  const idx = o ? stageIdx(o.status) : 0;
  const drv = o?.driver;
  return (
    <View style={s.root}>
      <ZenMap ref={map} style={s.map} testID="track-map" />
      <SafeAreaView edges={['top']} style={s.top} pointerEvents="box-none">
        <TouchableOpacity style={s.back} onPress={() => router.back()} testID="track-back"><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      </SafeAreaView>
      <ScrollView style={s.sheet} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 }}>
        {o ? (<>
          <View style={s.headRow}>
            <View style={{ flex: 1 }}>
              <TX style={s.stage}>{STAGES[idx].label}</TX>
              <Text style={s.no}>#{o.id.slice(-8).toUpperCase()}</Text>
            </View>
            {o.eta_min && o.status !== 'delivered' ? (<View style={s.eta}><Text style={s.etaMin}>{o.eta_min}</Text><TX style={s.etaLbl}>دقيقة</TX></View>) : null}
          </View>
          <View style={s.progress}>{STAGES.map((st, i) => <View key={st.key} style={[s.seg, i <= idx && { backgroundColor: colors.brand }]} />)}</View>
          {o.near && o.status === 'picked_up' && o.step !== 'at_customer' ? (
            <View style={s.near} testID="track-near"><Ionicons name="notifications" size={18} color={colors.onBrandPrimary} />
              <TX style={s.nearTxt}>طلبك قريب، خلك مستعد لاستلامه</TX></View>
          ) : null}
          {o.otp && o.status !== 'delivered' && drv ? (
            <View style={s.otp} testID="track-otp">
              <TX style={s.otpLbl}>رمز الاستلام — أعطه للسائق عند التسليم</TX>
              <Text style={s.otpVal}>{o.otp}</Text>
            </View>
          ) : null}
          {drv ? (
            <View style={s.drv}>
              {drv.photo_url ? <Image source={{ uri: drv.photo_url }} style={s.avatar} /> : <View style={s.avatar}><Ionicons name="person" size={24} color={colors.brand} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.drvName}>{drv.name}</Text>
                <Text style={s.drvSub}>★ {drv.rating} · {drv.trips} {tSync('رحلة', lang)}{drv.vehicle?.model ? ` · ${drv.vehicle.model}` : ''}{drv.vehicle?.plate ? ` · ${drv.vehicle.plate}` : ''}</Text>
              </View>
              <TouchableOpacity testID="track-chat" style={s.round} onPress={() => router.push(`/chat/${o.id}`)}><Ionicons name="chatbubbles" size={20} color={colors.brand} /></TouchableOpacity>
              <TouchableOpacity testID="track-call" style={s.round} onPress={() => Linking.openURL(`tel:${drv.phone}`)}><Ionicons name="call" size={20} color={colors.brand} /></TouchableOpacity>
            </View>
          ) : <TX style={s.wait}>نجهز طلبك وسيتم تعيين أقرب سائق قريباً</TX>}
          {o.status === 'delivered' && drv && !rated ? (
            <View style={s.rate} testID="track-rate">
              <TX style={s.stage}>كيف كانت تجربة التوصيل؟</TX>
              <View style={s.stars}>{[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setStars(n)} testID={`star-${n}`}><Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color={colors.brand} /></TouchableOpacity>
              ))}</View>
              <PrimaryButton testID="rate-submit" label={tSync('إرسال التقييم', lang)} onPress={rate} disabled={!stars} />
            </View>
          ) : null}
          {o.status === 'delivered' && drv && !o.tipped && !tipped ? (
            <View style={s.rate} testID="track-tip">
              <TX style={s.stage}>🎁 إكرامية للسائق (اختياري)</TX>
              <View style={s.stars}>{[5, 10, 15, 20].map((n) => (
                <TouchableOpacity key={n} testID={`tip-${n}`} style={[s.tipChip, tipAmt === n && { backgroundColor: colors.brand }]} onPress={() => setTipAmt(n)}>
                  <Text style={[s.tipTxt, tipAmt === n && { color: colors.onBrandPrimary }]}>{n} {tSync('ر.س', lang)}</Text>
                </TouchableOpacity>
              ))}</View>
              <PrimaryButton testID="tip-send" label={tSync('إرسال الإكرامية من المحفظة', lang)} onPress={sendTip} disabled={!tipAmt} />
            </View>
          ) : null}
          {o.queue_waiting ? <TX style={s.wait}>طلبك مع السائق ضمن جولة التوصيل، وسنشعرك فور توجهه إليك</TX> : null}
          <View style={s.addr}><Ionicons name="location" size={18} color={colors.brand} /><Text style={s.addrTxt}>{o.customer?.address}</Text></View>
        </>) : null}
      </ScrollView>
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    map: { height: '55%' },
    top: { position: 'absolute', top: 0, left: 0 },
    back: { margin: spacing.lg, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    sheet: { flex: 1, marginTop: -20, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stage: { color: colors.onSurface, fontSize: 19, fontWeight: '900' },
    no: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
    eta: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6 },
    etaMin: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: '900' },
    etaLbl: { color: colors.onBrandPrimary, fontSize: 11 },
    progress: { flexDirection: 'row', gap: 4 },
    seg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surfaceTertiary },
    otp: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.brand },
    near: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
    nearTxt: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 14, flex: 1 },
    otpLbl: { color: colors.onSurfaceSecondary, fontSize: 12 },
    otpVal: { color: colors.brand, fontSize: 34, fontWeight: '900', letterSpacing: 12 },
    drv: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.brand },
    drvName: { color: colors.onSurface, fontWeight: '800', fontSize: 16 },
    drvSub: { color: colors.onSurfaceTertiary, fontSize: 12 },
    round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
    wait: { color: colors.onSurfaceSecondary, textAlign: 'center' },
    rate: { alignItems: 'center', gap: spacing.sm },
    stars: { flexDirection: 'row', gap: spacing.sm },
    tipChip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center' },
    tipTxt: { color: colors.brand, fontWeight: '800' },
    addr: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    addrTxt: { color: colors.onSurfaceSecondary, flex: 1 },
  }), [themeKey]);
}
