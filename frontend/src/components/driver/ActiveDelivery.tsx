/** Active delivery panel: stepper, contact actions, navigation and the next-step swipe. */
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { TX, tSync } from '../../useAutoT';
import { useT } from '../../i18n';
import SwipeButton from './SwipeButton';

const STEPS = ['to_store', 'at_store', 'picked_up', 'at_customer'];
const ISSUES = ['العميل لا يرد', 'العنوان غير صحيح', 'الطلب غير جاهز', 'حادث أو عطل بالمركبة', 'أخرى'];

type Props = { order: any; eta?: { min: number; km: number } | null; navApp: string; onStep: (step: string) => Promise<void>; onDeliver: () => void; onIssue: (t: string) => void };

export function openNav(lat: number, lng: number, app: string) {
  const urls: Record<string, string> = {
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    apple: `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
    google: Platform.OS === 'android' ? `google.navigation:q=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
  };
  Linking.openURL(urls[app] || urls.google).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
}

export default function ActiveDelivery({ order, eta, navApp, onStep, onDeliver, onIssue }: Props) {
  const s = useStyles();
  const router = useRouter();
  const { lang } = useT();
  const [busy, setBusy] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const idx = Math.max(0, STEPS.indexOf(order.step));
  const atStorePhase = idx <= 1;
  const tgt = atStorePhase ? order.store : order.customer;
  const cta: Record<string, { label: string; next?: string }> = {
    to_store: { label: 'اسحب: وصلت للمتجر', next: 'at_store' },
    at_store: { label: 'اسحب: استلمت الطلب', next: 'picked_up' },
    picked_up: { label: 'اسحب: وصلت للعميل', next: 'at_customer' },
    at_customer: { label: 'اسحب: تسليم الطلب' },
  };
  const c = cta[order.step] || cta.to_store;
  const go = async () => {
    if (!c.next) { onDeliver(); return; }
    setBusy(true); try { await onStep(c.next); } finally { setBusy(false); }
  };

  return (
    <View style={s.sheet} testID="active-delivery">
      <View style={s.stepper}>
        {[tSync('للمتجر', lang), tSync('استلام', lang), tSync('للعميل', lang), tSync('تسليم', lang)].map((l, i) => (
          <View key={i} style={s.stepItem}>
            <View style={[s.dot, i <= idx && s.dotOn]}>{i < idx ? <Ionicons name="checkmark" size={12} color={colors.onBrandPrimary} /> : null}</View>
            <Text style={[s.stepTxt, i <= idx && { color: colors.brand }]}>{l}</Text>
          </View>
        ))}
      </View>
      <View style={s.target}>
        <View style={s.tIcon}><Ionicons name={atStorePhase ? 'storefront' : 'home'} size={22} color={colors.brand} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.tName} numberOfLines={1}>{atStorePhase ? tgt.name : tgt.name || tSync('العميل', lang)}</Text>
          <Text style={s.tAddr} numberOfLines={2}>{tgt.address || '—'}</Text>
        </View>
        {eta ? (<View style={s.eta}><Text style={s.etaMin}>{eta.min}</Text><Text style={s.etaLbl}>{tSync('د', lang)} · {eta.km.toFixed(1)} {tSync('كم', lang)}</Text></View>) : null}
      </View>
      {!atStorePhase && order.cod ? (
        <View style={s.cod}><Ionicons name="cash" size={16} color={colors.onBrandPrimary} /><Text style={s.codTxt}>{tSync('تحصيل كاش', lang)}: {Number(order.cash_to_collect).toFixed(2)} {tSync('ر.س', lang)}</Text></View>
      ) : null}
      {order.step === 'at_store' ? (
        <View style={s.items}>{(order.items || []).slice(0, 6).map((it: any, i: number) => (
          <Text key={i} style={s.item}>• {it.name} ×{it.qty}</Text>))}</View>
      ) : null}
      <View style={s.actions}>
        <Action s={s} icon="navigate" label={tSync('ملاحة', lang)} testID="ad-nav" onPress={() => tgt.lat && openNav(tgt.lat, tgt.lng, navApp)} />
        <Action s={s} icon="call" label={tSync('اتصال', lang)} testID="ad-call" onPress={() => tgt.phone && Linking.openURL(`tel:${tgt.phone}`)} />
        <Action s={s} icon="chatbubbles" label={tSync('محادثة', lang)} testID="ad-chat" onPress={() => router.push(`/chat/${order.id}`)} />
        <Action s={s} icon="alert-circle" label={tSync('مشكلة', lang)} testID="ad-issue" onPress={() => setIssueOpen(true)} />
      </View>
      <SwipeButton testID="ad-next" label={tSync(c.label, lang)} onConfirm={go} loading={busy} tone={c.next ? 'brand' : 'success'} />

      <Modal visible={issueOpen} transparent animationType="fade" onRequestClose={() => setIssueOpen(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setIssueOpen(false)}>
          <View style={s.issueBox}>
            <TX style={s.issueTitle}>الإبلاغ عن مشكلة</TX>
            {ISSUES.map((t) => (
              <TouchableOpacity key={t} style={s.issueRow} onPress={() => { setIssueOpen(false); onIssue(t); }}>
                <TX style={s.issueTxt}>{t}</TX>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Action({ s, icon, label, onPress, testID }: any) {
  return (
    <TouchableOpacity testID={testID} style={s.action} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.brand} />
      <Text style={s.actionTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderColor: colors.border },
    stepper: { flexDirection: 'row', justifyContent: 'space-between' },
    stepItem: { alignItems: 'center', flex: 1, gap: 4 },
    dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    dotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    stepTxt: { fontSize: 11, color: colors.onSurfaceTertiary, fontWeight: '700' },
    target: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    tIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
    tName: { color: colors.onSurface, fontSize: 17, fontWeight: '800' },
    tAddr: { color: colors.onSurfaceSecondary, fontSize: 13 },
    eta: { alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6 },
    etaMin: { color: colors.brand, fontSize: 22, fontWeight: '900' },
    etaLbl: { color: colors.onSurfaceTertiary, fontSize: 11 },
    cod: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
    codTxt: { color: colors.onBrandPrimary, fontWeight: '800' },
    items: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 2 },
    item: { color: colors.onSurface, fontSize: 14 },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingVertical: spacing.sm, minHeight: 56, justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    actionTxt: { color: colors.onSurface, fontSize: 12, fontWeight: '700' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
    issueBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
    issueTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '900', marginBottom: spacing.sm },
    issueRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
    issueTxt: { color: colors.onSurface, fontSize: 15 },
  }), [themeKey]);
}
