import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';

export default function DriverLayout() {
  const { lang } = useT();
  useTheme();
  const insets = useSafeAreaInsets();
  const icon = (n: string) => function TabIcon({ color, focused }: any) {
    return <Ionicons name={(focused ? n : `${n}-outline`) as any} size={24} color={color} />;
  };
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brand,
      tabBarInactiveTintColor: colors.onSurfaceTertiary,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 60 + insets.bottom, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 6 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      <Tabs.Screen name="index" options={{ title: tSync('الخريطة', lang), tabBarIcon: icon('navigate') }} />
      <Tabs.Screen name="earnings" options={{ title: tSync('الأرباح', lang), tabBarIcon: icon('wallet') }} />
      <Tabs.Screen name="trips" options={{ title: tSync('الرحلات', lang), tabBarIcon: icon('time') }} />
      <Tabs.Screen name="profile" options={{ title: tSync('حسابي', lang), tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
