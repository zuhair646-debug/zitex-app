import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ListItem, SectionHeader, ScreenHeader } from '../../src/components/ui';
import { useAuth } from '../_layout';

export default function MerchantMore() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const sales = [
    { icon: 'cart', title: 'نقطة البيع POS', subtitle: 'شاشة كاشير سريعة لإصدار الفواتير', route: '/merchant/pos' },
    { icon: 'receipt', title: 'الفواتير', subtitle: 'سجل الفواتير ومبيعات اليوم', route: '/merchant/invoices' },
    { icon: 'megaphone', title: 'التسويق والمسوقون', subtitle: 'إعلانات مدفوعة + برنامج المسوقين بالعمولة', route: '/merchant/marketing' },
  ] as const;

  const marketing = [
    { icon: 'megaphone', title: 'السوشال ميديا', subtitle: 'منشورات، استطلاعات، حالات', route: '/merchant/social' },
    { icon: 'trophy', title: 'المسابقات والسحوبات', subtitle: 'إنشاء وإدارة السحوبات', route: '/merchant/competitions' },
    { icon: 'image', title: 'البانرات الترويجية', subtitle: 'عروض الصفحة الرئيسية', route: '/merchant/banners' },
  ] as const;

  const operations = [
    { icon: 'briefcase', title: 'الخدمات', subtitle: 'خدماتك المقدمة للعملاء', route: '/merchant/services' },
    { icon: 'calendar', title: 'حجوزات الخدمات', subtitle: 'إدارة الحجوزات + تحديثات الفيديو', route: '/merchant/service-bookings' },
    { icon: 'business', title: 'الفروع', subtitle: 'مواقع فروع المتجر', route: '/merchant/branches' },
    { icon: 'car-sport', title: 'السائقون', subtitle: 'إدارة السائقين والتعيين', route: '/merchant/drivers' },
    { icon: 'map', title: 'إعدادات التوصيل', subtitle: 'الأسعار والمناطق والأوقات', route: '/merchant/delivery-settings' },
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
          <Section label="الإدارة" items={admin as any} />

          <SectionHeader title="الحساب" />
          <View style={styles.groupCard}>
            <ListItem icon="log-out" title="تسجيل الخروج" onPress={logout} tone="default" />
          </View>

          <Text style={styles.version}>Zitex Merchant v1.3.0</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
