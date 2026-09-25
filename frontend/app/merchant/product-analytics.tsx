import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const CARD2 = '#1D1F2A';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';
const OK = '#10B981';
const RED = '#EF4444';
const BLUE = '#3B82F6';
const PURPLE = '#8B5CF6';
const AMBER = '#F59E0B';

const PLATFORM_COLORS: Record<string, string> = {
  'واتساب': '#25D366', 'تويتر': '#1DA1F2', 'انستقرام': '#E4405F',
  'سنابشات': '#FFFC00', 'تيليجرام': '#0088CC',
};

export default function ProductAnalyticsScreen({ kind = 'product', id: idProp = '' }: { kind?: 'product' | 'service' | 'competition' | 'post'; id?: string } = {} as any) {
  const router = useRouter();
  const { apiCall } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const pid = String(idProp || params.id || '');
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'visitors' | 'buyers' | 'shares' | 'reviews' | 'compare' | 'returns' | 'complaints' | 'winners' | 'videos'>('overview');

  const endpoint = kind === 'service'
    ? `/api/merchant/services/${pid}/deep-analytics`
    : kind === 'competition'
      ? `/api/merchant/competitions/${pid}/deep-analytics`
      : kind === 'post'
        ? `/api/merchant/social/posts/${pid}/deep-analytics`
        : `/api/merchant/products/${pid}/deep-analytics`;

  const kindLabel = kind === 'service' ? 'تحليلات الخدمة العميقة'
    : kind === 'competition' ? 'تحليلات المسابقة العميقة'
    : kind === 'post' ? 'تحليلات المنشور العميقة'
    : 'تحليلات المنتج العميقة';

  const buyersLabel = kind === 'service' ? 'الحجوزات'
    : kind === 'competition' ? 'المشتركون'
    : kind === 'post' ? 'التفاعل'
    : 'المشترون';

  // Kind-aware KPI labels & icons — using researched KSA-standard terminology
  const L = kind === 'service' ? {
    views: 'مشاهدات الخدمة', addToCart: 'الحجوزات', addIcon: 'calendar' as any,
    addSubUnit: 'معدل الحجز',
    abandon: 'حجوزات ملغاة', abandonSub: 'لم تكتمل',
    orders: 'خدمات مكتملة', ordersIcon: 'checkmark-done-circle' as any,
    ordersSubUnit: 'معدل الإتمام',
    revenue: 'إيرادات الخدمة',
    funnelCart: 'حجز خدمة', funnelCheckout: 'بدأ التنفيذ', funnelOrder: 'تم إنجاز الخدمة',
    heroPill: 'خدمة',
    unitLabel: 'حجز',
  } : kind === 'competition' ? {
    views: 'مشاهدات المسابقة', addToCart: 'المشتركون', addIcon: 'person-add' as any,
    addSubUnit: 'معدل المشاركة',
    abandon: 'أماكن شاغرة', abandonSub: 'من السعة الكلية',
    orders: 'دخلوا السحب', ordersIcon: 'trophy' as any,
    ordersSubUnit: 'معدل التأهل',
    revenue: 'قيمة المشتريات',
    funnelCart: 'سجّل مشاركته', funnelCheckout: 'أكمل المتطلبات', funnelOrder: 'دخل السحب',
    heroPill: 'مسابقة',
    unitLabel: 'مشترك',
  } : kind === 'post' ? {
    views: 'الوصول', addToCart: 'الإعجابات', addIcon: 'heart' as any,
    addSubUnit: 'من الوصول',
    abandon: 'التعليقات', abandonSub: 'تفاعل نصي',
    orders: 'المشاركات', ordersIcon: 'paper-plane' as any,
    ordersSubUnit: 'إعادة نشر',
    revenue: 'نقاط التفاعل',
    funnelCart: 'أعجبوا', funnelCheckout: 'علّقوا', funnelOrder: 'شاركوا',
    heroPill: 'منشور',
    unitLabel: 'مشاركة',
  } : {
    views: 'مشاهدات كلية', addToCart: 'أضيف للسلة', addIcon: 'cart' as any,
    addSubUnit: 'معدل السلة',
    abandon: 'سلات مهجورة', abandonSub: 'فرصة مفقودة',
    orders: 'عمليات شراء', ordersIcon: 'checkmark-circle' as any,
    ordersSubUnit: 'معدل الشراء',
    revenue: 'إيرادات',
    funnelCart: 'أضيف للسلة', funnelCheckout: 'بدأ الدفع', funnelOrder: 'أكمل الشراء',
    heroPill: 'منتج',
    unitLabel: 'قطعة',
  };

  // Number formatter to prevent overflow on big values (12.3K, 1.4M)
  const fmt = (n: number = 0): string => {
    if (n == null || isNaN(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (abs >= 10_000) return (n / 1000).toFixed(1) + 'K';
    if (abs >= 1000) return n.toLocaleString('en-US');
    return n.toLocaleString('en-US');
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await apiCall(endpoint);
        setD(data);
      } catch (e: any) {
        Alert.alert('خطأ', e?.message);
      } finally { setLoading(false); }
    })();
  }, [pid, endpoint]);

  if (loading) return (<SafeAreaView style={s.safe}><ActivityIndicator color={GOLD} style={{ marginTop: 40 }} /></SafeAreaView>);
  if (!d) return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
      </View>
      <View style={{ padding: 40, alignItems: 'center' }}>
        <Ionicons name="alert-circle" size={48} color={AMBER} />
        <Text style={{ color: TEXT, textAlign: 'center', marginTop: 12, fontSize: 14, fontWeight: '900' }}>تعذّر تحميل التحليلات</Text>
        <Text style={{ color: MUTED, textAlign: 'center', marginTop: 6, fontSize: 12 }}>تأكد من تسجيل الدخول كتاجر، أو تحقق من الاتصال بالإنترنت</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, backgroundColor: GOLD, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999 }}>
          <Text style={{ color: BG, fontWeight: '900' }}>الرجوع</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const k = d.kpis; const p = d.product;
  const disc = p.discount_price;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{p.name_ar}</Text>
          <Text style={s.sub}>{kindLabel}</Text>
        </View>
        {d.category_ranking && (
          <View style={s.rankBadge}>
            <Ionicons name="trophy" size={11} color={GOLD} />
            <Text style={s.rankText}>#{d.category_ranking.rank}/{d.category_ranking.total}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Product hero */}
        <View style={s.hero}>
          {p.images?.[0] ? (
            <Image source={{ uri: p.images[0] }} style={s.heroImg} resizeMode="cover" />
          ) : (
            <View style={[s.heroImg, { backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name={
                kind === 'service' ? 'construct' :
                kind === 'competition' ? 'trophy' :
                kind === 'post' ? 'megaphone' :
                'cube'
              } size={40} color={MUTED} />
            </View>
          )}
          <View style={s.heroOverlay}>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
              <View style={s.condPill}><Text style={s.condText}>{
                kind === 'product' ? (p.condition === 'new' ? 'جديد' : 'مستعمل')
                : L.heroPill
              }</Text></View>
              {p.warranty_days > 0 && (
                <View style={[s.condPill, { backgroundColor: PURPLE + '30', borderColor: PURPLE }]}>
                  <Text style={[s.condText, { color: PURPLE }]}>ضمان {p.warranty_days} يوم</Text>
                </View>
              )}
              {kind === 'competition' && k.winners_count != null && (
                <View style={[s.condPill, { backgroundColor: GOLD + '30', borderColor: GOLD }]}>
                  <Text style={[s.condText, { color: GOLD }]}>🏆 {k.winners_count}/{k.prize_count || '?'} فائز</Text>
                </View>
              )}
              {kind === 'post' && (
                <View style={[s.condPill, { backgroundColor: BLUE + '30', borderColor: BLUE }]}>
                  <Text style={[s.condText, { color: BLUE }]}>وصول ~{(k.reach_estimate || k.total_views).toLocaleString()}</Text>
                </View>
              )}
            </View>
            <Text style={s.heroTitle} numberOfLines={2}>{p.name_ar}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 }}>
              {kind === 'post' ? (
                <>
                  <Text style={s.priceMain}>{(k.engagement_score || 0).toLocaleString()}</Text>
                  <Text style={{ color: MUTED, fontSize: 11, marginBottom: 3 }}>نقطة تفاعل</Text>
                </>
              ) : kind === 'competition' ? (
                <>
                  <Text style={s.priceMain}>{p.price > 0 ? `${p.price} ر.س` : 'مجاناً'}</Text>
                  <Text style={{ color: MUTED, fontSize: 10, marginBottom: 3 }}>حد الإنفاق</Text>
                </>
              ) : (
                <>
                  <Text style={s.priceMain}>{disc || p.price} ر.س</Text>
                  {disc && <Text style={s.priceOld}>{p.price} ر.س</Text>}
                </>
              )}
              <View style={{ flex: 1 }} />
              {(kind === 'product' || kind === 'service') && (
                <View style={s.ratingPill}>
                  <Ionicons name="star" size={11} color={AMBER} />
                  <Text style={s.ratingText}>{p.rating} ({p.review_count})</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Big KPIs grid */}
        <View style={{ padding: 12 }}>
          <View style={s.kpiRow}>
            <KPI label={L.views} value={fmt(k.total_views)} icon="eye" color={BLUE} sub={`اليوم: ${fmt(k.views_today)}`} />
            <KPI label={kind === 'post' ? 'الوصول التقديري' : 'زوار فريدون'} value={fmt(kind === 'post' ? (k.reach_estimate || k.total_views) : k.unique_visitors)} icon="people" color={PURPLE} sub={`آخر ٧ أيام: ${fmt(k.views_week)}`} />
          </View>
          <View style={s.kpiRow}>
            <KPI label={L.addToCart} value={fmt(k.add_to_cart)} icon={L.addIcon} color={AMBER} sub={`${k.cart_conversion_rate}% ${L.addSubUnit}`} />
            <KPI label={L.abandon} value={fmt(kind === 'post' ? k.reached_checkout : (kind === 'competition' ? Math.max(0, (p.stock || 0) - k.add_to_cart) : k.cart_abandonments))} icon={kind === 'post' ? 'chatbubbles' as any : (kind === 'competition' ? 'ellipsis-horizontal-circle' as any : 'alert-circle' as any)} color={kind === 'post' ? BLUE : RED} sub={L.abandonSub} />
          </View>
          <View style={s.kpiRow}>
            <KPI label={L.orders} value={fmt(k.total_orders)} icon={L.ordersIcon} color={OK} sub={`${k.purchase_conversion_rate}% ${L.ordersSubUnit}`} />
            <KPI label={L.revenue} value={kind === 'post' ? fmt(k.engagement_score || 0) : (k.total_revenue >= 1000 ? `${(k.total_revenue / 1000).toFixed(1)}K` : String(Math.round(k.total_revenue || 0)))} icon={kind === 'post' ? 'flash' as any : 'cash' as any} color={GOLD} sub={`${fmt(k.total_units)} ${L.unitLabel}`} unit={kind === 'post' ? '' : 'ر.س'} />
          </View>
          <View style={s.kpiRow}>
            <KPI label={kind === 'post' ? 'المشاركات' : 'مشاركات'} value={fmt(k.shares_total)} icon="share-social" color="#EC4899" sub="على المنصات" />
            <KPI label={kind === 'competition' ? 'نسبة الامتلاء' : kind === 'post' ? 'مرات الظهور' : 'متوسط الوقت'}
                 value={kind === 'competition' ? `${k.capacity_pct || 0}%`
                        : kind === 'post' ? fmt(Math.round((k.total_views || 0) * 1.4))
                        : `${Math.round(k.avg_duration_seconds / 60)}د`}
                 icon={kind === 'competition' ? 'speedometer' as any : kind === 'post' ? 'stats-chart' as any : 'time' as any}
                 color={BLUE}
                 sub={kind === 'competition' ? `${fmt(k.total_units)}/${fmt(p.stock)}` : kind === 'post' ? 'إجمالي الظهور' : 'لكل زيارة'} />
          </View>
          {kind === 'service' && (
            <View style={s.kpiRow}>
              <KPI label="طلبات إرجاع" value={fmt(k.returns_count || 0)} icon="return-up-back" color={RED} sub={`${k.returns_pct || 0}% من الحجوزات`} />
              <KPI label="الشكاوى" value={fmt(k.complaints_count || 0)} icon="alert-circle" color={AMBER} sub="بلاغات العملاء" />
            </View>
          )}
          {kind === 'competition' && (
            <View style={s.kpiRow}>
              <KPI label="الفائزون" value={fmt(k.winners_count || 0)} icon="trophy" color={GOLD} sub={`من ${fmt(k.prize_count || 0)} جائزة`} />
              <KPI label="فيديوهات ترويجية" value={fmt(k.videos_count || 0)} icon="videocam" color={PURPLE} sub="محفوظة للأرشيف" />
            </View>
          )}
          {kind === 'post' && (
            <View style={s.kpiRow}>
              <KPI label="التعليقات" value={fmt(k.comments_total || 0)} icon="chatbubbles" color={BLUE} sub="تفاعل نصي" />
              <KPI label="معدل التفاعل" value={`${k.conversion_rate || 0}%`} icon="trending-up" color={OK} sub="مقارنة بالوصول" />
            </View>
          )}
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, gap: 6 }}>
          {[
            { code: 'overview', label: 'نظرة عامة', icon: 'grid' },
            { code: 'visitors', label: 'الزوار', icon: 'people', count: d.top_visitors.length },
            { code: 'buyers', label: buyersLabel, icon: 'bag-check', count: d.buyers.length },
            { code: 'shares', label: 'المشاركات', icon: 'share-social', count: d.recent_shares.length },
            { code: 'reviews', label: 'التقييمات', icon: 'star', count: d.reviews.length + d.questions.length },
            ...(kind === 'service' ? [
              { code: 'returns', label: 'الإرجاعات', icon: 'return-up-back', count: (d.returns || []).length },
              { code: 'complaints', label: 'الشكاوى', icon: 'alert-circle', count: (d.complaints || []).length },
            ] : []),
            ...(kind === 'competition' ? [
              { code: 'winners', label: 'الفائزون', icon: 'trophy', count: (d.winners || []).length },
              { code: 'videos', label: 'الفيديوهات', icon: 'videocam', count: (d.videos || []).length },
            ] : []),
            { code: 'compare', label: 'مقارنة', icon: 'stats-chart', count: d.comparison.length },
          ].map((t) => (
            <TouchableOpacity key={t.code}
              onPress={() => setTab(t.code as any)}
              style={[s.tab, tab === t.code && s.tabActive]}>
              <Ionicons name={t.icon as any} size={12} color={tab === t.code ? BG : TEXT} />
              <Text style={[s.tabText, tab === t.code && { color: BG }]}>{t.label}</Text>
              {t.count != null && t.count > 0 && (
                <View style={[s.tabBadge, tab === t.code && { backgroundColor: BG + '30' }]}>
                  <Text style={[s.tabBadgeText, tab === t.code && { color: BG }]}>{t.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ padding: 12, paddingBottom: 40 }}>
          {tab === 'overview' && (
            <>
              <SectionTitle icon="pie-chart" label="مصادر الزيارات" />
              <View style={s.card}>
                {d.traffic_sources.map((t: any, i: number) => (
                  <View key={i} style={s.trafficRow}>
                    <View style={s.trafficBar}>
                      <View style={[s.trafficFill, { width: `${t.pct}%`, backgroundColor: [GOLD, BLUE, PURPLE, OK, RED, AMBER][i % 6] }]} />
                    </View>
                    <Text style={s.trafficLabel}>{
                      t.source === 'direct' ? 'مباشر' :
                      t.source === 'social' ? 'وسائل التواصل' :
                      t.source === 'referral' ? 'إحالة' :
                      t.source === 'search' ? 'بحث' : t.source
                    }</Text>
                    <Text style={s.trafficVal}>{t.count} · {t.pct}%</Text>
                  </View>
                ))}
              </View>

              <SectionTitle icon="trending-up" label="اتجاه المبيعات — آخر 12 شهر" />
              <View style={s.card}>
                {d.monthly_series.length === 0 ? (
                  <Text style={{ color: MUTED, textAlign: 'center', padding: 20 }}>لا توجد بيانات مبيعات بعد</Text>
                ) : (
                  <>
                    {d.monthly_series.map((m: any, i: number) => {
                      const maxSales = Math.max(...d.monthly_series.map((x: any) => x.sales), 1);
                      return (
                        <View key={i} style={s.monthRow}>
                          <Text style={s.monthLabel}>{m.month}</Text>
                          <View style={s.monthBar}>
                            <View style={[s.monthFill, { width: `${(m.sales * 100) / maxSales}%` }]} />
                          </View>
                          <Text style={s.monthVal}>{m.sales.toLocaleString()} ر.س</Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>

              <SectionTitle icon="funnel" label="قمع التحويل" />
              <View style={s.card}>
                <FunnelStage label="مشاهدات" value={k.total_views} pct={100} color={BLUE} />
                <FunnelStage label="زوار فريدون" value={k.unique_visitors} pct={Math.round(k.unique_visitors * 100 / Math.max(k.total_views, 1))} color={PURPLE} />
                <FunnelStage label={L.funnelCart} value={k.add_to_cart} pct={k.cart_conversion_rate} color={AMBER} />
                <FunnelStage label={L.funnelCheckout} value={k.reached_checkout} pct={k.conversion_rate} color="#EC4899" />
                <FunnelStage label={L.funnelOrder} value={k.total_orders} pct={k.purchase_conversion_rate} color={OK} />
              </View>
            </>
          )}

          {tab === 'visitors' && (
            <>
              <SectionTitle icon="people" label={`أكثر الزوار نشاطاً (${d.top_visitors.length})`} />
              {d.top_visitors.map((v: any, i: number) => (
                <View key={i} style={s.userCard}>
                  <View style={[s.avatar, { backgroundColor: BLUE + '30' }]}>
                    <Text style={{ color: BLUE, fontWeight: '900' }}>{(v.user_name || 'ز').charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.userName}>{v.user_name}</Text>
                    <Text style={s.userMeta}>{v.count} زيارة · آخر ظهور: {(v.last_seen || '').slice(0, 10)}</Text>
                  </View>
                  {v.cart_adds > 0 && (
                    <View style={s.miniPill}>
                      <Ionicons name="cart" size={10} color={AMBER} />
                      <Text style={[s.miniPillText, { color: AMBER }]}>{v.cart_adds}</Text>
                    </View>
                  )}
                </View>
              ))}

              <SectionTitle icon="alert-circle" label={`سلات مهجورة (${d.cart_abandonments.length})`} />
              {d.cart_abandonments.length === 0 && <Text style={s.emptyText}>لا توجد سلات مهجورة 🎉</Text>}
              {d.cart_abandonments.map((a: any, i: number) => (
                <View key={i} style={[s.userCard, { borderLeftWidth: 3, borderLeftColor: RED }]}>
                  <View style={[s.avatar, { backgroundColor: RED + '30' }]}>
                    <Text style={{ color: RED, fontWeight: '900' }}>{(a.user_name || '?').charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.userName}>{a.user_name}</Text>
                    <Text style={s.userMeta}>أضاف للسلة: {(a.added_at || '').slice(0, 16).replace('T', ' ')}</Text>
                    {a.reached_checkout && <Text style={{ color: AMBER, fontSize: 10, marginTop: 2 }}>⚠️ وصل الدفع ولم يكمل</Text>}
                  </View>
                </View>
              ))}
            </>
          )}

          {tab === 'buyers' && (
            <>
              <SectionTitle icon="bag-check" label={`المشترون (${d.buyers.length})`} />
              {d.buyers.length === 0 && <Text style={s.emptyText}>لا مشتريات بعد</Text>}
              {d.buyers.map((b: any, i: number) => (
                <View key={i} style={s.userCard}>
                  <View style={[s.avatar, { backgroundColor: OK + '30' }]}>
                    <Text style={{ color: OK, fontWeight: '900' }}>{(b.user_name || 'ع').charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.userName}>{b.user_name} <Text style={{ color: MUTED, fontSize: 10, fontWeight: '400' }}>· {b.phone || ''}</Text></Text>
                    <Text style={s.userMeta}>{(b.created_at || '').slice(0, 10)} · {b.address}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                      <View style={s.miniPill}><Text style={s.miniPillText}>{b.payment_method}</Text></View>
                      <View style={[s.miniPill, { backgroundColor: b.status === 'delivered' ? OK + '20' : AMBER + '20' }]}>
                        <Text style={[s.miniPillText, { color: b.status === 'delivered' ? OK : AMBER }]}>{b.status}</Text>
                      </View>
                      {b.source === 'pos' && <View style={s.miniPill}><Text style={s.miniPillText}>POS</Text></View>}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-start' }}>
                    <Text style={{ color: GOLD, fontSize: 13, fontWeight: '900' }}>{b.total} ر.س</Text>
                    <Text style={{ color: MUTED, fontSize: 10 }}>×{b.quantity}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {tab === 'shares' && (
            <>
              <SectionTitle icon="share-social" label="المشاركات حسب المنصة" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {d.shares_by_platform.map((sp: any) => (
                  <View key={sp.platform} style={[s.platCard, { borderColor: PLATFORM_COLORS[sp.platform] || GOLD }]}>
                    <Text style={[s.platName, { color: PLATFORM_COLORS[sp.platform] || GOLD }]}>{sp.platform}</Text>
                    <Text style={s.platCount}>{sp.count}</Text>
                  </View>
                ))}
              </View>

              <SectionTitle icon="paper-plane" label={`آخر ${d.recent_shares.length} مشاركة`} />
              {d.recent_shares.length === 0 && <Text style={s.emptyText}>لم يتم مشاركة المنتج بعد</Text>}
              {d.recent_shares.map((r: any, i: number) => (
                <View key={i} style={s.userCard}>
                  <View style={[s.avatar, { backgroundColor: (PLATFORM_COLORS[r.platform] || GOLD) + '30' }]}>
                    <Ionicons name="paper-plane" size={14} color={PLATFORM_COLORS[r.platform] || GOLD} />
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.userName}>{r.user_name}</Text>
                    <Text style={s.userMeta}>شارك عبر <Text style={{ color: PLATFORM_COLORS[r.platform] || GOLD, fontWeight: '900' }}>{r.platform}</Text> {r.shared_to ? `→ ${r.shared_to}` : ''}</Text>
                    <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{(r.created_at || '').slice(0, 16).replace('T', ' ')}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {tab === 'reviews' && (
            <>
              <View style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: TEXT, fontSize: 26, fontWeight: '900' }}>{k.avg_rating} ⭐</Text>
                    <Text style={{ color: MUTED, fontSize: 11 }}>{k.review_count_real} تقييم</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = d.reviews.filter((r: any) => r.rating === star).length;
                      const pct = count * 100 / Math.max(d.reviews.length, 1);
                      return (
                        <View key={star} style={{ alignItems: 'center' }}>
                          <Text style={{ color: MUTED, fontSize: 9 }}>{star}</Text>
                          <View style={{ width: 4, height: 40, backgroundColor: CARD2, borderRadius: 2, marginTop: 2, overflow: 'hidden', justifyContent: 'flex-end' }}>
                            <View style={{ width: '100%', height: `${pct}%`, backgroundColor: AMBER }} />
                          </View>
                          <Text style={{ color: MUTED, fontSize: 9, marginTop: 2 }}>{count}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>

              <SectionTitle icon="chatbubbles" label={`التعليقات والتقييمات (${d.reviews.length})`} />
              {d.reviews.map((r: any, i: number) => (
                <View key={i} style={s.reviewCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[s.avatar, { backgroundColor: AMBER + '30' }]}>
                      <Text style={{ color: AMBER, fontWeight: '900' }}>{(r.user_name || '?').charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={s.userName}>{r.user_name}</Text>
                      <Text style={{ color: MUTED, fontSize: 10 }}>{(r.created_at || '').slice(0, 10)}</Text>
                    </View>
                    <Text style={{ color: AMBER, fontWeight: '900', fontSize: 14 }}>{'★'.repeat(r.rating)}</Text>
                  </View>
                  <Text style={s.reviewText}>{r.text}</Text>
                </View>
              ))}

              {d.questions.length > 0 && (
                <>
                  <SectionTitle icon="help-circle" label={`أسئلة العملاء (${d.questions.length})`} />
                  {d.questions.map((q: any, i: number) => (
                    <View key={i} style={[s.reviewCard, { borderLeftWidth: 3, borderLeftColor: PURPLE }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[s.avatar, { backgroundColor: PURPLE + '30' }]}>
                          <Text style={{ color: PURPLE, fontWeight: '900' }}>؟</Text>
                        </View>
                        <View style={{ flex: 1, marginHorizontal: 10 }}>
                          <Text style={s.userName}>{q.user_name}</Text>
                          <Text style={{ color: MUTED, fontSize: 10 }}>{(q.created_at || '').slice(0, 10)}</Text>
                        </View>
                      </View>
                      <Text style={s.reviewText}>{q.text}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {tab === 'returns' && kind === 'service' && (
            <>
              <SectionTitle icon="return-up-back" label={`طلبات الإرجاع (${(d.returns || []).length})`} />
              {(d.returns || []).length === 0 && <Text style={s.emptyText}>لا يوجد طلبات إرجاع لهذه الخدمة 🎉</Text>}
              {(d.returns || []).map((r: any, i: number) => (
                <View key={i} style={[s.userCard, { borderLeftWidth: 3, borderLeftColor: RED, alignItems: 'flex-start' }]}>
                  <View style={[s.avatar, { backgroundColor: RED + '30' }]}>
                    <Ionicons name="return-up-back" size={16} color={RED} />
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.userName}>{r.user_name || 'عميل'} <Text style={{ color: MUTED, fontSize: 10, fontWeight: '400' }}>· {r.phone || ''}</Text></Text>
                    <Text style={s.userMeta}>{r.reason || 'بدون سبب'}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <View style={[s.miniPill, { backgroundColor: (r.status === 'approved' ? OK : r.status === 'rejected' ? RED : AMBER) + '20' }]}>
                        <Text style={[s.miniPillText, { color: r.status === 'approved' ? OK : r.status === 'rejected' ? RED : AMBER }]}>
                          {r.status === 'approved' ? 'مقبول' : r.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                        </Text>
                      </View>
                      <Text style={{ color: MUTED, fontSize: 10 }}>{(r.created_at || '').slice(0, 10)}</Text>
                    </View>
                  </View>
                  <Text style={{ color: RED, fontWeight: '900', fontSize: 12 }}>-{r.amount || 0} ر.س</Text>
                </View>
              ))}
            </>
          )}

          {tab === 'complaints' && kind === 'service' && (
            <>
              <SectionTitle icon="alert-circle" label={`الشكاوى (${(d.complaints || []).length})`} />
              {(d.complaints || []).length === 0 && <Text style={s.emptyText}>لا توجد شكاوى مسجلة 👌</Text>}
              {(d.complaints || []).map((c: any, i: number) => (
                <View key={i} style={[s.reviewCard, { borderLeftWidth: 3, borderLeftColor: AMBER }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[s.avatar, { backgroundColor: AMBER + '30' }]}>
                      <Text style={{ color: AMBER, fontWeight: '900' }}>{(c.user_name || '؟').charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={s.userName}>{c.user_name} <Text style={{ color: MUTED, fontSize: 10, fontWeight: '400' }}>· {c.phone || ''}</Text></Text>
                      <Text style={{ color: MUTED, fontSize: 10 }}>{(c.created_at || '').slice(0, 10)} · {c.category || 'عام'}</Text>
                    </View>
                    <View style={[s.miniPill, { backgroundColor: (c.status === 'resolved' ? OK : c.status === 'escalated' ? RED : AMBER) + '20' }]}>
                      <Text style={[s.miniPillText, { color: c.status === 'resolved' ? OK : c.status === 'escalated' ? RED : AMBER }]}>
                        {c.status === 'resolved' ? 'مُعالج' : c.status === 'escalated' ? 'مُصعّد' : 'مفتوح'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.reviewText}>{c.text}</Text>
                  {!!c.reply && (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: BG, borderRadius: 8, borderRightWidth: 2, borderRightColor: OK }}>
                      <Text style={{ color: OK, fontSize: 10, fontWeight: '900', textAlign: 'right', marginBottom: 3 }}>رد المتجر:</Text>
                      <Text style={{ color: TEXT, fontSize: 11, textAlign: 'right' }}>{c.reply}</Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}

          {tab === 'winners' && kind === 'competition' && (
            <>
              <SectionTitle icon="trophy" label={`قائمة الفائزين (${(d.winners || []).length})`} />
              {(d.winners || []).length === 0 && <Text style={s.emptyText}>لم يتم الإعلان عن الفائزين بعد 🎯</Text>}
              {(d.winners || []).map((w: any, i: number) => (
                <View key={i} style={[s.userCard, { borderWidth: 1.5, borderColor: GOLD + '80' }]}>
                  <View style={[s.avatar, { backgroundColor: GOLD + '30' }]}>
                    <Text style={{ color: GOLD, fontWeight: '900' }}>🏆</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.userName}>{w.user_name} <Text style={{ color: GOLD, fontSize: 10, fontWeight: '900' }}>· المركز {w.rank || i + 1}</Text></Text>
                    <Text style={s.userMeta}>{w.prize_name || 'جائزة قيّمة'} · {(w.announced_at || '').slice(0, 10)}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
                      <View style={[s.miniPill, { backgroundColor: (w.claim_status === 'claimed' ? OK : AMBER) + '20' }]}>
                        <Text style={[s.miniPillText, { color: w.claim_status === 'claimed' ? OK : AMBER }]}>
                          {w.claim_status === 'claimed' ? '✓ تسلّم الجائزة' : 'بانتظار الاستلام'}
                        </Text>
                      </View>
                      {!!w.city && <View style={s.miniPill}><Text style={s.miniPillText}>{w.city}</Text></View>}
                    </View>
                  </View>
                  {!!w.prize_value && <Text style={{ color: GOLD, fontWeight: '900', fontSize: 13 }}>{w.prize_value} ر.س</Text>}
                </View>
              ))}
            </>
          )}

          {tab === 'videos' && kind === 'competition' && (
            <>
              <SectionTitle icon="videocam" label={`أرشيف الفيديوهات الترويجية (${(d.videos || []).length})`} />
              <Text style={{ color: MUTED, fontSize: 10, textAlign: 'right', marginBottom: 8 }}>💾 محفوظ للأبد — حتى بعد انتهاء المسابقة</Text>
              {(d.videos || []).length === 0 && <Text style={s.emptyText}>لم يتم رفع فيديوهات ترويجية</Text>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(d.videos || []).map((v: any, i: number) => (
                  <TouchableOpacity key={i} style={{ width: (Dimensions.get('window').width - 32) / 2, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: 'hidden' }}>
                    <View style={{ position: 'relative', height: 120, backgroundColor: '#000' }}>
                      {v.thumbnail ? (
                        <Image source={{ uri: v.thumbnail }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="videocam" size={30} color={GOLD} />
                        </View>
                      )}
                      <View style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -18, marginTop: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="play" size={18} color={GOLD} />
                      </View>
                      {!!v.duration && (
                        <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>{v.duration}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ padding: 8 }}>
                      <Text style={{ color: TEXT, fontSize: 11, fontWeight: '900', textAlign: 'right' }} numberOfLines={2}>{v.title || 'فيديو ترويجي'}</Text>
                      <Text style={{ color: MUTED, fontSize: 9, textAlign: 'right', marginTop: 4 }}>{fmt(v.views || 0)} مشاهدة · {(v.created_at || '').slice(0, 10)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {tab === 'compare' && (
            <>
              <SectionTitle icon="stats-chart" label={kind === 'service' ? 'مقارنة بخدمات مشابهة' : kind === 'competition' ? 'مقارنة بمسابقات أخرى' : kind === 'post' ? 'مقارنة بمنشورات أخرى' : 'مقارنة بمنتجات مشابهة'} />
              <View style={s.card}>
                <View style={s.compareHeaderRow}>
                  <Text style={[s.compareHeader, { flex: 2 }]}>{kind === 'service' ? 'الخدمة' : kind === 'competition' ? 'المسابقة' : kind === 'post' ? 'المنشور' : 'المنتج'}</Text>
                  <Text style={s.compareHeader}>مشاهدات</Text>
                  <Text style={s.compareHeader}>{kind === 'service' ? 'حجوزات' : kind === 'competition' ? 'مشاركون' : kind === 'post' ? 'إعجاب' : 'سلة'}</Text>
                  <Text style={s.compareHeader}>{kind === 'service' ? 'مكتمل' : kind === 'competition' ? 'دخل' : kind === 'post' ? 'مشاركات' : 'بيعات'}</Text>
                </View>
                <View style={[s.compareRow, { backgroundColor: GOLD + '10', borderRadius: 8 }]}>
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {p.images?.[0] && <Image source={{ uri: p.images[0] }} style={s.compareImg} />}
                    <Text style={[s.compareName, { color: GOLD }]} numberOfLines={2}>{p.name_ar} ← {kind === 'service' ? 'هذه الخدمة' : kind === 'competition' ? 'هذه المسابقة' : kind === 'post' ? 'هذا المنشور' : 'هذا المنتج'}</Text>
                  </View>
                  <Text style={s.compareVal}>{k.total_views}</Text>
                  <Text style={s.compareVal}>{k.add_to_cart}</Text>
                  <Text style={s.compareVal}>{k.total_orders}</Text>
                </View>
                {d.comparison.map((c: any, i: number) => (
                  <View key={i} style={s.compareRow}>
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {c.image && <Image source={{ uri: c.image }} style={s.compareImg} />}
                      <Text style={s.compareName} numberOfLines={2}>{c.name_ar}</Text>
                    </View>
                    <Text style={s.compareVal}>{c.views}</Text>
                    <Text style={s.compareVal}>{c.cart_adds}</Text>
                    <Text style={s.compareVal}>{c.orders}</Text>
                  </View>
                ))}
              </View>
              {d.category_ranking && (
                <View style={[s.card, { backgroundColor: GOLD + '10', borderColor: GOLD }]}>
                  <Text style={{ color: GOLD, fontSize: 12, fontWeight: '900', textAlign: 'right' }}>
                    🏆 هذا المنتج مصنّف #{d.category_ranking.rank} من أصل {d.category_ranking.total} منتج في فئته
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const KPI = ({ label, value, icon, color, sub, unit }: any) => (
  <View style={[s.kpi, { borderColor: color + '50' }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={[s.kpiIcon, { backgroundColor: color + '25' }]}>
        <Ionicons name={icon} size={12} color={color} />
      </View>
      <Text style={s.kpiLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </View>
    <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
      {value}<Text style={{ fontSize: 10, color: MUTED }}> {unit || ''}</Text>
    </Text>
    {!!sub && <Text style={[s.kpiSub, { color }]} numberOfLines={1} adjustsFontSizeToFit>{sub}</Text>}
  </View>
);

const SectionTitle = ({ icon, label }: any) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 }}>
    <Ionicons name={icon} size={14} color={GOLD} />
    <Text style={{ color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right' }}>{label}</Text>
  </View>
);

const FunnelStage = ({ label, value, pct, color }: any) => (
  <View style={{ marginBottom: 8 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
      <Text style={{ color: TEXT, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: color, fontSize: 12, fontWeight: '900' }}>{value.toLocaleString()} · {pct}%</Text>
    </View>
    <View style={{ height: 8, backgroundColor: CARD2, borderRadius: 4, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.max(pct, 2)}%`, backgroundColor: color, borderRadius: 4 }} />
    </View>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 8 },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  sub: { color: MUTED, fontSize: 10, textAlign: 'right' },
  rankBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: GOLD + '20', borderColor: GOLD, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  rankText: { color: GOLD, fontSize: 10, fontWeight: '900' },
  hero: { position: 'relative', height: 220 },
  heroImg: { width: '100%', height: '100%' },
  heroOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 14, backgroundColor: 'rgba(11,12,16,0.85)' },
  condPill: { backgroundColor: OK + '30', borderColor: OK, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  condText: { color: OK, fontSize: 9, fontWeight: '900' },
  heroTitle: { color: TEXT, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  priceMain: { color: GOLD, fontSize: 20, fontWeight: '900' },
  priceOld: { color: MUTED, fontSize: 12, textDecorationLine: 'line-through' },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  ratingText: { color: AMBER, fontSize: 10, fontWeight: '900' },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpi: { flex: 1, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, padding: 10 },
  kpiIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiLabel: { color: MUTED, fontSize: 10, flex: 1, textAlign: 'right' },
  kpiValue: { color: TEXT, fontSize: 18, fontWeight: '900', textAlign: 'right', marginTop: 6 },
  kpiSub: { fontSize: 9, textAlign: 'right', marginTop: 2, fontWeight: '700' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tabActive: { backgroundColor: GOLD, borderColor: GOLD },
  tabText: { color: TEXT, fontSize: 11, fontWeight: '900' },
  tabBadge: { backgroundColor: BG, paddingHorizontal: 5, borderRadius: 999, minWidth: 18, alignItems: 'center' },
  tabBadgeText: { color: TEXT, fontSize: 9, fontWeight: '900' },
  card: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 4 },
  trafficRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, gap: 8 },
  trafficBar: { flex: 1, height: 8, backgroundColor: CARD2, borderRadius: 4, overflow: 'hidden' },
  trafficFill: { height: '100%', borderRadius: 4 },
  trafficLabel: { color: TEXT, fontSize: 11, fontWeight: '700', minWidth: 90, textAlign: 'right' },
  trafficVal: { color: MUTED, fontSize: 10, minWidth: 70, textAlign: 'left' },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  monthLabel: { color: MUTED, fontSize: 10, width: 55 },
  monthBar: { flex: 1, height: 8, backgroundColor: CARD2, borderRadius: 4, overflow: 'hidden', marginHorizontal: 6 },
  monthFill: { height: '100%', backgroundColor: GOLD, borderRadius: 4 },
  monthVal: { color: TEXT, fontSize: 10, fontWeight: '700', width: 85, textAlign: 'left' },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 10, borderRadius: 10, marginBottom: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  userName: { color: TEXT, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  userMeta: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 },
  miniPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  miniPillText: { color: TEXT, fontSize: 9, fontWeight: '700' },
  emptyText: { color: MUTED, textAlign: 'center', padding: 20, fontSize: 11 },
  platCard: { width: (Dimensions.get('window').width - 30) / 3, alignItems: 'center', padding: 12, borderWidth: 1.5, borderRadius: 12, backgroundColor: CARD },
  platName: { fontSize: 11, fontWeight: '900', marginBottom: 4 },
  platCount: { color: TEXT, fontSize: 20, fontWeight: '900' },
  reviewCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 12, borderRadius: 10, marginBottom: 6 },
  reviewText: { color: TEXT, fontSize: 12, textAlign: 'right', marginTop: 8, lineHeight: 18 },
  compareHeaderRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  compareHeader: { color: MUTED, fontSize: 10, textAlign: 'center', flex: 1, fontWeight: '900' },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 4 },
  compareImg: { width: 30, height: 30, borderRadius: 6, backgroundColor: BG },
  compareName: { color: TEXT, fontSize: 10, fontWeight: '700', flex: 1, textAlign: 'right' },
  compareVal: { color: TEXT, fontSize: 12, fontWeight: '900', flex: 1, textAlign: 'center' },
});
