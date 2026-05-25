import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function InvoicesScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { const d = await apiCall('/api/invoices'); setInvoices(d); } catch {} finally { setLoading(false); } })(); }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="inv-back" style={s.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Invoices</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        invoices.length === 0 ? (
          <View style={s.empty}><Ionicons name="receipt-outline" size={48} color="#A1A1AA" /><Text style={s.emptyText}>No invoices yet</Text></View>
        ) : (
          <ScrollView contentContainerStyle={s.list}>
            {invoices.map(inv => (
              <View key={inv.id} style={s.card}>
                <View style={s.cardTop}><Text style={s.invNo}>{inv.invoice_no}</Text><View style={[s.statusBadge, { backgroundColor: inv.status === 'completed' ? '#DCFCE7' : '#FEF3C7' }]}><Text style={[s.statusText, { color: inv.status === 'completed' ? '#10B981' : '#F59E0B' }]}>{inv.status}</Text></View></View>
                <Text style={s.date}>{inv.date?.split('T')[0]}</Text>
                <View style={s.row}><Text style={s.label}>Subtotal</Text><Text style={s.val}>{inv.subtotal} SAR</Text></View>
                <View style={s.row}><Text style={s.label}>Tax (15%)</Text><Text style={s.val}>{inv.tax} SAR</Text></View>
                <View style={[s.row, s.totalRow]}><Text style={s.totalLabel}>TOTAL</Text><Text style={s.totalVal}>{inv.total} SAR</Text></View>
                <Text style={s.itemsTitle}>{inv.items?.length || 0} items</Text>
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
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 16, color: '#52525B' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  invNo: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  date: { fontSize: 12, color: '#A1A1AA', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { fontSize: 13, color: '#52525B' }, val: { fontSize: 13, color: '#0A0A0A' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 8, marginTop: 4 },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  totalVal: { fontSize: 16, fontWeight: '800', color: '#8833FF' },
  itemsTitle: { fontSize: 12, color: '#A1A1AA', marginTop: 6 },
});
