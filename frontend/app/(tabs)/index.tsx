import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const { width } = Dimensions.get('window');
const CARD_W = (width - 60) / 2;

export default function HomeScreen() {
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [banners, setBanners] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [hotProducts, setHotProducts] = useState<any[]>([]);
  const [bestDeals, setBestDeals] = useState<any[]>([]);
  const [topCompetition, setTopCompetition] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bannerIdx, setBannerIdx] = useState(0);

  const loadData = async () => {
    try {
      const [b, c, hp, bd, comps] = await Promise.all([
        apiCall('/api/banners'),
        apiCall('/api/categories'),
        apiCall('/api/products?sort=popular&limit=6'),
        apiCall('/api/products?sort=newest&limit=6'),
        apiCall('/api/competitions').catch(() => []),
      ]);
      setBanners(b);
      setCategories(c);
      setHotProducts(hp.products || []);
      setBestDeals(bd.products || []);
      const live = (Array.isArray(comps) ? comps : []).find((x: any) => x.status === 'open' || x.status === 'live');
      setTopCompetition(live || (Array.isArray(comps) && comps[0]) || null);
    } catch (e) { console.log(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color="#8833FF" /></View>;

  const catImages: Record<string, string> = {
    'Phones': 'phone-portrait', 'Tablets': 'tablet-portrait', 'Laptops': 'laptop',
    'Accessories': 'headset', 'Smartwatches': 'watch', 'Gaming': 'game-controller',
  };

  const ProductCard = ({ p, showDiscount }: { p: any; showDiscount?: boolean }) => {
    const price = p.discount_price || p.price;
    const hasDiscount = p.discount_price && p.discount_price < p.price;
    const discountPct = hasDiscount ? Math.round(((p.price - p.discount_price) / p.price) * 100) : 0;

    return (
      <TouchableOpacity testID={`product-${p.id}`} style={s.productCard} onPress={() => router.push(`/product/${p.id}`)}>
        <View style={s.productImgWrap}>
          <Image source={{ uri: p.images?.[0] }} style={s.productImg} />
          {showDiscount && hasDiscount && (
            <View style={s.discountBadge}><Text style={s.discountText}>{discountPct}% OFF</Text></View>
          )}
          {!showDiscount && p.condition === 'new' && (
            <View style={s.newBadge}><Text style={s.newBadgeText}>New</Text></View>
          )}
          {p.condition !== 'new' && (
            <View style={s.usedBadge}><Text style={s.usedBadgeText}>Used</Text></View>
          )}
        </View>
        <View style={s.productInfo}>
          <View style={s.ratingRow}>
            <Ionicons name="star" size={12} color="#FACC15" />
            <Text style={s.ratingText}>{p.rating}</Text>
          </View>
          <Text style={s.productName} numberOfLines={1}>{p.name_en}</Text>
          <Text style={s.soldText}>{p.sold_count} SOLD</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{price}</Text>
            {hasDiscount && <Text style={s.oldPrice}>{p.price}</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8833FF" />} showsVerticalScrollIndicator={false}>

        {/* ─── Header ─── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <TouchableOpacity testID="notifications-btn" style={s.headerIconBtn} onPress={() => router.push('/notifications')}>
              <Ionicons name="notifications-outline" size={22} color="#0A0A0A" />
            </TouchableOpacity>
            <TouchableOpacity testID="search-btn" style={s.headerIconBtn} onPress={() => router.push('/search')}>
              <Ionicons name="search-outline" size={22} color="#0A0A0A" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity testID="store-selector" style={s.storeSelector}>
            <Ionicons name="storefront-outline" size={18} color="#8833FF" />
            <Text style={s.storeName}>Riyadh Store</Text>
            <Ionicons name="chevron-down" size={14} color="#52525B" />
          </TouchableOpacity>
          <View style={s.headerRight}>
            <TouchableOpacity testID="location-btn" style={s.locationBtn}>
              <Ionicons name="location-outline" size={16} color="#52525B" />
              <Text style={s.locationText}>My home</Text>
              <Ionicons name="chevron-down" size={12} color="#52525B" />
            </TouchableOpacity>
            <TouchableOpacity testID="cart-btn" style={s.cartBtn} onPress={() => router.push('/cart')}>
              <Ionicons name="bag-outline" size={22} color="#0A0A0A" />
              <View style={s.cartBadge}><Text style={s.cartBadgeText}>3</Text></View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Banner Slider ─── */}
        {banners.length > 0 && (
          <View style={s.bannerSection}>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setBannerIdx(Math.round(e.nativeEvent.contentOffset.x / (width - 40)))}>
              {banners.map((b, i) => (
                <View key={i} style={s.bannerSlide}>
                  <Image source={{ uri: b.image }} style={s.bannerImage} />
                </View>
              ))}
            </ScrollView>
            <View style={s.dotsRow}>
              {banners.map((_, i) => <View key={i} style={[s.dot, bannerIdx === i && s.dotActive]} />)}
            </View>
          </View>
        )}

        {/* ─── Categories ─── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Categories</Text>
            <TouchableOpacity testID="see-all-categories"><Text style={s.seeAll}>See all</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
            {categories.map((cat) => (
              <TouchableOpacity testID={`cat-${cat.id}`} key={cat.id} style={s.catCard}
                onPress={() => router.push({ pathname: '/search', params: { category: cat.id, categoryName: cat.name_en } })}>
                <View style={[s.catIconWrap, { backgroundColor: cat.color1 + '18' }]}>
                  <Ionicons name={(catImages[cat.name_en] || 'grid') as any} size={28} color={cat.color1} />
                </View>
                <Text style={s.catLabel} numberOfLines={1}>{cat.name_en}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ─── Used Devices Banner ─── */}
        <TouchableOpacity activeOpacity={0.85} style={s.usedDevicesBanner} onPress={() => router.push({ pathname: '/search', params: { condition: 'used', categoryName: 'الأجهزة المستخدمة' } })}>
          <View style={s.usedDevicesLeft}>
            <View style={s.offBadge}><Text style={s.offBadgeText}>75% OFF</Text></View>
            <Text style={s.usedDevicesTitle}>Used Devices</Text>
            <Text style={s.usedDevicesDesc}>Get like new devices in{'\n'}low price</Text>
            <View style={s.checkNowBtn}>
              <Text style={s.checkNowText}>Check it now</Text>
            </View>
          </View>
          <View style={s.usedDevicesRight}>
            <Image source={{ uri: hotProducts[0]?.images?.[0] }} style={s.usedDevicesImg} />
          </View>
        </TouchableOpacity>

        {/* ─── Hot Products ─── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionTitleRow}>
              <Ionicons name="flame" size={22} color="#EF4444" />
              <Text style={s.sectionTitle}>Hot products</Text>
            </View>
            <TouchableOpacity testID="see-all-hot" onPress={() => router.push('/search')}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.productScroll}>
            {hotProducts.map((p) => <ProductCard key={p.id} p={p} />)}
          </ScrollView>
        </View>

        {/* ─── Featured iPhone Banner ─── */}
        <TouchableOpacity activeOpacity={0.85} style={s.featuredBanner} onPress={() => hotProducts[0] ? router.push(`/product/${hotProducts[0].id}`) : router.push('/search')}>
          <View style={s.featuredContent}>
            <Text style={s.featuredTitle}>iPhone 16</Text>
            <View style={s.checkOutBtn}>
              <Text style={s.checkOutText}>Check out now!</Text>
            </View>
          </View>
          <Image source={{ uri: hotProducts[0]?.images?.[0] || '' }} style={s.featuredImg} />
        </TouchableOpacity>

        {/* ─── Best Deals ─── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionTitleRow}>
              <Ionicons name="pricetag" size={20} color="#8833FF" />
              <Text style={s.sectionTitle}>Best deals</Text>
            </View>
            <TouchableOpacity testID="see-all-deals" onPress={() => router.push('/search')}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.productScroll}>
            {bestDeals.filter(p => p.discount_price).map((p) => <ProductCard key={p.id} p={p} showDiscount />)}
          </ScrollView>
        </View>

        {/* ─── Competition Progress ─── */}
        {topCompetition && (() => {
          const joined = topCompetition.joined_count || 0;
          const max = topCompetition.max_participants || topCompetition.target || 250;
          const pct = Math.min(100, Math.round((joined / max) * 100));
          const daysLeft = topCompetition.end_date ? Math.max(0, Math.ceil((new Date(topCompetition.end_date).getTime() - Date.now()) / 86400000)) : null;
          return (
            <TouchableOpacity activeOpacity={0.85} style={s.competitionBanner} onPress={() => router.push(`/competition/${topCompetition.id || topCompetition._id}` as any)}>
              <View style={s.competitionLeft}>
                <View style={s.trophyWrap}>
                  <Ionicons name="trophy" size={28} color="#8833FF" />
                  {daysLeft != null && daysLeft <= 30 && <View style={s.trophyBadge}><Text style={s.trophyBadgeText}>{daysLeft}d</Text></View>}
                </View>
              </View>
              <View style={s.competitionContent}>
                <Text style={s.competitionText} numberOfLines={1}>🏆 {topCompetition.title || 'مسابقة جديدة'}</Text>
                <Text style={s.competitionPrize} numberOfLines={1}>{topCompetition.prize || 'جوائز قيمة'}</Text>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${pct}%` }]} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.progressText}>{joined}/{max} مشارك</Text>
                  <Text style={[s.progressText, { color: '#8833FF', fontWeight: '700' }]}>اضغط للتفاصيل ←</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })()}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerLeft: { flexDirection: 'row', gap: 6 },
  headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  storeSelector: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9F9FB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  storeName: { fontSize: 13, fontWeight: '600', color: '#0A0A0A' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F9F9FB' },
  locationText: { fontSize: 11, color: '#52525B', fontWeight: '500' },
  cartBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: '#8833FF', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  // Banner
  bannerSection: { paddingHorizontal: 20, marginBottom: 16 },
  bannerSlide: { width: width - 40, height: 180, borderRadius: 16, overflow: 'hidden', marginEnd: 12 },
  bannerImage: { width: '100%', height: '100%' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E4E4E7' },
  dotActive: { backgroundColor: '#8833FF', width: 24 },

  // Sections
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seeAll: { fontSize: 13, color: '#8833FF', fontWeight: '600' },

  // Categories
  catScroll: { paddingHorizontal: 16, gap: 12 },
  catCard: { alignItems: 'center', width: 72 },
  catIconWrap: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  catLabel: { fontSize: 11, fontWeight: '500', color: '#52525B', textAlign: 'center' },

  // Used Devices Banner
  usedDevicesBanner: { marginHorizontal: 20, borderRadius: 20, backgroundColor: '#F3F0FF', flexDirection: 'row', padding: 20, marginBottom: 20, overflow: 'hidden' },
  usedDevicesLeft: { flex: 1 },
  offBadge: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  offBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  usedDevicesTitle: { fontSize: 20, fontWeight: '800', color: '#0A0A0A', marginBottom: 4 },
  usedDevicesDesc: { fontSize: 13, color: '#52525B', lineHeight: 20, marginBottom: 12 },
  checkNowBtn: { backgroundColor: '#8833FF', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  checkNowText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  usedDevicesRight: { width: 100, alignItems: 'center', justifyContent: 'center' },
  usedDevicesImg: { width: 90, height: 120, borderRadius: 12 },

  // Product Cards
  productScroll: { paddingHorizontal: 16, gap: 12 },
  productCard: { width: CARD_W, backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F4F4F5' },
  productImgWrap: { width: '100%', height: CARD_W, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  productImg: { width: '80%', height: '80%' },
  discountBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discountText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  newBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  newBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  usedBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  usedBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  productInfo: { padding: 12 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  ratingText: { fontSize: 12, fontWeight: '600', color: '#0A0A0A' },
  productName: { fontSize: 13, fontWeight: '600', color: '#0A0A0A', marginBottom: 4 },
  soldText: { fontSize: 11, color: '#A1A1AA', marginBottom: 6, fontWeight: '500' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 16, fontWeight: '800', color: '#8833FF' },
  oldPrice: { fontSize: 12, color: '#A1A1AA', textDecorationLine: 'line-through' },

  // Featured Banner
  featuredBanner: { marginHorizontal: 20, borderRadius: 20, backgroundColor: '#1A1A2E', flexDirection: 'row', padding: 24, marginBottom: 20, overflow: 'hidden' },
  featuredContent: { flex: 1, justifyContent: 'center' },
  featuredTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 12 },
  checkOutBtn: { backgroundColor: '#8833FF', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  checkOutText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  featuredImg: { width: 100, height: 130, borderRadius: 12 },

  // Competition
  competitionBanner: { marginHorizontal: 20, borderRadius: 16, backgroundColor: '#F9F9FB', flexDirection: 'row', padding: 16, alignItems: 'center', marginBottom: 10 },
  competitionLeft: { marginEnd: 14 },
  trophyWrap: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center' },
  trophyBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  trophyBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  competitionContent: { flex: 1 },
  competitionText: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', marginBottom: 2 },
  competitionPrize: { fontSize: 11, color: '#8833FF', marginBottom: 6, fontWeight: '600' },
  progressBar: { height: 8, backgroundColor: '#E4E4E7', borderRadius: 4, marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: '#8833FF', borderRadius: 4 },
  progressText: { fontSize: 12, color: '#52525B', fontWeight: '600', textAlign: 'right' },
});
