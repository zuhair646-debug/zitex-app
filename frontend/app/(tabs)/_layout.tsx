import { Tabs } from 'expo-router';
import { useMemo, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import { useT } from '../../src/i18n';

export default function TabLayout() {
  const styles = useSStyles();
  const { user, loading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useT();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (!user) return null;

  const bottomPad = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 16 : 12);
  const barHeight = 56 + bottomPad;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.gold,
      tabBarInactiveTintColor: colors.textSecondary,
      tabBarStyle: {
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        height: barHeight,
        paddingBottom: bottomPad,
        paddingTop: 8,
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      tabBarItemStyle: { paddingVertical: 2 },
    }}>
      <Tabs.Screen name="index"        options={{ title: t('tabs.home'),         tabBarIcon: ({ color, size }) => <Ionicons name="home"      size={size} color={color} /> }} />
      <Tabs.Screen name="services"     options={{ title: t('tabs.services'),     tabBarIcon: ({ color, size }) => <Ionicons name="grid"      size={size} color={color} /> }} />
      <Tabs.Screen name="competitions" options={{ title: t('tabs.competitions'), tabBarIcon: ({ color, size }) => <Ionicons name="trophy"    size={size} color={color} /> }} />
      <Tabs.Screen name="social"       options={{ title: t('tabs.social'),       tabBarIcon: ({ color, size }) => <Ionicons name="megaphone" size={size} color={color} /> }} />
      <Tabs.Screen name="settings"     options={{ title: t('tabs.profile'),      tabBarIcon: ({ color, size }) => <Ionicons name="person"    size={size} color={color} /> }} />
    </Tabs>
  );
}

function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
}), [themeKey]);
}
