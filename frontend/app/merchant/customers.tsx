import { useEffect, useState, useCallback } from 'react';
import { useT } from '../../src/i18n';
import { tSync } from '../../src/useAutoT';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import TranslatableName, { NameInitial } from '../../src/components/TranslatableName';
import { colors, themed } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';

export default function MerchantCustomers() {
  useTheme(); // re-render when the app theme changes
  const { lang } = useT();

  const router = useRouter();
  const { apiCall } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/customers'); setCustomers(d); } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={s.title}>{tSync('العملاء (', lang)}{customers.length})</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {customers.map(c => (
            <View key={c.id} style={s.card}>
              <View style={s.avatar}><NameInitial name={c.name} style={s.avatarText} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <TranslatableName
                  text={c.name || 'No Name'}
                  style={s.name}
                  iconSize={12}
                />
                <Text style={s.phone}>{c.phone}</Text>
                <Text style={s.email}>{c.email || tSync('لا يوجد بريد', lang)}</Text>
              </View>
              <View style={s.statsBox}>
                <Text style={s.statsVal}>{c.orders_count}</Text>
                <Text style={s.statsLbl}>{tSync('الطلبات', lang)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      }
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: colors.onSurface },
  card: { flexDirection: 'row', backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontSize: 20, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  phone: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  email: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 1 },
  statsBox: { alignItems: 'center', backgroundColor: '#EFE6FF', borderRadius: 10, padding: 8, minWidth: 50 },
  statsVal: { fontSize: 18, fontWeight: '800', color: colors.brand },
  statsLbl: { fontSize: 10, color: colors.onSurfaceSecondary },
}));
