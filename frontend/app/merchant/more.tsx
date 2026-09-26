import { View, Text, ScrollView, StyleSheet, StatusBar, TouchableOpacity, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMemo,  useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ListItem, SectionHeader, ScreenHeader } from '../../src/components/ui';
import { useAuth } from '../_layout';
import { useThemeMode } from '../../src/theme/mode';
import { useTheme } from '../../src/theme/ThemeContext';
import { useT, LANGUAGES } from '../../src/i18n';

export default function MerchantMore() {
  const styles = useStylesStyles();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { mode, toggle: toggleThemeLegacy } = useThemeMode();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t } = useT();
  const [langOpen, setLangOpen] = useState(false);
  const syncedToggleTheme = async () => { await toggleTheme(); await toggleThemeLegacy(); };
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  const sales = [
    { icon: 'cart', title: 'نقطة البيع POS', subtitle: 'شاشة كاشير سريعة لإصدار الفواتير', route: '/merchant/pos' },
    { icon: 'receipt', title: 'الفواتير', subtitle: 'سجل الفواتير ومبيعات اليوم', route: '/merchant/invoices' },
    { icon: 'cube', title: 'المخزون', subtitle: 'مخزون المتجر / التطبيق + تنبيهات النفاد', route: '/merchant/inventory' },
    { icon: 'megaphone', title: 'التسويق والإعلانات', subtitle: 'إعلانات مدفوعة وحملات مستهدفة', route: '/merchant/marketing' },
    { icon: 'people', title: 'المسوّقون والعمولات', subtitle: 'موافقات، عمولات، نشاط، تحويلات', route: '/merchant/marketing?tab=affiliates' },
  ] as const;

  const marketing = [
    { icon: 'megaphone', title: 'السوشال ميديا', subtitle: 'منشورات، استطلاعات، حالات', route: '/merchant/social' },
    { icon: 'trophy', title: 'المسابقات والسحوبات', subtitle: 'إنشاء وإدارة السحوبات', route: '/merchant/competitions' },
    { icon: 'image', title: 'البانرات الترويجية', subtitle: 'عروض الصفحة الرئيسية', route: '/merchant/banners' },
  ] as const;

  const operations = [
    { icon: 'briefcase', title: 'الخدمات', subtitle: 'خدماتك المقدمة للعملاء', route: '/merchant/services' },
    { icon: 'calendar', title: 'حجوزات الخدمات', subtitle: 'إدارة الحجوزات + تحديثات الفيديو', route: '/merchant/service-bookings' },
    { icon: 'clipboard', title: 'كل الحجوزات', subtitle: 'حجوزات عامة، حالتها، إدارتها', route: '/merchant/bookings' },
    { icon: 'business', title: 'الفروع', subtitle: 'مواقع فروع المتجر', route: '/merchant/branches' },
    { icon: 'car-sport', title: 'السائقون', subtitle: 'إدارة السائقين والتعيين', route: '/merchant/drivers' },
    { icon: 'map', title: 'إعدادات التوصيل الداخلي', subtitle: 'الأسطول الخاص + المناطق والأوقات', route: '/merchant/delivery-settings' },
    { icon: 'airplane', title: 'مصفوفة الشحن الخارجي', subtitle: 'شركات الشحن حسب المدينة والفرع', route: '/merchant/shipping-matrix' },
    { icon: 'return-up-back', title: 'الإرجاع والضمان', subtitle: 'طلبات الإرجاع من العملاء', route: '/merchant/returns' },
  ] as const;

  const growth = [
    { icon: 'ribbon', title: 'برامج الولاء السعودية', subtitle: 'قطاف، مكافآت، الفرسان…', route: '/merchant/loyalty-programs' },
    { icon: 'options', title: 'ميزات التطبيق', subtitle: 'فعّل أو أوقف أي ميزة', route: '/merchant/services-catalog' },
  ] as const;

  const admin = [
    { icon: 'people', title: 'العملاء', subtitle: 'قاعدة عملائك وسجلاتهم', route: '/merchant/customers' },
    { icon: 'people-circle', title: 'الموظفون', subtitle: 'الأدوار والصلاحيات', route: '/merchant/employees' },
    { icon: 'shield-checkmark', title: 'الأدوار والصلاحيات', subtitle: 'أدوار جاهزة + مخصصة', route: '/merchant/roles' },
    { icon: 'pulse', title: 'الفريق - مباشر', subtitle: 'الحضور والنشاط', route: '/merchant/team' },
    { icon: 'headset', title: 'إعدادات الدعم', subtitle: 'قنوات التواصل مع العملاء', route: '/merchant/support-settings' },
  ] as const;

  const Section = ({ label, items }: { label: string; items: any[] }) => (
    <>
      <SectionHeader title={label} />
      <View style={styles.groupCard}>
        {items.map((it, i) => (
          <ListItem
            key={it.route}
            icon={it.icon as any}
            title={it.title}
            subtitle={it.subtitle}
            onPress={() => router.push(it.route as any)}
          />
        ))}
      </View>
    </>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || 'M').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name || 'التاجر'}</Text>
            <Text style={styles.phone}>{user?.phone}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Section label="المبيعات والفواتير" items={sales as any} />
          <Section label="التسويق" items={marketing as any} />
          <Section label="العمليات" items={operations as any} />
          <Section label="النمو والولاء" items={growth as any} />
          <Section label="الإدارة" items={admin as any} />

          <SectionHeader title="الحساب" />
          <View style={styles.groupCard}>
            {/* Appearance & Fonts (unified control) */}
            <TouchableOpacity style={styles.prefRow} onPress={() => router.push('/appearance' as any)} activeOpacity={0.7}>
              <View style={styles.prefLeft}>
                <View style={[styles.prefIcon, { backgroundColor: colors.brandTertiary }]}>
                  <Ionicons name="color-palette" size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle}>{lang === 'ar' ? 'المظهر والخطوط' : 'Appearance & Fonts'}</Text>
                  <Text style={styles.prefSub}>
                    {lang === 'ar' ? 'ليلي • نهاري • مخصص + اختر الخطوط والألوان' : 'Dark • Light • Custom + fonts & colors'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-back" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Theme Toggle */}
            <TouchableOpacity style={styles.prefRow} onPress={syncedToggleTheme} activeOpacity={0.7}>
              <View style={styles.prefLeft}>
                <View style={[styles.prefIcon, { backgroundColor: (isDark ? '#F5B547' : '#6EA8FF') + '25' }]}>
                  <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? '#F5B547' : '#6EA8FF'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle}>{isDark ? 'الوضع الليلي' : 'الوضع النهاري'}</Text>
                  <Text style={styles.prefSub}>اضغط للتبديل بين النهاري والليلي والمخصص</Text>
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
                  <Text style={styles.prefTitle}>{t('settings.language', 'اللغة')}</Text>
                  <Text style={styles.prefSub}>{currentLang.flag}  {currentLang.nativeName}  ·  {currentLang.name}</Text>
                </View>
              </View>
              <Ionicons name="chevron-back" size={18} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <ListItem icon="log-out" title="تسجيل الخروج" onPress={logout} tone="default" />
          </View>

          <Text style={styles.version}>Zenrex Store Merchant v1.14.3</Text>
        </ScrollView>
      </SafeAreaView>

      {/* Language picker modal */}
      <Modal transparent animationType="slide" visible={langOpen} onRequestClose={() => setLangOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setLangOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('settings.changeLanguage', 'تغيير اللغة')}</Text>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map(L => (
                <TouchableOpacity key={L.code} style={styles.langRow}
                  onPress={async () => { await setLang(L.code); setLangOpen(false); }}>
                  <Text style={{ fontSize: 22 }}>{L.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.langNative}>{L.nativeName}</Text>
                    <Text style={styles.langName}>{L.name}</Text>
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
}), []);
}

