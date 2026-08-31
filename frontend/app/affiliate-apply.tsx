import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from './_layout';

export default function AffiliateApply() {
  const router = useRouter();
  const { merchant_id, merchant_name, campaign_id, commission } = useLocalSearchParams<{
    merchant_id?: string; merchant_name?: string; campaign_id?: string; commission?: string;
  }>();
  const { apiCall, user } = useAuth();

  const [form, setForm] = useState({
    full_name: user?.name || '',
    phone: user?.phone || '',
    city: user?.city || '',
    email: user?.email || '',
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

  const missing = (key: keyof typeof form) => !form[key] || (typeof form[key] === 'string' && !form[key].trim());
  const requiredMissing = missing('full_name') || missing('phone');

  const submit = async () => {
    if (!merchant_id) { Alert.alert('خطأ', 'لم يتم تحديد التاجر'); return; }
    if (requiredMissing) { Alert.alert('حقول ناقصة', 'يرجى إكمال الاسم ورقم الجوال'); return; }
    setSaving(true);
    try {
      await apiCall('/api/affiliate/apply', {
        method: 'POST',
        body: JSON.stringify({
          merchant_id,
          campaign_id: campaign_id || '',
          full_name: form.full_name,
          social_handle: form.social_handle,
          audience_size: parseInt(form.audience_size || '0', 10),
          note: form.note,
        }),
      });
      Alert.alert('✅ تم إرسال الطلب', 'سيصلك إشعار عند موافقة التاجر.',
        [{ text: 'موافق', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  const fieldStyle = (key: keyof typeof form) => [
    s.input,
    missing(key) ? s.inputMissing : null,
  ];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#F5C518" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>انضم كمسوّق</Text>
          <View style={s.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {myAccounts.length > 0 && (
            <View style={s.myCard}>
              <Text style={s.myTitle}>🏆 حسابات المسوق النشطة ({myAccounts.length})</Text>
              {myAccounts.map(a => (
                <View key={a.id} style={s.myRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.myName}>{a.merchant_name || 'مسوّق لدى تاجر'}</Text>
                    <View style={s.codeBox}><Text style={s.codeBoxText}>{a.referral_code}</Text></View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.myEarn}>{(a.total_earnings || 0).toFixed(0)} ر.س</Text>
                    <Text style={s.myConv}>{a.commission_percent}% • {a.total_conversions || 0} تحويل</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={() => router.push('/my-affiliate')} style={s.dashLink}>
                <Text style={s.dashLinkText}>افتح لوحة المسوّق ←</Text>
              </TouchableOpacity>
            </View>
          )}

          <LinearGradient colors={['#F5C518', '#D4AF37']} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Ionicons name="megaphone" size={40} color="#0A0A0A" />
            <Text style={s.heroTitle}>{commission ? `اربح ${commission}% عمولة` : 'كن مسوّق Zitex'}</Text>
            <Text style={s.heroSubtitle}>من كل عملية شراء تتم عبر رابطك الفريد</Text>
          </LinearGradient>

          {!!merchant_name && (
            <View style={s.targetBox}>
              <Ionicons name="business" size={18} color="#F5C518" />
              <Text style={s.targetText}>التقديم لـ: <Text style={{ fontWeight: '800' }}>{merchant_name}</Text></Text>
            </View>
          )}

          {(missing('full_name') || missing('phone') || missing('city')) && (
            <View style={s.warnBox}>
              <Ionicons name="alert-circle" size={18} color="#F59E0B" />
              <Text style={s.warnText}>يرجى إكمال المعلومات الناقصة أدناه</Text>
            </View>
          )}

          <View style={s.autofillBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <Text style={s.autofillText}>المعلومات مأخوذة من حسابك تلقائياً</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
            <Text style={s.label}>الاسم الكامل *</Text>
            {missing('full_name') && <Text style={s.missTag}>مطلوب</Text>}
          </View>
          <TextInput style={fieldStyle('full_name')} value={form.full_name}
            placeholderTextColor="#6B7280"
            onChangeText={t => setForm({ ...form, full_name: t })} placeholder="اسمك الرباعي" />

          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
            <Text style={s.label}>رقم الجوال *</Text>
            {missing('phone') && <Text style={s.missTag}>مطلوب</Text>}
          </View>
          <TextInput style={fieldStyle('phone')} value={form.phone} editable={false}
            placeholderTextColor="#6B7280" placeholder="من حسابك" />

          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
            <Text style={s.label}>المدينة</Text>
            {missing('city') && <Text style={s.missTag}>ناقص</Text>}
          </View>
          <TextInput style={fieldStyle('city')} value={form.city}
            onChangeText={t => setForm({ ...form, city: t })}
            placeholderTextColor="#6B7280" placeholder="الرياض" />

          <Text style={[s.label, { marginTop: 12 }]}>حساب السوشال (اختياري)</Text>
          <TextInput testID="apply-social-input" style={s.input} value={form.social_handle}
            onChangeText={t => setForm({ ...form, social_handle: t })}
            placeholderTextColor="#6B7280" placeholder="@username على انستقرام أو تويتر" autoCapitalize="none" />

          <Text style={[s.label, { marginTop: 12 }]}>حجم الجمهور (متابع)</Text>
          <TextInput testID="apply-audience-input" style={s.input} value={form.audience_size} keyboardType="numeric"
            onChangeText={t => setForm({ ...form, audience_size: t })}
            placeholderTextColor="#6B7280" placeholder="5000" />

          <Text style={[s.label, { marginTop: 12 }]}>لماذا تريد الانضمام؟ (اختياري)</Text>
          <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]} multiline
            value={form.note} onChangeText={t => setForm({ ...form, note: t })}
            placeholderTextColor="#6B7280" placeholder="أشارك أخبار التقنية مع متابعيني..." />

          <TouchableOpacity testID="apply-submit-btn" onPress={submit} disabled={saving} style={s.submitBtn}>
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
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: 'white' },
  hero: { alignItems: 'center', padding: 24, borderRadius: 16, marginBottom: 12 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#0A0A0A', marginTop: 8 },
  heroSubtitle: { fontSize: 13, color: '#0A0A0A', marginTop: 4, textAlign: 'center' },
  targetBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1F1F1F', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2E2404' },
  targetText: { color: '#F5C518', fontSize: 13 },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#432104', padding: 10, borderRadius: 10, marginTop: 8, borderWidth: 1, borderColor: '#F59E0B' },
  warnText: { color: '#F59E0B', fontSize: 12, fontWeight: '700' },
  autofillBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#052E19', padding: 8, borderRadius: 8, marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#10B981' },
  autofillText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: '#F5C518' },
  missTag: { fontSize: 10, color: '#F59E0B', fontWeight: '700' },
  input: { backgroundColor: '#151515', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', fontSize: 14, color: 'white', textAlign: 'right' },
  inputMissing: { borderColor: '#F59E0B', backgroundColor: '#241505' },
  submitBtn: { marginTop: 24, borderRadius: 12, overflow: 'hidden' },
  submitInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { color: '#0A0A0A', fontSize: 15, fontWeight: '800' },
  notice: { textAlign: 'center', fontSize: 11, color: '#6B7280', marginTop: 12, fontStyle: 'italic' },
  myCard: { backgroundColor: '#151515', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F5C518' },
  myTitle: { fontSize: 13, fontWeight: '800', color: '#F5C518', marginBottom: 10 },
  myRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  myName: { fontSize: 13, color: 'white', fontWeight: '600' },
  codeBox: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: '#2E2404', marginTop: 3 },
  codeBoxText: { color: '#F5C518', fontFamily: 'monospace', fontSize: 11, fontWeight: '800' },
  myEarn: { color: '#F5C518', fontSize: 14, fontWeight: '900' },
  myConv: { color: '#9CA3AF', fontSize: 10 },
  dashLink: { marginTop: 8, alignSelf: 'flex-end' },
  dashLinkText: { color: '#F5C518', fontSize: 12, fontWeight: '800' },
});
