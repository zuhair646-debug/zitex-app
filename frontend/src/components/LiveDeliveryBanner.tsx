/** Customer bottom banner: shown above the tab bar while a delivery is on its way → opens live tracking. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { tSync } from '../useAutoT';
import { useT } from '../i18n';
import { useLive } from '../utils/live';
import { notify } from '../utils/notify';

export default function LiveDeliveryBanner({ apiCall, bottom }: { apiCall: any; bottom: number }) {
  const s = useStyles();
  const { lang } = useT();
  const router = useRouter();
  const [o, setO] = useState<any>(null);
  const load = useCallback(async () => {
    try { setO((await apiCall('/api/delivery/active-order')).order); } catch { setO(null); }
  }, [apiCall]);
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);
  useLive((m) => {
    if (m.t === 'order_update' || m.t === 'connected') load();
    else if (m.t === 'near') { load(); notify(tSync('🚗 طلبك قريب منك', lang), tSync('السائق على بُعد 3 دقائق تقريباً، خلك مستعد لاستلام طلبك', lang)); }
  });
  if (!o) return null;
  const txt = o.step === 'at_customer' ? 'السائق وصل إلى موقعك' : o.near ? 'طلبك قريب، خلك مستعد' : o.status === 'picked_up' ? 'طلبك في الطريق إليك الآن' : 'السائق يستلم طلبك من المتجر';
  return (
    <TouchableOpacity testID="live-delivery-banner" activeOpacity={0.9} style={[s.bar, { bottom }]} onPress={() => router.push(`/track-order/${o.id}` as any)}>
      <View style={s.icon}><Ionicons name="bicycle" size={20} color={colors.onBrandPrimary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={2}>{tSync(txt, lang)}</Text>
        <Text style={s.sub} numberOfLines={1}>{o.driver_name} · {tSync('رمز الاستلام', lang)} {o.otp}</Text>
      </View>
      <Text style={s.cta}>{tSync('تتبع', lang)}</Text>
    </TouchableOpacity>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    bar: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1.5, borderColor: colors.brand, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
    icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.onSurface, fontWeight: '900', fontSize: 14 },
    sub: { color: colors.onSurfaceTertiary, fontSize: 12 },
    cta: { color: colors.brand, fontWeight: '900' },
  }), [themeKey]);
}
