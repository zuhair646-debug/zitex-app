import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { colors, spacing, radius } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { TX, tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';
import { EmptyState } from '../../src/components/ui';

export default function DriverTrips() {
  const s = useStyles();
  const { lang } = useT();
  const { apiCall } = useAuth();
  const [trips, setTrips] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setTrips(await apiCall('/api/driver/trips')); } catch { setTrips([]); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView edges={['top']} style={s.root}>
      <TX style={s.h1}>سجل الرحلات</TX>
      <FlatList data={trips || []} keyExtractor={(t) => t.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        ListEmptyComponent={trips ? <EmptyState icon="bicycle-outline" title={tSync('لا توجد رحلات مكتملة بعد', lang)} description={tSync('أكمل أول توصيل لتظهر رحلاتك هنا', lang)} /> : null}
        renderItem={({ item: t }) => (
          <View style={s.card} testID={`trip-${t.id}`}>
            <View style={s.row}>
              <Text style={s.no}>#{t.id.slice(-6).toUpperCase()}</Text>
              <Text style={s.earn}>+{Number(t.driver_earnings || 0).toFixed(2)} {tSync('ر.س', lang)}</Text>
            </View>
            <View style={s.line}><Ionicons name="storefront" size={14} color={colors.brand} /><Text style={s.txt} numberOfLines={1}>{t.store?.name}</Text></View>
            <View style={s.line}><Ionicons name="home" size={14} color={colors.brand} /><Text style={s.txt} numberOfLines={1}>{t.customer?.address}</Text></View>
            <View style={s.row}>
              <Text style={s.date}>{String(t.delivered_at || '').slice(0, 16).replace('T', ' ')}</Text>
              <Text style={s.date}>{t.items_count} {tSync('قطعة', lang)} · {t.cod ? tSync('كاش', lang) : tSync('مدفوع', lang)}</Text>
            </View>
          </View>
        )} />
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    h1: { color: colors.onSurface, fontSize: 24, fontWeight: '900', paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 6, borderWidth: 1, borderColor: colors.border },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    no: { color: colors.onSurface, fontWeight: '900' },
    earn: { color: colors.success, fontWeight: '900' },
    line: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    txt: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
    date: { color: colors.onSurfaceTertiary, fontSize: 12 },
  }), [themeKey]);
}
