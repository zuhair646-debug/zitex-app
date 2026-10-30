import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Modal, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { useThemeMode } from '../../src/theme/mode';
import { TX, tSync } from '../../src/useAutoT';
import { useT, LANGUAGES } from '../../src/i18n';
import { PrimaryButton, SecondaryButton, Badge } from '../../src/components/ui';
import { uploadMedia } from '../../src/utils/upload';
import { notify } from '../../src/utils/notify';
import { stopBeacon } from '../../src/utils/driverTracking';

const DOCS = [['id', 'الهوية / الإقامة'], ['license', 'رخصة القيادة'], ['registration', 'استمارة المركبة'], ['insurance', 'تأمين المركبة']];
const LEVEL_AR: Record<string, string> = { bronze: 'برونزي', silver: 'فضي', gold: 'ذهبي', platinum: 'بلاتيني' };
const BADGE_AR: Record<string, [string, any]> = {
  first_trip: ['أول رحلة', 'flag'], fifty_trips: ['50 رحلة', 'trophy'], on_time_pro: ['دقيق في المواعيد', 'time'],
  five_star: ['خمس نجوم', 'star'], reliable: ['موثوق', 'shield-checkmark'],
};

export default function DriverProfile() {
  const s = useStyles();
  const { lang, setLang, t, isRTL } = useT();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { toggle: toggleThemeLegacy } = useThemeMode();
  const syncedToggleTheme = async () => { await toggleTheme(); await toggleThemeLegacy(); };
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const chevron = isRTL ? 'chevron-back' : 'chevron-forward';
  const { apiCall, logout } = useAuth();
  const [me, setMe] = useState<any>(null);
  const [perf, setPerf] = useState<any>(null);
  const [veh, setVeh] = useState<any>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([apiCall('/api/driver/me'), apiCall('/api/driver/performance')]);
      setMe(m); setPerf(p); setVeh(m.vehicle || {});
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (body: any, key = 'save') => {
    setBusy(key);
    try { setMe(await apiCall('/api/driver/me', { method: 'PUT', body: JSON.stringify(body) })); }
    catch (e: any) { notify(tSync('خطأ', lang), e.message); }
    finally { setBusy(''); }
  };
  const pick = async (key: string) => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) await ImagePicker.requestMediaLibraryPermissionsAsync();
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    setBusy(key);
    try {
      const up = await uploadMedia(r.assets[0].uri, r.assets[0].fileName || `${key}.jpg`, r.assets[0].mimeType || 'image/jpeg');
      await save(key === 'photo' ? { photo_url: up.url } : { docs: { [key]: up.url } }, key);
    } catch (e: any) { notify(tSync('فشل الرفع', lang), e.message); setBusy(''); }
  };

  if (!me) return <SafeAreaView style={s.root} />;
  return (
    <SafeAreaView edges={['top']} style={s.root}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }}>
        <View style={s.head}>
          <TouchableOpacity onPress={() => pick('photo')} testID="driver-photo">
            {me.photo_url ? <Image source={{ uri: me.photo_url }} style={s.avatar} /> : <View style={s.avatar}><Ionicons name="person" size={36} color={colors.brand} /></View>}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{me.name}</Text>
            <Text style={s.sub}>{me.phone}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              <Badge label={tSync(me.type === 'independent' ? 'سائق مستقل' : 'سائق المتجر', lang)} tone="gold" />
              <Badge label={tSync(me.status === 'approved' ? 'معتمد' : me.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة', lang)}
                tone={me.status === 'approved' ? 'success' : me.status === 'rejected' ? 'error' : 'warning'} />
            </View>
          </View>
        </View>

        {perf ? (
          <View style={s.card} testID="driver-performance">
            <View style={s.levelRow}>
              <Ionicons name="medal" size={26} color={colors.brand} />
              <Text style={s.level}>{tSync('المستوى', lang)}: {tSync(LEVEL_AR[perf.level] || perf.level, lang)}</Text>
              {perf.next_level ? <Text style={s.sub}>{perf.to_next} {tSync('رحلة للمستوى التالي', lang)}</Text> : null}
            </View>
            <View style={s.grid}>
              <Kpi s={s} v={`${perf.rating.toFixed(1)} ★`} l={tSync('التقييم', lang)} />
              <Kpi s={s} v={`${perf.acceptance_rate}%`} l={tSync('نسبة القبول', lang)} />
              <Kpi s={s} v={`${perf.on_time_rate}%`} l={tSync('في الوقت', lang)} />
              <Kpi s={s} v={String(perf.completed)} l={tSync('رحلات مكتملة', lang)} />
            </View>
            {perf.badges.length ? (
              <View style={s.badges}>{perf.badges.map((b: string) => (
                <View key={b} style={s.badge}><Ionicons name={BADGE_AR[b]?.[1] || 'ribbon'} size={16} color={colors.brand} /><Text style={s.badgeTxt}>{tSync(BADGE_AR[b]?.[0] || b, lang)}</Text></View>
              ))}</View>
            ) : null}
          </View>
        ) : null}

        <View style={s.card}>
          <TX style={s.h2}>المركبة</TX>
          {[['type', 'النوع (سيارة / دباب)'], ['model', 'الموديل'], ['plate', 'رقم اللوحة'], ['color', 'اللون']].map(([k, l]) => (
            <TextInput key={k} testID={`veh-${k}`} style={s.input} value={veh[k] || ''} onChangeText={(t) => setVeh({ ...veh, [k]: t })}
              placeholder={tSync(l, lang)} placeholderTextColor={colors.onSurfaceTertiary} />
          ))}
          <PrimaryButton label={tSync('حفظ', lang)} icon="save" loading={busy === 'save'} onPress={() => save({ vehicle: veh })} />
        </View>

        <View style={s.card}>
          <TX style={s.h2}>المستندات</TX>
          {DOCS.map(([k, l]) => {
            const d = me.docs?.[k];
            return (
              <TouchableOpacity key={k} style={s.docRow} onPress={() => pick(k)} testID={`doc-${k}`}>
                <Ionicons name="document-text" size={22} color={colors.brand} />
                <TX style={s.docName}>{l}</TX>
                {busy === k ? <Text style={s.sub}>…</Text> :
                  <Badge label={tSync(!d ? 'ارفع' : d.status === 'approved' ? 'معتمد' : d.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة', lang)}
                    tone={!d ? 'default' : d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'error' : 'warning'} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.card}>
          <TX style={s.h2}>تطبيق الملاحة المفضل</TX>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[['google', 'Google Maps'], ['waze', 'Waze'], ['apple', 'Apple Maps']].map(([k, l]) => (
              <TouchableOpacity key={k} testID={`nav-${k}`} style={[s.navOpt, me.nav_app === k && s.navOn]} onPress={() => save({ nav_app: k }, 'nav')}>
                <Text style={[s.navTxt, me.nav_app === k && { color: colors.onBrandPrimary }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {perf?.reviews?.length ? (
          <View style={s.card}>
            <TX style={s.h2}>آخر التقييمات</TX>
            {perf.reviews.map((r: any, i: number) => (
              <View key={i} style={s.review}><Text style={s.stars}>{'★'.repeat(r.stars || 0)}</Text>{r.comment ? <Text style={s.sub}>{r.comment}</Text> : null}</View>
            ))}
          </View>
        ) : null}

        {/* Same account preferences as the merchant panel (merchant/more.tsx) */}
        <View style={s.groupCard}>
          <TouchableOpacity testID="drv-appearance" style={s.prefRow} onPress={() => router.push('/appearance' as any)} activeOpacity={0.7}>
            <View style={s.prefLeft}>
              <View style={[s.prefIcon, { backgroundColor: colors.brandTertiary }]}>
                <Ionicons name="color-palette" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.prefTitle} numberOfLines={1}>{t('mo.appearance.title')}</Text>
                <Text style={s.prefSub} numberOfLines={2}>{t('mo.appearance.sub')}</Text>
              </View>
            </View>
            <Ionicons name={chevron} size={18} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity testID="drv-theme-toggle" style={s.prefRow} onPress={syncedToggleTheme} activeOpacity={0.7}>
            <View style={s.prefLeft}>
              <View style={[s.prefIcon, { backgroundColor: (isDark ? '#F5B547' : '#6EA8FF') + '25' }]}>
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? '#F5B547' : '#6EA8FF'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.prefTitle} numberOfLines={1}>{isDark ? t('mo.themeDark') : t('mo.themeLight')}</Text>
                <Text style={s.prefSub} numberOfLines={2}>{t('mo.themeToggleHint')}</Text>
              </View>
            </View>
            <View style={[s.switchTrack, isDark && s.switchTrackOn]}>
              <View style={[s.switchThumb, isDark && s.switchThumbOn]} />
            </View>
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity testID="drv-language" style={s.prefRow} onPress={() => setLangOpen(true)} activeOpacity={0.7}>
            <View style={s.prefLeft}>
              <View style={[s.prefIcon, { backgroundColor: '#A895FF25' }]}>
                <Ionicons name="language" size={20} color="#A895FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.prefTitle} numberOfLines={1}>{t('settings.language')}</Text>
                <Text style={s.prefSub} numberOfLines={1}>{currentLang.flag}  {currentLang.nativeName}</Text>
              </View>
            </View>
            <Ionicons name={chevron} size={18} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        </View>

        <SecondaryButton label={tSync('تسجيل الخروج', lang)} icon="log-out" onPress={async () => { await stopBeacon(); logout(); }} />
      </ScrollView>

      <Modal transparent animationType="slide" visible={langOpen} onRequestClose={() => setLangOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setLangOpen(false)}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{t('settings.changeLanguage')}</Text>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map(L => (
                <TouchableOpacity key={L.code} testID={`drv-lang-${L.code}`} style={s.langRow}
                  onPress={async () => { await setLang(L.code); setLangOpen(false); }}>
                  <Text style={{ fontSize: 22 }}>{L.flag}</Text>
                  <View style={{ flex: 1 }}><Text style={s.langNative}>{L.nativeName}</Text></View>
                  {L.code === lang && <Ionicons name="checkmark-circle" size={22} color={colors.brand} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Kpi({ s, v, l }: any) { return <View style={s.kpi}><Text style={s.kpiV}>{v}</Text><Text style={s.kpiL}>{l}</Text></View>; }

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
    name: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
    sub: { color: colors.onSurfaceTertiary, fontSize: 13 },
    card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
    h2: { color: colors.onSurface, fontSize: 17, fontWeight: '800' },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    level: { color: colors.brand, fontSize: 17, fontWeight: '900' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    kpi: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
    kpiV: { color: colors.onSurface, fontSize: 22, fontWeight: '900' },
    kpiL: { color: colors.onSurfaceTertiary, fontSize: 12 },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    badge: { flexDirection: 'row', gap: 4, alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 4 },
    badgeTxt: { color: colors.brand, fontSize: 12, fontWeight: '700' },
    input: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, padding: 12, fontSize: 15 },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
    docName: { flex: 1, color: colors.onSurface, fontSize: 15 },
    navOpt: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' },
    navOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    navTxt: { color: colors.onSurface, fontWeight: '700', fontSize: 13 },
    groupCard: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    prefRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
    prefLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    prefIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    prefTitle: { ...typography.body, color: colors.onSurface, fontWeight: '700' as any },
    prefSub: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
    switchTrack: { width: 44, height: 24, borderRadius: 12, backgroundColor: colors.border, padding: 2, justifyContent: 'center' },
    switchTrackOn: { backgroundColor: colors.brand },
    switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
    switchThumbOn: { alignSelf: 'flex-end' },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
    modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 32, maxHeight: '85%' },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
    modalTitle: { ...typography.titleMedium, color: colors.onSurface, textAlign: 'center', marginBottom: spacing.md },
    langRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    langNative: { ...typography.body, color: colors.onSurface, fontWeight: '700' as any },
    review: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: spacing.sm },
    stars: { color: colors.brand, fontSize: 16 },
  }), [themeKey]);
}
