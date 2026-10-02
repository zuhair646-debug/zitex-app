import { View, Text, ScrollView, StyleSheet, StatusBar, TouchableOpacity, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ListItem, SectionHeader } from '../../src/components/ui';
import { useAuth } from '../_layout';
import { useThemeMode } from '../../src/theme/mode';
import { useTheme } from '../../src/theme/ThemeContext';
import { useT, LANGUAGES } from '../../src/i18n';

export default function MerchantMore() {
  const styles = useStylesStyles();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toggle: toggleThemeLegacy } = useThemeMode();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t, isRTL } = useT();
  const [langOpen, setLangOpen] = useState(false);
  const syncedToggleTheme = async () => { await toggleTheme(); await toggleThemeLegacy(); };
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const chevron = isRTL ? 'chevron-back' : 'chevron-forward';

  const sales = [
    { icon: 'cart',      titleKey: 'mo.pos.title',        subKey: 'mo.pos.sub',        route: '/merchant/pos' },
    { icon: 'receipt',   titleKey: 'mo.invoices.title',   subKey: 'mo.invoices.sub',   route: '/merchant/invoices' },
    { icon: 'cube',      titleKey: 'mo.inventory.title',  subKey: 'mo.inventory.sub',  route: '/merchant/inventory' },
    { icon: 'megaphone', titleKey: 'mo.marketing.title',  subKey: 'mo.marketing.sub',  route: '/merchant/marketing' },
    { icon: 'people',    titleKey: 'mo.affiliates.title', subKey: 'mo.affiliates.sub', route: '/merchant/marketing?tab=affiliates' },
  ] as const;

  const marketing = [
    { icon: 'megaphone', titleKey: 'mo.social.title',       subKey: 'mo.social.sub',       route: '/merchant/social' },
    { icon: 'trophy',    titleKey: 'mo.competitions.title', subKey: 'mo.competitions.sub', route: '/merchant/competitions' },
    { icon: 'image',     titleKey: 'mo.banners.title',      subKey: 'mo.banners.sub',      route: '/merchant/banners' },
  ] as const;

  const operations = [
    { icon: 'briefcase',      titleKey: 'mo.services.title',         subKey: 'mo.services.sub',         route: '/merchant/services' },
    { icon: 'calendar',       titleKey: 'mo.serviceBookings.title',  subKey: 'mo.serviceBookings.sub',  route: '/merchant/service-bookings' },
    { icon: 'clipboard',      titleKey: 'mo.bookings.title',         subKey: 'mo.bookings.sub',         route: '/merchant/bookings' },
    { icon: 'business',       titleKey: 'mo.branches.title',         subKey: 'mo.branches.sub',         route: '/merchant/branches' },
    { icon: 'car-sport',      titleKey: 'mo.drivers.title',          subKey: 'mo.drivers.sub',          route: '/merchant/drivers' },
    { icon: 'map',            titleKey: 'mo.deliverySettings.title', subKey: 'mo.deliverySettings.sub', route: '/merchant/delivery-settings' },
    { icon: 'airplane',       titleKey: 'mo.shipping.title',         subKey: 'mo.shipping.sub',         route: '/merchant/shipping-matrix' },
    { icon: 'return-up-back', titleKey: 'mo.returns.title',          subKey: 'mo.returns.sub',          route: '/merchant/returns' },
  ] as const;

  const growth = [
    { icon: 'ribbon',  titleKey: 'mo.loyalty.title',     subKey: 'mo.loyalty.sub',     route: '/merchant/loyalty-programs' },
    { icon: 'options', titleKey: 'mo.appFeatures.title', subKey: 'mo.appFeatures.sub', route: '/merchant/services-catalog' },
  ] as const;

  const admin = [
    { icon: 'people',            titleKey: 'mo.customers.title', subKey: 'mo.customers.sub', route: '/merchant/customers' },
    { icon: 'people-circle',     titleKey: 'mo.employees.title', subKey: 'mo.employees.sub', route: '/merchant/employees' },
    { icon: 'shield-checkmark',  titleKey: 'mo.roles.title',     subKey: 'mo.roles.sub',     route: '/merchant/roles' },
    { icon: 'pulse',             titleKey: 'mo.team.title',      subKey: 'mo.team.sub',      route: '/merchant/team' },
    { icon: 'headset',           titleKey: 'mo.support.title',   subKey: 'mo.support.sub',   route: '/merchant/support-settings' },
  ] as const;

  const Section = ({ label, items }: { label: string; items: readonly any[] }) => (
    <>
      <SectionHeader title={label} />
      <View style={styles.groupCard}>
        {items.map((it) => (
          <ListItem
            key={it.route}
            icon={it.icon as any}
            title={t(it.titleKey)}
            subtitle={t(it.subKey)}
            onPress={() => router.push(it.route as any)}
          />
        ))}
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || t('mh.merchantFallback')).slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{user?.name || t('mh.merchantFallback')}</Text>
            <Text style={styles.phone}>{user?.phone}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Section label={t('mo.section.sales')}       items={sales} />
          <Section label={t('mo.section.marketing')}   items={marketing} />
          <Section label={t('mo.section.operations')}  items={operations} />
          <Section label={t('mo.section.growth')}      items={growth} />
          <Section label={t('mo.section.admin')}       items={admin} />

          <SectionHeader title={t('mo.account')} />
          <View style={styles.groupCard}>
            {/* Appearance & Fonts */}
            <TouchableOpacity style={styles.prefRow} onPress={() => router.push('/appearance' as any)} activeOpacity={0.7}>
              <View style={styles.prefLeft}>
                <View style={[styles.prefIcon, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name="color-palette" size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle} numberOfLines={1}>{t('mo.appearance.title')}</Text>
                  <Text style={styles.prefSub} numberOfLines={2}>{t('mo.appearance.sub')}</Text>
                </View>
              </View>
              <Ionicons name={chevron} size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Theme Toggle */}
            <TouchableOpacity style={styles.prefRow} onPress={syncedToggleTheme} activeOpacity={0.7}>
              <View style={styles.prefLeft}>
                <View style={[styles.prefIcon, { backgroundColor: (isDark ? '#F5B547' : '#6EA8FF') + '25' }]}>
                  <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? '#F5B547' : '#6EA8FF'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle} numberOfLines={1}>
                    {isDark ? t('mo.themeDark') : t('mo.themeLight')}
                  </Text>
                  <Text style={styles.prefSub} numberOfLines={2}>{t('mo.themeToggleHint')}</Text>
                </View>
              </View>
              <View style={[styles.switchTrack, isDark && styles.switchTrackOn]}>
                <View style={[styles.switchThumb, isDark && styles.switchThumbOn]} />
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Language Picker */}
            <TouchableOpacity style={styles.prefRow} onPress={() => setLangOpen(true)} activeOpacity={0.7}>
              <View style={styles.prefLeft}>
                <View style={[styles.prefIcon, { backgroundColor: '#A895FF25' }]}>
                  <Ionicons name="language" size={20} color="#A895FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle} numberOfLines={1}>{t('settings.language')}</Text>
                  <Text style={styles.prefSub} numberOfLines={1}>
                    {currentLang.flag}  {currentLang.nativeName}
                  </Text>
                </View>
              </View>
              <Ionicons name={chevron} size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <ListItem icon="log-out" title={t('auth.logout')} onPress={logout} tone="default" />
          </View>

          <Text style={styles.version}>Zenrex Store Merchant v1.14.3</Text>
        </ScrollView>
      </SafeAreaView>

      {/* Language picker modal */}
      <Modal transparent animationType="slide" visible={langOpen} onRequestClose={() => setLangOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setLangOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('settings.changeLanguage')}</Text>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map(L => (
                <TouchableOpacity key={L.code} style={styles.langRow}
                  onPress={async () => { await setLang(L.code); setLangOpen(false); }}>
                  <Text style={{ fontSize: 22 }}>{L.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.langNative}>{L.nativeName}</Text>
                  </View>
                  {L.code === lang && <Ionicons name="checkmark-circle" size={22} color={colors.brand} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function useStylesStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 56, height: 56, borderRadius: radius.pill,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: colors.onBrandPrimary },
  name: { ...typography.titleLarge, color: colors.onSurface },
  phone: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  groupCard: {
    marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  version: { textAlign: 'center', color: colors.onSurfaceTertiary, fontSize: 11, marginTop: spacing.xl },
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
  langName: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
}), [themeKey]);
}
