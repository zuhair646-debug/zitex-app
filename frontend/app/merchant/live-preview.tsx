import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert, Dimensions, FlatList, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, G, Line, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useAuth } from '../_layout';
import { mediaUrlSync } from '../../src/utils/upload';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const MUTED = '#9CA3AF';
const { width: SCREEN } = Dimensions.get('window');

type Section = 'products' | 'services' | 'competitions' | 'social';

export default function LivePreview() {
  const router = useRouter();
  const { apiCall } = useAuth();
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
        <Text style={s.previewText}>🔴 وضع البث المباشر — v1.11.1 ✨ إحصائيات حقيقية</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close-circle" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Section tabs (like customer bottom tabs, but at top for preview) */}
      <View style={s.sectionRow}>
        {[
          { id: 'products', name: 'المتجر', icon: 'storefront' },
          { id: 'services', name: 'الصيانة', icon: 'construct' },
          { id: 'competitions', name: 'المسابقات', icon: 'trophy' },
          { id: 'social', name: 'السوشيال', icon: 'chatbubbles' },
        ].map(t => (
          <TouchableOpacity key={t.id} onPress={() => { setSection(t.id as Section); setCompareMode(false); setSelectedIds([]); }}
            style={[s.sectionBtn, section === t.id && s.sectionBtnActive]}>
            <Ionicons name={t.icon as any} size={18} color={section === t.id ? BG : GOLD} />
            <Text style={[s.sectionText, section === t.id && { color: BG }]}>{t.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'products' && (
        <ProductsSection
          apiCall={apiCall}
          onAnalytics={setAnalyticsFor}
          compareMode={compareMode}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          setCompareMode={setCompareMode}
          openCompare={openCompare}
        />
      )}
      {section === 'services' && <ServicesSection apiCall={apiCall} onAnalytics={setServiceAnalyticsFor} />}
      {section === 'competitions' && <CompetitionsSection apiCall={apiCall} onAnalytics={setCompAnalyticsFor} />}
      {section === 'social' && <SocialSection apiCall={apiCall} onOpenPost={setPostDetailFor} />}

      {analyticsFor && (
        <ProductAnalyticsSheet product={analyticsFor} onClose={() => setAnalyticsFor(null)} apiCall={apiCall} />
      )}
      {serviceAnalyticsFor && (
        <ServiceAnalyticsSheet service={serviceAnalyticsFor} onClose={() => setServiceAnalyticsFor(null)} apiCall={apiCall} />
      )}
      {compAnalyticsFor && (
        <CompetitionAnalyticsSheet competition={compAnalyticsFor} onClose={() => setCompAnalyticsFor(null)} apiCall={apiCall} />
      )}
      {postDetailFor && (
        <PostDetailSheet post={postDetailFor} onClose={() => setPostDetailFor(null)} apiCall={apiCall} />
      )}
      {compareData && (
        <CompareSheet items={compareData} onClose={() => { setCompareData(null); setSelectedIds([]); setCompareMode(false); }} />
      )}
    </SafeAreaView>
  );
}

/* ─── Products grid with live viewers & comparison ─────────────────────── */
function ProductsSection({ apiCall, onAnalytics, compareMode, selectedIds, setSelectedIds, setCompareMode, openCompare }: any) {
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
                    <TouchableOpacity key={f.id} onPress={() => router.push(`/product/${f.id}?preview=1` as any)}
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
              onPress={() => {
                if (compareMode) { toggle(item.id); return; }
                // Deep-link to the actual customer product page (with a preview flag)
                router.push(`/product/${item.id}?preview=1` as any);
              }}
              onLongPress={() => onAnalytics(item)}>
              {!!item.images?.[0] && (
                <Image source={{ uri: mediaUrlSync(item.images[0]) }} style={s.pImg} contentFit="cover" />
              )}
              {liveCount > 0 && (
                <View style={s.pLive}>
                  <View style={s.livePulse} />
                  <Text style={s.pLiveText}>{liveCount}</Text>
                </View>
              )}
              {/* Analytics button — always visible tap target */}
              {!compareMode && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); onAnalytics(item); }} style={s.pAnalyticsBtn}>
                  <Ionicons name="stats-chart" size={14} color={BG} />
                </TouchableOpacity>
              )}
              {compareMode && (
                <View style={[s.checkbox, selected && s.checkboxOn]}>
                  {selected && <Ionicons name="checkmark" size={14} color={BG} />}
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
          <View style={s.svcCard2}>
            {/* Cover image with badges */}
            <View style={{ position: 'relative' }}>
              <TouchableOpacity onPress={() => onAnalytics && onAnalytics(item)} style={s.analyticsFloatBtn}>
                <Ionicons name="stats-chart" size={16} color={BG} />
              </TouchableOpacity>
              {(item.images?.[0] || item.cover) ? (
                <Image source={{ uri: mediaUrlSync(item.images?.[0] || item.cover) }} style={s.svcCover} contentFit="cover" />
              ) : (
                <View style={[s.svcCover, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1D26' }]}>
                  <Ionicons name="construct" size={40} color={GOLD} />
                </View>
              )}
              {(item.avg_rating || 0) > 0 && (
                <View style={s.svcBadge}>
                  <Ionicons name="star" size={12} color={BG} />
                  <Text style={s.svcBadgeText}>{item.avg_rating}</Text>
                </View>
              )}
              {!!item.warranty_available && (
                <View style={[s.svcBadge, { top: 8, left: 8, right: 'auto', backgroundColor: '#10B981' }]}>
                  <Ionicons name="shield-checkmark" size={12} color={BG} />
                  <Text style={[s.svcBadgeText, { color: BG }]}>ضمان {item.warranty_days || 0}ي</Text>
                </View>
              )}
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
          </View>
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
      {/* Filter row */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 }}>
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
      </View>
      <FlatList data={filtered} keyExtractor={(x, i) => x.id || String(i)} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const isEnded = item.status === 'ended' || (item.winners || []).length > 0;
          const isLive = !isEnded && (item.remaining_ms == null || item.remaining_ms > 0);
          return (
            <LinearGradient colors={isEnded ? ['#1F2937', '#0F1116'] : ['#332905', '#1A1401']} style={s.compCard}>
              <TouchableOpacity onPress={() => onAnalytics && onAnalytics(item)} style={[s.analyticsFloatBtn, { top: 10, left: 10 }]}>
                <Ionicons name="stats-chart" size={16} color={BG} />
              </TouchableOpacity>
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
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>{filter === 'ended' ? 'لا مسابقات منتهية' : 'لا مسابقات نشطة'}</Text>}
      />
    </>
  );
}

function SocialSection({ apiCall, onOpenPost }: any) {
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
      {/* Filter row */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 }}>
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
      </View>
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CompareSheet({ items, onClose }: any) {
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
              </View>
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
              </View>
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
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                {[
                  { k: 'comments', label: `تعليقات (${data.kpis.comment_count})` },
                  { k: 'viewers', label: `مشاهدون (${data.viewers.length})` },
                  { k: 'likers', label: `إعجابات (${data.likers.length})` },
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


const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7f1d1d', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, margin: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  previewText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  sectionRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingBottom: 8 },
  sectionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: CARD, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: BORDER },
  sectionBtnActive: { backgroundColor: GOLD, borderColor: GOLD },
  sectionText: { color: GOLD, fontSize: 12, fontWeight: '800' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0F5132', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  livePulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  livePulse2: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0F5132', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  liveText: { color: '#A7F3D0', fontSize: 11, fontWeight: '800' },
  cmpBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CARD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: GOLD },
  cmpText: { color: GOLD, fontSize: 12, fontWeight: '700' },
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
  pAnalyticsBtn: { position: 'absolute', top: 6, left: 6, backgroundColor: GOLD, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4 },
  // Services rich card
  svcCard2: { backgroundColor: CARD, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  svcCover: { width: '100%', height: 160 },
  svcBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: GOLD, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  svcBadgeText: { color: BG, fontSize: 10, fontWeight: '900' },
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
  analyticsFloatBtn: { position: 'absolute', top: 8, left: 8, backgroundColor: GOLD, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4, zIndex: 5 },
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
});
