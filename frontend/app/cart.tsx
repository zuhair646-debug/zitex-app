import { useState, useEffect } from 'react';
import { useT, curLang } from '../src/i18n';
import { tSync } from '../src/useAutoT';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import TranslatableName from '../src/components/TranslatableName';

export default function CartScreen() {
  const { lang } = useT();

  const router = useRouter();
  const { apiCall } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);

  const loadCart = async () => {
    try {
      const data = await apiCall('/api/cart');
      setItems(data);
    } catch (e) { console.log(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadCart(); }, []);

  const updateQty = async (itemId: string, qty: number) => {
    try {
      if (qty <= 0) {
        await apiCall(`/api/cart/${itemId}`, { method: 'DELETE' });
      } else {
        await apiCall(`/api/cart/${itemId}?quantity=${qty}`, { method: 'PUT' });
      }
      await loadCart();
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };

  const removeItem = async (itemId: string) => {
    try {
      await apiCall(`/api/cart/${itemId}`, { method: 'DELETE' });
      await loadCart();
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };

  const placeOrder = async () => {
    setOrdering(true);
    try {
      await apiCall('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          address: 'الرياض - حي النرجس',
          phone: '0500000000',
          delivery_type: 'standard',
          payment_method: 'cash',
        })
      });
      Alert.alert(tSync('تم تقديم الطلب!', curLang()), tSync('سيتم تجهيز طلبك قريباً', curLang()), [
        { text: tSync('حسناً', curLang()), onPress: () => { router.back(); } }
      ]);
      setItems([]);
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); } finally { setOrdering(false); }
  };

  const subtotal = items.reduce((acc, i) => {
    const p = i.product;
    if (!p) return acc;
    const price = p.discount_price || p.price;
    return acc + price * i.quantity;
  }, 0);
  const tax = Math.round(subtotal * 0.15);
  const delivery = 15;
  const total = subtotal + tax + delivery;

  if (loading) return <View style={styles.loadWrap}><ActivityIndicator size="large" color="#F5C518" /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity testID="cart-back-btn" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tSync('سلة التسوق', lang)}</Text>
        <Text style={styles.itemCount}>{items.length} {tSync('منتج', lang)}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconWrap}><Ionicons name="cart-outline" size={64} color="#A1A1AA" /></View>
          <Text style={styles.emptyTitle}>{tSync('السلة فارغة', lang)}</Text>
          <Text style={styles.emptyDesc}>{tSync('ما أضفت أي منتجات لحد الآن', lang)}</Text>
          <TouchableOpacity testID="browse-products-btn" style={styles.browseBtn} onPress={() => router.back()}>
            <Text style={styles.browseBtnText}>{tSync('تصفح المنتجات', lang)}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
            {items.map((item) => {
              const p = item.product;
              if (!p) return null;
              const price = p.discount_price || p.price;
              return (
                <View key={item.id} style={styles.cartItem}>
                  <Image source={{ uri: p.images?.[0] }} style={styles.cartImg} />
                  <View style={styles.cartInfo}>
                    <TranslatableName
                      text={lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}
                      sourceLang={lang === 'ar' ? 'ar' : 'en'}
                      style={styles.cartName}
                      numberOfLines={2}
                      iconSize={12}
                    />
                    {!!item.color && <Text style={styles.cartOption}>{item.color}</Text>}
                    {!!item.storage && <Text style={styles.cartOption}>{item.storage}</Text>}
                    <Text style={styles.cartPrice}>{price} {tSync('ر.س', lang)}</Text>
                    <View style={styles.qtyRow}>
                      <TouchableOpacity testID={`qty-minus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantity - 1)}>
                        <Ionicons name="remove" size={18} color="#0A0A0A" />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <TouchableOpacity testID={`qty-plus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantity + 1)}>
                        <Ionicons name="add" size={18} color="#0A0A0A" />
                      </TouchableOpacity>
                      <TouchableOpacity testID={`remove-item-${item.id}`} style={styles.removeBtn} onPress={() => removeItem(item.id)}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{tSync('ملخص الطلب', lang)}</Text>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{tSync('المجموع الجزئي', lang)}</Text><Text style={styles.summaryVal}>{subtotal} {tSync('ر.س', lang)}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{tSync('الضريبة (15%)', lang)}</Text><Text style={styles.summaryVal}>{tax} {tSync('ر.س', lang)}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{tSync('التوصيل', lang)}</Text><Text style={styles.summaryVal}>{delivery} {tSync('ر.س', lang)}</Text></View>
              <View style={[styles.summaryRow, styles.totalRow]}><Text style={styles.totalLabel}>{tSync('الإجمالي', lang)}</Text><Text style={styles.totalVal}>{total} {tSync('ر.س', lang)}</Text></View>
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>

          <View style={styles.bottomBar}>
            <View style={styles.bottomInfo}>
              <Text style={styles.bottomTotal}>{total} {tSync('ر.س', lang)}</Text>
              <Text style={styles.bottomCount}>{items.length} {tSync('منتج', lang)}</Text>
            </View>
            <TouchableOpacity testID="place-order-btn" style={styles.orderBtn} onPress={() => router.push('/checkout')} disabled={ordering}>
              {ordering ? <ActivityIndicator color="#FFF" /> : <Text style={styles.orderBtnText}>{tSync('الدفع', lang)}</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: '#0A0A0A' },
  itemCount: { fontSize: 14, color: '#52525B' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0A0A0A', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#52525B', marginBottom: 24 },
  browseBtn: { backgroundColor: '#F5C518', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  browseBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  listContent: { paddingHorizontal: 20 },
  cartItem: { flexDirection: 'row', padding: 14, backgroundColor: '#F9F9FB', borderRadius: 16, marginBottom: 12 },
  cartImg: { width: 90, height: 90, borderRadius: 12, backgroundColor: '#FFF', marginEnd: 14 },
  cartInfo: { flex: 1 },
  cartName: { fontSize: 14, fontWeight: '600', color: '#0A0A0A', marginBottom: 4, lineHeight: 20 },
  cartOption: { fontSize: 12, color: '#52525B', marginBottom: 2 },
  cartPrice: { fontSize: 16, fontWeight: '800', color: '#F5C518', marginBottom: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E4E4E7' },
  qtyText: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', minWidth: 24, textAlign: 'center' },
  removeBtn: { marginStart: 'auto', padding: 6 },
  summaryCard: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 20, marginTop: 8 },
  summaryTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryLabel: { fontSize: 14, color: '#52525B' },
  summaryVal: { fontSize: 14, color: '#0A0A0A', fontWeight: '500' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 12, marginTop: 4 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' },
  totalVal: { fontSize: 18, fontWeight: '800', color: '#F5C518' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 34, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  bottomInfo: { flex: 1 },
  bottomTotal: { fontSize: 20, fontWeight: '800', color: '#0A0A0A' },
  bottomCount: { fontSize: 12, color: '#52525B' },
  orderBtn: { backgroundColor: '#F5C518', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, shadowColor: '#F5C518', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  orderBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
