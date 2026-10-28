import { useT } from '../src/i18n';
import { tSync } from '../src/useAutoT';
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { openInvoicePrint } from '../src/utils/invoicePrint';

const TYPE_LABEL: Record<string, string> = { simplified: 'فاتورة ضريبية مبسطة', standard: 'فاتورة ضريبية', credit_note: 'إشعار دائن' };

export default function InvoicesScreen() {
  const { lang, isRTL } = useT();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { const d = await apiCall('/api/invoices/mine'); setInvoices(Array.isArray(d) ? d : []); } catch {} finally { setLoading(false); } })(); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="inv-back" style={s.backBtn} onPress={() => router.back()}><Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>{tSync('الفواتير', lang)}</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color="#F5C518" style={{ marginTop: 40 }} /> :
        invoices.length === 0 ? (
          <View style={s.empty}><Ionicons name="receipt-outline" size={48} color="#A1A1AA" /><Text style={s.emptyText}>{tSync('ما في فواتير لحد الآن', lang)}</Text></View>
        ) : (
          <ScrollView contentContainerStyle={s.list}>
            {invoices.map(inv => (
              <View key={inv.id} style={s.card}>
                <View style={s.cardTop}>
                  <Text style={s.invNo}>{inv.invoice_number}</Text>
                  <View style={[s.statusBadge, { backgroundColor: inv.type === 'credit_note' ? '#FEF3C7' : '#DCFCE7' }]}>
                    <Text style={[s.statusText, { color: inv.type === 'credit_note' ? '#B45309' : '#047857' }]}>{tSync(TYPE_LABEL[inv.type] || TYPE_LABEL.simplified, lang)}</Text>
                  </View>
                </View>
                <Text style={s.date}>{inv.created_at?.split('T')[0]}</Text>
                <View style={s.row}><Text style={s.label}>{tSync('ضريبة القيمة المضافة 15%', lang)}</Text><Text style={s.val}>{inv.vat_amount?.toFixed?.(2)} {tSync('ر.س', lang)}</Text></View>
                <View style={[s.row, s.totalRow]}><Text style={s.totalLabel}>{tSync('الإجمالي شامل الضريبة', lang)}</Text><Text style={s.totalVal}>{inv.total?.toFixed?.(2)} {tSync('ر.س', lang)}</Text></View>
                <View style={s.actions}>
                  <TouchableOpacity testID={`inv-print-${inv.id}`} style={s.actBtn} onPress={() => openInvoicePrint(inv.id, 'a4')}>
                    <Ionicons name="document-text" size={16} color="#0A0A0A" /><Text style={s.actTxt}>{tSync('عرض / PDF', lang)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 16, color: '#52525B' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  invNo: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, color: '#A1A1AA', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 13, color: '#52525B' }, val: { fontSize: 13, color: '#0A0A0A' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 8, marginTop: 4 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  totalVal: { fontSize: 16, fontWeight: '800', color: '#B8860B' },
  actions: { flexDirection: 'row', marginTop: 10 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F5C518' },
  actTxt: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
});
