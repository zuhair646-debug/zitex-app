import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';

const COMPETITIONS = [
  { id: '1', title: 'Spend & Win: Eid Special Draw', desc: 'Spend $100 or more between April 15-May 10 and enter our Eid prize draw to win amazing gifts!', prize: 'Win 1 of 5 iPhone 15s', status: 'Still open', joined: 237, total: 1000, timeLeft: '1D 5H left', progress: 0.8, color: '#8833FF' },
  { id: '2', title: 'Summer Tech Giveaway', desc: 'Purchase any laptop and get a chance to win a MacBook Pro!', prize: 'Win MacBook Pro 16"', status: 'Coming soon', joined: 0, total: 500, timeLeft: 'Starts in 5D', progress: 0, color: '#3B82F6' },
  { id: '3', title: 'Accessories Bundle Draw', desc: 'Buy 3 accessories and enter the draw for a complete Apple ecosystem bundle', prize: 'Win Apple Ecosystem Bundle', status: 'Ended', joined: 500, total: 500, timeLeft: 'Ended', progress: 1, color: '#10B981' },
];

export default function CompetitionsScreen() {
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [comps, setComps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { try { const d = await apiCall('/api/competitions'); setComps(d); } catch {} finally { setLoading(false); } })();
  }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#F5C518" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>المسابقات</Text>
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <View style={s.statIcon}><Ionicons name="trophy" size={22} color="#F5C518" /></View>
            <Text style={s.statNum}>{comps.filter((c: any) => c.status === 'open').length}</Text>
            <Text style={s.statLabel}>نشطة</Text>
          </View>
          <View style={s.statCard}>
            <View style={s.statIcon}><Ionicons name="checkmark-circle" size={22} color="#10B981" /></View>
            <Text style={s.statNum}>0</Text>
            <Text style={s.statLabel}>مشاركة</Text>
          </View>
          <View style={s.statCard}>
            <View style={s.statIcon}><Ionicons name="star" size={22} color="#F5C518" /></View>
            <Text style={s.statNum}>{user?.points || 0}</Text>
            <Text style={s.statLabel}>نقاطك</Text>
          </View>
        </View>

        {comps.map((comp: any) => (
          <TouchableOpacity testID={`competition-${comp.id}`} key={comp.id} style={s.compCard}
            onPress={() => router.push(comp.competition_type === 'ugc_video' ? `/ugc-contest?id=${comp.id}` : `/competition/${comp.id}`)}>
            <View style={s.compTop}>
              <View style={[s.statusBadge, { backgroundColor: comp.status === 'open' ? '#052E19' : comp.status === 'coming_soon' ? '#0B1B3B' : '#2A2A2A' }]}>
                <View style={[s.statusDot, { backgroundColor: comp.status === 'open' ? '#10B981' : comp.status === 'coming_soon' ? '#3B82F6' : '#6B7280' }]} />
                <Text style={[s.statusText, { color: comp.status === 'open' ? '#10B981' : comp.status === 'coming_soon' ? '#3B82F6' : '#9CA3AF' }]}>
                  {comp.status === 'open' ? 'مفتوحة' : comp.status === 'coming_soon' ? 'قريباً' : 'انتهت'}
                </Text>
              </View>
            </View>
            <Text style={s.compTitle}>{comp.title}</Text>
            <Text style={s.compDesc} numberOfLines={2}>{comp.description}</Text>

            <View style={s.prizeRow}>
              <Ionicons name="trophy" size={16} color="#F59E0B" />
              <Text style={s.prizeText}>{comp.prize}</Text>
            </View>

            <View style={s.progressSection}>
              <View style={s.progressBar}><View style={[s.progressFill, { width: `${Math.min((comp.joined_count / comp.max_participants) * 100, 100)}%` }]} /></View>
              <View style={s.progressInfo}>
                <Text style={s.progressLabel}>{comp.joined_count}/{comp.max_participants} joined</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '900', color: '#F5C518' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#151515', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A' },
  statIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: '#2E2404' },
  statNum: { fontSize: 20, fontWeight: '800', color: 'white', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  compCard: { marginHorizontal: 20, backgroundColor: '#151515', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#2A2A2A' },
  compTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#2E2404' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  timeLeft: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  compTitle: { fontSize: 16, fontWeight: '700', color: 'white', marginBottom: 6 },
  compDesc: { fontSize: 13, color: '#D0D0D0', lineHeight: 20, marginBottom: 12 },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2E2404', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#F5C518' },
  prizeText: { fontSize: 13, fontWeight: '700', color: '#F5C518' },
  progressSection: {},
  progressBar: { height: 8, backgroundColor: '#2A2A2A', borderRadius: 4 },
  progressFill: { height: '100%', borderRadius: 4 },
  progressInfo: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  progressLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
});
