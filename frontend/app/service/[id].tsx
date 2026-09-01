import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Dimensions, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../_layout';
import { mediaUrlSync } from '../../src/utils/upload';

const PURPLE = '#8833FF';
const { width } = Dimensions.get('window');

type Tab = 'about' | 'experiences' | 'reviews';

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [svc, setSvc] = useState<any>(null);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('about');
  const [imgIndex, setImgIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, exp, revs] = await Promise.all([
        apiCall(`/api/services/${id}`),
        apiCall(`/api/services/${id}/experiences`).catch(() => []),
        apiCall(`/api/services/${id}/reviews`).catch(() => []),
      ]);
      setSvc(d); setExperiences(exp); setReviews(revs);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color={PURPLE} /></View>;
  if (!svc) return <View style={s.load}><Text>غير موجودة</Text></View>;

  const images: string[] = svc.images?.length ? svc.images : [];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.topBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>{svc.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Hero images carousel */}
        <View>
          {images.length > 0 ? (
            <FlatList
              data={images} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e => setImgIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
              renderItem={({ item }) => (
                <Image source={{ uri: mediaUrlSync(item) }} style={{ width, height: 260 }} contentFit="cover" />
              )}
              keyExtractor={(_, i) => String(i)}
            />
          ) : (
            <LinearGradient colors={['#F4ECFF', '#E7D6FF']} style={s.heroFallback}>
              <Ionicons name={svc.icon || 'construct'} size={72} color={PURPLE} />
            </LinearGradient>
          )}
          {images.length > 1 && (
            <View style={s.dots}>
              {images.map((_, i) => <View key={i} style={[s.dot, imgIndex === i && s.dotActive]} />)}
            </View>
          )}
          {svc.warranty_available && (
            <View style={s.warrantyBadge}>
              <Ionicons name="shield-checkmark" size={14} color="white" />
              <Text style={s.warrantyBadgeText}>ضمان {svc.warranty_days} يوم</Text>
            </View>
          )}
        </View>

        <View style={s.headerCard}>
          <Text style={s.name}>{svc.name}</Text>
          {!!svc.desc && <Text style={s.desc}>{svc.desc}</Text>}
          <View style={s.metaRow}>
            <View style={s.metaChip}><Ionicons name="cash" size={14} color={PURPLE} /><Text style={s.metaText}>{svc.price} ر.س</Text></View>
            <View style={s.metaChip}><Ionicons name="time" size={14} color={PURPLE} /><Text style={s.metaText}>{svc.turnaround}</Text></View>
            {svc.rating > 0 && (
              <View style={s.metaChip}><Ionicons name="star" size={14} color="#F5C518" /><Text style={s.metaText}>{svc.rating} ({svc.review_count})</Text></View>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabsBar}>
          {[
            { id: 'about', name: 'نبذة', icon: 'information-circle' },
            { id: 'experiences', name: `تجارب (${experiences.length})`, icon: 'videocam' },
            { id: 'reviews', name: `تقييمات (${reviews.length})`, icon: 'star' },
          ].map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id as Tab)} style={[s.tabItem, tab === t.id && s.tabItemActive]}>
              <Ionicons name={t.icon as any} size={16} color={tab === t.id ? PURPLE : '#6B7280'} />
              <Text style={[s.tabText, tab === t.id && s.tabTextActive]}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'about' && (
          <View style={{ padding: 20 }}>
            {!!svc.long_description && (
              <View style={s.aboutCard}>
                <Text style={s.aboutTitle}>عن الخدمة</Text>
                <Text style={s.aboutBody}>{svc.long_description}</Text>
              </View>
            )}
            <View style={s.featureGrid}>
              <Feature icon="time-outline" title="مدة الإنجاز" value={svc.turnaround} />
              {svc.warranty_available && <Feature icon="shield-checkmark-outline" title="الضمان" value={`${svc.warranty_days} يوم`} />}
              {svc.home_pickup && <Feature icon="car-outline" title="استلام منزلي" value={`من ${svc.pickup_base_fee || 10} ر.س`} />}
              {svc.delivery_available && <Feature icon="paper-plane-outline" title="توصيل" value="متاح" />}
              {svc.inspection_price > 0 && <Feature icon="search-outline" title="رسم الفحص" value={`${svc.inspection_price} ر.س`} />}
            </View>
            {!!svc.warranty_terms && (
              <View style={s.warrantyCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="shield-checkmark" size={18} color="#10B981" />
                  <Text style={s.warrantyTitle}>شروط الضمان</Text>
                </View>
                <Text style={s.warrantyBody}>{svc.warranty_terms}</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'experiences' && (
          <View style={{ padding: 12 }}>
            {experiences.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="videocam-outline" size={48} color="#D4D4D8" />
                <Text style={s.emptyText}>لا توجد تجارب عملاء بعد</Text>
                <Text style={s.emptySubText}>كن أول من يجرب هذي الخدمة</Text>
              </View>
            ) : experiences.map(e => <ExperienceCard key={e.id} exp={e} />)}
          </View>
        )}

        {tab === 'reviews' && (
          <View style={{ padding: 16 }}>
            {reviews.length === 0 ? (
              <View style={s.emptyBox}>
                <Ionicons name="star-outline" size={48} color="#D4D4D8" />
                <Text style={s.emptyText}>لا توجد تقييمات بعد</Text>
              </View>
            ) : reviews.map(r => (
              <View key={r.id} style={s.reviewCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.reviewer}>{r.user_name || 'عميل'}</Text>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {[1,2,3,4,5].map(i => (
                      <Ionicons key={i} name={i <= r.stars ? 'star' : 'star-outline'} size={14} color="#F5C518" />
                    ))}
                  </View>
                </View>
                {!!r.comment && <Text style={s.reviewComment}>{r.comment}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={s.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.bottomLabel}>السعر</Text>
          <Text style={s.bottomPrice}>{svc.price} ر.س</Text>
        </View>
        <TouchableOpacity testID="book-svc-btn" style={s.bookBtn}
          onPress={() => router.push(`/service-booking?service_id=${svc.id}`)}>
          <Text style={s.bookText}>احجز الخدمة</Text>
          <Ionicons name="arrow-back" size={18} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Feature({ icon, title, value }: { icon: string; title: string; value: string }) {
  return (
    <View style={s.featureCard}>
      <Ionicons name={icon as any} size={20} color={PURPLE} />
      <Text style={s.featureTitle}>{title}</Text>
      <Text style={s.featureValue}>{value}</Text>
    </View>
  );
}

function ExperienceCard({ exp }: { exp: any }) {
  const player = useVideoPlayer(mediaUrlSync(exp.video_url), p => { p.loop = false; });
  return (
    <View style={s.expCard}>
      <VideoView player={player} style={s.expVideo} contentFit="cover" nativeControls />
      <View style={{ padding: 12 }}>
        {!!exp.caption && <Text style={s.expCaption}>{exp.caption}</Text>}
        {exp.avg_rating > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
            {[1,2,3,4,5].map(i => (
              <Ionicons key={i} name={i <= Math.round(exp.avg_rating) ? 'star' : 'star-outline'} size={14} color="#F5C518" />
            ))}
            <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>({exp.review_count})</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#0A0A0A' },
  heroFallback: { width: '100%', height: 260, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: 'white', width: 20 },
  warrantyBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4 },
  warrantyBadgeText: { color: 'white', fontSize: 11, fontWeight: '800' },
  headerCard: { padding: 20 },
  name: { fontSize: 22, fontWeight: '900', color: '#0A0A0A', textAlign: 'right' },
  desc: { fontSize: 14, color: '#52525B', marginTop: 6, lineHeight: 22, textAlign: 'right' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F4ECFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  metaText: { fontSize: 12, color: PURPLE, fontWeight: '700' },
  tabsBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#FFF' },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: PURPLE },
  tabText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  tabTextActive: { color: PURPLE, fontWeight: '800' },
  aboutCard: { backgroundColor: '#F9FAFB', padding: 14, borderRadius: 14, marginBottom: 12 },
  aboutTitle: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', marginBottom: 6, textAlign: 'right' },
  aboutBody: { fontSize: 14, color: '#374151', lineHeight: 22, textAlign: 'right' },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  featureCard: { width: '48%', padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  featureTitle: { fontSize: 12, color: '#6B7280', marginTop: 6, textAlign: 'right' },
  featureValue: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', marginTop: 2, textAlign: 'right' },
  warrantyCard: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  warrantyTitle: { fontSize: 14, fontWeight: '800', color: '#166534' },
  warrantyBody: { fontSize: 13, color: '#166534', marginTop: 6, lineHeight: 20, textAlign: 'right' },
  emptyBox: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 15, color: '#6B7280', fontWeight: '700' },
  emptySubText: { fontSize: 12, color: '#9CA3AF' },
  reviewCard: { padding: 12, borderRadius: 10, backgroundColor: '#F9FAFB', marginBottom: 8 },
  reviewer: { fontSize: 13, fontWeight: '800', color: '#0A0A0A' },
  reviewComment: { fontSize: 13, color: '#374151', marginTop: 4, textAlign: 'right' },
  expCard: { backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  expVideo: { width: '100%', height: 220, backgroundColor: '#000' },
  expCaption: { fontSize: 13, color: '#0A0A0A', textAlign: 'right' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 30, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', gap: 12 },
  bottomLabel: { fontSize: 11, color: '#6B7280', textAlign: 'right' },
  bottomPrice: { fontSize: 20, fontWeight: '900', color: PURPLE, textAlign: 'right' },
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PURPLE, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12 },
  bookText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
