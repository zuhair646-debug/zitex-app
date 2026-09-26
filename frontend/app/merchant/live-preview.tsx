import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert, Dimensions, FlatList, TextInput, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Path, G, Line, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useAuth } from '../_layout';
import { mediaUrlSync } from '../../src/utils/upload';
import MerchantSocialFeed from '../../src/components/live-preview/MerchantSocialFeed';
import { DriverDetailSheet, BranchDetailSheet, MarketerDetailSheet, EmployeeDetailSheet } from '../../src/components/live-preview/DetailSheets';
import OrderHeatmap from '../../src/components/live-preview/OrderHeatmap';
import { AlertsBell } from '../../src/components/live-preview/AlertsAndExport';
import CompetitionDetailSheet from '../../src/components/live-preview/CompetitionDetailSheet';
import LiveToastNotifications from '../../src/components/live-preview/LiveToastNotifications';
import { useT } from '../../src/i18n';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const MUTED = '#9CA3AF';
const { width: SCREEN } = Dimensions.get('window');

type Section = 'products' | 'services' | 'competitions' | 'social' | 'overview';

export default function LivePreview() {
  const s = useSStyles();
  const router = useRouter();
  const { apiCall } = useAuth();
  const { t } = useT();
  const [section, setSection] = useState<Section>('products');
  const [analyticsFor, setAnalyticsFor] = useState<any>(null);
  const [serviceAnalyticsFor, setServiceAnalyticsFor] = useState<any>(null);
  const [compAnalyticsFor, setCompAnalyticsFor] = useState<any>(null);
  const [postDetailFor, setPostDetailFor] = useState<any>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<any[] | null>(null);

  const openCompare = async () => {
    if (selectedIds.length < 2) { Alert.alert('اختر منتجين على الأقل'); return; }
    try {
      const data = await apiCall('/api/merchant/products/compare', {
        method: 'POST', body: JSON.stringify({ product_ids: selectedIds }),
      });
      setCompareData(data);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Preview banner */}
      <View style={s.previewPill}>
        <View style={s.liveDot} />
        <Text style={s.previewText}>🔴 وضع البث المباشر — v1.14.3 ✨</Text>
        <AlertsBell apiCall={apiCall} />
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close-circle" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Section tabs (Store → Maintenance → Competitions → Social → General) */}
      <View style={s.sectionRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.sectionRow}
          bounces={false}
          decelerationRate="fast"
        >
          {[
            { id: 'products', name: t('merchant.store','المتجر'), icon: 'storefront' },
            { id: 'services', name: t('merchant.maintenance','الصيانة'), icon: 'construct' },
            { id: 'competitions', name: t('merchant.competitions','المسابقات'), icon: 'trophy' },
            { id: 'social', name: t('merchant.social','السوشيال ميديا'), icon: 'chatbubbles' },
            { id: 'overview', name: t('merchant.overview','العام'), icon: 'grid' },
          ].map(t2 => (
            <TouchableOpacity key={t2.id} onPress={() => { setSection(t2.id as Section); setCompareMode(false); setSelectedIds([]); }}
              style={[s.sectionBtn, section === t2.id && s.sectionBtnActive]}>
              <Ionicons name={t2.icon as any} size={18} color={section === t2.id ? BG : GOLD} />
              <Text style={[s.sectionText, section === t2.id && { color: BG }]}>{t2.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {section === 'overview' && <OverviewSection apiCall={apiCall} />}
      {section === 'products' && (
        <ProductsSection
          apiCall={apiCall}
          onAnalytics={(item: any) => router.push(`/merchant/product-analytics?id=${item.id}` as any)}
          compareMode={compareMode}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          setCompareMode={setCompareMode}
          openCompare={openCompare}
        />
      )}
      {section === 'services' && <ServicesSection apiCall={apiCall} onAnalytics={(svc: any) => router.push(`/merchant/service-analytics?id=${svc.id}` as any)} />}
      {section === 'competitions' && <CompetitionsSection apiCall={apiCall} onAnalytics={(comp: any) => router.push(`/merchant/competition-analytics?id=${comp.id}` as any)} />}
      {section === 'social' && <MerchantSocialFeed apiCall={apiCall} onOpenPost={(post: any) => router.push(`/merchant/post-analytics?id=${post.id || post._id}` as any)} />}

      {analyticsFor && (
        <ProductAnalyticsSheet product={analyticsFor} onClose={() => setAnalyticsFor(null)} apiCall={apiCall} />
      )}
      {serviceAnalyticsFor && (
        <ServiceAnalyticsSheet service={serviceAnalyticsFor} onClose={() => setServiceAnalyticsFor(null)} apiCall={apiCall} />
      )}
      {compAnalyticsFor && (
        <CompetitionDetailSheet competitionId={compAnalyticsFor.id} onClose={() => setCompAnalyticsFor(null)} apiCall={apiCall} />
      )}
      {postDetailFor && (
        <PostDetailSheet post={postDetailFor} onClose={() => setPostDetailFor(null)} apiCall={apiCall} />
      )}
      {compareData && (
        <CompareSheet items={compareData} onClose={() => { setCompareData(null); setSelectedIds([]); setCompareMode(false); }} />
      )}

      {/* Live merchant toast notifications */}
      <LiveToastNotifications apiCall={apiCall} insetTop={0} />
    </SafeAreaView>
  );
}

/* ─── Products grid with live viewers & comparison ─────────────────────── */
function ProductsSection({ apiCall, onAnalytics, compareMode, selectedIds, setSelectedIds, setCompareMode, openCompare }: any) {
  const s = useSStyles();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [live, setLive] = useState<Record<string, { count: number; sample_names: string[] }>>({});
  const [banners, setBanners] = useState<any[]>([]);
  const [featured, setFeatured] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, lv, banners, featured, tp, ov] = await Promise.all([
        apiCall('/api/products'),
        apiCall('/api/merchant/products/live-viewers').catch(() => ({})),
        apiCall('/api/banners').catch(() => []),
        apiCall('/api/products/featured').catch(() => []),
        apiCall('/api/merchant/analytics/top-products?limit=8').catch(() => ({ top: [] })),
        apiCall('/api/merchant/analytics/sales-overview').catch(() => null),
      ]);
      setItems(Array.isArray(d) ? d : (d.products || d.items || []));
      setLive(lv || {});
      setBanners(Array.isArray(banners) ? banners : []);
      setFeatured(Array.isArray(featured) ? featured : (featured.products || []));
      setTop((tp?.top) || []);
      setOverview(ov);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [apiCall]);
  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }, [load]);

  const totalLive = useMemo(() => Object.values(live).reduce((s, v: any) => s + (v.count || 0), 0), [live]);
  const toggle = (id: string) => setSelectedIds((cur: string[]) => cur.includes(id) ? cur.filter(x => x !== id) : (cur.length < 4 ? [...cur, id] : cur));

  if (loading) return <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />;

  return (
    <View style={{ flex: 1 }}>
      {/* Toolbar */}
      <View style={s.toolbar}>
        <View style={s.liveBadge}>
          <View style={s.livePulse} />
          <Text style={s.liveText}>{totalLive} زائر مباشر الآن</Text>
        </View>
        <TouchableOpacity onPress={() => { setCompareMode(!compareMode); setSelectedIds([]); }}
          style={[s.cmpBtn, compareMode && { backgroundColor: GOLD }]}>
          <Ionicons name="git-compare" size={14} color={compareMode ? BG : GOLD} />
          <Text style={[s.cmpText, compareMode && { color: BG }]}>{compareMode ? `مقارنة (${selectedIds.length})` : 'مقارنة'}</Text>
        </TouchableOpacity>
      </View>

      {/* Sales overview strip */}
      {!!overview && (
        <View style={s.ovRow}>
          <View style={s.ovCard}>
            <Text style={s.ovLbl}>مبيعات اليوم</Text>
            <Text style={s.ovVal}>{Math.round((overview.today?.pos_sales || 0) + (overview.today?.app_sales || 0)).toLocaleString()} ر.س</Text>
            <Text style={s.ovSub}>{overview.today?.count || 0} عملية</Text>
          </View>
          <View style={s.ovCard}>
            <Text style={s.ovLbl}>هذا الأسبوع</Text>
            <Text style={s.ovVal}>{Math.round((overview.week?.pos_sales || 0) + (overview.week?.app_sales || 0)).toLocaleString()} ر.س</Text>
            <Text style={s.ovSub}>{overview.week?.count || 0} عملية</Text>
          </View>
          <View style={s.ovCard}>
            <Text style={s.ovLbl}>هذا الشهر</Text>
            <Text style={s.ovVal}>{Math.round((overview.month?.pos_sales || 0) + (overview.month?.app_sales || 0)).toLocaleString()} ر.س</Text>
            <Text style={s.ovSub}>{overview.month?.count || 0} عملية</Text>
          </View>
        </View>
      )}

      {/* Top-sellers strip */}
      {top.length > 0 && (
        <View style={{ paddingHorizontal: 12, marginBottom: 6 }}>
          <Text style={s.stripTitle}>🏆 الأكثر مبيعاً</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {top.map((t: any, idx: number) => (
              <TouchableOpacity key={t.product_id} onPress={() => onAnalytics({ id: t.product_id, name_ar: t.name, images: t.image ? [t.image] : [] })} style={s.topCard}>
                <View style={s.topRank}><Text style={s.topRankText}>{idx + 1}</Text></View>
                {!!t.image && <Image source={{ uri: mediaUrlSync(t.image) }} style={s.topImg} contentFit="cover" />}
                <Text style={s.topName} numberOfLines={1}>{t.name}</Text>
                <Text style={s.topRev}>{Math.round(t.revenue).toLocaleString()} ر.س</Text>
                <View style={s.topSplit}>
                  <Text style={s.topSplitPos}>POS {t.pos_orders}</Text>
                  <Text style={s.topSplitApp}>App {t.app_orders}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={items}
        numColumns={2}
        keyExtractor={(x, i) => x.id || String(i)}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
        contentContainerStyle={{ paddingBottom: 120, gap: 10 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 12, gap: 10 }}>
            {/* Banners (like customer home) */}
            {banners.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                {banners.map((b: any, i: number) => (
                  <View key={i} style={{ marginRight: 10, width: 280, height: 120, borderRadius: 14, overflow: 'hidden', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }}>
                    {!!b.image && <Image source={{ uri: mediaUrlSync(b.image) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                  </View>
                ))}
              </ScrollView>
            )}
            {/* Featured strip */}
            {featured.length > 0 && (
              <>
                <Text style={{ color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 6, textAlign: 'right' }}>⭐ منتجات مميزة</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {featured.slice(0, 10).map((f: any) => (
                    <TouchableOpacity key={f.id} onPress={() => onAnalytics(f)}
                      style={{ marginRight: 10, width: 130, backgroundColor: CARD, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: BORDER }}>
                      {!!f.images?.[0] && <Image source={{ uri: mediaUrlSync(f.images[0]) }} style={{ width: 130, height: 100 }} contentFit="cover" />}
                      <View style={{ padding: 6 }}>
                        <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'right' }}>{f.name_ar}</Text>
                        <Text style={{ color: GOLD, fontSize: 12, fontWeight: '900', marginTop: 2 }}>{f.price} ر.س</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            {items.length > 0 && (
              <Text style={{ color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 6, textAlign: 'right' }}>🛍 كل المنتجات</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const liveCount = live[item.id]?.count || 0;
          const selected = selectedIds.includes(item.id);
          return (
            <TouchableOpacity style={[s.pCard, selected && s.pCardSelected]}
              activeOpacity={0.85}
              onPress={() => {
                if (compareMode) { toggle(item.id); return; }
                // In merchant preview: tap opens rich analytics (not customer page)
                onAnalytics(item);
              }}
              onLongPress={() => router.push(`/product/${item.id}?preview=1` as any)}>
              {!!item.images?.[0] && (
                <Image source={{ uri: mediaUrlSync(item.images[0]) }} style={s.pImg} contentFit="cover" />
              )}
              {liveCount > 0 && (
                <View style={s.pLive}>
                  <View style={s.livePulse} />
                  <Text style={s.pLiveText}>{liveCount}</Text>
                </View>
              )}
              {compareMode && (
                <View style={[s.checkbox, selected && s.checkboxOn]}>
                  {selected && <Ionicons name="checkmark" size={14} color={BG} />}
                </View>
              )}
              {!compareMode && (
                <View style={s.pDetailHint}>
                  <Ionicons name="stats-chart" size={12} color={GOLD} />
                  <Text style={s.pDetailHintText}>تحليلات</Text>
                </View>
              )}
              <View style={{ padding: 10 }}>
                <Text style={s.pName} numberOfLines={2}>{item.name_ar || item.name}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={s.pPrice}>{item.price} ر.س</Text>
                  {(item.rating || 0) > 0 && (
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      <Ionicons name="star" size={10} color={GOLD} />
                      <Text style={s.pRating}>{item.rating}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Text style={s.pStat}>👁 {item.views || 0}</Text>
                  <Text style={s.pStat}>🛒 {item.sold_count || 0}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>لا توجد منتجات</Text>}
      />

      {compareMode && selectedIds.length >= 2 && (
        <TouchableOpacity style={s.compareFab} onPress={openCompare}>
          <Ionicons name="stats-chart" size={20} color={BG} />
          <Text style={s.compareFabText}>عرض المقارنة ({selectedIds.length})</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ServicesSection({ apiCall, onAnalytics }: any) {
  const s = useSStyles();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<{ reviewId: string; commentText: string; userName: string } | null>(null);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    try {
      // Try enriched merchant endpoint first, fallback to public services list
      let data: any;
      try { data = await apiCall('/api/merchant/services/live-summary'); }
      catch { data = await apiCall('/api/services'); }
      setItems(Array.isArray(data) ? data : (data?.services || []));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [apiCall]);
  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv); }, [load]);

  const sendReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    try {
      await apiCall(`/api/services/reviews/${replyTo.reviewId}/reply`, {
        method: 'POST', body: JSON.stringify({ text: replyText.trim() }),
      });
      Alert.alert('تم', 'تم إرسال ردك ✨');
      setReplyTo(null); setReplyText(''); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  if (loading) return <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />;

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(x, i) => x.id || String(i)}
        contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.svcCard2} activeOpacity={0.85} onPress={() => onAnalytics && onAnalytics(item)}>
            {/* Cover image with badges */}
            <View style={{ position: 'relative' }}>
              {(item.images?.[0] || item.cover || item.image) ? (
                <Image source={{ uri: mediaUrlSync(item.images?.[0] || item.cover || item.image) }} style={s.svcCover} contentFit="cover" />
              ) : (
                <View style={[s.svcCover, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1D26' }]}>
                  <Ionicons name="construct" size={40} color={GOLD} />
                </View>
              )}
              {/* Dark gradient overlay at bottom for readability */}
              <LinearGradient colors={['transparent', 'rgba(11,12,16,0.85)']} style={s.svcOverlay} />

              {/* Rating badge — top-right */}
              {(item.avg_rating || 0) > 0 && (
                <View style={s.svcRatingBadge}>
                  <Ionicons name="star" size={11} color={BG} />
                  <Text style={s.svcBadgeText}>{item.avg_rating}</Text>
                </View>
              )}
              {/* Warranty pill — inside dark overlay, bottom-right */}
              {!!item.warranty_available && (
                <View style={s.svcWarrantyPill}>
                  <Ionicons name="shield-checkmark" size={11} color="#10B981" />
                  <Text style={s.svcWarrantyText}>ضمان {item.warranty_days || 0} يوم</Text>
                </View>
              )}
              {/* Details hint — bottom-left */}
              <View style={s.svcDetailHint}>
                <Ionicons name="chevron-back" size={14} color={GOLD} />
                <Text style={s.svcDetailHintText}>التفاصيل</Text>
              </View>
            </View>
            <View style={{ padding: 12, gap: 4 }}>
              <Text style={s.svcName2}>{item.title || item.name}</Text>
              {!!(item.description || item.desc) && (
                <Text style={s.svcDesc2} numberOfLines={2}>{item.description || item.desc}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <Text style={s.svcPrice2}>{item.base_price || item.price || 0} ر.س</Text>
                {!!item.home_pickup && (
                  <View style={s.svcMetaChip}>
                    <Ionicons name="car" size={11} color={GOLD} />
                    <Text style={s.svcMetaText}>استلام منزلي</Text>
                  </View>
                )}
                {(item.review_count || 0) > 0 && (
                  <View style={s.svcMetaChip}>
                    <Ionicons name="chatbubbles" size={11} color={GOLD} />
                    <Text style={s.svcMetaText}>{item.review_count} تقييم</Text>
                  </View>
                )}
                {(item.booking_count || 0) > 0 && (
                  <View style={s.svcMetaChip}>
                    <Ionicons name="calendar" size={11} color={GOLD} />
                    <Text style={s.svcMetaText}>{item.booking_count} حجز</Text>
                  </View>
                )}
              </View>

              {/* Reviews with reply capability */}
              {(item.reviews || []).length > 0 && (
                <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8, gap: 6 }}>
                  <Text style={{ color: GOLD, fontSize: 11, fontWeight: '800', textAlign: 'right' }}>💬 آخر التقييمات</Text>
                  {item.reviews.slice(0, 3).map((r: any) => (
                    <View key={r.id} style={s.svcReview}>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Text style={s.svcReviewName}>{r.user_name || 'زائر'}</Text>
                        <View style={{ flexDirection: 'row' }}>
                          {[1,2,3,4,5].map(n => (
                            <Ionicons key={n} name="star" size={9} color={n <= (r.stars||0) ? GOLD : BORDER} />
                          ))}
                        </View>
                        <View style={{ flex: 1 }} />
                        {!r.merchant_reply && (
                          <TouchableOpacity style={s.replyBtn}
                            onPress={() => { setReplyTo({ reviewId: r.id, commentText: r.comment || '', userName: r.user_name || '' }); setReplyText(''); }}>
                            <Ionicons name="arrow-undo" size={10} color={BG} />
                            <Text style={s.replyBtnText}>رد</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {!!r.comment && <Text style={s.svcReviewText}>{r.comment}</Text>}
                      {!!r.merchant_reply && (
                        <View style={s.replyBadge}>
                          <Ionicons name="checkmark-circle" size={11} color={GOLD} />
                          <Text style={s.replyBadgeText}>ردّ المتجر: {r.merchant_reply}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.empty}>لا توجد خدمات</Text>}
      />

      {replyTo && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setReplyTo(null)}>
          <View style={s.sheetBackdrop}>
            <View style={s.replySheet}>
              <View style={s.sheetHandle} />
              <Text style={s.sheetTitle}>رد على تقييم {replyTo.userName} ✨</Text>
              {!!replyTo.commentText && (
                <View style={s.commentPreview}>
                  <Text style={s.commentText}>💬 {replyTo.commentText}</Text>
                </View>
              )}
              <TextInput style={s.replyInput} placeholder="اكتب ردك..." placeholderTextColor={MUTED}
                multiline value={replyText} onChangeText={setReplyText} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setReplyTo(null)}>
                  <Text style={s.cancelText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sendBtn} onPress={sendReply}>
                  <Ionicons name="send" size={16} color={BG} />
                  <Text style={s.sendText}>إرسال</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

function CompetitionsSection({ apiCall, onAnalytics }: any) {
  const s = useSStyles();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'ended' | 'all'>('active');

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/api/competitions/live-summary');
      setItems(d?.competitions || []);
    } catch (e: any) {
      // Fallback
      try { const list = await apiCall('/api/competitions'); setItems(list || []); } catch {}
    } finally { setLoading(false); }
  }, [apiCall]);
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'ended') return items.filter(c => c.status === 'ended' || (c.winners || []).length > 0);
    return items.filter(c => c.status === 'open' || (c.remaining_ms || 0) > 0);
  }, [items, filter]);

  const fmtRemaining = (ms: number | null | undefined) => {
    if (!ms) return null;
    const days = Math.floor(ms / (24 * 3600 * 1000));
    const hours = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
    const mins = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
    if (days > 0) return `${days}ي ${hours}س`;
    if (hours > 0) return `${hours}س ${mins}د`;
    if (mins > 0) return `${mins} دقيقة`;
    return 'ينتهي الآن';
  };

  if (loading) return <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />;

  return (
    <>
      {/* Filter row — competitions */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, paddingEnd: 24 }}
        style={{ height: 52, flexGrow: 0 }}>
        {[
          { k: 'active', label: 'نشطة' },
          { k: 'ended', label: 'منتهية' },
          { k: 'all', label: 'الكل' },
        ].map((f: any) => (
          <TouchableOpacity key={f.k} onPress={() => setFilter(f.k)}
            style={[s.cmpBtn, filter === f.k && { backgroundColor: GOLD }]}>
            <Text style={[s.cmpText, filter === f.k && { color: BG }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList data={filtered} keyExtractor={(x, i) => x.id || String(i)} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const isEnded = item.status === 'ended' || (item.winners || []).length > 0;
          const isLive = !isEnded && (item.remaining_ms == null || item.remaining_ms > 0);
          return (
            <TouchableOpacity activeOpacity={0.9} onPress={() => onAnalytics && onAnalytics(item)}>
            <LinearGradient colors={isEnded ? ['#1F2937', '#0F1116'] : ['#332905', '#1A1401']} style={s.compCard}>
              {/* Banner image (matches customer view) */}
              {!!(item.image || item.banner_image) && (
                <View style={{ position: 'relative', marginBottom: 10 }}>
                  <Image source={{ uri: mediaUrlSync(item.image || item.banner_image) }}
                    style={{ width: '100%', height: 130, borderRadius: 12 }} contentFit="cover" />
                  <LinearGradient colors={['transparent', 'rgba(11,12,16,0.7)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, borderRadius: 12 }} />
                  <View style={s.svcDetailHint}>
                    <Ionicons name="chevron-back" size={14} color={GOLD} />
                    <Text style={s.svcDetailHintText}>التفاصيل الكاملة</Text>
                  </View>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <View style={s.trophy}>
                  <Ionicons name={isEnded ? 'checkmark-done-circle' : 'trophy'} size={22} color={GOLD} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.compTitle} numberOfLines={1}>{item.title}</Text>
                    {isLive && <View style={s.liveTag}><View style={s.livePulse} /><Text style={s.liveTagText}>مباشرة</Text></View>}
                    {isEnded && <View style={[s.liveTag, { backgroundColor: '#3B82F6' }]}><Text style={[s.liveTagText, { color: '#FFF' }]}>انتهت</Text></View>}
                  </View>
                  <Text style={s.compPrize}>🎁 {item.prize}{item.prize_count > 1 ? ` (${item.prize_count} جوائز)` : ''}</Text>
                </View>
              </View>

              {/* Meta row: participants + remaining */}
              <View style={s.compMetaRow}>
                <View style={s.compMetaChip}>
                  <Ionicons name="people" size={12} color={GOLD} />
                  <Text style={s.compMetaText}>{item.joined_count || 0} مشترك</Text>
                </View>
                {!!item.starts_at && (
                  <View style={s.compMetaChip}>
                    <Ionicons name="play" size={12} color={GOLD} />
                    <Text style={s.compMetaText}>بدأت {String(item.starts_at).slice(0, 10)}</Text>
                  </View>
                )}
                {!!item.ends_at && (
                  <View style={s.compMetaChip}>
                    <Ionicons name="hourglass" size={12} color={GOLD} />
                    <Text style={s.compMetaText}>
                      {isLive && item.remaining_ms != null ? `متبقٍ: ${fmtRemaining(item.remaining_ms)}` : `تنتهي ${String(item.ends_at).slice(0, 10)}`}
                    </Text>
                  </View>
                )}
                {!!item.competition_type && (
                  <View style={s.compMetaChip}>
                    <Ionicons name="pricetag" size={12} color={GOLD} />
                    <Text style={s.compMetaText}>{item.competition_type}</Text>
                  </View>
                )}
              </View>

              {/* Winners */}
              {(item.winners || []).length > 0 && (
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 }}>
                  <Text style={{ color: GOLD, fontSize: 11, fontWeight: '800', textAlign: 'right', marginBottom: 6 }}>🏆 الفائزون</Text>
                  {item.winners.slice(0, 3).map((w: any, i: number) => (
                    <View key={i} style={s.winnerRow}>
                      <View style={s.winnerRank}><Text style={{ color: BG, fontWeight: '900', fontSize: 11 }}>{i + 1}</Text></View>
                      <Text style={s.winnerName}>{w.user_name}</Text>
                      <Text style={s.winnerPhone}>{(w.user_phone || '').slice(-4).padStart(4, '•')}</Text>
                    </View>
                  ))}
                </View>
              )}
            </LinearGradient>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>{filter === 'ended' ? 'لا مسابقات منتهية' : 'لا مسابقات نشطة'}</Text>}
      />
    </>
  );
}

function SocialSection({ apiCall, onOpenPost }: any) {
  const s = useSStyles();
  const [posts, setPosts] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState<{ postId: string; commentId: string; commentText: string } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'needs_reply' | 'top'>('all');

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/social/posts'); setPosts(Array.isArray(d) ? d : (d.posts || [])); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [apiCall]);
  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [load]);

  const likePost = async (pid: string) => {
    try { await apiCall(`/api/social/posts/${pid}/like`, { method: 'POST' }); load(); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const sendReply = async () => {
    if (!replying || !replyText.trim()) return;
    try {
      await apiCall(`/api/social/posts/${replying.postId}/comments/${replying.commentId}/store-reply`, {
        method: 'POST', body: JSON.stringify({ text: replyText.trim() }),
      });
      Alert.alert('تم', 'تم إرسال ردك باسم المتجر ✨');
      setReplying(null); setReplyText(''); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const displayed = useMemo(() => {
    if (filter === 'needs_reply') {
      return posts.filter(p => (Array.isArray(p.comments) ? p.comments : []).some((c: any) => !c.store_reply));
    }
    if (filter === 'top') return [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    return posts;
  }, [posts, filter]);

  if (loading) return <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />;

  return (
    <>
      {/* Filter row — social */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, paddingEnd: 24 }}
        style={{ height: 52, flexGrow: 0 }}>
        {[
          { k: 'all', label: 'الكل' },
          { k: 'needs_reply', label: 'يحتاج رد' },
          { k: 'top', label: 'الأكثر تفاعلاً' },
        ].map((f: any) => (
          <TouchableOpacity key={f.k} onPress={() => setFilter(f.k)}
            style={[s.cmpBtn, filter === f.k && { backgroundColor: GOLD }]}>
            <Text style={[s.cmpText, filter === f.k && { color: BG }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <FlatList data={displayed} keyExtractor={(x, i) => x.id || String(i)} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const allComments = Array.isArray(item.comments) ? item.comments : [];
          const commentCount = Array.isArray(item.comments) ? item.comments.length : (item.comments_count || item.comments || 0);
          const expanded = expandedComments[item.id];
          const visibleComments = expanded ? allComments : allComments.slice(0, 3);
          return (
          <View style={s.postCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <View style={s.avatar}><Text style={{ color: BG, fontWeight: '900' }}>{(item.author_name || 'ز')[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.postAuthor}>{item.author_name}</Text>
                <Text style={s.postDate}>{(item.created_at || '').slice(0, 10)}</Text>
              </View>
              <TouchableOpacity onPress={() => onOpenPost && onOpenPost(item)} style={s.detailBtn}>
                <Ionicons name="analytics" size={14} color={BG} />
                <Text style={s.detailBtnText}>التفاصيل</Text>
              </TouchableOpacity>
            </View>
            {!!item.text && <Text style={s.postText}>{item.text}</Text>}
            {!!item.images?.[0] && <Image source={{ uri: mediaUrlSync(item.images[0]) }} style={s.postImg} contentFit="cover" />}
            {/* Poll */}
            {!!item.poll && Array.isArray(item.poll.options) && (
              <View style={{ marginTop: 8, gap: 4 }}>
                <Text style={{ color: GOLD, fontSize: 12, fontWeight: '800', textAlign: 'right' }}>🗳 {item.poll.question}</Text>
                {item.poll.options.map((opt: any, i: number) => {
                  const totalVotes = item.poll.options.reduce((s: number, o: any) => s + (o.votes || 0), 0) || 1;
                  const pct = Math.round(((opt.votes || 0) / totalVotes) * 100);
                  return (
                    <View key={i} style={s.pollRow}>
                      <View style={[s.pollBar, { width: `${pct}%` }]} />
                      <Text style={s.pollText}>{opt.text} — {pct}% ({opt.votes || 0})</Text>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={s.postMeta}>
              <TouchableOpacity onPress={() => likePost(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="heart" size={14} color={GOLD} />
                <Text style={s.postMetaText}>{item.likes || 0}</Text>
              </TouchableOpacity>
              <Text style={s.postMetaText}>💬 {commentCount}</Text>
              <Text style={s.postMetaText}>👁 {item.views || 0}</Text>
              <View style={{ flex: 1 }} />
              <View style={s.livePulse2}>
                <View style={s.livePulse} />
                <Text style={{ color: '#A7F3D0', fontSize: 10, fontWeight: '700' }}>مباشر</Text>
              </View>
            </View>
            {/* Comments */}
            {visibleComments.map((c: any) => (
              <View key={c.id} style={s.comment}>
                <View style={{ flex: 1 }}>
                  <Text style={s.commentAuthor}>{c.user_name}</Text>
                  <Text style={s.commentText}>{c.text}</Text>
                  {!!c.store_reply && (
                    <View style={s.replyBadge}>
                      <Ionicons name="checkmark-circle" size={11} color={GOLD} />
                      <Text style={s.replyBadgeText}>ردّ المتجر: {c.store_reply}</Text>
                    </View>
                  )}
                </View>
                {!c.store_reply && (
                  <TouchableOpacity style={s.replyBtn}
                    onPress={() => { setReplying({ postId: item.id, commentId: c.id, commentText: c.text }); setReplyText(''); }}>
                    <Ionicons name="arrow-undo" size={12} color={BG} />
                    <Text style={s.replyBtnText}>رد باسم المتجر</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {allComments.length > 3 && (
              <TouchableOpacity onPress={() => setExpandedComments(x => ({ ...x, [item.id]: !x[item.id] }))} style={{ paddingVertical: 6, alignItems: 'center' }}>
                <Text style={{ color: GOLD, fontSize: 11, fontWeight: '800' }}>
                  {expanded ? '↑ إخفاء التعليقات' : `↓ عرض جميع التعليقات (${allComments.length})`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>لا منشورات</Text>}
      />
      {replying && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setReplying(null)}>
          <View style={s.sheetBackdrop}>
            <View style={s.replySheet}>
              <View style={s.sheetHandle} />
              <Text style={s.sheetTitle}>رد باسم المتجر ✨</Text>
              <View style={s.commentPreview}>
                <Text style={s.commentText}>💬 {replying.commentText}</Text>
              </View>
              <TextInput style={s.replyInput} placeholder="اكتب ردك..." placeholderTextColor={MUTED}
                multiline value={replyText} onChangeText={setReplyText} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setReplying(null)}>
                  <Text style={s.cancelText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sendBtn} onPress={sendReply}>
                  <Ionicons name="send" size={16} color={BG} />
                  <Text style={s.sendText}>إرسال</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

/* ─── Wave chart (SVG) for monthly sales ────────────────────────────── */
function WaveChart({ series, width = SCREEN - 60, height = 160 }: any) {
  const s = useSStyles();
  if (!series || series.length === 0) {
    return <View style={{ padding: 20, alignItems: 'center' }}><Text style={{ color: MUTED }}>لا بيانات</Text></View>;
  }
  const max = Math.max(1, ...series.map((s: any) => s.sales || 0));
  const stepX = width / Math.max(series.length - 1, 1);
  const pad = 20;
  const points = series.map((s: any, i: number) => ({
    x: pad + i * stepX * ((width - pad * 2) / width),
    y: pad + (height - pad * 2) * (1 - (s.sales || 0) / max),
    label: (s.month || '').slice(5),
    value: s.sales || 0,
  }));
  // Smooth Bezier path
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` Q ${cx},${p0.y} ${cx},${(p0.y + p1.y) / 2}`;
    d += ` Q ${cx},${p1.y} ${p1.x},${p1.y}`;
  }
  const fillPath = `${d} L ${points[points.length - 1].x},${height - pad} L ${points[0].x},${height - pad} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GOLD} stopOpacity="0.5" />
          <Stop offset="1" stopColor={GOLD} stopOpacity="0.02" />
        </SvgGrad>
      </Defs>
      <G>
        <Line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={BORDER} strokeWidth="1" />
        <Path d={fillPath} fill="url(#grad)" />
        <Path d={d} fill="none" stroke={GOLD} strokeWidth="2.5" />
        {points.map((p: any, i: number) => (
          <G key={i}>
            <Path d={`M ${p.x},${p.y} l 0 0`} stroke={GOLD} strokeWidth="6" strokeLinecap="round" />
            <SvgText x={p.x} y={height - 4} fontSize="9" fill={MUTED} textAnchor="middle">{p.label}</SvgText>
          </G>
        ))}
      </G>
    </Svg>
  );
}

function ProductAnalyticsSheet({ product, onClose, apiCall }: any) {
  const s = useSStyles();
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    apiCall(`/api/merchant/products/${product.id}/analytics`)
      .then(setData).catch((e: any) => Alert.alert('خطأ', e.message));
  }, [product.id, apiCall]);

  const sendOffer = async (uid: string, uname: string) => {
    try {
      await apiCall(`/api/merchant/abandoned-carts/${uid}/send-offer`, {
        method: 'POST',
        body: JSON.stringify({ discount_percent: 15, product_name: product.name_ar || product.name }),
      });
      Alert.alert('تم', `أُرسل خصم 15% إلى ${uname}`);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  if (!data) return (
    <Modal visible transparent animationType="slide">
      <View style={s.sheetBackdrop}><View style={s.sheet}><ActivityIndicator size="large" color={GOLD} style={{ margin: 40 }} /></View></View>
    </Modal>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={GOLD} /></TouchableOpacity>
            <Text style={s.sheetTitle} numberOfLines={1}>📊 {data.product.name_ar}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
            <View style={s.kpiGrid}>
              <Kpi icon="eye" label="مشاهدات" value={data.kpis.total_views} />
              <Kpi icon="people" label="زوار فريدون" value={data.kpis.unique_users} />
              <Kpi icon="cart" label="أضيف للسلة" value={data.kpis.add_to_cart} />
              <Kpi icon="bag-check" label="وصل الدفع" value={data.kpis.reached_checkout} />
              <Kpi icon="alert-circle" label="ترك السلة" value={data.kpis.abandoned_count} danger />
              <Kpi icon="trending-up" label="التحويل" value={`${data.kpis.conversion_rate}%`} highlight />
            </View>

            <Text style={s.sec}>📈 اتجاه المبيعات (12 شهر)</Text>
            <LinearGradient colors={['#1A1C24', '#0F1116']} style={s.chartCard}>
              <WaveChart series={data.monthly_series} />
            </LinearGradient>

            <Text style={s.sec}>👥 آخر الزوار</Text>
            {(data.visitors || []).length === 0 ? (
              <View style={s.empty2}><Text style={{ color: MUTED }}>لا زوار بعد</Text></View>
            ) : data.visitors.map((v: any, i: number) => (
              <View key={i} style={s.visitor}>
                <View style={s.visitorAvatar}><Text style={{ color: BG, fontWeight: '900' }}>{(v.user_name || 'ز')[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.visitorName}>{v.user_name}</Text>
                  <Text style={s.visitorMeta}>⏱ {v.duration_seconds || 0}ث • {v.added_to_cart ? '🛒 أضاف للسلة ' : ''}{v.reached_checkout ? '✅ وصل الدفع' : ''}</Text>
                </View>
                <Text style={s.visitorTime}>{(v.created_at || '').slice(5, 10)}</Text>
              </View>
            ))}

            {(data.abandoned_cart_users || []).length > 0 && (
              <>
                <Text style={s.sec}>💔 عملاء تركوا السلة ({data.abandoned_cart_users.length})</Text>
                <Text style={s.hint}>اضغط لإرسال خصم 15% وتذكير</Text>
                {data.abandoned_cart_users.map((a: any) => (
                  <View key={a.user_id} style={s.abandoned}>
                    <Ionicons name="cart" size={18} color="#EF4444" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.visitorName}>{a.user_name}</Text>
                      <Text style={s.visitorMeta}>{(a.created_at || '').slice(0, 10)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => sendOffer(a.user_id, a.user_name)} style={s.offerBtn}>
                      <Ionicons name="gift" size={14} color={BG} />
                      <Text style={s.offerText}>خصم 15٪</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {/* Buyers list */}
            {(data.buyers || []).length > 0 && (
              <>
                <Text style={s.sec}>🛒 المشترون ({data.buyers.length})</Text>
                {data.buyers.slice(0, 15).map((b: any, i: number) => (
                  <View key={i} style={s.visitor}>
                    <View style={[s.visitorAvatar, { backgroundColor: b.source === 'pos' ? '#F5C518' : '#60A5FA' }]}>
                      <Ionicons name={b.source === 'pos' ? 'cart' : 'phone-portrait'} size={14} color={BG} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.visitorName}>{b.user_name}</Text>
                      <Text style={s.visitorMeta}>{b.channel} · {b.quantity} قطعة · {(b.created_at || '').slice(0, 10)}{b.branch ? ` · ${b.branch}` : ''}</Text>
                    </View>
                    <Text style={{ color: '#F5C518', fontSize: 12, fontWeight: '900' }}>{Number(b.total).toLocaleString()} ر.س</Text>
                  </View>
                ))}
              </>
            )}

            {/* Top branches selling this product */}
            {(data.top_branches || []).length > 0 && (
              <>
                <Text style={s.sec}>🏢 أفضل الفروع مبيعاً لهذا المنتج</Text>
                {data.top_branches.map((tb: any, i: number) => (
                  <View key={tb.id} style={[s.visitor, { paddingVertical: 10 }]}>
                    <View style={[s.visitorAvatar, { backgroundColor: '#34D399', width: 32, height: 32 }]}>
                      <Text style={{ color: BG, fontWeight: '900', fontSize: 11 }}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.visitorName}>{tb.name}</Text>
                      <Text style={s.visitorMeta}>{tb.city} · {tb.units} قطعة · {tb.orders} فاتورة</Text>
                    </View>
                    <Text style={{ color: '#F5C518', fontSize: 12, fontWeight: '900' }}>{Number(tb.revenue).toLocaleString()} ر.س</Text>
                  </View>
                ))}
              </>
            )}

            {/* Purchase sources */}
            {(data.purchase_sources || []).length > 0 && (
              <>
                <Text style={s.sec}>🔗 مصادر الوصول للمنتج</Text>
                <View style={{ backgroundColor: '#1A1C24', borderRadius: 12, padding: 10 }}>
                  {data.purchase_sources.map((ps: any) => {
                    const total = data.purchase_sources.reduce((a: number, x: any) => a + x.count, 0) || 1;
                    const pct = (ps.count / total) * 100;
                    const labelMap: any = { direct: 'وصول مباشر', social: 'وسائل تواصل', link: 'رابط دعوة', referral: 'إحالة', ad: 'إعلان مدفوع' };
                    return (
                      <View key={ps.source} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row' }}>
                          <Text style={{ color: '#FFF', fontSize: 11, flex: 1, textAlign: 'right', fontWeight: '700' }}>{labelMap[ps.source] || ps.source}</Text>
                          <Text style={{ color: '#F5C518', fontSize: 11, fontWeight: '900' }}>{ps.count} ({pct.toFixed(1)}%)</Text>
                        </View>
                        <View style={{ height: 6, backgroundColor: '#2A2D38', borderRadius: 3, marginTop: 3, overflow: 'hidden' }}>
                          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#F5C518' }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CompareSheet({ items, onClose }: any) {
  const s = useSStyles();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={GOLD} /></TouchableOpacity>
            <Text style={s.sheetTitle}>⚖️ المقارنة بين {items.length} منتجات</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView horizontal contentContainerStyle={{ padding: 12 }}>
            {items.map((it: any) => (
              <View key={it.id} style={s.cmpCard}>
                {!!it.image && <Image source={{ uri: mediaUrlSync(it.image) }} style={s.cmpImg} contentFit="cover" />}
                <Text style={s.cmpName} numberOfLines={2}>{it.name_ar}</Text>
                <Text style={s.cmpPrice}>{it.price} ر.س</Text>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>مشاهدات</Text><Text style={s.cmpVal}>{it.views_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>أضيف للسلة</Text><Text style={s.cmpVal}>{it.cart_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>طلبات</Text><Text style={s.cmpVal}>{it.orders_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>مبيعات</Text><Text style={s.cmpVal}>{it.sold_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>التحويل</Text><Text style={[s.cmpVal, { color: GOLD }]}>{it.conversion_rate}%</Text></View>
                {(it.rating || 0) > 0 && (
                  <View style={s.cmpRow}><Text style={s.cmpLbl}>التقييم</Text>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      <Ionicons name="star" size={12} color={GOLD} />
                      <Text style={s.cmpVal}>{it.rating}</Text>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Kpi({ icon, label, value, highlight, danger }: any) {
  const s = useSStyles();
  const c = highlight ? BG : danger ? '#EF4444' : GOLD;
  return (
    <View style={[s.kpi, highlight && { backgroundColor: GOLD }]}>
      <Ionicons name={icon} size={18} color={c} />
      <Text style={[s.kpiVal, highlight && { color: BG }]}>{value}</Text>
      <Text style={[s.kpiLbl, highlight && { color: 'rgba(11,12,16,0.8)' }]}>{label}</Text>
    </View>
  );
}

/* ─── Service Analytics Sheet ───────────────────────────────────── */
function ServiceAnalyticsSheet({ service, onClose, apiCall }: any) {
  const s = useSStyles();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiCall(`/api/merchant/services/${service.id}/analytics`)
      .then(setData)
      .catch((e: any) => Alert.alert('خطأ', e.message))
      .finally(() => setLoading(false));
  }, [service.id]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <View style={[s.replySheet, { maxHeight: '90%' }]}>
          <View style={s.sheetHandle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={s.sheetTitle}>📊 إحصائيات الخدمة</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
          </View>
          <Text style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 8 }}>
            {service.title || service.name}
          </Text>
          {loading ? <ActivityIndicator color={GOLD} style={{ marginTop: 30 }} /> : !data ? (
            <Text style={s.empty}>لا تتوفر بيانات</Text>
          ) : (
            <ScrollView>
              <View style={s.sheetCard}>
                <View style={s.sheetKpiRow}>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{data.kpis.total_bookings}</Text><Text style={s.sheetKpiLbl}>إجمالي الحجوزات</Text></View>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{Math.round(data.kpis.revenue).toLocaleString()}</Text><Text style={s.sheetKpiLbl}>الإيرادات (ر.س)</Text></View>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{data.kpis.avg_rating}★</Text><Text style={s.sheetKpiLbl}>متوسط التقييم</Text></View>
                </View>
                {data.kpis.avg_duration_hours > 0 && (
                  <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0F1116', padding: 8, borderRadius: 8 }}>
                    <Ionicons name="timer" size={14} color={GOLD} />
                    <Text style={{ color: '#FFF', fontSize: 12, flex: 1, textAlign: 'right' }}>متوسط وقت الإنجاز</Text>
                    <Text style={{ color: GOLD, fontSize: 13, fontWeight: '900' }}>{data.kpis.avg_duration_hours} ساعة</Text>
                  </View>
                )}
              </View>

              {(data.technicians || []).length > 0 && (
                <View style={s.sheetCard}>
                  <Text style={s.sheetSectionTitle}>🔧 الفنيون المسؤولون</Text>
                  {data.technicians.map((t: any, i: number) => (
                    <View key={t.id} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: i < data.technicians.length - 1 ? 1 : 0, borderBottomColor: '#2A2D38', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: GOLD + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD + '55' }}>
                        <Ionicons name="construct" size={16} color={GOLD} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>{t.name}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                          <Text style={{ color: '#A1A1AA', fontSize: 10 }}>✅ {t.completed}/{t.count} حجز</Text>
                          {t.avg_duration_hours > 0 && <Text style={{ color: '#A1A1AA', fontSize: 10 }}>⏱ {t.avg_duration_hours}س</Text>}
                          {t.avg_rating > 0 && <Text style={{ color: GOLD, fontSize: 10 }}>⭐ {t.avg_rating}</Text>}
                        </View>
                      </View>
                      <Text style={{ color: GOLD, fontSize: 12, fontWeight: '900' }}>{Number(t.revenue).toLocaleString()} ر.س</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={s.sheetCard}>
                <Text style={s.sheetSectionTitle}>الحالات</Text>
                {data.status_breakdown.map((row: any) => {
                  const max = Math.max(...data.status_breakdown.map((r: any) => r.count));
                  const pct = max > 0 ? (row.count * 100) / max : 0;
                  return (
                    <View key={row.status} style={s.barRow}>
                      <Text style={s.barLabel}>{row.status}</Text>
                      <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
                      <Text style={s.barValue}>{row.count}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={s.sheetCard}>
                <Text style={s.sheetSectionTitle}>توزيع النجوم</Text>
                {data.star_distribution.map((row: any) => {
                  const total = data.star_distribution.reduce((a: number, r: any) => a + r.count, 0) || 1;
                  const pct = (row.count * 100) / total;
                  return (
                    <View key={row.stars} style={s.barRow}>
                      <Text style={s.barLabel}>{'★'.repeat(row.stars) || '—'}</Text>
                      <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
                      <Text style={s.barValue}>{row.count}</Text>
                    </View>
                  );
                })}
              </View>
              {data.recent_reviews.length > 0 && (
                <View style={s.sheetCard}>
                  <Text style={s.sheetSectionTitle}>💬 آخر التقييمات</Text>
                  {data.recent_reviews.map((r: any) => (
                    <View key={r.id} style={s.listRow}>
                      <Text style={s.listRowText}>{r.user_name}: {r.comment}</Text>
                      <Text style={s.listRowMeta}>{r.stars}★</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ─── Competition Analytics Sheet ───────────────────────────────── */
function CompetitionAnalyticsSheet({ competition, onClose, apiCall }: any) {
  const s = useSStyles();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiCall(`/api/merchant/competitions/${competition.id}/analytics`)
      .then(setData)
      .catch((e: any) => Alert.alert('خطأ', e.message))
      .finally(() => setLoading(false));
  }, [competition.id]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <View style={[s.replySheet, { maxHeight: '90%' }]}>
          <View style={s.sheetHandle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={s.sheetTitle}>🏆 إحصائيات المسابقة</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
          </View>
          <Text style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 8 }}>
            {competition.title}
          </Text>
          {loading ? <ActivityIndicator color={GOLD} style={{ marginTop: 30 }} /> : !data ? (
            <Text style={s.empty}>لا تتوفر بيانات</Text>
          ) : (
            <ScrollView>
              <View style={s.sheetCard}>
                <View style={s.sheetKpiRow}>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{data.kpis.total_participants}</Text><Text style={s.sheetKpiLbl}>مشارك</Text></View>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{data.kpis.unique_users}</Text><Text style={s.sheetKpiLbl}>مستخدم فريد</Text></View>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>+{data.kpis.followers_gained}</Text><Text style={s.sheetKpiLbl}>متابع مكتسب</Text></View>
                </View>
                {typeof data.peak_hour === 'number' && (
                  <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD + '20', borderWidth: 1, borderColor: GOLD + '55', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                      <Ionicons name="flame" size={12} color={GOLD} />
                      <Text style={{ color: GOLD, fontSize: 11, fontWeight: '900' }}>
                        ذروة الساعة: {data.peak_hour === 0 ? 12 : data.peak_hour > 12 ? data.peak_hour - 12 : data.peak_hour}{data.peak_hour < 12 ? 'ص' : 'م'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#60A5FA20', borderWidth: 1, borderColor: '#60A5FA55', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                      <Ionicons name="trending-up" size={12} color="#60A5FA" />
                      <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '900' }}>معدل المشاركة: {data.kpis.engagement_rate}%</Text>
                    </View>
                  </View>
                )}
              </View>

              {(data.winner_details || []).length > 0 && (
                <View style={s.sheetCard}>
                  <Text style={s.sheetSectionTitle}>🏆 الفائزون بالتفصيل</Text>
                  {data.winner_details.map((w: any, i: number) => (
                    <View key={i} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2A2D38', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: BG, fontWeight: '900' }}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>{w.user_name}</Text>
                        <Text style={{ color: '#A1A1AA', fontSize: 10, textAlign: 'right' }}>{(w.user_phone || '').slice(-4).padStart(4, '•')} · {(w.picked_at || '').slice(0, 10)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View style={s.sheetCard}>
                <Text style={s.sheetSectionTitle}>🔗 مصادر المشاركين</Text>
                {data.sources.map((row: any) => {
                  const max = Math.max(...data.sources.map((r: any) => r.count));
                  const pct = max > 0 ? (row.count * 100) / max : 0;
                  const label: Record<string, string> = { link: 'رابط دعوة', organic: 'تصفح عادي', push: 'إشعار', social_share: 'مشاركة اجتماعية' };
                  return (
                    <View key={row.source} style={s.barRow}>
                      <Text style={s.barLabel}>{label[row.source] || row.source}</Text>
                      <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
                      <Text style={s.barValue}>{row.count}</Text>
                    </View>
                  );
                })}
              </View>
              {data.top_cities.length > 0 && (
                <View style={s.sheetCard}>
                  <Text style={s.sheetSectionTitle}>🏙 أعلى المدن</Text>
                  {data.top_cities.map((row: any) => {
                    const max = Math.max(...data.top_cities.map((r: any) => r.count));
                    const pct = max > 0 ? (row.count * 100) / max : 0;
                    return (
                      <View key={row.city} style={s.barRow}>
                        <Text style={s.barLabel}>{row.city}</Text>
                        <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
                        <Text style={s.barValue}>{row.count}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {data.recent_participants.length > 0 && (
                <View style={s.sheetCard}>
                  <Text style={s.sheetSectionTitle}>👥 آخر المشاركين</Text>
                  {data.recent_participants.map((p: any, i: number) => (
                    <View key={i} style={s.listRow}>
                      <Text style={s.listRowText}>{p.user_name} · {p.user_city}</Text>
                      <Text style={s.listRowMeta}>{p.source}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ─── Post Detail Sheet — viewers/likers/comments/poll ──────────── */
function PostDetailSheet({ post, onClose, apiCall }: any) {
  const s = useSStyles();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'comments' | 'viewers' | 'likers' | 'poll'>('comments');
  const [replyTo, setReplyTo] = useState<{ commentId: string; commentText: string } | null>(null);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiCall(`/api/merchant/social/posts/${post.id}/detail`)
      .then(setData)
      .catch((e: any) => Alert.alert('خطأ', e.message))
      .finally(() => setLoading(false));
  }, [post.id]);
  useEffect(() => { load(); }, [load]);

  const likeAsStore = async () => {
    try { await apiCall(`/api/merchant/social/posts/${post.id}/like-as-store`, { method: 'POST' }); load(); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
  };
  const sendThreadedReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    try {
      await apiCall(`/api/merchant/social/posts/${post.id}/comments/${replyTo.commentId}/replies`, {
        method: 'POST', body: JSON.stringify({ text: replyText.trim() }),
      });
      setReplyTo(null); setReplyText(''); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <View style={[s.replySheet, { maxHeight: '95%' }]}>
          <View style={s.sheetHandle} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.sheetTitle}>🔎 تفاصيل المنشور</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#FFF" /></TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={GOLD} style={{ marginTop: 30 }} /> : !data ? (
            <Text style={s.empty}>لا تتوفر بيانات</Text>
          ) : (
            <>
              <View style={s.sheetCard}>
                {!!data.post.text && <Text style={{ color: '#FFF', fontSize: 12, textAlign: 'right', marginBottom: 6 }}>{data.post.text}</Text>}
                <View style={s.sheetKpiRow}>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{data.kpis.views}</Text><Text style={s.sheetKpiLbl}>مشاهدة</Text></View>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{data.kpis.likes}</Text><Text style={s.sheetKpiLbl}>إعجاب</Text></View>
                  <View style={s.sheetKpi}><Text style={s.sheetKpiVal}>{data.kpis.comment_count}</Text><Text style={s.sheetKpiLbl}>تعليق</Text></View>
                </View>
                <TouchableOpacity onPress={likeAsStore} style={[s.sendBtn, { marginTop: 8 }]}>
                  <Ionicons name="heart" size={14} color={BG} />
                  <Text style={s.sendText}>أضف إعجاب باسم المتجر</Text>
                </TouchableOpacity>
              </View>
              {/* Tabs */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                {[
                  { k: 'comments', label: `تعليقات (${data.kpis.comment_count})` },
                  { k: 'viewers', label: `مشاهدون (${data.viewers.length})` },
                  { k: 'likers', label: `إعجابات (${data.likers.length})` },
                  { k: 'sharers', label: `مشاركات` },
                  ...(data.poll?.options ? [{ k: 'poll', label: 'استطلاع' }] : []),
                ].map((t: any) => (
                  <TouchableOpacity key={t.k} onPress={() => setTab(t.k)} style={[s.cmpBtn, tab === t.k && { backgroundColor: GOLD }]}>
                    <Text style={[s.cmpText, tab === t.k && { color: BG }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView style={{ flex: 1 }}>
                {tab === 'comments' && data.comments.map((c: any) => (
                  <View key={c.id} style={s.sheetCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: GOLD, fontSize: 12, fontWeight: '800' }}>{c.user_name} · {c.user_city || ''}</Text>
                      {!c.store_reply && (
                        <TouchableOpacity onPress={() => { setReplyTo({ commentId: c.id, commentText: c.text }); setReplyText(''); }} style={s.replyBtn}>
                          <Ionicons name="arrow-undo" size={11} color={BG} />
                          <Text style={s.replyBtnText}>رد</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={{ color: '#E5E7EB', fontSize: 12, textAlign: 'right', marginTop: 4 }}>{c.text}</Text>
                    {!!c.store_reply && (
                      <View style={s.replyBadge}>
                        <Ionicons name="checkmark-circle" size={11} color={GOLD} />
                        <Text style={s.replyBadgeText}>ردّ المتجر: {c.store_reply}</Text>
                      </View>
                    )}
                    {(c.replies || []).map((r: any) => (
                      <View key={r.id} style={[s.replyBadge, { marginTop: 4, backgroundColor: r.is_store ? 'rgba(16,185,129,0.15)' : BG }]}>
                        <Ionicons name={r.is_store ? 'storefront' : 'person'} size={11} color={r.is_store ? '#10B981' : GOLD} />
                        <Text style={s.replyBadgeText}>{r.user_name}: {r.text}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                {tab === 'viewers' && data.viewers.map((v: any, i: number) => (
                  <View key={i} style={s.listRow}>
                    <Text style={s.listRowText}>{v.user_name} · {v.user_city || '—'}</Text>
                    <Text style={s.listRowMeta}>{(v.viewed_at || '').slice(0, 10)}</Text>
                  </View>
                ))}
                {tab === 'likers' && data.likers.map((v: any, i: number) => (
                  <View key={i} style={s.listRow}>
                    <Text style={s.listRowText}>{v.user_name} · {v.user_city || '—'}</Text>
                    <Text style={s.listRowMeta}>{(v.liked_at || '').slice(0, 10)}</Text>
                  </View>
                ))}
                {tab === 'poll' && data.poll?.options?.map((opt: any, i: number) => (
                  <View key={i} style={s.sheetCard}>
                    <Text style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right' }}>{opt.text}</Text>
                    <Text style={{ color: '#E5E7EB', fontSize: 12, marginTop: 2, textAlign: 'right' }}>{opt.votes || 0} صوت</Text>
                    {(opt.voter_list || []).slice(0, 12).map((vt: any, k: number) => (
                      <View key={k} style={s.listRow}>
                        <Text style={s.listRowText}>{vt.user_name} · {vt.user_city || '—'}</Text>
                        <Text style={s.listRowMeta}>{(vt.voted_at || '').slice(0, 10)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                {tab === 'sharers' && <SharersView postId={post.id} apiCall={apiCall} />}
              </ScrollView>
              {replyTo && (
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8, marginTop: 8 }}>
                  <Text style={{ color: MUTED, fontSize: 11, textAlign: 'right' }}>رد على: {replyTo.commentText}</Text>
                  <TextInput style={s.replyInput} placeholder="ردك..." placeholderTextColor={MUTED}
                    multiline value={replyText} onChangeText={setReplyText} />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setReplyTo(null)}><Text style={s.cancelText}>إلغاء</Text></TouchableOpacity>
                    <TouchableOpacity style={s.sendBtn} onPress={sendThreadedReply}>
                      <Ionicons name="send" size={14} color={BG} />
                      <Text style={s.sendText}>إرسال</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}


/* ─── Sharers view — WHO shared and WHERE ────────────────────────── */
function SharersView({ postId, apiCall }: any) {
  const s = useSStyles();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiCall(`/api/merchant/social/posts/${postId}/sharers`)
      .then(setData).catch(() => setData({ total: 0, sharers: [], by_platform: {} }))
      .finally(() => setLoading(false));
  }, [postId]);
  const PLATFORM_META: any = {
    whatsapp: { icon: 'logo-whatsapp', color: '#25D366', label: 'واتساب' },
    twitter: { icon: 'logo-twitter', color: '#1DA1F2', label: 'تويتر' },
    telegram: { icon: 'paper-plane', color: '#0088cc', label: 'تيليجرام' },
    snapchat: { icon: 'logo-snapchat', color: '#FFFC00', label: 'سناب شات' },
    facebook: { icon: 'logo-facebook', color: '#4267B2', label: 'فيسبوك' },
    instagram: { icon: 'logo-instagram', color: '#E1306C', label: 'انستقرام' },
    copy: { icon: 'copy', color: GOLD, label: 'نسخ الرابط' },
    unknown: { icon: 'share-social', color: MUTED, label: 'أخرى' },
  };
  if (loading) return <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />;
  if (!data || data.total === 0) return <Text style={s.empty}>لا يوجد مشاركات بعد لهذا المنشور</Text>;
  return (
    <>
      <View style={s.sheetCard}>
        <Text style={{ color: GOLD, fontSize: 13, fontWeight: '800', textAlign: 'right', marginBottom: 8 }}>
          🔗 مشاركات ({data.total})
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(data.by_platform || {}).map(([platform, count]: any) => {
            const meta = PLATFORM_META[platform] || PLATFORM_META.unknown;
            return (
              <View key={platform} style={[s.svcMetaChip, { backgroundColor: meta.color + '20', borderColor: meta.color }]}>
                <Ionicons name={meta.icon} size={12} color={meta.color} />
                <Text style={[s.svcMetaText, { color: meta.color }]}>{meta.label} · {count}</Text>
              </View>
            );
          })}
        </View>
      </View>
      {data.sharers.map((sh: any, i: number) => {
        const meta = PLATFORM_META[sh.platform] || PLATFORM_META.unknown;
        return (
          <View key={i} style={s.listRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name={meta.icon} size={14} color={meta.color} />
              <Text style={s.listRowText}>{sh.user_name} · {sh.user_city || '—'}</Text>
            </View>
            <Text style={s.listRowMeta}>{(sh.shared_at || '').slice(0, 10)}</Text>
          </View>
        );
      })}
    </>
  );
}

/* ─── Overview Section — Luxe Glass Command Center ─────────────── */
const MEDAL_COLORS: Record<number, { bg: string; border: string; label: string }> = {
  0: { bg: '#F5C518', border: '#FCD34D', label: '🥇' },
  1: { bg: '#D4D4D8', border: '#E5E7EB', label: '🥈' },
  2: { bg: '#CD7F32', border: '#EAB308', label: '🥉' },
};

function LeaderRow({ rank, name, subtitle, primaryValue, primaryLabel, secondaryValue, progressPct, isOnline, avatar, onPress }: any) {
  const s = useSStyles();
  const medal = MEDAL_COLORS[rank];
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={s.luxeRow}>
      {/* Avatar + medal */}
      {avatar ? (
        <View style={{ position: 'relative' }}>
          <Image source={{ uri: avatar }} style={s.luxeAvatar} contentFit="cover" />
          {medal && <View style={s.luxeAvatarMedal}><Text style={{ fontSize: 12 }}>{medal.label}</Text></View>}
        </View>
      ) : (
        <View style={[s.luxeMedal, medal ? { backgroundColor: medal.bg + '30', borderColor: medal.border } : { backgroundColor: BORDER, borderColor: BORDER }]}>
          {medal ? <Text style={{ fontSize: 18 }}>{medal.label}</Text>
            : <Text style={{ color: MUTED, fontSize: 13, fontWeight: '800' }}>{rank + 1}</Text>}
        </View>
      )}
      {/* Info */}
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.luxeRowName} numberOfLines={1}>{name}</Text>
          {isOnline && <View style={s.onlineDot} />}
        </View>
        <Text style={s.luxeRowSub} numberOfLines={1}>{subtitle}</Text>
        <View style={s.progressBg}>
          <LinearGradient
            colors={[GOLD, '#D4A017']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={[s.progressFill, { width: `${Math.max(4, Math.min(100, progressPct))}%` }]}
          />
        </View>
      </View>
      {/* Metric */}
      <View style={{ alignItems: 'flex-end', minWidth: 62 }}>
        <Text style={s.luxeMetric}>{primaryValue}</Text>
        <Text style={s.luxeMetricLabel}>{primaryLabel}</Text>
        {secondaryValue !== undefined && <Text style={s.luxeMetricSecondary}>{secondaryValue}</Text>}
      </View>
      <Ionicons name="chevron-back" size={18} color={MUTED} style={{ marginStart: 4 }} />
    </TouchableOpacity>
  );
}

/* ─── Entity Detail Sheet — driver / branch / marketer / employee ─────── */
function EntityDetailSheet({ entity, kind, onClose }: any) {
  const s = useSStyles();
  if (!entity) return null;
  const rows: { icon: string; label: string; value: string; color?: string }[] = [];
  const K = (v: any) => v ? Number(v).toLocaleString('ar-SA') : '0';

  if (kind === 'driver') {
    rows.push({ icon: 'car', label: 'المركبة', value: entity.vehicle || '—' });
    rows.push({ icon: 'radio-button-on', label: 'الحالة', value: entity.online ? '🟢 متصل الآن' : '⚪ غير متصل', color: entity.online ? '#34D399' : MUTED });
    rows.push({ icon: 'star', label: 'التقييم', value: `⭐ ${(entity.rating || 0).toFixed(1)}` });
    rows.push({ icon: 'briefcase', label: 'نظام الدفع', value: entity.salary_type === 'monthly' ? `راتب شهري: ${K(entity.salary_monthly)} ر.س` : entity.salary_type === 'hourly' ? `أجر بالساعة: ${K(entity.hourly_rate)} ر.س` : 'عمولة على التوصيلات' });
    rows.push({ icon: 'today', label: 'اليوم', value: `${K(entity.today_deliveries)} توصيلة`, color: GOLD });
    rows.push({ icon: 'calendar', label: 'هذا الأسبوع', value: `${K(entity.week_deliveries)} توصيلة · ${K(entity.week_earnings)} ر.س` });
    rows.push({ icon: 'calendar-outline', label: 'هذا الشهر', value: `${K(entity.month_deliveries)} توصيلة · ${K(entity.month_earnings)} ر.س` });
    rows.push({ icon: 'trending-up', label: 'هذه السنة', value: `${K(entity.year_deliveries)} توصيلة · ${K(entity.year_earnings)} ر.س` });
    rows.push({ icon: 'wallet', label: 'رصيد المحفظة', value: `${K(entity.wallet_balance)} ر.س`, color: '#34D399' });
    rows.push({ icon: 'call', label: 'الجوال', value: entity.phone });
  }
  if (kind === 'branch') {
    rows.push({ icon: 'location', label: 'المدينة', value: entity.city });
    rows.push({ icon: 'call', label: 'الجوال', value: entity.phone });
    rows.push({ icon: 'time', label: 'ساعات العمل', value: entity.open_hours || '—' });
    rows.push({ icon: 'checkmark-circle', label: 'الحالة', value: entity.active ? '✅ نشط' : '⚠️ متوقف', color: entity.active ? '#34D399' : '#F87171' });
    rows.push({ icon: 'people', label: 'عدد الموظفين', value: `${entity.employees_count} موظف` });
    rows.push({ icon: 'cart', label: 'مبيعات داخل الفرع', value: `${K(entity.in_store_revenue)} ر.س`, color: '#34D399' });
    rows.push({ icon: 'phone-portrait', label: 'مبيعات من التطبيق', value: `${K(entity.app_revenue)} ر.س`, color: '#60A5FA' });
    rows.push({ icon: 'calculator', label: 'إجمالي الشهر', value: `${K(entity.pos_revenue + entity.app_revenue)} ر.س`, color: GOLD });
    rows.push({ icon: 'receipt', label: 'إجمالي الطلبات', value: `${K(entity.orders_count)} طلب` });
    if (entity.monthly_target > 0) {
      const pct = ((entity.pos_revenue + entity.app_revenue) / entity.monthly_target * 100).toFixed(1);
      rows.push({ icon: 'flag', label: 'الهدف الشهري', value: `${K(entity.monthly_target)} ر.س (${pct}%)` });
    }
  }
  if (kind === 'marketer') {
    rows.push({ icon: 'megaphone', label: 'رمز الإحالة', value: entity.referral_code, color: GOLD });
    rows.push({ icon: 'call', label: 'الجوال', value: entity.phone });
    rows.push({ icon: 'link', label: 'نقرات إجمالية', value: `${K(entity.clicks)} نقرة` });
    rows.push({ icon: 'trending-up', label: 'التحويلات', value: `${K(entity.conversions)} عملية (${((entity.conversions/(entity.clicks||1))*100).toFixed(1)}%)`, color: '#34D399' });
    rows.push({ icon: 'cash', label: 'إجمالي المبيعات', value: `${K(entity.sales_total)} ر.س`, color: GOLD });
    rows.push({ icon: 'gift', label: 'العمولات المكتسبة', value: `${K(entity.commission_earned)} ر.س`, color: '#34D399' });
    rows.push({ icon: 'hourglass', label: 'قيد التسوية', value: `${K(entity.commission_pending)} ر.س`, color: '#F59E0B' });
    rows.push({ icon: 'checkmark-done', label: 'تم دفعها', value: `${K(entity.commission_paid)} ر.س` });
    rows.push({ icon: 'share-social', label: 'مشاركات على السوشيال', value: `${K(entity.posts_shared)} منشور` });
    rows.push({ icon: 'globe', label: 'أكثر منصة نشاطاً', value: entity.top_platform || '—' });
  }
  if (kind === 'employee') {
    rows.push({ icon: 'briefcase', label: 'الوظيفة', value: entity.job_title });
    rows.push({ icon: 'business', label: 'القسم', value: entity.department || '—' });
    rows.push({ icon: 'call', label: 'الجوال', value: entity.phone });
    rows.push({ icon: 'time', label: 'الدوام', value: `${entity.shift_start} - ${entity.shift_end}` });
    rows.push({ icon: 'hourglass', label: 'ساعات العمل يومياً', value: `${entity.shift_hours} ساعة` });
    rows.push({ icon: 'calendar', label: 'تاريخ التوظيف', value: entity.hire_date || '—' });
    rows.push({ icon: 'wallet', label: 'نظام الأجر',
      value: entity.salary_type === 'monthly' ? `راتب شهري: ${K(entity.salary_monthly)} ر.س` : `أجر بالساعة: ${K(entity.hourly_rate)} ر.س`,
      color: GOLD });
    rows.push({ icon: 'receipt', label: 'إجمالي الفواتير', value: `${K(entity.invoices_total)} ر.س`, color: '#34D399' });
    rows.push({ icon: 'cart', label: 'الطلبات المُنجزة', value: `${K(entity.orders_handled)} طلب` });
    rows.push({ icon: 'location', label: 'الفروع', value: `${(entity.branch_ids || []).length} فرع` });
  }

  return (
    <Modal visible={!!entity} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetOverlay}>
        <View style={[s.sheet, { maxHeight: '86%' }]}>
          <View style={s.sheetHead}>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={GOLD} /></TouchableOpacity>
            <Text style={s.sheetTitle}>{entity.name}</Text>
          </View>
          {/* Hero */}
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            {entity.avatar || entity.image ? (
              <Image source={{ uri: entity.avatar || entity.image }} style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: GOLD }} contentFit="cover" />
            ) : (
              <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: GOLD + '30', borderWidth: 3, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={kind === 'branch' ? 'business' : kind === 'driver' ? 'car' : kind === 'marketer' ? 'megaphone' : 'person'} size={44} color={GOLD} />
              </View>
            )}
          </View>
          <ScrollView>
            {rows.map((r, i) => (
              <View key={i} style={s.detailRow}>
                <View style={{ width: 30, alignItems: 'center' }}>
                  <Ionicons name={r.icon as any} size={16} color={r.color || GOLD} />
                </View>
                <Text style={s.detailLabel}>{r.label}</Text>
                <Text style={[s.detailValue, r.color ? { color: r.color } : null]}>{r.value}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OverviewSection({ apiCall }: any) {
  const s = useSStyles();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'drivers' | 'branches' | 'marketers' | 'employees'>('drivers');
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [marketerId, setMarketerId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh?: boolean) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { setData(await apiCall('/api/merchant/live-preview/overview')); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [apiCall]);
  useEffect(() => { load(); const iv = setInterval(() => load(true), 25000); return () => clearInterval(iv); }, [load]);

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
      <ActivityIndicator size="large" color={GOLD} />
      <Text style={{ color: MUTED, marginTop: 12, fontSize: 12 }}>جاري تحميل داشبورد الأداء...</Text>
    </View>
  );
  if (!data) return <Text style={s.empty}>لا تتوفر بيانات</Text>;

  const summary = [
    { icon: 'car', color: '#60A5FA', label: 'السائقون', value: data.drivers.total, sub: `${data.drivers.online} متصل الآن` },
    { icon: 'business', color: '#34D399', label: 'الفروع', value: data.branches.total, sub: `${data.branches.active} فرع نشط` },
    { icon: 'megaphone', color: '#F59E0B', label: 'المسوّقون', value: data.marketers.total, sub: `${Math.round(data.marketers.total_commission).toLocaleString()} ر.س` },
    { icon: 'people', color: '#F472B6', label: 'الموظفون', value: data.employees.total, sub: `${data.employees.list.length} نشط` },
  ];

  // Max value for progress bars per tab
  const maxDrivers = Math.max(...data.drivers.top.map((d: any) => d.total_deliveries || 0), 1);
  const maxBranches = Math.max(...data.branches.top.map((b: any) => b.pos_revenue || 0), 1);
  const maxMarketers = Math.max(...data.marketers.top.map((m: any) => m.commission_earned || 0), 1);
  const maxEmployees = Math.max(...data.employees.list.map((e: any) => e.invoices_total || 0), 1);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GOLD} />}
    >
      {/* Hero header with gold streak */}
      <LinearGradient
        colors={['#1A1401', '#0B0C10']}
        style={s.luxeHero}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={s.luxeHeroGoldStreak} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Ionicons name="analytics" size={26} color={GOLD} />
          <View>
            <Text style={s.luxeHeroTitle}>مركز القيادة</Text>
            <Text style={s.luxeHeroSub}>نظرة شاملة على أداء المتجر</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Glass KPI cards */}
      <View style={s.luxeKpiRow}>
        {summary.map((k, i) => (
          <BlurView key={i} intensity={30} tint="dark" style={s.luxeKpi}>
            <View style={[s.luxeKpiIconWrap, { backgroundColor: k.color + '25', borderColor: k.color + '55' }]}>
              <Ionicons name={k.icon as any} size={20} color={k.color} />
            </View>
            <Text style={s.luxeKpiValue}>{k.value}</Text>
            <Text style={s.luxeKpiLabel}>{k.label}</Text>
            <Text style={[s.luxeKpiSub, { color: k.color }]}>{k.sub}</Text>
          </BlurView>
        ))}
      </View>

      {/* Tab pills - premium style */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.luxeTabRow}>
        {[
          { k: 'drivers', label: 'السائقون', icon: 'car' },
          { k: 'branches', label: 'الفروع', icon: 'business' },
          { k: 'marketers', label: 'المسوّقون', icon: 'megaphone' },
          { k: 'employees', label: 'الموظفون', icon: 'people' },
        ].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setTab(t.k as any)}
            style={[s.luxeTab, tab === t.k && s.luxeTabActive]}>
            <Ionicons name={t.icon as any} size={16} color={tab === t.k ? BG : GOLD} />
            <Text style={[s.luxeTabText, tab === t.k && { color: BG, fontWeight: '900' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Order Heatmap - Best Times */}
      <OrderHeatmap apiCall={apiCall} />

      <View style={{ paddingHorizontal: 12 }}>
        {tab === 'drivers' && (
          <View>
            <Text style={s.luxeSectionTitle}>🏆 أفضل السائقين حسب التوصيلات</Text>
            {data.drivers.top.length === 0 ? <Text style={s.empty}>لا يوجد سائقون بعد</Text> :
              data.drivers.top.map((d: any, i: number) => (
                <LeaderRow key={d.id} rank={i}
                  name={d.name}
                  avatar={d.avatar}
                  subtitle={`${d.vehicle || d.phone}${d.rating ? ` · ⭐ ${d.rating.toFixed(1)}` : ''}`}
                  primaryValue={d.total_deliveries}
                  primaryLabel="توصيلة"
                  secondaryValue={`${d.today_deliveries} اليوم`}
                  progressPct={(d.total_deliveries / maxDrivers) * 100}
                  isOnline={d.online}
                  onPress={() => setDriverId(d.id)}
                />
              ))}
          </View>
        )}

        {tab === 'branches' && (
          <View>
            <Text style={s.luxeSectionTitle}>🏆 أفضل الفروع حسب المبيعات</Text>
            {data.branches.top.length === 0 ? <Text style={s.empty}>لا يوجد فروع بعد</Text> :
              data.branches.top.map((b: any, i: number) => (
                <LeaderRow key={b.id} rank={i}
                  name={b.name}
                  avatar={b.image}
                  subtitle={`${b.city} · ${b.employees_count} موظف · ${b.open_hours}`}
                  primaryValue={`${((b.pos_revenue + b.app_revenue) / 1000).toFixed(1)}K`}
                  primaryLabel="ر.س"
                  secondaryValue={`${b.orders_count} طلب`}
                  progressPct={((b.pos_revenue + b.app_revenue) / maxBranches) * 100}
                  isOnline={b.active}
                  onPress={() => setBranchId(b.id)}
                />
              ))}
          </View>
        )}

        {tab === 'marketers' && (
          <View>
            <Text style={s.luxeSectionTitle}>🏆 أفضل المسوقين حسب العمولات</Text>
            {data.marketers.top.length === 0 ?
              <View style={s.luxeEmpty}>
                <Ionicons name="megaphone-outline" size={40} color={MUTED} />
                <Text style={s.luxeEmptyTitle}>لا يوجد مسوّقون معتمدون بعد</Text>
                <Text style={s.luxeEmptySub}>افتح باب التسويق بالعمولة من إعدادات المتجر</Text>
              </View>
              :
              data.marketers.top.map((m: any, i: number) => (
                <LeaderRow key={m.id} rank={i}
                  name={m.name}
                  avatar={m.avatar}
                  subtitle={`رمز: ${m.referral_code} · ${m.clicks} نقرة · ${m.conversions} تحويل`}
                  primaryValue={`${(m.commission_earned / 1000).toFixed(1)}K`}
                  primaryLabel="ر.س"
                  progressPct={(m.commission_earned / maxMarketers) * 100}
                  onPress={() => setMarketerId(m.id)}
                />
              ))}
          </View>
        )}

        {tab === 'employees' && (
          <View>
            <Text style={s.luxeSectionTitle}>🏆 أفضل الموظفين حسب الفواتير</Text>
            {data.employees.list.length === 0 ? <Text style={s.empty}>لا يوجد موظفون بعد</Text> :
              data.employees.list.map((e: any, i: number) => (
                <LeaderRow key={e.id} rank={i}
                  name={e.name}
                  avatar={e.avatar}
                  subtitle={`${e.job_title} · ${e.shift_start}-${e.shift_end}`}
                  primaryValue={`${(e.invoices_total / 1000).toFixed(1)}K`}
                  primaryLabel="ر.س"
                  secondaryValue={`${e.orders_handled} طلب`}
                  progressPct={(e.invoices_total / maxEmployees) * 100}
                  onPress={() => setEmployeeId(e.id)}
                />
              ))}
          </View>
        )}
      </View>

      {/* Rich drill-down sheets with cross-navigation */}
      {driverId && <DriverDetailSheet driverId={driverId} apiCall={apiCall}
        onClose={() => setDriverId(null)}
        onOpenBranch={(bid: string) => { setDriverId(null); setBranchId(bid); }} />}
      {branchId && <BranchDetailSheet branchId={branchId} apiCall={apiCall}
        onClose={() => setBranchId(null)}
        onOpenEmployee={(eid: string) => { setBranchId(null); setEmployeeId(eid); }} />}
      {marketerId && <MarketerDetailSheet marketerId={marketerId} apiCall={apiCall}
        onClose={() => setMarketerId(null)} />}
      {employeeId && <EmployeeDetailSheet employeeId={employeeId} apiCall={apiCall}
        onClose={() => setEmployeeId(null)}
        onOpenBranch={(bid: string) => { setEmployeeId(null); setBranchId(bid); }} />}
    </ScrollView>
  );
}


function useSStyles() {
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7f1d1d', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, margin: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  previewText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  sectionRowWrap: { height: 60, marginTop: 4 },
  sectionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingEnd: 24, alignItems: 'center', minHeight: 52 },
  sectionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CARD, height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, borderColor: BORDER, flexShrink: 0 },
  sectionBtnActive: { backgroundColor: GOLD, borderColor: GOLD },
  sectionText: { color: GOLD, fontSize: 12, fontWeight: '800', flexShrink: 0, includeFontPadding: false as any },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0F5132', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  livePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  livePulse2: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0F5132', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  liveText: { color: '#A7F3D0', fontSize: 11, fontWeight: '800' },
  cmpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CARD, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: GOLD, flexShrink: 0, height: 36 },
  cmpText: { color: GOLD, fontSize: 12, fontWeight: '700', flexShrink: 0 },
  pCard: { flex: 1, backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, position: 'relative' },
  pCardSelected: { borderColor: GOLD, borderWidth: 2 },
  pImg: { width: '100%', height: 130 },
  pLive: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(16,185,129,0.9)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pLiveText: { color: 'white', fontSize: 10, fontWeight: '900' },
  checkbox: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: GOLD },
  pName: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  pPrice: { color: GOLD, fontSize: 13, fontWeight: '900' },
  pRating: { color: GOLD, fontSize: 10 },
  pStat: { color: MUTED, fontSize: 10 },
  empty: { color: MUTED, textAlign: 'center', marginTop: 40 },
  compareFab: { position: 'absolute', left: 20, right: 20, bottom: 90, backgroundColor: GOLD, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 999, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12 },
  compareFabText: { color: BG, fontWeight: '900', fontSize: 14 },
  svcCard: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', alignItems: 'center' },
  svcImg: { width: 80, height: 80 },
  svcName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textAlign: 'right' },
  svcDesc: { color: MUTED, fontSize: 11, marginTop: 2, textAlign: 'right' },
  svcPrice: { color: GOLD, fontSize: 13, fontWeight: '900' },
  svcMeta: { color: '#60A5FA', fontSize: 10, fontWeight: '700' },
  compCard: { padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#4A3809' },
  trophy: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(245,197,24,0.15)', alignItems: 'center', justifyContent: 'center' },
  compTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', textAlign: 'right' },
  compPrize: { color: GOLD, fontSize: 12, marginTop: 2, textAlign: 'right' },
  compMeta: { color: MUTED, fontSize: 11, marginTop: 2, textAlign: 'right' },
  postCard: { backgroundColor: CARD, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  postAuthor: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  postDate: { color: MUTED, fontSize: 10, marginTop: 2 },
  postText: { color: '#E5E7EB', fontSize: 13, textAlign: 'right', lineHeight: 20 },
  postImg: { width: '100%', height: 200, borderRadius: 10, marginTop: 8 },
  postMeta: { flexDirection: 'row', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER },
  postMetaText: { color: MUTED, fontSize: 12 },
  comment: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 8, backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  commentAuthor: { color: GOLD, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  commentText: { color: '#E5E7EB', fontSize: 12, marginTop: 2, textAlign: 'right' },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  replyBtnText: { color: BG, fontSize: 10, fontWeight: '900' },
  commentPreview: { padding: 10, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, marginTop: 8 },
  replyInput: { backgroundColor: CARD, color: '#FFFFFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: BORDER, minHeight: 80, marginTop: 8, textAlign: 'right' },
  replySheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, borderTopWidth: 1, borderTopColor: BORDER },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  cancelText: { color: MUTED, fontWeight: '700' },
  sendBtn: { flex: 2, padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: GOLD },
  sendText: { color: BG, fontWeight: '900' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', borderTopWidth: 1, borderTopColor: BORDER },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: '#3A3D48', alignSelf: 'center', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  sheetTitle: { flex: 1, textAlign: 'center', color: GOLD, fontSize: 15, fontWeight: '900' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexBasis: '31%', flexGrow: 1, backgroundColor: CARD, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 4 },
  kpiVal: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  kpiLbl: { color: MUTED, fontSize: 10, textAlign: 'center' },
  sec: { color: GOLD, fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 8, textAlign: 'right' },
  hint: { color: MUTED, fontSize: 11, marginBottom: 8, textAlign: 'right' },
  chartCard: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  empty2: { padding: 20, alignItems: 'center', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER },
  visitor: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 6 },
  visitorAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  visitorName: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  visitorMeta: { color: MUTED, fontSize: 11, marginTop: 2, textAlign: 'right' },
  visitorTime: { color: MUTED, fontSize: 11 },
  abandoned: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#3B0F0F', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#7F1D1D', marginBottom: 6 },
  offerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  offerText: { color: BG, fontSize: 11, fontWeight: '900' },
  cmpCard: { width: 180, backgroundColor: CARD, borderRadius: 12, padding: 10, marginRight: 10, borderWidth: 1, borderColor: BORDER },
  cmpImg: { width: '100%', height: 100, borderRadius: 8 },
  cmpName: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: 6, textAlign: 'right' },
  cmpPrice: { color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 4, textAlign: 'right' },
  cmpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: BORDER },
  cmpLbl: { color: MUTED, fontSize: 10 },
  cmpVal: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  // Analytics button on product card
  pAnalyticsBtn: { position: 'absolute', top: 6, left: 6, backgroundColor: GOLD, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 8, zIndex: 10 },
  pDetailHint: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(11,12,16,0.85)', borderWidth: 1, borderColor: GOLD,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, zIndex: 10,
  },
  pDetailHintText: { color: GOLD, fontSize: 9, fontWeight: '900' },
  // Services rich card
  svcCard2: { backgroundColor: CARD, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  svcCover: { width: '100%', height: 160 },
  svcOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 },
  svcBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: GOLD, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  svcBadgeText: { color: BG, fontSize: 10, fontWeight: '900' },
  svcRatingBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: GOLD, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  svcWarrantyPill: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: '#10B981',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  svcWarrantyText: { color: '#10B981', fontSize: 10, fontWeight: '900' },
  svcDetailHint: {
    position: 'absolute', bottom: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(11,12,16,0.85)', borderWidth: 1, borderColor: GOLD,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  svcDetailHintText: { color: GOLD, fontSize: 10, fontWeight: '900' },
  svcName2: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'right' },
  svcDesc2: { color: MUTED, fontSize: 12, marginTop: 2, textAlign: 'right', lineHeight: 18 },
  svcPrice2: { color: GOLD, fontSize: 15, fontWeight: '900' },
  svcMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,197,24,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(245,197,24,0.3)' },
  svcMetaText: { color: GOLD, fontSize: 10, fontWeight: '700' },
  svcReview: { backgroundColor: BG, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: BORDER },
  svcReviewName: { color: GOLD, fontSize: 11, fontWeight: '800' },
  svcReviewText: { color: '#E5E7EB', fontSize: 11, marginTop: 4, textAlign: 'right' },
  replyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,197,24,0.12)', padding: 6, borderRadius: 6, marginTop: 6, borderWidth: 1, borderColor: 'rgba(245,197,24,0.3)' },
  replyBadgeText: { color: GOLD, fontSize: 10, fontWeight: '700', flex: 1, textAlign: 'right' },
  // Competitions details
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  liveTagText: { color: BG, fontSize: 9, fontWeight: '900' },
  compMetaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  compMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  compMetaText: { color: '#E5E7EB', fontSize: 10, fontWeight: '700' },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 6, marginBottom: 4 },
  winnerRank: { width: 22, height: 22, borderRadius: 11, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  winnerName: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', flex: 1, textAlign: 'right' },
  winnerPhone: { color: MUTED, fontSize: 10 },
  // Poll bars
  pollRow: { position: 'relative', backgroundColor: BG, borderRadius: 6, padding: 8, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  pollBar: { position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(245,197,24,0.2)' },
  pollText: { color: '#E5E7EB', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  // Sales overview + top strip
  ovRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  ovCard: { flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: BORDER },
  ovLbl: { color: MUTED, fontSize: 10, textAlign: 'right' },
  ovVal: { color: GOLD, fontSize: 13, fontWeight: '900', marginTop: 3, textAlign: 'right' },
  ovSub: { color: '#9CA3AF', fontSize: 9, textAlign: 'right', marginTop: 1 },
  stripTitle: { color: GOLD, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  topCard: { width: 140, backgroundColor: CARD, borderRadius: 10, padding: 6, borderWidth: 1, borderColor: BORDER, marginLeft: 8, position: 'relative' },
  topRank: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  topRankText: { color: BG, fontWeight: '900', fontSize: 11 },
  topImg: { width: '100%', height: 70, borderRadius: 6 },
  topName: { color: '#FFF', fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  topRev: { color: GOLD, fontSize: 12, fontWeight: '900', marginTop: 2, textAlign: 'right' },
  topSplit: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  topSplitPos: { color: '#60A5FA', fontSize: 9, fontWeight: '800' },
  topSplitApp: { color: '#34D399', fontSize: 9, fontWeight: '800' },
  // Analytics buttons on service/comp cards
  analyticsFloatBtn: { position: 'absolute', top: 8, left: 8, backgroundColor: GOLD, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 10, zIndex: 20 },
  // Sheet common
  sheetCard: { backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 10 },
  sheetKpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetKpi: { flexBasis: '30%', backgroundColor: BG, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: BORDER },
  sheetKpiVal: { color: GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  sheetKpiLbl: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 },
  sheetSectionTitle: { color: GOLD, fontSize: 12, fontWeight: '900', marginBottom: 6, textAlign: 'right' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  barLabel: { color: '#E5E7EB', fontSize: 11, width: 90, textAlign: 'right' },
  barTrack: { flex: 1, height: 10, backgroundColor: BG, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: GOLD },
  barValue: { color: GOLD, fontSize: 11, fontWeight: '800', width: 44, textAlign: 'left' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  listRowText: { color: '#E5E7EB', fontSize: 11, textAlign: 'right', flex: 1 },
  listRowMeta: { color: MUTED, fontSize: 10 },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: GOLD, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  detailBtnText: { color: BG, fontSize: 10, fontWeight: '900' },
  /* ─── Luxe Glass Command Center styles ───────────────────────────── */
  luxeHero: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, overflow: 'hidden', position: 'relative' },
  luxeHeroGoldStreak: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#F5C518', opacity: 0.05, top: -160, right: -80 },
  luxeHeroTitle: { color: '#F5F5F7', fontSize: 22, fontWeight: '900', textAlign: 'right' },
  luxeHeroSub: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 2 },
  luxeKpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginTop: -8, marginBottom: 16 },
  luxeKpi: { flex: 1, minWidth: '46%', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#3F435466', overflow: 'hidden', backgroundColor: '#1A1C2380' },
  luxeKpiIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 8 },
  luxeKpiValue: { color: '#F5F5F7', fontSize: 26, fontWeight: '900', textAlign: 'right' },
  luxeKpiLabel: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 1 },
  luxeKpiSub: { fontSize: 10, textAlign: 'right', marginTop: 4, fontWeight: '700' },
  luxeTabRow: { paddingHorizontal: 12, gap: 8, marginBottom: 14, flexDirection: 'row' },
  luxeTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#1A1C23', borderWidth: 1, borderColor: '#3F435466' },
  luxeTabActive: { backgroundColor: GOLD, borderColor: GOLD },
  luxeTabText: { color: '#E5E7EB', fontSize: 12, fontWeight: '700' },
  luxeSectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right', marginBottom: 12, marginTop: 4 },
  luxeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, backgroundColor: '#1A1C23', borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: '#262933' },
  luxeMedal: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  luxeAvatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: BORDER },
  luxeAvatarMedal: { position: 'absolute', bottom: -4, right: -4, backgroundColor: BG, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: GOLD },
  luxeRowName: { color: '#F5F5F7', fontSize: 14, fontWeight: '800', textAlign: 'right', flex: 1 },
  luxeRowSub: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 3 },
  luxeMetric: { color: '#F5F5F7', fontSize: 18, fontWeight: '900', textAlign: 'left' },
  luxeMetricLabel: { color: MUTED, fontSize: 9, textAlign: 'left' },
  luxeMetricSecondary: { color: GOLD, fontSize: 10, textAlign: 'left', marginTop: 3, fontWeight: '700' },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#34D399', shadowColor: '#34D399', shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  progressBg: { height: 4, backgroundColor: '#262933', borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  luxeEmpty: { alignItems: 'center', padding: 30, backgroundColor: '#1A1C23', borderRadius: 14, borderWidth: 1, borderColor: '#262933' },
  luxeEmptyTitle: { color: '#E5E7EB', fontSize: 13, fontWeight: '800', marginTop: 10 },
  luxeEmptySub: { color: MUTED, fontSize: 10, marginTop: 4, textAlign: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  detailLabel: { color: MUTED, fontSize: 12, flex: 1, textAlign: 'right', marginHorizontal: 8 },
  detailValue: { color: '#FFF', fontSize: 12, fontWeight: '700', textAlign: 'left' },
}), []);
}

