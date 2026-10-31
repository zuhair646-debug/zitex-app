import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { colors, spacing, radius } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { TX, tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';
import { FilterTabs, PrimaryButton, EmptyState, Badge } from '../../src/components/ui';
import { notify } from '../../src/utils/notify';

export default function DriverEarnings() {
  const s = useStyles();
  const { lang } = useT();
  const { apiCall } = useAuth();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [d, setD] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p = period) => {
    try { setD(await apiCall(`/api/driver/earnings?period=${p}`)); } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
    finally { setRefreshing(false); }
  }, [period]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const payout = async () => {
    const a = parseFloat(amount);
    if (!(a > 0)) return;
    setBusy(true);
    try { await apiCall('/api/driver/payouts', { method: 'POST', body: JSON.stringify({ amount: a }) }); setAmount(''); notify(tSync('✅ تم إرسال طلب السحب', lang)); load(); }
    catch (e: any) { notify(tSync('تنبيه', lang), e.message); }
    finally { setBusy(false); }
  };
  const max = Math.max(1, ...(d?.series || []).map((x: any) => x.amount));
  const showBars = (d?.series || []).slice(-(period === 'month' ? 30 : 7));

  return (
    <SafeAreaView edges={['top']} style={s.root}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}>
        <TX style={s.h1}>الأرباح والمحفظة</TX>
        <View style={s.balance} testID="driver-wallet">
          <TX style={s.balLbl}>الرصيد القابل للسحب</TX>
          <Text style={s.balVal}>{Number(d?.wallet_balance || 0).toFixed(2)} <Text style={s.cur}>{tSync('ر.س', lang)}</Text></Text>
          <View style={s.cashRow}><Ionicons name="cash" size={16} color={colors.brand} /><Text style={s.cashTxt}>{tSync('كاش بحوزتك (يُسلَّم للمتجر)', lang)}: {Number(d?.cash_in_hand || 0).toFixed(2)}</Text></View>
        </View>
        {d?.pay ? <PayCard s={s} p={d.pay} lang={lang} /> : null}
        <FilterTabs items={[{ key: 'day', label: tSync('اليوم', lang) }, { key: 'week', label: tSync('الأسبوع', lang) }, { key: 'month', label: tSync('الشهر', lang) }] as any}
          value={period} onChange={(k: any) => { setPeriod(k); load(k); }} />
        <View style={s.stats}>
          <Stat s={s} label={tSync('الإجمالي', lang)} value={Number(d?.total || 0).toFixed(2)} />
          <Stat s={s} label={tSync('الرحلات', lang)} value={String(d?.trips || 0)} />
          <Stat s={s} label={tSync('متوسط الرحلة', lang)} value={Number(d?.avg_per_trip || 0).toFixed(2)} />
        </View>
        {period !== 'day' ? (
          <View style={s.chart}>
            {showBars.map((x: any) => (
              <View key={x.date} style={s.barCol}>
                <View style={[s.bar, { height: Math.max(4, (x.amount / max) * 110) }]} />
                {period === 'week' ? <Text style={s.barLbl}>{x.date.slice(8)}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
        <View style={s.card}>
          <TX style={s.h2}>طلب سحب الأرباح</TX>
          <Text style={s.hint}>{tSync('الحد الأدنى', lang)} {Number(d?.payout_min || 50).toFixed(0)} {tSync('ر.س', lang)}</Text>
          <TextInput testID="payout-amount" style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
            placeholder={tSync('المبلغ', lang)} placeholderTextColor={colors.onSurfaceTertiary} />
          <PrimaryButton testID="payout-submit" label={tSync('طلب سحب', lang)} icon="arrow-down-circle" onPress={payout} loading={busy} />
        </View>
        <TX style={s.h2}>طلبات السحب</TX>
        {!d?.payouts?.length ? <EmptyState icon="wallet-outline" title={tSync('لا توجد طلبات سحب بعد', lang)} /> :
          d.payouts.map((p: any) => (
            <View key={p.id} style={s.row}>
              <Text style={s.rowVal}>{Number(p.amount).toFixed(2)} {tSync('ر.س', lang)}</Text>
              <Text style={s.rowDate}>{String(p.created_at).slice(0, 10)}</Text>
              <Badge label={tSync(p.status === 'paid' ? 'تم التحويل' : p.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة', lang)}
                tone={p.status === 'paid' ? 'success' : p.status === 'rejected' ? 'error' : 'warning' as any} />
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ s, label, value }: any) {
  return <View style={s.stat}><Text style={s.statVal}>{value}</Text><Text style={s.statLbl}>{label}</Text></View>;
}

/** How this driver is paid — set by the merchant in Drivers (salary / per trip / per km). */
function PayCard({ s, p, lang }: any) {
  const cur = tSync('ر.س', lang);
  const rows: [string, string][] = [];
  let title = '';
  if (p.model === 'salary') {
    title = 'راتب شهري + مكافآت';
    const left = Math.max(0, p.bonus_threshold_orders - p.today_trips);
    rows.push([tSync('الراتب الشهري', lang), `${p.salary_monthly.toFixed(0)} ${cur}`]);
    rows.push([tSync('مكافأة كل طلب فوق الحد اليومي', lang), `${p.bonus_per_extra_order.toFixed(2)} ${cur}`]);
    rows.push([tSync('طلبات اليوم', lang), `${p.today_trips} / ${p.bonus_threshold_orders}`]);
    rows.push([tSync('مكافآت هذا الشهر', lang), `${p.month_earnings.toFixed(2)} ${cur}`]);
    if (left > 0) rows.push([tSync('باقي لبدء المكافأة', lang), `${left} ${tSync('طلب', lang)}`]);
  } else if (p.model === 'per_km') {
    title = 'أجر حسب الكيلومتر';
    rows.push([tSync('سعر الكيلومتر', lang), `${p.driver_km_rate.toFixed(2)} ${cur}`]);
    if (p.driver_base_fare > 0) rows.push([tSync('أجرة بداية الرحلة', lang), `${p.driver_base_fare.toFixed(2)} ${cur}`]);
    rows.push([tSync('أرباح هذا الشهر', lang), `${p.month_earnings.toFixed(2)} ${cur}`]);
  } else {
    title = 'أجر لكل مشوار';
    rows.push([tSync('حصة المتجر من رسوم التوصيل', lang), p.commission_type === 'percentage' ? `${p.merchant_commission_value}%` : `${p.merchant_commission_value.toFixed(2)} ${cur}`]);
    rows.push([tSync('أرباح هذا الشهر', lang), `${p.month_earnings.toFixed(2)} ${cur}`]);
  }
  rows.push([tSync('مشاوير هذا الشهر', lang), String(p.month_trips)]);
  return (
    <View style={s.card} testID="driver-pay-card">
      <View style={s.payHead}><Ionicons name="briefcase" size={18} color={colors.brand} /><Text style={s.h2}>{tSync(title, lang)}</Text></View>
      {rows.map(([k, v]) => (
        <View key={k} style={s.payRow}><Text style={s.payK}>{k}</Text><Text style={s.payV}>{v}</Text></View>
      ))}
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    h1: { color: colors.onSurface, fontSize: 24, fontWeight: '900' },
    h2: { color: colors.onSurface, fontSize: 17, fontWeight: '800' },
    balance: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.brand, gap: 4 },
    balLbl: { color: colors.onSurfaceSecondary, fontSize: 13 },
    balVal: { color: colors.brand, fontSize: 36, fontWeight: '900' },
    cur: { fontSize: 16, color: colors.onSurfaceSecondary },
    cashRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    cashTxt: { color: colors.onSurface, fontSize: 13 },
    stats: { flexDirection: 'row', gap: spacing.sm },
    stat: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    statVal: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
    statLbl: { color: colors.onSurfaceTertiary, fontSize: 12 },
    chart: { height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 3, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
    barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    bar: { width: '80%', backgroundColor: colors.brand, borderRadius: 4 },
    barLbl: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 2 },
    card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
    hint: { color: colors.onSurfaceTertiary, fontSize: 12 },
    input: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, padding: 12, fontSize: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
    rowVal: { color: colors.onSurface, fontWeight: '800', flex: 1 },
    rowDate: { color: colors.onSurfaceTertiary, fontSize: 12 },
    payHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: spacing.md },
    payK: { color: colors.onSurfaceSecondary, fontSize: 13, flex: 1 },
    payV: { color: colors.onSurface, fontWeight: '800', fontSize: 14 },
  }), [themeKey]);
}
