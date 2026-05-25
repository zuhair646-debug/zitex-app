import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';

const { width } = Dimensions.get('window');
const CARD_W = width - 40;

export default function ServicesScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { const d = await apiCall('/api/services'); setServices(d); } catch {} finally { setLoading(false); } })(); }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#8833FF" /></View>;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Services</Text>
          <TouchableOpacity testID="service-search-btn" style={s.searchBtn}>
            <Ionicons name="search-outline" size={20} color="#52525B" />
          </TouchableOpacity>
        </View>

        <View style={s.promoCard}>
          <View style={s.promoContent}>
            <Text style={s.promoTag}>Expert Repair</Text>
            <Text style={s.promoTitle}>Fix your device{'\n'}with us!</Text>
            <Text style={s.promoDesc}>Certified technicians with genuine parts</Text>
            <TouchableOpacity testID="book-service-btn" style={s.promoBtn}>
              <Text style={s.promoBtnText}>Book a service</Text>
            </TouchableOpacity>
          </View>
          <View style={s.promoImgWrap}>
            <Ionicons name="construct" size={60} color="#FFF" />
          </View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>All Services</Text>
            <Text style={s.sectionCount}>{services.length} services</Text>
          </View>
          {services.map((svc: any) => (
            <TouchableOpacity testID={`service-${svc.id}`} key={svc.id} style={s.serviceCard}
              onPress={() => router.push({ pathname: '/service/[id]', params: { id: svc.id } })}>
              <View style={[s.serviceIcon, { backgroundColor: (svc.color || '#8833FF') + '18' }]}>
                <Ionicons name={(svc.icon || 'construct') as any} size={26} color={svc.color || '#8833FF'} />
              </View>
              <View style={s.serviceInfo}>
                <Text style={s.serviceName}>{svc.name}</Text>
                <Text style={s.serviceDesc} numberOfLines={1}>{svc.desc}</Text>
                <View style={s.serviceBottom}>
                  <Text style={s.serviceRequests}>{svc.total_requests} REQUESTS</Text>
                  <Text style={s.servicePrice}>From {svc.price} SAR</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A0A0A' },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  promoCard: { marginHorizontal: 20, borderRadius: 20, backgroundColor: '#8833FF', flexDirection: 'row', padding: 20, marginBottom: 24, overflow: 'hidden' },
  promoContent: { flex: 1 },
  promoTag: { fontSize: 11, fontWeight: '700', color: '#FFF', opacity: 0.8, marginBottom: 6 },
  promoTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', lineHeight: 30, marginBottom: 6 },
  promoDesc: { fontSize: 12, color: '#FFF', opacity: 0.8, marginBottom: 14 },
  promoBtn: { backgroundColor: '#FFF', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  promoBtnText: { fontSize: 13, fontWeight: '700', color: '#8833FF' },
  promoImgWrap: { width: 100, alignItems: 'center', justifyContent: 'center', opacity: 0.3 },
  section: { paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  sectionCount: { fontSize: 13, color: '#A1A1AA' },
  serviceCard: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#F9F9FB', borderRadius: 16, marginBottom: 10 },
  serviceIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  serviceInfo: { flex: 1, marginEnd: 8 },
  serviceName: { fontSize: 15, fontWeight: '600', color: '#0A0A0A', marginBottom: 3 },
  serviceDesc: { fontSize: 12, color: '#52525B', marginBottom: 6 },
  serviceBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  serviceRequests: { fontSize: 11, color: '#A1A1AA', fontWeight: '500' },
  servicePrice: { fontSize: 12, color: '#8833FF', fontWeight: '700' },
});
