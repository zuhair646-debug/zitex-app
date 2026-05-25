import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AboutStoreScreen() {
  const router = useRouter();
  const stores = [
    { name: 'Riyadh Store', address: 'Prince Mohammed Bin Abdulaziz Rd, Riyadh', phone: '+966 1234 8366 90' },
    { name: 'Jeddah Store', address: 'King Fahad Road, Al Hamra, Jeddah', phone: '+966 1234 9277 01' },
  ];
  const [selected, setSelected] = require('react').useState(0);
  const store = stores[selected];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="about-back" style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={s.title}>About the store</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={s.storeSelector}>
          {stores.map((st, i) => (
            <TouchableOpacity key={i} testID={`store-${i}`} style={[s.storePill, selected === i && s.storePillActive]}
              onPress={() => setSelected(i)}>
              <Ionicons name="storefront" size={16} color={selected === i ? '#FFF' : '#52525B'} />
              <Text style={[s.storePillText, selected === i && s.storePillTextActive]}>{st.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.logoSection}>
          <View style={s.logoCircle}><Ionicons name="phone-portrait-outline" size={40} color="#8833FF" /></View>
          <Text style={s.storeName}>Tech Store</Text>
          <Text style={s.storeDesc}>A tech store for phones and accessories</Text>
        </View>

        <View style={s.infoCard}>
          <View style={s.infoRow}>
            <Ionicons name="call" size={20} color="#8833FF" />
            <Text style={s.infoText}>{store.phone}</Text>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${store.phone}`)}><Ionicons name="copy" size={18} color="#A1A1AA" /></TouchableOpacity>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Ionicons name="location" size={20} color="#8833FF" />
            <Text style={s.infoText}>{store.address}</Text>
            <TouchableOpacity><Ionicons name="open-outline" size={18} color="#A1A1AA" /></TouchableOpacity>
          </View>
        </View>

        <View style={s.mapPlaceholder}>
          <Ionicons name="map" size={40} color="#A1A1AA" />
          <Text style={s.mapText}>Map - {store.name}</Text>
          <Text style={s.mapAddr}>{store.address}</Text>
        </View>

        <View style={s.socialSection}>
          <Text style={s.socialTitle}>Follow us</Text>
          <View style={s.socialRow}>
            {[{ icon: 'logo-twitter', color: '#1DA1F2' }, { icon: 'logo-instagram', color: '#E4405F' }, { icon: 'logo-whatsapp', color: '#25D366' }, { icon: 'logo-tiktok', color: '#000' }].map((soc, i) => (
              <TouchableOpacity key={i} style={[s.socialBtn, { backgroundColor: soc.color + '15' }]}>
                <Ionicons name={soc.icon as any} size={24} color={soc.color} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  storeSelector: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  storePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, backgroundColor: '#F9F9FB', borderWidth: 1, borderColor: '#E4E4E7' },
  storePillActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  storePillText: { fontSize: 13, fontWeight: '600', color: '#52525B' },
  storePillTextActive: { color: '#FFF' },
  logoSection: { alignItems: 'center', marginBottom: 24 },
  logoCircle: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  storeName: { fontSize: 22, fontWeight: '800', color: '#0A0A0A', marginBottom: 4 },
  storeDesc: { fontSize: 14, color: '#52525B' },
  infoCard: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginBottom: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoText: { flex: 1, fontSize: 14, color: '#0A0A0A' },
  divider: { height: 1, backgroundColor: '#E4E4E7', marginVertical: 12 },
  mapPlaceholder: { height: 200, backgroundColor: '#F9F9FB', borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 8 },
  mapText: { fontSize: 16, fontWeight: '600', color: '#0A0A0A' },
  mapAddr: { fontSize: 13, color: '#52525B' },
  socialSection: { marginBottom: 20 },
  socialTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 12 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialBtn: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
