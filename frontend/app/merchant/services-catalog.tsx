import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StatusBar, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';

const CAT_META: Record<string, { label: string; color: string; icon: string }> = {
  core:        { label: 'الأساسي',           color: '#F5C518', icon: 'construct' },
  engagement:  { label: 'التفاعل',           color: '#EC4899', icon: 'heart' },
  logistics:   { label: 'اللوجستيات',        color: '#10B981', icon: 'car' },
  service:     { label: 'الخدمة',            color: '#3B82F6', icon: 'headset' },
  growth:      { label: 'النمو',             color: '#F59E0B', icon: 'trending-up' },
  b2b:         { label: 'الأعمال (B2B)',     color: '#8B5CF6', icon: 'business' },
  analytics:   { label: 'التحليلات',         color: '#06B6D4', icon: 'stats-chart' },
  integration: { label: 'التكامل الخارجي',   color: '#EF4444', icon: 'link' },
};

export default function ServicesCatalogScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [grouped, setGrouped] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiCall('/api/merchant/modules');
      setGrouped(d.grouped || []);
    } catch (e: any) { Alert.alert('خطأ', e?.message); }
    finally { setLoading(false); }
  }, [apiCall]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (code: string, enabled: boolean) => {
    // Optimistic
    setGrouped((g) => g.map((cat) => ({
      ...cat,
      modules: cat.modules.map((m: any) => m.code === code ? { ...m, enabled } : m),
    })));
    try {
      await apiCall(`/api/merchant/modules/${code}`, {
        method: 'PUT', body: JSON.stringify({ enabled }),
      });
    } catch (e: any) {
      Alert.alert('خطأ', e?.message);
      await load();
    }
  };

  const enabledCount = grouped.reduce((sum, cat) => sum + cat.modules.filter((m: any) => m.enabled).length, 0);
  const totalCount = grouped.reduce((sum, cat) => sum + cat.modules.length, 0);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>ميزات التطبيق</Text>
          <Text style={s.sub}>فعّل أو أوقف أي ميزة لعملائك</Text>
        </View>
        <View style={s.badge}>
          <Text style={s.badgeText}>{enabledCount}/{totalCount}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <View style={s.infoBar}>
            <Ionicons name="bulb" size={14} color={GOLD} />
            <Text style={s.infoText}>
              عند إيقاف أي ميزة، تختفي تلقائياً من واجهة العملاء ومن قوائم لوحة تحكمك. البيانات محفوظة ويمكن استعادتها بإعادة التفعيل.
            </Text>
          </View>

          {grouped.map((cat) => {
            const meta = CAT_META[cat.category] || { label: cat.category, color: GOLD, icon: 'ellipse' };
            return (
              <View key={cat.category} style={{ marginBottom: 12 }}>
                <View style={s.catHeader}>
                  <View style={[s.catIcon, { backgroundColor: meta.color + '20', borderColor: meta.color }]}>
                    <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                  </View>
                  <Text style={[s.catTitle, { color: meta.color }]}>{meta.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: MUTED, fontSize: 10 }}>
                    {cat.modules.filter((m: any) => m.enabled).length}/{cat.modules.length}
                  </Text>
                </View>
                <View style={s.catBox}>
                  {cat.modules.map((m: any, i: number) => (
                    <View key={m.code} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}>
                      <View style={[s.rowIcon, { backgroundColor: meta.color + '15' }]}>
                        <Ionicons name={m.icon as any} size={16} color={meta.color} />
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <Text style={s.rowTitle}>{m.name_ar}</Text>
                        <Text style={s.rowDesc} numberOfLines={2}>{m.description_ar}</Text>
                      </View>
                      <Switch
                        value={!!m.enabled}
                        onValueChange={(v) => toggle(m.code, v)}
                        trackColor={{ true: meta.color, false: BORDER }}
                        thumbColor="#FFF"
                      />
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

          <View style={s.tipBox}>
            <Text style={s.tipTitle}>💡 نصيحة</Text>
            <Text style={s.tipText}>
              هذه القائمة تخدم عمليتك اليومية، وتُسهّل أيضاً استنساخ التطبيق لتاجر آخر لاحقاً — فقط اضبط الميزات المناسبة.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right', marginHorizontal: 10 },
  sub: { color: MUTED, fontSize: 10, textAlign: 'right', marginHorizontal: 10 },
  badge: { backgroundColor: GOLD + '25', borderColor: GOLD, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: GOLD, fontSize: 11, fontWeight: '900' },
  infoBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, padding: 10, borderRadius: 10, marginBottom: 12 },
  infoText: { color: TEXT, fontSize: 11, flex: 1, textAlign: 'right', lineHeight: 16 },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: 4 },
  catIcon: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  catTitle: { fontSize: 13, fontWeight: '900' },
  catBox: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: TEXT, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  rowDesc: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 2, lineHeight: 14 },
  tipBox: { backgroundColor: '#8B5CF615', borderColor: '#8B5CF6', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  tipTitle: { color: '#A78BFA', fontSize: 12, fontWeight: '900', textAlign: 'right' },
  tipText: { color: TEXT, fontSize: 11, textAlign: 'right', marginTop: 4, lineHeight: 16 },
});
