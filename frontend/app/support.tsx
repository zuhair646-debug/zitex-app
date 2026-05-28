import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';

export default function SupportScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const { t, lang } = useT();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall('/api/store/support').then(setInfo).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openLink = async (url: string) => {
    try { await Linking.openURL(url); } catch { Alert.alert(t('common.error'), 'تعذر فتح الرابط'); }
  };

  if (loading || !info) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  const channels = [
    { id: 'whatsapp', label: 'واتساب', sub: info.whatsapp, icon: 'logo-whatsapp', color: '#25D366', url: info.whatsapp ? `https://wa.me/${info.whatsapp}` : '' },
    { id: 'phone', label: lang === 'ar' ? 'اتصال هاتفي' : 'Phone', sub: info.phone, icon: 'call', color: '#3B82F6', url: info.phone ? `tel:${info.phone}` : '' },
    { id: 'email', label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email', sub: info.email, icon: 'mail', color: '#EF4444', url: info.email ? `mailto:${info.email}` : '' },
    { id: 'instagram', label: 'Instagram', sub: info.instagram, icon: 'logo-instagram', color: '#E1306C', url: info.instagram ? `https://instagram.com/${info.instagram.replace('@','')}` : '' },
    { id: 'twitter', label: 'X (Twitter)', sub: info.twitter, icon: 'logo-twitter', color: '#000000', url: info.twitter ? `https://twitter.com/${info.twitter.replace('@','')}` : '' },
    { id: 'tiktok', label: 'TikTok', sub: info.tiktok, icon: 'logo-tiktok', color: '#000000', url: info.tiktok ? `https://tiktok.com/@${info.tiktok.replace('@','')}` : '' },
    { id: 'snapchat', label: 'Snapchat', sub: info.snapchat, icon: 'logo-snapchat', color: '#FFFC00', url: info.snapchat ? `https://snapchat.com/add/${info.snapchat.replace('@','')}` : '' },
    { id: 'telegram', label: 'Telegram', sub: info.telegram, icon: 'paper-plane', color: '#0088CC', url: info.telegram ? `https://t.me/${info.telegram.replace('@','')}` : '' },
  ].filter(c => c.sub);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>🎧 {lang === 'ar' ? 'الدعم الفني' : 'Customer Support'}</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={s.hero}>
          <Ionicons name="headset" size={36} color="white" />
          <Text style={s.heroTitle}>{lang === 'ar' ? 'كيف يمكننا مساعدتك؟' : 'How can we help you?'}</Text>
          <Text style={s.heroSub}>{info.working_hours}</Text>
        </View>

        {info.contact_via_social_first && (
          <View style={s.tipBox}>
            <Ionicons name="information-circle" size={18} color="#3B82F6" />
            <Text style={s.tipText}>{lang === 'ar' ? 'للرد السريع، تواصل عبر السوشال ميديا أو الواتساب' : 'For fastest reply, contact via WhatsApp or social media'}</Text>
          </View>
        )}

        <Text style={s.section}>{lang === 'ar' ? 'وسائل التواصل' : 'Contact Channels'}</Text>
        <View style={s.grid}>
          {channels.map(c => (
            <TouchableOpacity key={c.id} style={[s.card, { borderColor: c.color + '40' }]} onPress={() => openLink(c.url)}>
              <View style={[s.iconBox, { backgroundColor: c.color + '20' }]}>
                <Ionicons name={c.icon as any} size={24} color={c.color} />
              </View>
              <Text style={s.cardLabel}>{c.label}</Text>
              <Text style={s.cardSub} numberOfLines={1}>{c.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {info.address && (<>
          <Text style={s.section}>📍 {lang === 'ar' ? 'العنوان' : 'Address'}</Text>
          <View style={s.addrBox}><Text style={s.addrText}>{info.address}</Text></View>
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white' },
  title: { fontSize: 17, fontWeight: '800' },
  hero: { backgroundColor: '#8833FF', padding: 24, borderRadius: 18, alignItems: 'center', marginBottom: 14 },
  heroTitle: { color: 'white', fontSize: 18, fontWeight: '800', marginTop: 8 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 },
  tipBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DBEAFE', padding: 10, borderRadius: 10, marginBottom: 14 },
  tipText: { fontSize: 12, color: '#1E40AF', fontWeight: '600', flex: 1 },
  section: { fontSize: 15, fontWeight: '800', color: '#0A0A0A', marginTop: 6, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '47%', backgroundColor: 'white', padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1.5 },
  iconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cardLabel: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  cardSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  addrBox: { backgroundColor: 'white', padding: 14, borderRadius: 10, marginTop: 4 },
  addrText: { fontSize: 13, color: '#374151' },
});
