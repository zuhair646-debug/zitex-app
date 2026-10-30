/** Incoming order offer: 30s countdown ring, key metrics, swipe to accept. */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { TX, tSync } from '../../useAutoT';
import { useT } from '../../i18n';
import SwipeButton from './SwipeButton';

type Props = { offer: any; onAccept: () => Promise<void>; onDecline: () => void; busy?: boolean };
const R = 34, C = 2 * Math.PI * R;

export default function OfferSheet({ offer, onAccept, onDecline, busy }: Props) {
  const s = useStyles();
  const { lang } = useT();
  const total = 30;
  const calc = () => Math.max(0, (new Date(offer.expires_at).getTime() - Date.now()) / 1000);
  const [left, setLeft] = useState(calc());
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const iv = setInterval(() => setLeft(calc()), 200);
    return () => clearInterval(iv);
  }, [offer.id]);
  const o = offer.order || {};
  const km = (v: any) => (v == null ? '—' : `${Number(v).toFixed(1)} ${tSync('كم', lang)}`);

  return (
    <View style={s.sheet} testID="driver-offer-sheet">
      <View style={s.head}>
        <View style={s.ring}>
          <Svg width={80} height={80}>
            <Circle cx={40} cy={40} r={R} stroke={colors.surfaceTertiary} strokeWidth={6} fill="none" />
            <Circle cx={40} cy={40} r={R} stroke={left < 8 ? colors.error : colors.brand} strokeWidth={6} fill="none"
              strokeDasharray={`${C}`} strokeDashoffset={C * (1 - left / total)} strokeLinecap="round" transform="rotate(-90 40 40)" />
          </Svg>
          <Text style={s.ringNum}>{Math.ceil(left)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <TX style={s.title}>طلب توصيل جديد</TX>
          <Text style={s.store} numberOfLines={1}>{o.store?.name}</Text>
          <Text style={s.addr} numberOfLines={2}>{o.customer?.address}</Text>
        </View>
      </View>
      <View style={s.grid}>
        <Metric s={s} icon="cash" label={tSync('ربحك', lang)} value={`${Number(offer.est_earning || 0).toFixed(2)} ${tSync('ر.س', lang)}`} big />
        <Metric s={s} icon="storefront" label={tSync('إلى المتجر', lang)} value={km(offer.to_store_km)} />
        <Metric s={s} icon="flag" label={tSync('مسافة التوصيل', lang)} value={km(offer.trip_km)} />
        <Metric s={s} icon={o.cod ? 'wallet' : 'card'} label={tSync('الدفع', lang)}
          value={o.cod ? `${tSync('كاش', lang)} ${Number(o.cash_to_collect).toFixed(0)}` : tSync('مدفوع', lang)} />
      </View>
      <Text style={s.items}>{o.items_count} {tSync('قطعة', lang)}</Text>
      <SwipeButton testID="offer-accept" label={tSync('اسحب لقبول الطلب', lang)} onConfirm={onAccept} loading={busy} />
      <TouchableOpacity testID="offer-decline" onPress={onDecline} style={s.decline}><TX style={s.declineTxt}>رفض</TX></TouchableOpacity>
    </View>
  );
}

function Metric({ s, icon, label, value, big }: any) {
  return (
    <View style={s.metric}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <Text style={s.mLabel}>{label}</Text>
      <Text style={[s.mValue, big && { color: colors.brand, fontSize: 20 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md, borderTopWidth: 2, borderColor: colors.brand },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    ring: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
    ringNum: { position: 'absolute', color: colors.onSurface, fontSize: 24, fontWeight: '900' },
    title: { color: colors.brand, fontSize: 14, fontWeight: '800' },
    store: { color: colors.onSurface, fontSize: 18, fontWeight: '800', marginTop: 2 },
    addr: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    metric: { width: '48.5%', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 2, borderWidth: 1, borderColor: colors.border },
    mLabel: { color: colors.onSurfaceTertiary, fontSize: 12 },
    mValue: { color: colors.onSurface, fontSize: 16, fontWeight: '800' },
    items: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center' },
    decline: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, minHeight: 44, justifyContent: 'center' },
    declineTxt: { color: colors.error, fontSize: 15, fontWeight: '700' },
  }), [themeKey]);
}
