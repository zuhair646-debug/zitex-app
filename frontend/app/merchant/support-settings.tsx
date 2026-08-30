import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const FIELDS: { key: string; label: string; placeholder: string; icon: any; color: string; sub?: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp (مع كود الدولة)', placeholder: '966500000000', icon: 'logo-whatsapp', color: '#25D366', sub: 'بدون + أو 00' },
  { key: 'phone', label: 'رقم الهاتف', placeholder: '0500000000', icon: 'call', color: '#3B82F6' },
  { key: 'email', label: 'البريد الإلكتروني', placeholder: 'support@zitex.sa', icon: 'mail', color: '#EF4444' },
  { key: 'instagram', label: 'Instagram', placeholder: 'zitex_official', icon: 'logo-instagram', color: '#E1306C' },
  { key: 'twitter', label: 'X (Twitter)', placeholder: 'zitex_official', icon: 'logo-twitter', color: '#000' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'zitex_official', icon: 'logo-tiktok', color: '#000' },
  { key: 'snapchat', label: 'Snapchat', placeholder: 'zitex_official', icon: 'logo-snapchat', color: '#FFC000' },
  { key: 'telegram', label: 'Telegram', placeholder: 'zitex_official', icon: 'paper-plane', color: '#0088CC' },
  { key: 'address', label: 'العنوان', placeholder: 'الرياض، حي العليا', icon: 'location', color: '#10B981' },
  { key: 'working_hours', label: 'ساعات العمل', placeholder: 'السبت - الخميس: 9 ص - 11 م', icon: 'time', color: '#F59E0B' },
];

export default function SupportSettings() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/store/support'); setData(d); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiCall('/api/merchant/store/support', { method: 'PUT', body: JSON.stringify(data) });
      Alert.alert('تم الحفظ', 'تم تحديث معلومات الدعم');
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  if (loading || !data) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>📞 الدعم الفني</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>{saving ? <ActivityIndicator size="small" color="white" /> : <Text style={s.saveText}>حفظ</Text>}</TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>إظهار تنبيه "تواصل أولاً عبر السوشال"</Text>
            <Text style={s.toggleHint}>يظهر للعملاء في صفحة الدعم</Text>
          </View>
          <Switch value={!!data.contact_via_social_first} onValueChange={v => setData({ ...data, contact_via_social_first: v })} />
        </View>

        {FIELDS.map(f => (
          <View key={f.key} style={s.field}>
            <View style={s.fieldHeader}>
              <View style={[s.fIcon, { backgroundColor: f.color + '20' }]}><Ionicons name={f.icon} size={16} color={f.color} /></View>
              <Text style={s.fLabel}>{f.label}</Text>
            </View>
            <TextInput style={s.input} value={String(data[f.key] || '')} onChangeText={t => setData({ ...data, [f.key]: t })} placeholder={f.placeholder} autoCapitalize="none" />
            {!!f.sub && <Text style={s.sub}>{f.sub}</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white' },
  title: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  saveBtn: { backgroundColor: '#8833FF', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, minWidth: 60, alignItems: 'center' },
  saveText: { color: 'white', fontWeight: '800', fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 14 },
  toggleLabel: { fontSize: 13, fontWeight: '700' },
  toggleHint: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  field: { backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  fIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fLabel: { fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', textAlign: 'right' },
  sub: { fontSize: 10, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
});
