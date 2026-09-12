import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../_layout';
import { spacing, radius } from '../../src/theme/tokens';
import { mediaUrlSync } from '../../src/utils/upload';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const MUTED = '#9CA3AF';

type Section = 'products' | 'social' | 'services';

export default function LivePreview() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [section, setSection] = useState<Section>('products');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyticsFor, setAnalyticsFor] = useState<any>(null);

  const load = async (s: Section) => {
    setSection(s); setLoading(true); setItems([]);
    try {
      const url = s === 'products' ? '/api/products' : s === 'social' ? '/api/social/posts' : '/api/services';
      const data = await apiCall(url);
      setItems(Array.isArray(data) ? data : (data.products || data.items || []));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load('products'); }, []);

  return (
    <SafeAreaView style={s.safe}>
      {/* Preview mode banner */}
      <View style={s.previewPill}>
        <View style={s.liveDot} />
        <Text style={s.previewText}>🔴 وضع المعاينة — أنت تشاهد التطبيق كعميل</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close-circle" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Section tabs */}
      <View style={s.sectionRow}>
        {[
          { id: 'products', name: 'المنتجات', icon: 'cube' },
          { id: 'social', name: 'السوشيال', icon: 'chatbubbles' },
          { id: 'services', name: 'الخدمات', icon: 'construct' },
        ].map(t => (
          <TouchableOpacity key={t.id} onPress={() => load(t.id as Section)}
            style={[s.sectionBtn, section === t.id && s.sectionBtnActive]}>
            <Ionicons name={t.icon as any} size={16} color={section === t.id ? BG : GOLD} />
            <Text style={[s.sectionText, section === t.id && { color: BG }]}>{t.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={items}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}
          keyExtractor={(item, i) => item?.id || String(i)}
          renderItem={({ item }) => (
            <View style={s.item}>
              {item.images?.[0] && (
                <Image source={{ uri: mediaUrlSync(item.images[0]) }} style={s.itemImg} contentFit="cover" />
              )}
              <View style={{ flex: 1, padding: spacing.md }}>
                <Text style={s.itemName} numberOfLines={1}>
                  {item.name_ar || item.name || item.text?.slice(0, 40) || '—'}
                </Text>
                {(item.price != null) && <Text style={s.itemPrice}>{item.price} ر.س</Text>}
                {(item.views != null || item.likes != null) && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    {item.views != null && <Text style={s.itemStat}>👁 {item.views || 0}</Text>}
                    {item.likes != null && <Text style={s.itemStat}>❤ {item.likes || 0}</Text>}
                    {item.sold_count != null && <Text style={s.itemStat}>🛒 {item.sold_count || 0}</Text>}
                  </View>
                )}
              </View>
              {section === 'products' && (
                <TouchableOpacity onPress={() => setAnalyticsFor(item)} style={s.analyticsBtn} testID="open-product-analytics">
                  <Ionicons name="analytics" size={16} color={BG} />
                  <Text style={s.analyticsBtnText}>إحصائيات</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={s.empty}>لا توجد عناصر</Text>}
        />
      )}

      {analyticsFor && (
        <ProductAnalyticsSheet product={analyticsFor} onClose={() => setAnalyticsFor(null)} apiCall={apiCall} />
      )}
    </SafeAreaView>
  );
}

function ProductAnalyticsSheet({ product, onClose, apiCall }: any) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    apiCall(`/api/merchant/products/${product.id}/analytics`)
      .then(setData)
      .catch((e: any) => Alert.alert('خطأ', e.message));
  }, [product.id]);

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
      <View style={s.sheetBackdrop}>
        <View style={s.sheet}>
          <ActivityIndicator size="large" color={GOLD} style={{ margin: 40 }} />
        </View>
      </View>
    </Modal>
  );

  const monthly = data.monthly_series || [];
  const maxSales = Math.max(1, ...monthly.map((m: any) => m.sales || 0));

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

          <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
            {/* KPI grid */}
            <View style={s.kpiGrid}>
              <Kpi icon="eye" label="مشاهدات" value={data.kpis.total_views} />
              <Kpi icon="people" label="زوار فريدون" value={data.kpis.unique_users} />
              <Kpi icon="cart" label="أضيف للسلة" value={data.kpis.add_to_cart} />
              <Kpi icon="bag-check" label="وصل الدفع" value={data.kpis.reached_checkout} />
              <Kpi icon="alert-circle" label="ترك السلة" value={data.kpis.abandoned_count} danger />
              <Kpi icon="trending-up" label="التحويل" value={`${data.kpis.conversion_rate}%`} highlight />
            </View>

            {/* Yearly-style monthly chart */}
            <Text style={s.sec}>📈 مبيعات 12 شهراً</Text>
            {monthly.length === 0 ? (
              <View style={s.empty2}><Text style={{ color: MUTED }}>لا مبيعات بعد</Text></View>
            ) : (
              <LinearGradient colors={['#1A1C24', '#0F1116']} style={s.chartCard}>
                <View style={s.chart}>
                  {monthly.map((m: any) => (
                    <View key={m.month} style={s.bar}>
                      <View style={[s.barFill, { height: `${Math.max(6, (m.sales * 100) / maxSales)}%` }]} />
                      <Text style={s.barLbl}>{m.month?.slice(5) || ''}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
            )}

            {/* Visitor timeline */}
            <Text style={s.sec}>👥 آخر الزوار</Text>
            {(data.visitors || []).length === 0 ? (
              <View style={s.empty2}><Text style={{ color: MUTED }}>لا زوار بعد</Text></View>
            ) : data.visitors.map((v: any, i: number) => (
              <View key={i} style={s.visitor}>
                <View style={s.visitorAvatar}><Text style={{ color: BG, fontWeight: '900' }}>{(v.user_name || 'ز')[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.visitorName}>{v.user_name}</Text>
                  <Text style={s.visitorMeta}>
                    ⏱ {v.duration_seconds || 0}ث • {v.added_to_cart ? '🛒 أضاف للسلة ' : ''}{v.reached_checkout ? '✅ وصل الدفع' : ''}
                  </Text>
                </View>
                <Text style={s.visitorTime}>{(v.created_at || '').slice(5, 10)}</Text>
              </View>
            ))}

            {/* Abandoned cart recovery */}
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

function Kpi({ icon, label, value, highlight, danger }: any) {
  const c = highlight ? GOLD : danger ? '#EF4444' : GOLD;
  return (
    <View style={[s.kpi, highlight && { backgroundColor: GOLD }]}>
      <Ionicons name={icon} size={18} color={highlight ? BG : c} />
      <Text style={[s.kpiVal, highlight && { color: BG }]}>{value}</Text>
      <Text style={[s.kpiLbl, highlight && { color: 'rgba(11,12,16,0.8)' }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7f1d1d', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, margin: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  previewText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  sectionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  sectionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CARD, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: BORDER },
  sectionBtnActive: { backgroundColor: GOLD, borderColor: GOLD },
  sectionText: { color: GOLD, fontSize: 13, fontWeight: '800' },
  item: { flexDirection: 'row', backgroundColor: CARD, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', alignItems: 'center' },
  itemImg: { width: 72, height: 72 },
  itemName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textAlign: 'right' },
  itemPrice: { color: GOLD, fontSize: 13, fontWeight: '900', marginTop: 2 },
  itemStat: { color: MUTED, fontSize: 11 },
  analyticsBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 8, marginRight: 8, borderRadius: 999 },
  analyticsBtnText: { color: BG, fontWeight: '800', fontSize: 12 },
  empty: { color: MUTED, textAlign: 'center', marginTop: 40 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', borderTopWidth: 1, borderTopColor: BORDER },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: '#3A3D48', alignSelf: 'center', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  sheetTitle: { flex: 1, textAlign: 'center', color: GOLD, fontSize: 15, fontWeight: '900' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexBasis: '31%', flexGrow: 1, backgroundColor: CARD, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 4 },
  kpiVal: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  kpiLbl: { color: MUTED, fontSize: 10, textAlign: 'center' },
  sec: { color: GOLD, fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 8, textAlign: 'right' },
  hint: { color: MUTED, fontSize: 11, marginBottom: 8, textAlign: 'right' },
  chartCard: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: BORDER },
  chart: { flexDirection: 'row', gap: 4, height: 140, alignItems: 'flex-end' },
  bar: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barFill: { width: '80%', backgroundColor: GOLD, borderRadius: 3 },
  barLbl: { color: MUTED, fontSize: 9, marginTop: 4 },
  visitor: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: CARD, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: BORDER, marginBottom: 6 },
  visitorAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  visitorName: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  visitorMeta: { color: MUTED, fontSize: 11, marginTop: 2, textAlign: 'right' },
  visitorTime: { color: MUTED, fontSize: 11 },
  empty2: { padding: 20, alignItems: 'center', backgroundColor: CARD, borderRadius: radius.md, borderWidth: 1, borderColor: BORDER },
  abandoned: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#3B0F0F', padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: '#7F1D1D', marginBottom: 6 },
  offerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  offerText: { color: BG, fontSize: 11, fontWeight: '900' },
});
