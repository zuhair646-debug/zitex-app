import { Tabs, useRouter, useSegments } from 'expo-router';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../src/theme/tokens';

/* ─── Custom tab bar with big center "Live Preview" FAB ─────────────────── */
function MerchantTabBar({ state, descriptors, navigation }: any) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, spacing.md);
  // Filter routes we want visible in the bar (custom order + center FAB slot)
  const leftKeys = ['index', 'orders'];         // left side
  const rightKeys = ['products', 'more'];        // right side
  const buildBtn = (routeName: string) => {
    const route = state.routes.find((r: any) => r.name === routeName);
    if (!route) return null;
    const { options } = descriptors[route.key];
    const isFocused = state.routes[state.index]?.name === routeName;
    const color = isFocused ? colors.brand : colors.onSurfaceSecondary;
    const iconMap: Record<string, [string, string]> = {
      index: ['grid', 'grid-outline'],
      orders: ['receipt', 'receipt-outline'],
      products: ['cube', 'cube-outline'],
      more: ['ellipsis-horizontal-circle', 'ellipsis-horizontal-circle-outline'],
    };
    const [on, off] = iconMap[routeName] || ['ellipse', 'ellipse-outline'];
    return (
      <Pressable
        key={routeName}
        onPress={() => navigation.navigate(routeName)}
        style={s.tabBtn}
        testID={`tab-${routeName}`}
      >
        <Ionicons name={(isFocused ? on : off) as any} size={22} color={color} />
        <Text style={[s.tabLbl, { color }]}>{String(options.title || routeName)}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[s.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <BlurView tint="dark" intensity={Platform.OS === 'ios' ? 90 : 100} style={StyleSheet.absoluteFill} />
      <View style={s.bar}>
        {leftKeys.map(buildBtn)}
        {/* Spacer for the FAB */}
        <View style={{ width: 76 }} />
        {rightKeys.map(buildBtn)}
      </View>
      {/* Center FAB — Live Preview */}
      <TouchableOpacity
        testID="live-preview-fab"
        activeOpacity={0.85}
        onPress={() => router.push('/merchant/live-preview' as any)}
        style={s.fabWrap}
      >
        <View style={s.fabHalo} />
        <View style={s.fab}>
          <Ionicons name="radio" size={26} color="#0A0A0A" />
        </View>
        <Text style={s.fabLbl}>بث المتجر</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MerchantLayout() {
  return (
    <Tabs
      tabBar={props => <MerchantTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand }}
    >
      <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
      <Tabs.Screen name="orders" options={{ title: 'الطلبات' }} />
      <Tabs.Screen name="products" options={{ title: 'المنتجات' }} />
      <Tabs.Screen name="more" options={{ title: 'المزيد' }} />

      {/* Hidden routes — accessible via router.push */}
      {[
        'product-form','social','competitions','competition-form','services','service-bookings',
        'bookings','customers','banners','branches','drivers','delivery-settings','employees',
        'support-settings','roles','team','pos','invoices','marketing','marketer-stats',
        'live-preview',
      ].map(n => (
        <Tabs.Screen key={n} name={n} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md, right: spacing.md,
    height: 72,
    borderRadius: 28,
    overflow: 'visible',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: Platform.OS === 'android' ? 'rgba(15, 17, 24, 0.94)' : 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12,
  },
  bar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, borderRadius: 28, overflow: 'hidden',
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 2 },
  tabLbl: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  fabWrap: {
    position: 'absolute',
    left: '50%', marginLeft: -34, top: -22,
    alignItems: 'center',
  },
  fabHalo: {
    position: 'absolute', top: -4, width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(245,197,24,0.22)',
  },
  fab: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#0B0C10',
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 14,
  },
  fabLbl: { color: colors.brand, fontSize: 10, fontWeight: '900', marginTop: 6 },
});
