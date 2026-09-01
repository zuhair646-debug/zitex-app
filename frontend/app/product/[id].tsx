import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState<number>(0);
  const [selectedStorage, setSelectedStorage] = useState<number>(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await apiCall(`/api/products/${id}`);
        setProduct(p);
      } catch (e) { console.log(e); } finally { setLoading(false); }
    })();
  }, [id]);

  const addToCart = async () => {
    if (!product) return;
    setAdding(true);
    try {
      await apiCall('/api/cart', {
        method: 'POST',
        body: JSON.stringify({
          product_id: product.id,
          quantity: 1,
          color: product.colors?.[selectedColor]?.name || null,
          storage: product.storage_options?.[selectedStorage] || null,
        })
      });
      Alert.alert('Added', 'Product added to cart', [
        { text: 'Continue Shopping' },
        { text: 'Go to Cart', onPress: () => router.push('/cart') },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e.message);
    } finally { setAdding(false); }
  };

  if (loading) return <View style={styles.loadWrap}><ActivityIndicator size="large" color="#8833FF" /></View>;
  if (!product) return <View style={styles.loadWrap}><Text>المنتج غير موجود</Text></View>;

  const price = product.discount_price || product.price;
  const specs = product.specs || {};

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-button" style={styles.topBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <TouchableOpacity testID="share-button" style={styles.topBtn}>
          <Ionicons name="share-outline" size={22} color="#0A0A0A" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Product Image */}
        <View style={styles.imageWrap}>
          <Image source={{ uri: product.images?.[0] }} style={styles.productImage} />
          {product.condition !== 'new' && (
            <View style={styles.condBadge}><Text style={styles.condText}>مستعمل</Text></View>
          )}
        </View>

        <View style={styles.content}>
          {/* Name & Rating */}
          <Text style={styles.productName}>{product.name_en}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={16} color="#FACC15" />
            <Text style={styles.ratingVal}>{product.rating}</Text>
            <Text style={styles.reviewCount}>({product.review_count} reviews)</Text>
            <View style={styles.soldBadge}>
              <Text style={styles.soldText}>{product.sold_count} sold</Text>
            </View>
          </View>

          {/* Price */}
          <View style={styles.priceSection}>
            <Text style={styles.price}>{price} ر.س</Text>
            {!!product.discount_price && <Text style={styles.oldPrice}>{product.price} ر.س</Text>}
            {!!product.discount_price && (
              <View style={styles.saveBadge}>
                <Text style={styles.saveText}>Save {product.price - product.discount_price} SAR</Text>
              </View>
            )}
          </View>

          {/* Colors — circular chip picker */}
          {product.colors?.length > 0 && (
            <View style={styles.optionSection}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.optionTitle}>اللون</Text>
                <Text style={styles.colorSelectedName}>{product.colors[selectedColor]?.name || ''}</Text>
              </View>
              <View style={styles.colorCircleRow}>
                {product.colors.map((c: any, i: number) => (
                  <TouchableOpacity
                    testID={`color-option-${i}`}
                    key={i}
                    onPress={() => setSelectedColor(i)}
                    style={styles.colorCircleWrap}
                    activeOpacity={0.75}
                  >
                    <View style={[
                      styles.colorCircleOuter,
                      selectedColor === i && styles.colorCircleOuterActive,
                    ]}>
                      <View style={[styles.colorCircleInner, { backgroundColor: c.hex }]} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Storage */}
          {product.storage_options?.length > 0 && (
            <View style={styles.optionSection}>
              <Text style={styles.optionTitle}>Storage</Text>
              <View style={styles.optionRow}>
                {product.storage_options.map((s: string, i: number) => (
                  <TouchableOpacity testID={`storage-option-${i}`} key={i} style={[styles.storageBtn, selectedStorage === i && styles.storageSelected]}
                    onPress={() => setSelectedStorage(i)}>
                    <Text style={[styles.storageLabel, selectedStorage === i && styles.storageLabelActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={styles.optionTitle}>Description</Text>
            <Text style={styles.descText}>{product.description_en}</Text>
          </View>

          {/* Specs */}
          {Object.keys(specs).length > 0 && (
            <View style={styles.specsSection}>
              <Text style={styles.optionTitle}>Specifications</Text>
              {Object.entries(specs).map(([key, val]) => (
                <View key={key} style={styles.specRow}>
                  <Text style={styles.specKey}>{key}</Text>
                  <Text style={styles.specVal}>{val as string}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Availability + Warranty + Shipping + Payment */}
          <View style={styles.availSection}>
            <Text style={styles.optionTitle}>المعلومات والضمان</Text>

            <View style={styles.availItem}>
              <Ionicons name={product.in_stock ? 'checkmark-circle' : 'close-circle'} size={20} color={product.in_stock ? '#10B981' : '#EF4444'} />
              <Text style={styles.availText}>{product.in_stock ? 'متوفر في المخزون' : 'غير متوفر'}</Text>
            </View>

            <View style={styles.availItem}>
              <Ionicons name={product.condition && product.condition !== 'new' ? 'refresh-circle' : 'sparkles'} size={20} color={product.condition && product.condition !== 'new' ? '#F59E0B' : '#10B981'} />
              <Text style={styles.availText}>الحالة: {product.condition === 'new' || !product.condition ? 'جديد (New)' : product.condition === 'used_3months' ? 'مستعمل - 3 أشهر' : product.condition === 'used_6months' ? 'مستعمل - 6 أشهر' : 'مستعمل (Used)'}</Text>
            </View>

            {product.warranty_type && product.warranty_type !== 'none' ? (
              <View style={styles.warrantyBlock}>
                {(product.warranty_type === 'shop' || product.warranty_type === 'both') && product.shop_warranty_days > 0 && (
                  <View style={styles.warrCard}>
                    <View style={styles.warrHead}>
                      <View style={[styles.warrBadge, { backgroundColor: '#DCFCE7' }]}>
                        <Ionicons name="storefront" size={16} color="#166534" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.warrTitle}>ضمان المحل</Text>
                        <Text style={styles.warrSub}>{product.shop_warranty_days} يوم</Text>
                      </View>
                      <View style={styles.warrChip}><Text style={styles.warrChipText}>مضمون</Text></View>
                    </View>
                    {!!product.shop_warranty_terms && <Text style={styles.warrTerms}>{product.shop_warranty_terms}</Text>}
                  </View>
                )}
                {(product.warranty_type === 'manufacturer' || product.warranty_type === 'both') && product.manufacturer_name && (
                  <View style={styles.warrCard}>
                    <View style={styles.warrHead}>
                      <View style={[styles.warrBadge, { backgroundColor: '#DBEAFE' }]}>
                        <Ionicons name="business" size={16} color="#1E40AF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.warrTitle}>ضمان {product.manufacturer_name}</Text>
                        <Text style={styles.warrSub}>{product.manufacturer_days || 365} يوم (شركة)</Text>
                      </View>
                    </View>
                    {!!product.manufacturer_terms && <Text style={styles.warrTerms}>{product.manufacturer_terms}</Text>}
                    <View style={styles.warrActions}>
                      {!!product.manufacturer_url && (
                        <TouchableOpacity style={styles.warrBtn} onPress={() => require('react-native').Linking.openURL(product.manufacturer_url)}>
                          <Ionicons name="globe-outline" size={14} color="#1E40AF" />
                          <Text style={styles.warrBtnText}>الموقع الرسمي</Text>
                        </TouchableOpacity>
                      )}
                      {!!product.manufacturer_phone && (
                        <TouchableOpacity style={styles.warrBtn} onPress={() => require('react-native').Linking.openURL(`tel:${product.manufacturer_phone}`)}>
                          <Ionicons name="call-outline" size={14} color="#1E40AF" />
                          <Text style={styles.warrBtnText}>اتصال</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ) : product.warranty_days > 0 || product.warranty ? (
              <View style={styles.availItem}>
                <Ionicons name="shield-checkmark" size={20} color="#10B981" />
                <Text style={styles.availText}>ضمان {product.warranty_days || 365} يوم{product.warranty_type ? ` - ${product.warranty_type}` : ''}</Text>
              </View>
            ) : (
              <View style={styles.availItem}>
                <Ionicons name="information-circle" size={20} color="#9CA3AF" />
                <Text style={styles.availText}>بدون ضمان</Text>
              </View>
            )}

            <View style={styles.divider} />

            <Text style={styles.subTitle}>طرق التوصيل المتاحة</Text>
            <View style={styles.shipItem}>
              <Ionicons name="flash" size={18} color="#F59E0B" />
              <Text style={styles.shipText}>توصيل نفس اليوم (90 دقيقة)</Text>
            </View>
            <View style={styles.shipItem}>
              <Ionicons name="calendar" size={18} color="#3B82F6" />
              <Text style={styles.shipText}>توصيل مجدول (اختر الوقت المناسب)</Text>
            </View>
            <View style={styles.shipItem}>
              <Ionicons name="cube" size={18} color="#8833FF" />
              <Text style={styles.shipText}>توصيل عادي (2-3 أيام)</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.subTitle}>وسائل الدفع المتاحة</Text>
            <View style={styles.payRow}>
              <View style={styles.payBadge}><Ionicons name="cash" size={16} color="#10B981" /><Text style={styles.payText}>الدفع عند الاستلام</Text></View>
              <View style={[styles.payBadge, styles.payBadgeSoon]}><Ionicons name="card" size={16} color="#6B7280" /><Text style={styles.payTextSoon}>بطاقة</Text></View>
              <View style={[styles.payBadge, styles.payBadgeSoon]}><Ionicons name="logo-apple" size={16} color="#6B7280" /><Text style={styles.payTextSoon}>Apple Pay</Text></View>
              <View style={[styles.payBadge, styles.payBadgeSoon]}><Ionicons name="time" size={16} color="#6B7280" /><Text style={styles.payTextSoon}>تمارا</Text></View>
            </View>
          </View>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity testID="add-to-cart-btn" style={styles.addToCartBtn} onPress={addToCart} disabled={adding}>
          {adding ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Ionicons name="cart" size={22} color="#FFF" />
              <Text style={styles.addToCartText}>Add to Cart - {price} SAR</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, position: 'absolute', top: 50, left: 0, right: 0, zIndex: 10 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  imageWrap: { width, height: width * 0.85, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  productImage: { width: width * 0.7, height: width * 0.7 },
  condBadge: { position: 'absolute', top: 60, right: 20, backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  condText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  productName: { fontSize: 22, fontWeight: '800', color: '#0A0A0A', lineHeight: 32, marginBottom: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  ratingVal: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  reviewCount: { fontSize: 13, color: '#52525B' },
  soldBadge: { backgroundColor: '#EFE6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginStart: 8 },
  soldText: { fontSize: 11, color: '#8833FF', fontWeight: '600' },
  priceSection: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  price: { fontSize: 28, fontWeight: '800', color: '#8833FF' },
  oldPrice: { fontSize: 16, color: '#A1A1AA', textDecorationLine: 'line-through' },
  saveBadge: { backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  saveText: { fontSize: 12, color: '#10B981', fontWeight: '600' },
  optionSection: { marginBottom: 20 },
  optionTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 10 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E4E4E7', backgroundColor: '#FFF' },
  colorSelected: { borderColor: '#8833FF', backgroundColor: '#EFE6FF' },
  colorDot: { width: 20, height: 20, borderRadius: 10 },
  colorLabel: { fontSize: 13, color: '#52525B', fontWeight: '500' },
  colorLabelActive: { color: '#8833FF' },
  colorSelectedName: { fontSize: 13, fontWeight: '700', color: '#8833FF' },
  colorCircleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  colorCircleWrap: { alignItems: 'center' },
  colorCircleOuter: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colorCircleOuterActive: { borderColor: '#8833FF' },
  colorCircleInner: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  warrantyBlock: { gap: 10, marginTop: 6, marginBottom: 6 },
  warrCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  warrHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  warrBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  warrTitle: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', textAlign: 'right' },
  warrSub: { fontSize: 12, color: '#6B7280', marginTop: 2, textAlign: 'right' },
  warrChip: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  warrChipText: { fontSize: 10, color: '#166534', fontWeight: '800' },
  warrTerms: { fontSize: 12, color: '#374151', marginTop: 8, lineHeight: 18, textAlign: 'right' },
  warrActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  warrBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DBEAFE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  warrBtnText: { fontSize: 12, color: '#1E40AF', fontWeight: '700' },
  storageBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E4E4E7', backgroundColor: '#FFF' },
  storageSelected: { borderColor: '#8833FF', backgroundColor: '#EFE6FF' },
  storageLabel: { fontSize: 14, fontWeight: '600', color: '#52525B' },
  storageLabelActive: { color: '#8833FF' },
  descSection: { marginBottom: 20 },
  descText: { fontSize: 14, color: '#52525B', lineHeight: 24 },
  specsSection: { marginBottom: 20, backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  specKey: { fontSize: 13, color: '#52525B', fontWeight: '500' },
  specVal: { fontSize: 13, color: '#0A0A0A', fontWeight: '600' },
  availSection: { padding: 16, backgroundColor: '#F9F9FB', borderRadius: 16, marginBottom: 20 },
  availItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  availText: { fontSize: 13, color: '#0A0A0A', fontWeight: '600' },
  subTitle: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', marginTop: 4, marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 },
  shipItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  shipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#D1FAE5', borderRadius: 14 },
  payBadgeSoon: { backgroundColor: '#F3F4F6' },
  payText: { fontSize: 11, color: '#065F46', fontWeight: '700' },
  payTextSoon: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 34, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  addToCartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, gap: 10, shadowColor: '#8833FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  addToCartText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
