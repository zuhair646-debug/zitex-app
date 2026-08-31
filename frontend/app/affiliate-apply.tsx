import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from './_layout';

export default function AffiliateApply() {
  const router = useRouter();
  const { merchant_id, merchant_name } = useLocalSearchParams<{ merchant_id?: string; merchant_name?: string }>();
  const { apiCall, user } = useAuth();
  const [form, setForm] = useState({
    full_name: user?.name || '',
    social_handle: '',
    audience_size: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [myAccounts, setMyAccounts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try { const a = await apiCall('/api/affiliate/my'); setMyAccounts(a); } catch {}
    })();
  }, []);

  const submit = async () => {
    if (!merchant_id) { Alert.alert('خطأ', 'لم يتم تحديد التاجر'); return; }
    if (!form.full_name.trim()) { Alert.alert('مطلوب', 'الاسم مطلوب'); return; }
    setSaving(true);
    try {
      await apiCall('/api/affiliate/apply', {
        method: 'POST',
        body: JSON.stringify({
          merchant_id,
          full_name: form.full_name,
          social_handle: form.social_handle,
          audience_size: parseInt(form.audience_size || '0', 10),
          note: form.note,
        }),
      });
      Alert.alert('✅ تم', 'تم إرسال طلبك للتاجر، ستصلك رسالة عند الموافقة.',
        [{ text: 'موافق', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>انضم كمسوّق</Text>
          <View style={s.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* Existing accounts */}
          {myAccounts.length > 0 && (
            <View style={s.myCard}>
              <Text style={s.myTitle}>🏆 حسابات المسوق النشطة ({myAccounts.length})</Text>
              {myAccounts.map(a => (
                <View key={a.id} style={s.myRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.myName}>مسوّق لدى تاجر</Text>
                    <View style={s.codeBox}><Text style={s.codeBoxText}>{a.referral_code}</Text></View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.myEarn}>{(a.total_earnings || 0).toFixed(0)} ر.س</Text>
                    <Text style={s.myConv}>{a.total_conversions || 0} تحويل</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Hero */}
          <LinearGradient colors={['#F5C518', '#D4AF37']} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Ionicons name="megaphone" size={40} color="#0A0A0A" />
            <Text style={s.heroTitle}>كن مسوّق Zitex</Text>
            <Text style={s.heroSubtitle}>احصل على عمولة % من كل عملية شراء عبر رابطك</Text>
          </LinearGradient>

          {merchant_name && (
            <View style={s.targetBox}>
              <Ionicons name="business" size={18} color="#8B7500" />
              <Text style={s.targetText}>التقديم على: <Text style={{ fontWeight: '800' }}>{merchant_name}</Text></Text>
            </View>
          )}

          <Text style={s.label}>الاسم الكامل *</Text>
          <TextInput style={s.input} value={form.full_name} onChangeText={t => setForm({ ...form, full_name: t })} placeholder="اسمك الرباعي" />

          <Text style={s.label}>حساب السوشال (اختياري)</Text>
          <TextInput style={s.input} value={form.social_handle} onChangeText={t => setForm({ ...form, social_handle: t })}
            placeholder="@username على انستقرام أو تويتر" autoCapitalize="none" />

          <Text style={s.label}>حجم الجمهور (متابع)</Text>
          <TextInput style={s.input} value={form.audience_size} keyboardType="numeric"
            onChangeText={t => setForm({ ...form, audience_size: t })} placeholder="5000" />

          <Text style={s.label}>ملاحظات (اختياري)</Text>
          <TextInput style={[s.input, { height: 100 }]} multiline value={form.note}
            onChangeText={t => setForm({ ...form, note: t })} placeholder="ليش تحس إنك مناسب للتسويق؟" />

          <TouchableOpacity onPress={submit} disabled={saving} style={s.submitBtn}>
            <LinearGradient colors={['#F5C518', '#D4AF37']} style={s.submitInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              {saving ? <ActivityIndicator color="#0A0A0A" /> : <>
                <Ionicons name="send" size={18} color="#0A0A0A" />
                <Text style={s.submitText}>إرسال الطلب</Text>
              </>}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={s.notice}>💡 بعد الموافقة، ستحصل على رابط إحالة فريد وتبدأ بكسب عمولات فورية.</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#0A0A0A' },
  hero: { alignItems: 'center', padding: 24, borderRadius: 16, marginBottom: 16 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#0A0A0A', marginTop: 8 },
  heroSubtitle: { fontSize: 13, color: '#0A0A0A', marginTop: 4, textAlign: 'center' },
  targetBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF6E0', padding: 12, borderRadius: 10, marginBottom: 12 },
  targetText: { color: '#8B7500', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, color: '#0A0A0A', textAlign: 'right' },
  submitBtn: { marginTop: 24, borderRadius: 12, overflow: 'hidden' },
  submitInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { color: '#0A0A0A', fontSize: 15, fontWeight: '800' },
  notice: { textAlign: 'center', fontSize: 11, color: '#6B7280', marginTop: 12, fontStyle: 'italic' },
  myCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F5C518' },
  myTitle: { fontSize: 13, fontWeight: '800', color: '#0A0A0A', marginBottom: 10 },
  myRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  myName: { fontSize: 13, color: '#374151', fontWeight: '600' },
  codeBox: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: '#FFF6E0', marginTop: 3 },
  codeBoxText: { color: '#8B7500', fontFamily: 'monospace', fontSize: 11, fontWeight: '800' },
  myEarn: { color: '#8B7500', fontSize: 14, fontWeight: '900' },
  myConv: { color: '#9CA3AF', fontSize: 11 },
});
