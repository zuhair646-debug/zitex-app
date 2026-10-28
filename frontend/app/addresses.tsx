import { useT, curLang } from '../src/i18n';
import { tSync } from '../src/useAutoT';
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import TranslatableName from '../src/components/TranslatableName';

export default function AddressesScreen() {
  useT(); // re-render when language or on-demand translations change
  const router = useRouter();
  const { apiCall } = useAuth();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { try { const d = await apiCall('/api/addresses'); setAddresses(d); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const deleteAddr = (id: string) => Alert.alert(tSync('حذف العنوان', curLang()), tSync('هل أنت متأكد؟', curLang()), [
    { text: tSync('إلغاء', curLang()), style: 'cancel' },
    { text: tSync('حذف', curLang()), style: 'destructive', onPress: async () => { await apiCall(`/api/addresses/${id}`, { method: 'DELETE' }); load(); } },
  ]);

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color="#F5C518" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="addr-back" style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={s.title}>{tSync('عناويني', curLang())}</Text>
        <TouchableOpacity testID="add-addr-btn" style={s.addBtn}><Ionicons name="add" size={22} color="#F5C518" /></TouchableOpacity>
      </View>
      <View style={s.locationRow}>
        <Ionicons name="location" size={20} color="#F5C518" />
        <View style={s.locationInfo}>
          <Text style={s.locationLabel}>{tSync('فعّل الموقع', curLang())}</Text>
          <Text style={s.locationDesc}>{tSync('فعّل الموقع عشان نحدد موقعك الصحيح', curLang())}</Text>
        </View>
        <View style={s.toggle}><View style={s.toggleDot} /></View>
      </View>
      <Text style={s.sectionTitle}>{tSync('العناوين المحفوظة', curLang())}</Text>
      <ScrollView contentContainerStyle={s.list}>
        {addresses.map((a) => (
          <View key={a.id} style={s.addrCard}>
            <View style={s.addrTop}>
              <Ionicons name={a.label === 'My home' ? 'home' : 'business'} size={20} color="#F5C518" />
              <TranslatableName text={a.label} style={s.addrLabel} />
              {a.is_default && <View style={s.defaultBadge}><Ionicons name="checkmark" size={12} color="#10B981" /><Text style={s.defaultText}>{tSync('افتراضي', curLang())}</Text></View>}
            </View>
            <TranslatableName text={a.address} style={s.addrText} inline={false} />
            <View style={s.addrActions}>
              <TouchableOpacity testID={`edit-addr-${a.id}`} style={s.actionBtn}><Ionicons name="pencil" size={16} color="#52525B" /><Text style={s.actionText}>{tSync('تعديل', curLang())}</Text></TouchableOpacity>
              <TouchableOpacity testID={`delete-addr-${a.id}`} style={s.actionBtn} onPress={() => deleteAddr(a.id)}><Ionicons name="trash" size={16} color="#EF4444" /><Text style={[s.actionText, { color: '#EF4444' }]}>{tSync('حذف', curLang())}</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF7DA', alignItems: 'center', justifyContent: 'center' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 16, backgroundColor: '#F9F9FB', borderRadius: 16, marginBottom: 20 },
  locationInfo: { flex: 1, marginStart: 12 },
  locationLabel: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  locationDesc: { fontSize: 12, color: '#52525B' },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E4E4E7', justifyContent: 'center', paddingHorizontal: 2 },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', paddingHorizontal: 20, marginBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  addrCard: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginBottom: 12 },
  addrTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  addrLabel: { fontSize: 15, fontWeight: '600', color: '#0A0A0A', flex: 1 },
  defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  defaultText: { fontSize: 11, color: '#10B981', fontWeight: '600' },
  addrText: { fontSize: 13, color: '#52525B', lineHeight: 20, marginBottom: 12 },
  addrActions: { flexDirection: 'row', gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, color: '#52525B', fontWeight: '500' },
});
