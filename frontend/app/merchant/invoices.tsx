import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ScreenHeader, EmptyState, SkeletonBox, Badge, StatCard, PrimaryButton } from '../../src/components/ui';

export default function Invoices() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [invs, setInvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/pos/invoices'); setInvs(Array.isArray(d) ? d : []); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = new Date().toDateString();
  const todayInvs = invs.filter(i => { try { return new Date(i.created_at).toDateString() === today; } catch { return false; } });
  const todayRevenue = todayInvs.reduce((a, i) => a + (i.total || 0), 0);
  const totalRevenue = invs.reduce((a, i) => a + (i.total || 0), 0);

  const sendWhatsapp = (inv: any) => {
    if (!inv.customer_phone) { Alert.alert('لا يوجد رقم', 'العميل بدون رقم جوال'); return; }
    const phone = String(inv.customer_phone).replace(/[^0-9]/g, '');
    const msg = `مرحباً ${inv.customer_name || ''}%0A%0Aفاتورتك من Zitex:%0A${inv.invoice_number}%0Aالمجموع: ${inv.total?.toFixed(2)} ر.س%0A%0Aشكراً لك 🌟`;
    Linking.openURL(`https://wa.me/${phone}?text=${msg}`).catch(() => Alert.alert('خطأ', 'تعذّر فتح واتساب'));
  };

  const method = (m: string) => ({ cash: '💵 كاش', card: '💳 بطاقة', stc_pay: '📱 STC Pay', bank_transfer: '🏦 تحويل' } as any)[m] || m;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title="الفواتير" onBack={() => router.back()} rightIcon="refresh" onRight={load} subtitle={`${invs.length} فاتورة`} />

        <View style={s.row}>
          <StatCard icon="today" label="اليوم" value={`${todayInvs.length}`} tone="gold" />
          <StatCard icon="cash" label="مبيعات اليوم" value={new Intl.NumberFormat('en').format(todayRevenue)} tone="success" />
        </View>
        <View style={s.row}>
          <StatCard icon="receipt" label="الإجمالي" value={invs.length} tone="info" />
          <StatCard icon="wallet" label="إجمالي المبيعات" value={new Intl.NumberFormat('en').format(totalRevenue)} tone="gold" />
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <PrimaryButton label="فتح شاشة البيع POS" icon="cart" onPress={() => router.push('/merchant/pos')} />
        </View>

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}><SkeletonBox height={80} /><SkeletonBox height={80} /></View>
        ) : invs.length === 0 ? (
          <EmptyState icon="receipt-outline" title="لا توجد فواتير" description="أنشئ أول فاتورة من شاشة POS" actionLabel="فتح POS" onAction={() => router.push('/merchant/pos')} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.sm }}>
            {invs.map(i => (
              <View key={i.id} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                  <Text style={s.no}>{i.invoice_number}</Text>
                  <Badge label={method(i.payment_method)} tone="info" />
                  <View style={{ flex: 1 }} />
                  <Text style={s.amt}>{i.total?.toFixed(2)} <Text style={s.cur}>ر.س</Text></Text>
                </View>
                <Text style={s.meta} numberOfLines={1}>
                  {i.customer_name || 'عميل مباشر'} • {i.items_count} منتج • {i.employee_name}
                </Text>
                <Text style={s.date}>{new Date(i.created_at).toLocaleString('ar')}</Text>
                {i.customer_phone && (
                  <TouchableOpacity onPress={() => sendWhatsapp(i)} style={s.waBtn}>
                    <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
                    <Text style={s.waTxt}>إرسال واتساب</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  card: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  no: { ...typography.titleSmall, color: colors.brand },
  amt: { ...typography.titleMedium, color: colors.onSurface, fontWeight: '900' },
  cur: { fontSize: 11, color: colors.onSurfaceSecondary },
  meta: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 4 },
  date: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: 'rgba(37, 211, 102, 0.15)', borderRadius: radius.sm },
  waTxt: { color: '#25D366', fontSize: 11, fontWeight: '700' },
});
