import { useState, useEffect, useCallback, useMemo} from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../_layout';
import { colors, spacing, radius } from '../../src/theme';
import { useTheme } from '../../src/theme/ThemeContext';

export default function MarketerStats() {
  const s = useSStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const d = await apiCall(`/api/affiliate/${id}/stats`); setData(d); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !data) return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.brand} /></TouchableOpacity>
        <Text style={s.title}>إحصائيات المسوّق</Text><View style={{ width: 22 }} />
      </View>
      <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
    </SafeAreaView>
  );

  const a = data.affiliate || {};
  const convs = data.recent_conversions || [];
  const daily = data.daily_series || [];
  const maxSales = Math.max(1, ...daily.map((d: any) => d.sales || 0));

  const shareCode = async () => {
    try { await Share.share({ message: `استخدم رمز الإحالة ${a.referral_code} عند الطلب من Zenrex Store واحصل على منتجاتك المفضلة!` }); } catch {}
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.brand} /></TouchableOpacity>
        <Text style={s.title}>{a.name || 'المسوّق'}</Text>
        <TouchableOpacity onPress={shareCode}><Ionicons name="share-social" size={22} color={colors.brand} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 60 }}>
        {/* Hero — code + commission */}
        <LinearGradient colors={['#F5C518', '#D4AF37']} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={s.heroLbl}>رمز الإحالة</Text>
          <Text style={s.heroCode}>{a.referral_code || '—'}</Text>
          <Text style={s.heroCommission}>عمولة {a.commission_percent || 0}%</Text>
          <View style={s.heroStatus}>
            <Ionicons name={a.active ? 'checkmark-circle' : 'pause-circle'} size={14} color="#0A0A0A" />
            <Text style={s.heroStatusText}>{a.active ? 'نشط' : 'موقوف'}</Text>
          </View>
        </LinearGradient>

        {/* KPIs */}
        <View style={s.kpiRow}>
          <Kpi icon="hand-left" label="النقرات" value={a.total_clicks || 0} />
          <Kpi icon="repeat" label="التحويلات" value={a.total_conversions || 0} />
          <Kpi icon="cart" label="المبيعات" value={`${(a.total_sales || 0).toFixed(0)} ر.س`} highlight />
          <Kpi icon="cash" label="العمولات" value={`${(a.total_earnings || 0).toFixed(0)} ر.س`} highlight />
        </View>

        {/* Rates */}
        <View style={s.metaRow}>
          <View style={s.metaCard}>
            <Text style={s.metaLbl}>معدل التحويل</Text>
            <Text style={s.metaVal}>{data.conversion_rate}%</Text>
          </View>
          <View style={s.metaCard}>
            <Text style={s.metaLbl}>متوسط الطلب</Text>
            <Text style={s.metaVal}>{data.avg_order_value} ر.س</Text>
          </View>
        </View>

        {/* 30-day mini chart */}
        <Text style={s.sec}>📈 المبيعات خلال 30 يوم</Text>
        {daily.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>لا توجد مبيعات بعد</Text></View>
        ) : (
          <View style={s.chart}>
            {daily.map((d: any) => {
              const h = Math.max(6, ((d.sales || 0) * 100) / maxSales);
              return (
                <View key={d.date} style={s.bar}>
                  <View style={[s.barFill, { height: `${h}%` }]} />
                </View>
              );
            })}
          </View>
        )}

        {/* Timeline */}
        <Text style={s.sec}>📋 آخر التحويلات ({convs.length})</Text>
        {convs.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyText}>لا يوجد نشاط بعد</Text></View>
        ) : (
          convs.map((c: any) => (
            <View key={c.id} style={s.conv}>
              <View style={s.convIcon}><Ionicons name="cart" size={16} color="#0A0A0A" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.convName}>{c.customer_name || 'عميل'}</Text>
                <Text style={s.convDate}>{(c.created_at || '').slice(0, 10)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.convAmt}>+{(c.earning || 0).toFixed(2)} ر.س</Text>
                <Text style={s.convSub}>من طلب {(c.order_subtotal || 0).toFixed(0)} ر.س</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ icon, label, value, highlight }: any) {
  return (
    <View style={[s.kpi, highlight && s.kpiHi]}>
      <Ionicons name={icon} size={18} color={highlight ? '#0A0A0A' : colors.brand} />
      <Text style={[s.kpiVal, highlight && { color: '#0A0A0A' }]}>{value}</Text>
      <Text style={[s.kpiLbl, highlight && { color: 'rgba(10,10,10,0.7)' }]}>{label}</Text>
    </View>
  );
}



function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.onBackground, textAlign: 'center' },
  hero: { padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center', gap: 4 },
  heroLbl: { fontSize: 12, color: 'rgba(10,10,10,0.7)' },
  heroCode: { fontSize: 34, fontWeight: '900', color: '#0A0A0A', letterSpacing: 2, marginTop: 4 },
  heroCommission: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', marginTop: 2 },
  heroStatus: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  heroStatusText: { fontSize: 11, color: '#0A0A0A', fontWeight: '800' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 4 },
  kpiHi: { backgroundColor: colors.brand, borderColor: colors.brand },
  kpiVal: { fontSize: 18, fontWeight: '900', color: colors.onSurface },
  kpiLbl: { fontSize: 11, color: colors.onSurfaceSecondary },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  metaCard: { flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  metaLbl: { fontSize: 12, color: colors.onSurfaceSecondary, textAlign: 'right' },
  metaVal: { fontSize: 20, fontWeight: '900', color: colors.brand, marginTop: 4, textAlign: 'right' },
  sec: { fontSize: 15, fontWeight: '800', color: colors.onBackground, marginTop: spacing.lg, marginBottom: spacing.sm, textAlign: 'right' },
  chart: { flexDirection: 'row', gap: 2, height: 120, alignItems: 'flex-end', padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  bar: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', backgroundColor: colors.brand, borderRadius: 2 },
  conv: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs },
  convIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  convName: { fontSize: 13, fontWeight: '700', color: colors.onSurface, textAlign: 'right' },
  convDate: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  convAmt: { fontSize: 14, fontWeight: '900', color: '#10B981' },
  convSub: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  empty: { padding: spacing.lg, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontSize: 13, color: colors.onSurfaceSecondary },
}), [themeKey]);
}
