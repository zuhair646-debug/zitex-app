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
        <Text style={s.previewText}>🔴 وضع البث المباشر — أنت تشاهد المتجر كعميل</Text>
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
      {section === 'services' && <ServicesSection apiCall={apiCall} />}
      {section === 'competitions' && <CompetitionsSection apiCall={apiCall} />}
      {section === 'social' && <SocialSection apiCall={apiCall} />}

      {analyticsFor && (
        <ProductAnalyticsSheet product={analyticsFor} onClose={() => setAnalyticsFor(null)} apiCall={apiCall} />
      )}
      {compareData && (
        <CompareSheet items={compareData} onClose={() => { setCompareData(null); setSelectedIds([]); setCompareMode(false); }} />
      )}
    </SafeAreaView>
  );
}

/* ─── Products grid with live viewers & comparison ─────────────────────── */
function ProductsSection({ apiCall, onAnalytics, compareMode, selectedIds, setSelectedIds, setCompareMode, openCompare }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [live, setLive] = useState<Record<string, { count: number; sample_names: string[] }>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, lv] = await Promise.all([
        apiCall('/api/products'),
        apiCall('/api/merchant/products/live-viewers').catch(() => ({})),
      ]);
      setItems(Array.isArray(d) ? d : (d.products || d.items || []));
      setLive(lv || {});
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

      <FlatList
        data={items}
        numColumns={2}
        keyExtractor={(x, i) => x.id || String(i)}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
        contentContainerStyle={{ paddingBottom: 120, gap: 10 }}
        renderItem={({ item }) => {
          const liveCount = live[item.id]?.count || 0;
          const selected = selectedIds.includes(item.id);
          return (
            <TouchableOpacity style={[s.pCard, selected && s.pCardSelected]}
              onPress={() => compareMode ? toggle(item.id) : onAnalytics(item)}
              onLongPress={() => onAnalytics(item)}>
              {item.images?.[0] && (
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
              <View style={{ padding: 10 }}>
                <Text style={s.pName} numberOfLines={2}>{item.name_ar || item.name}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={s.pPrice}>{item.price} ر.س</Text>
                  {item.rating > 0 && (
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

function ServicesSection({ apiCall }: any) {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiCall('/api/services').then((d: any) => setItems(Array.isArray(d) ? d : (d.services || []))).catch(() => {}).finally(() => setLoading(false)); }, [apiCall]);
  if (loading) return <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />;
  return (
    <FlatList data={items} keyExtractor={(x, i) => x.id || String(i)} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
      renderItem={({ item }) => (
        <View style={s.svcCard}>
          {item.images?.[0] && <Image source={{ uri: mediaUrlSync(item.images[0]) }} style={s.svcImg} contentFit="cover" />}
          <View style={{ flex: 1, padding: 10 }}>
            <Text style={s.svcName}>{item.name}</Text>
            <Text style={s.svcDesc} numberOfLines={2}>{item.desc}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Text style={s.svcPrice}>{item.price} ر.س</Text>
              {item.warranty_available && <Text style={s.svcMeta}>🛡 {item.warranty_days} يوم</Text>}
              {item.home_pickup && <Text style={s.svcMeta}>🚗 استلام منزلي</Text>}
            </View>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={s.empty}>لا توجد خدمات</Text>}
    />
  );
}

function CompetitionsSection({ apiCall }: any) {
  const [items, setItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { apiCall('/api/competitions').then(setItems).catch(() => {}).finally(() => setLoading(false)); }, [apiCall]);
  if (loading) return <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />;
  return (
    <FlatList data={items} keyExtractor={(x, i) => x.id || String(i)} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
      renderItem={({ item }) => (
        <LinearGradient colors={['#332905', '#1A1401']} style={s.compCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={s.trophy}><Ionicons name="trophy" size={22} color={GOLD} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.compTitle}>{item.title}</Text>
              <Text style={s.compPrize}>🎁 {item.prize}</Text>
              <Text style={s.compMeta}>👥 {item.joined_count || 0} مشترك</Text>
            </View>
          </View>
        </LinearGradient>
      )}
      ListEmptyComponent={<Text style={s.empty}>لا مسابقات نشطة</Text>}
    />
  );
}

function SocialSection({ apiCall }: any) {
  const [posts, setPosts] = useState<any[]>([]); const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState<{ postId: string; commentId: string; commentText: string } | null>(null);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/social/posts'); setPosts(Array.isArray(d) ? d : (d.posts || [])); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [apiCall]);
  useEffect(() => { load(); }, [load]);

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

  if (loading) return <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />;

  return (
    <>
      <FlatList data={posts} keyExtractor={(x, i) => x.id || String(i)} contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <View style={s.postCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <View style={s.avatar}><Text style={{ color: BG, fontWeight: '900' }}>{(item.author_name || 'ز')[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.postAuthor}>{item.author_name}</Text>
                <Text style={s.postDate}>{(item.created_at || '').slice(0, 10)}</Text>
              </View>
            </View>
            {!!item.text && <Text style={s.postText}>{item.text}</Text>}
            {item.images?.[0] && <Image source={{ uri: mediaUrlSync(item.images[0]) }} style={s.postImg} contentFit="cover" />}
            <View style={s.postMeta}>
              <Text style={s.postMetaText}>❤ {item.likes || 0}</Text>
              <Text style={s.postMetaText}>💬 {(item.comments || []).length}</Text>
              <Text style={s.postMetaText}>👁 {item.views || 0}</Text>
            </View>
            {/* Comments (first 3) */}
            {(item.comments || []).slice(0, 3).map((c: any) => (
              <View key={c.id} style={s.comment}>
                <View style={{ flex: 1 }}>
                  <Text style={s.commentAuthor}>{c.user_name}</Text>
                  <Text style={s.commentText}>{c.text}</Text>
                </View>
                <TouchableOpacity style={s.replyBtn}
                  onPress={() => { setReplying({ postId: item.id, commentId: c.id, commentText: c.text }); setReplyText(''); }}>
                  <Ionicons name="arrow-undo" size={12} color={BG} />
                  <Text style={s.replyBtnText}>رد باسم المتجر</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
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
                {it.image && <Image source={{ uri: mediaUrlSync(it.image) }} style={s.cmpImg} contentFit="cover" />}
                <Text style={s.cmpName} numberOfLines={2}>{it.name_ar}</Text>
                <Text style={s.cmpPrice}>{it.price} ر.س</Text>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>مشاهدات</Text><Text style={s.cmpVal}>{it.views_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>أضيف للسلة</Text><Text style={s.cmpVal}>{it.cart_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>طلبات</Text><Text style={s.cmpVal}>{it.orders_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>مبيعات</Text><Text style={s.cmpVal}>{it.sold_count}</Text></View>
                <View style={s.cmpRow}><Text style={s.cmpLbl}>التحويل</Text><Text style={[s.cmpVal, { color: GOLD }]}>{it.conversion_rate}%</Text></View>
                {it.rating > 0 && (
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
});
