import { useEffect, useState, useCallback, useMemo } from 'react';
import { useT, curLang } from '../src/i18n';
import { tSync, tf, TX } from '../src/useAutoT';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Share, Alert, StatusBar, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from './_layout';
import { MarketerPayouts } from '../src/components/AffiliatePayouts';
import AccountPrefs from '../src/components/AccountPrefs';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';

const APP_LINK_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api`;

export default function MyAffiliate() {
  const { lang } = useT();
  const s = useStyles();
  const { isDark } = useTheme();

  const router = useRouter();
  const { apiCall, user, logout } = useAuth();
  const isMarketer = user?.role === 'marketer';
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await apiCall('/api/affiliate/dashboard');
      setAccounts(a);
      if (a.length && selected >= a.length) setSelected(0);
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selected]);
  useEffect(() => { load(); }, []);

  const cur = accounts[selected];
  const refLink = cur ? `${APP_LINK_BASE}/r/${cur.referral_code}` : '';

  const copy = async () => {
    if (!refLink) return;
    await Clipboard.setStringAsync(refLink);
    Alert.alert(tSync('✅ تم النسخ', curLang()), tSync('رابط الإحالة في الحافظة', curLang()));
  };
  const shareLink = async () => {
    if (!refLink) return;
    try { await Share.share({ message: tf('اطلب من Zenrex Store عبر رابطي وادعمني 🎁\n{0}', lang, [refLink]) }); } catch {}
  };
  const shareWhatsApp = () => {
    if (!refLink) return;
    const url = `https://wa.me/?text=${encodeURIComponent(tf('اطلب من Zenrex Store عبر رابطي 🎁\n{0}', lang, [refLink]))}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else Linking.openURL(url).catch(() => {});
  };

  if (loading) return (
    <View style={s.root}><ActivityIndicator color={colors.brand} style={{ marginTop: 100 }} /></View>
  );
  if (!accounts.length) return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          {isMarketer ? (
            <TouchableOpacity testID="marketer-logout" onPress={async () => { await logout(); router.replace('/login' as any); }} style={s.iconBtn}>
              <Ionicons name="log-out-outline" size={22} color={colors.brand} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.brand} />
            </TouchableOpacity>
          )}
          <TX style={s.headerTitle}>لوحة المسوّق</TX>
          <View style={s.iconBtn} />
        </View>
        <View style={s.emptyBox}>
          <Ionicons name="megaphone-outline" size={80} color={colors.onSurfaceTertiary} />
          <TX style={s.emptyTitle}>لا يوجد حساب مسوّق نشط</TX>
          <TX style={s.emptyDesc}>افتح تبويب "السوشال" وقدّم على أحد برامج التسويق بالعمولة</TX>
        </View>
        {isMarketer ? <View style={[s.prefsWrap, { marginBottom: 24 }]}><AccountPrefs testPrefix="mkt" /></View> : null}
      </SafeAreaView>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          {isMarketer ? (
            <TouchableOpacity testID="marketer-logout" onPress={async () => { await logout(); router.replace('/login' as any); }} style={s.iconBtn}>
              <Ionicons name="log-out-outline" size={22} color={colors.brand} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
              <Ionicons name="arrow-back" size={22} color={colors.brand} />
            </TouchableOpacity>
          )}
          <TX style={s.headerTitle}>لوحة المسوّق</TX>
          <View style={s.iconBtn} />
        </View>

        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}>
          {accounts.length > 1 && (
            <ScrollView horizontal contentContainerStyle={s.tabRow} showsHorizontalScrollIndicator={false}>
              {accounts.map((a: any, i: number) => (
                <TouchableOpacity key={a.id} onPress={() => setSelected(i)} style={[s.merchTab, selected === i && s.merchTabActive]}>
                  <Text style={[s.merchTabText, selected === i && s.merchTabTextActive]}>{a.merchant_name || `تاجر #${i + 1}`}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Hero commission card */}
          <LinearGradient colors={[colors.brand, colors.brandSecondary]} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <TX style={s.heroLabel}>عمولتك من كل عملية شراء</TX>
            <Text style={s.heroValue}>{cur.commission_percent}%</Text>
            <Text style={s.heroSub}>{tSync('تاجر:', lang)} {cur.merchant_name || 'Zenrex Store'}</Text>
          </LinearGradient>

          {/* Referral link */}
          <View style={s.card}>
            <TX style={s.cardTitle}>🔗 رابط الإحالة الخاص بك</TX>
            <View style={s.linkBox}>
              <Text style={s.linkText} numberOfLines={1}>{refLink}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity onPress={copy} style={s.actionBtn}>
                <Ionicons name="copy" size={16} color={colors.onBrandPrimary} />
                <TX style={s.actionText}>نسخ</TX>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareLink} style={s.actionBtn}>
                <Ionicons name="share-social" size={16} color={colors.onBrandPrimary} />
                <TX style={s.actionText}>مشاركة</TX>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareWhatsApp} style={[s.actionBtn, { backgroundColor: '#25D366' }]}>
                <Ionicons name="logo-whatsapp" size={16} color="white" />
                <TX style={[s.actionText, { color: 'white' }]}>واتساب</TX>
              </TouchableOpacity>
            </View>
            <View style={s.codeChip}>
              <TX style={s.codeChipLabel}>كود الإحالة:</TX>
              <Text style={s.codeChipCode}>{cur.referral_code}</Text>
            </View>
          </View>

          <MarketerPayouts affiliateId={cur.id} />

          {/* Analytics grid */}
          <View style={s.gridRow}>
            <View style={s.gridCell}>
              <Text style={s.gridNum}>{cur.total_clicks || 0}</Text>
              <TX style={s.gridLbl}>نقرة</TX>
            </View>
            <View style={s.gridCell}>
              <Text style={s.gridNum}>{cur.unique_visitors || 0}</Text>
              <TX style={s.gridLbl}>زائر فريد</TX>
            </View>
            <View style={s.gridCell}>
              <Text style={s.gridNum}>{cur.total_conversions || 0}</Text>
              <TX style={s.gridLbl}>تحويل</TX>
            </View>
          </View>

          <View style={s.gridRow}>
            <View style={[s.gridCell, s.gridCellGold]}>
              <Text style={s.gridNumGold}>{(cur.this_month_earnings || 0).toFixed(0)} {tSync('ر.س', lang)}</Text>
              <TX style={s.gridLbl}>هذا الشهر</TX>
            </View>
            <View style={[s.gridCell, s.gridCellGold]}>
              <Text style={s.gridNumGold}>{(cur.total_earnings || 0).toFixed(0)} {tSync('ر.س', lang)}</Text>
              <TX style={s.gridLbl}>مجموع الأرباح</TX>
            </View>
          </View>

          {!!cur.incentives && (
            <View style={s.incentivesBox}>
              <TX style={s.incentivesTitle}>🎁 الحوافز</TX>
              <Text style={s.incentivesText}>{cur.incentives}</Text>
            </View>
          )}

          <View style={s.card}>
            <TX style={s.cardTitle}>📋 أحدث التحويلات</TX>
            {(!cur.recent_conversions || cur.recent_conversions.length === 0) ? (
              <TX style={s.emptyHist}>لم يتم أي تحويل عبر رابطك بعد. شارك الرابط للمتابعين.</TX>
            ) : (
              cur.recent_conversions.map((c: any) => (
                <View key={c.id} style={s.histRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histOrder}>{tSync('طلب #', lang)}{c.order_id?.slice(-6) || '—'}</Text>
                    <Text style={s.histDate}>{new Date(c.created_at).toLocaleDateString(lang)}</Text>
                  </View>
                  <Text style={s.histAmount}>+{Number(c.earning ?? c.commission_amount ?? 0).toFixed(2)} {tSync('ر.س', lang)}</Text>
                </View>
              ))
            )}
          </View>

          {isMarketer ? (
            <View style={s.prefsWrap}>
              <Text style={[s.cardTitle, { fontSize: 18, color: colors.onSurface }]}>{tSync('الإعدادات', lang)}</Text>
              <AccountPrefs testPrefix="mkt" />
            </View>
          ) : null}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.onSurface },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '800', marginTop: 16 },
  emptyDesc: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  tabRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  merchTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  merchTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  merchTabText: { color: colors.onSurfaceSecondary, fontWeight: '700', fontSize: 12 },
  merchTabTextActive: { color: colors.onBrandPrimary, fontWeight: '800' },
  hero: { margin: 16, padding: 22, borderRadius: 16, alignItems: 'center' },
  heroLabel: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: '700' },
  heroValue: { color: colors.onBrandPrimary, fontSize: 48, fontWeight: '900', marginVertical: 6 },
  heroSub: { color: colors.onBrandPrimary, fontSize: 13 },
  card: { backgroundColor: colors.surface, margin: 16, marginTop: 8, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.brand, fontSize: 13, fontWeight: '800', marginBottom: 8 },
  linkBox: { backgroundColor: colors.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.brandTertiaryStrong },
  linkText: { color: colors.onSurface, fontFamily: 'monospace', fontSize: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: 8, minHeight: 44 },
  actionText: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 12 },
  codeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start', backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  codeChipLabel: { color: colors.onSurfaceSecondary, fontSize: 11 },
  codeChipCode: { color: colors.brand, fontFamily: 'monospace', fontWeight: '900' },
  gridRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  gridCell: { flex: 1, backgroundColor: colors.surface, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  gridCellGold: { borderColor: colors.brand },
  gridNum: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
  gridNumGold: { color: colors.brand, fontSize: 20, fontWeight: '900' },
  gridLbl: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  incentivesBox: { backgroundColor: colors.brandTertiary, margin: 16, marginTop: 0, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.brand },
  incentivesTitle: { color: colors.brand, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  incentivesText: { color: colors.onSurface, fontSize: 13, lineHeight: 20 },
  emptyHist: { color: colors.onSurfaceTertiary, fontSize: 12, textAlign: 'center', padding: 20 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  histOrder: { color: colors.onSurface, fontSize: 13, fontWeight: '700' },
  histDate: { color: colors.onSurfaceTertiary, fontSize: 11 },
  histAmount: { color: colors.success, fontSize: 14, fontWeight: '900' },
  prefsWrap: { marginHorizontal: 16, marginTop: 8, gap: 8 },
  }), [themeKey]);
}
