import { useMemo,  useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions, RefreshControl, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import { colors } from '../../src/theme/tokens';
import { useAuth } from '../_layout';
import { TX, tSync, tf } from '../../src/useAutoT';
import { useT, curLang } from '../../src/i18n';
import TranslatableName from '../../src/components/TranslatableName';
import { mediaUrlSync } from '../../src/utils/upload';

const { width } = Dimensions.get('window');
const CARD_W = (width - 60) / 2;

export default function HomeScreen() {
  const { lang } = useT();
  const s = useSStyles();
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [banners, setBanners] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [hotProducts, setHotProducts] = useState<any[]>([]);
  const [bestDeals, setBestDeals] = useState<any[]>([]);
  const [topCompetition, setTopCompetition] = useState<any>(null);
  const [nearestBranch, setNearestBranch] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [affiliateCount, setAffiliateCount] = useState(0);
  const [activeBooking, setActiveBooking] = useState<any>(null);

  // Prompt for location on first launch if not set
  useEffect(() => {
    if (user && !user.default_lat) {
      const timer = setTimeout(() => {
        // Auto-redirect to setup-location once
        AsyncStorage.getItem('location_prompted').then(v => {
          if (!v) {
            AsyncStorage.setItem('location_prompted', '1');
            router.push('/setup-location' as any);
          }
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
    // Load nearest branch info if user has location
    if (user?.default_lat && user?.default_lng) {
      apiCall(`/api/branches/nearest?lat=${user.default_lat}&lng=${user.default_lng}`).then(setNearestBranch).catch(() => {});
    }
  }, [user]);

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

  useEffect(() => {
    (async () => {
      try {
        const a = await apiCall('/api/affiliate/my').catch(() => []);
        setAffiliateCount(Array.isArray(a) ? a.length : 0);
      } catch {}
      try {
        const bookings = await apiCall('/api/services/bookings/my').catch(() => []);
        const arr = Array.isArray(bookings) ? bookings : [];
        // priority: in_progress > ready > received > pending
        const priority = ['in_progress', 'ready', 'received', 'pending'];
        const active = priority.map(p => arr.find((b: any) => b.status === p)).find(Boolean);
        if (active) setActiveBooking(active);
      } catch {}
    })();
  }, []);

  useEffect(() => { loadData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color={colors.brand} /></View>;

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
            <View style={s.discountBadge}><Text style={s.discountText}>{tf('خصم {0}%', lang, [discountPct])}</Text></View>
          )}
          {!showDiscount && p.condition === 'new' && (
            <View style={s.newBadge}><Text style={s.newBadgeText}>{tSync('جديد', lang)}</Text></View>
          )}
          {p.condition !== 'new' && (
            <View style={s.usedBadge}><Text style={s.usedBadgeText}>{tSync('مستعمل', lang)}</Text></View>
          )}
        </View>
        <View style={s.productInfo}>
          <View style={s.ratingRow}>
            <Ionicons name="star" size={12} color="#FACC15" />
            <Text style={s.ratingText}>{p.rating}</Text>
          </View>
          <TranslatableName
            text={lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}
            sourceLang={lang === 'ar' ? 'ar' : 'en'}
            style={s.productName}
            numberOfLines={1}
            iconSize={12}
          />
          <Text style={s.soldText}>{tf('{0} مُباع', lang, [p.sold_count])}</Text>
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
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />} showsVerticalScrollIndicator={false}>

        {/* ─── Header ─── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <TouchableOpacity testID="notifications-btn" style={s.headerIconBtn} onPress={() => router.push('/notifications')}>
              <Ionicons name="notifications-outline" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity testID="search-btn" style={s.headerIconBtn} onPress={() => router.push('/search')}>
              <Ionicons name="search-outline" size={22} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity testID="store-selector" style={s.storeSelector}>
            <Ionicons name="storefront-outline" size={18} color={colors.brand} />
            <Text style={s.storeName} numberOfLines={1}>{tSync('فرع الرياض', lang)}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
          <View style={s.headerRight}>
            <TouchableOpacity testID="location-btn" style={s.locationBtn}>
              <Ionicons name="location-outline" size={16} color={colors.onSurfaceSecondary} />
              <Text style={s.locationText}>{tSync('بيتي', lang)}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.onSurfaceSecondary} />
            </TouchableOpacity>
            <TouchableOpacity testID="cart-btn" style={s.cartBtn} onPress={() => router.push('/cart')}>
              <Ionicons name="bag-outline" size={22} color={colors.onSurface} />
              <View style={s.cartBadge}><Text style={s.cartBadgeText}>3</Text></View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Store ↔ Affiliate toggle (only if user has ≥1 approved affiliate account) ─── */}
        {affiliateCount > 0 && (
          <View style={s.tglWrap}>
            <View style={s.tglOn}>
              <Ionicons name="storefront" size={14} color={colors.brand} />
              <TX style={s.tglOnText}>🛍 المتجر</TX>
            </View>
            <TouchableOpacity onPress={() => router.push('/my-affiliate')} style={s.tglOff}>
              <TX style={s.tglOffText}>🏆 المسوّق</TX>
              {affiliateCount > 0 && <View style={s.tglBadge}><Text style={s.tglBadgeText}>{affiliateCount}</Text></View>}
            </TouchableOpacity>
          </View>
        )}

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
            <Text style={s.sectionTitle}>{tSync('الفئات', lang)}</Text>
            <TouchableOpacity testID="see-all-categories"><Text style={s.seeAll}>{tSync('شوف الكل', lang)}</Text></TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
            {categories.map((cat) => (
              <TouchableOpacity testID={`cat-${cat.id}`} key={cat.id} style={s.catCard}
                onPress={() => router.push({ pathname: '/search', params: { category: cat.id, categoryName: cat.name_en } })}>
                <View style={[s.catIconWrap, { backgroundColor: cat.color1 + '18' }]}>
                  {/^(https?:|\/api\/)/.test(cat.image || '')
                    ? <Image source={{ uri: mediaUrlSync(cat.image) }} style={s.catPhoto} />
                    : <Ionicons name={(catImages[cat.name_en] || 'grid') as any} size={28} color={cat.color1} />}
                </View>
                <TranslatableName
                  text={lang === 'ar' ? (cat.name_ar || cat.name_en) : (cat.name_en || cat.name_ar)}
                  sourceLang={lang === 'ar' ? 'ar' : 'en'}
                  style={s.catLabel}
                  numberOfLines={1}
                  iconSize={11}
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ─── Quick Access: Group Buy + Loyalty Points ─── */}
        <View style={s.quickRow}>
          <TouchableOpacity style={[s.quickCard, { backgroundColor: 'rgba(236,72,153,0.14)' }]} onPress={() => router.push('/group-buys' as any)}>
            <Ionicons name="people" size={26} color="#EC4899" />
            <TX style={s.quickTitle}>التسوق الجماعي</TX>
            <TX style={s.quickSub}>وفّر أكثر بالمجموعة 👥</TX>
          </TouchableOpacity>
          <TouchableOpacity style={[s.quickCard, { backgroundColor: 'rgba(245,158,11,0.14)' }]} onPress={() => router.push('/points' as any)}>
            <Ionicons name="medal" size={26} color="#F59E0B" />
            <TX style={s.quickTitle}>نقاط الولاء</TX>
            <TX style={s.quickSub}>اكسب وامنح خصومات 🎖️</TX>
          </TouchableOpacity>
        </View>

        {/* ─── Used Devices Banner ─── */}
        <TouchableOpacity activeOpacity={0.85} style={s.usedDevicesBanner} onPress={() => router.push({ pathname: '/search', params: { condition: 'used', categoryName: 'الأجهزة المستخدمة' } })}>
          <View style={s.usedDevicesLeft}>
            <View style={s.offBadge}><Text style={s.offBadgeText}>{tSync('خصم 75%', lang)}</Text></View>
            <Text style={s.usedDevicesTitle}>{tSync('الأجهزة المستعملة', lang)}</Text>
            <Text style={s.usedDevicesDesc}>{tSync('أجهزة بحالة الجديد\nبأسعار منخفضة', lang)}</Text>
            <View style={s.checkNowBtn}>
              <Text style={s.checkNowText}>{tSync('شوفها الحين', lang)}</Text>
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
              <Text style={s.sectionTitle}>{tSync('منتجات رائجة', lang)}</Text>
            </View>
            <TouchableOpacity testID="see-all-hot" onPress={() => router.push('/search')}>
              <Text style={s.seeAll}>{tSync('شوف الكل', lang)}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.productScroll}>
            {hotProducts.map((p) => <ProductCard key={p.id} p={p} />)}
          </ScrollView>
        </View>

        {/* ─── Featured iPhone Banner ─── */}
        <TouchableOpacity activeOpacity={0.85} style={s.featuredBanner} onPress={() => hotProducts[0] ? router.push(`/product/${hotProducts[0].id}`) : router.push('/search')}>
          <View style={s.featuredContent}>
            <TranslatableName text="iPhone 16" style={s.featuredTitle} noToggle />
            <View style={s.checkOutBtn}>
              <Text style={s.checkOutText}>{tSync('أتمم الشراء الحين!', lang)}</Text>
            </View>
          </View>
          <Image source={{ uri: hotProducts[0]?.images?.[0] || '' }} style={s.featuredImg} />
        </TouchableOpacity>

        {/* ─── Best Deals ─── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionTitleRow}>
              <Ionicons name="pricetag" size={20} color={colors.brand} />
              <Text style={s.sectionTitle}>{tSync('أفضل العروض', lang)}</Text>
            </View>
            <TouchableOpacity testID="see-all-deals" onPress={() => router.push('/search')}>
              <Text style={s.seeAll}>{tSync('شوف الكل', lang)}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.productScroll}>
            {bestDeals.filter(p => p.discount_price).map((p) => <ProductCard key={p.id} p={p} showDiscount />)}
          </ScrollView>
        </View>

        {/* ─── Active Service Booking widget ─── */}
        {activeBooking && (
          <TouchableOpacity testID="active-service-banner" activeOpacity={0.85} style={s.svcBanner} onPress={() => router.push('/my-services')}>
            <View style={s.svcIconWrap}>
              <Ionicons name="construct" size={26} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.svcBannerTitle}>🛠️ {activeBooking.service_name}</Text>
              <Text style={s.svcBannerSub}>{activeBooking.device_model} • {
                activeBooking.status === 'pending' ? 'قيد الاستلام' :
                activeBooking.status === 'received' ? 'مستلم' :
                activeBooking.status === 'in_progress' ? 'قيد الإصلاح' :
                activeBooking.status === 'ready' ? 'جاهز للاستلام' : activeBooking.status
              }</Text>
            </View>
            <Ionicons name="chevron-back" size={22} color={colors.brand} />
          </TouchableOpacity>
        )}

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
                  <Ionicons name="trophy" size={28} color={colors.brand} />
                  {daysLeft != null && daysLeft <= 30 && <View style={s.trophyBadge}><Text style={s.trophyBadgeText}>{daysLeft}d</Text></View>}
                </View>
              </View>
              <View style={s.competitionContent}>
                <TranslatableName text={'🏆 ' + (topCompetition.title || tSync('مسابقة جديدة', curLang()))} style={s.competitionText} numberOfLines={1} />
                <TranslatableName text={topCompetition.prize || tSync('جوائز قيمة', curLang())} style={s.competitionPrize} numberOfLines={1} />
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${pct}%` }]} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.progressText}>{joined}/{max} {tSync('مشارك', lang)}</Text>
                  <TX style={[s.progressText, { color: colors.brand, fontWeight: '700' }]}>اضغط للتفاصيل ←</TX>
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

function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tglWrap: { flexDirection: 'row', marginHorizontal: 16, marginTop: 4, marginBottom: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 999, padding: 4 },
  tglOn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface },
  tglOnText: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  tglOff: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999, backgroundColor: 'transparent' },
  tglOffText: { color: colors.onSurfaceSecondary, fontWeight: '700', fontSize: 13 },
  tglBadge: { backgroundColor: colors.brand, paddingHorizontal: 6, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tglBadgeText: { color: '#0A0A0A', fontWeight: '900', fontSize: 10 },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerLeft: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  storeSelector: { flex: 1, minWidth: 0, flexShrink: 1, marginHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  storeName: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.onSurface },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.surfaceSecondary },
  locationText: { fontSize: 11, color: colors.onSurfaceSecondary, fontWeight: '500' },
  cartBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: colors.brand, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  // Banner
  bannerSection: { paddingHorizontal: 20, marginBottom: 16 },
  bannerSlide: { width: width - 40, height: 180, borderRadius: 16, overflow: 'hidden', marginEnd: 12 },
  bannerImage: { width: '100%', height: '100%' },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brand, width: 24 },

  // Sections
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seeAll: { fontSize: 13, color: colors.brand, fontWeight: '600' },

  // Categories
  catScroll: { paddingHorizontal: 16, gap: 12 },
  catCard: { alignItems: 'center', width: 76 },
  catIconWrap: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6, overflow: 'hidden' },
  catPhoto: { width: '100%', height: '100%' },
  catLabel: { fontSize: 11, fontWeight: '500', color: colors.onSurfaceSecondary, textAlign: 'center' },
  quickRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 16 },
  quickCard: { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center' },
  quickTitle: { fontSize: 13, fontWeight: '800', color: colors.onSurface, marginTop: 6 },
  quickSub: { fontSize: 10, color: colors.onSurfaceSecondary, marginTop: 2, textAlign: 'center' },

  // Used Devices Banner
  usedDevicesBanner: { marginHorizontal: 20, borderRadius: 20, backgroundColor: colors.surfaceSecondary, flexDirection: 'row', padding: 20, marginBottom: 20, overflow: 'hidden' },
  usedDevicesLeft: { flex: 1 },
  offBadge: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  offBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  usedDevicesTitle: { fontSize: 20, fontWeight: '800', color: colors.onSurface, marginBottom: 4 },
  usedDevicesDesc: { fontSize: 13, color: colors.onSurfaceSecondary, lineHeight: 20, marginBottom: 12 },
  checkNowBtn: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  checkNowText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: '700' },
  usedDevicesRight: { width: 100, alignItems: 'center', justifyContent: 'center' },
  usedDevicesImg: { width: 90, height: 120, borderRadius: 12 },

  // Product Cards
  productScroll: { paddingHorizontal: 16, gap: 12 },
  productCard: { width: CARD_W, backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  productImgWrap: { width: '100%', height: CARD_W, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  productImg: { width: '80%', height: '80%' },
  discountBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discountText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  newBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#10B981', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  newBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  usedBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  usedBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  productInfo: { padding: 12 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  ratingText: { fontSize: 12, fontWeight: '600', color: colors.onSurface },
  productName: { fontSize: 13, fontWeight: '600', color: colors.onSurface, marginBottom: 4 },
  soldText: { fontSize: 11, color: colors.onSurfaceTertiary, marginBottom: 6, fontWeight: '500' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 16, fontWeight: '800', color: colors.brand },
  oldPrice: { fontSize: 12, color: colors.onSurfaceTertiary, textDecorationLine: 'line-through' },

  // Featured Banner
  featuredBanner: { marginHorizontal: 20, borderRadius: 20, backgroundColor: '#1A1A2E', flexDirection: 'row', padding: 24, marginBottom: 20, overflow: 'hidden' },
  featuredContent: { flex: 1, justifyContent: 'center' },
  featuredTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', marginBottom: 12 },
  checkOutBtn: { backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  checkOutText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: '700' },
  featuredImg: { width: 100, height: 130, borderRadius: 12 },

  // Competition
  competitionBanner: { marginHorizontal: 20, borderRadius: 16, backgroundColor: colors.surfaceSecondary, flexDirection: 'row', padding: 16, alignItems: 'center', marginBottom: 10 },
  svcBanner: { marginHorizontal: 20, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brand, flexDirection: 'row', padding: 14, alignItems: 'center', gap: 12, marginBottom: 10 },
  svcIconWrap: { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(245,197,24,0.15)', alignItems: 'center', justifyContent: 'center' },
  svcBannerTitle: { fontSize: 14, fontWeight: '900', color: colors.onSurface, textAlign: 'right' },
  svcBannerSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2, textAlign: 'right' },
  competitionLeft: { marginEnd: 14 },
  trophyWrap: { width: 50, height: 50, borderRadius: 14, backgroundColor: 'rgba(245,197,24,0.15)', alignItems: 'center', justifyContent: 'center' },
  trophyBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  trophyBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  competitionContent: { flex: 1 },
  competitionText: { fontSize: 13, fontWeight: '700', color: colors.onSurface, marginBottom: 2 },
  competitionPrize: { fontSize: 11, color: colors.brand, marginBottom: 6, fontWeight: '600' },
  progressBar: { height: 8, backgroundColor: colors.border, borderRadius: 4, marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 4 },
  progressText: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: '600', textAlign: 'right' },
}), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable
}

