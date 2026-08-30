import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, StatusBar, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ScreenHeader, PrimaryButton, SecondaryButton, EmptyState, SkeletonBox, Badge, Chip } from '../../src/components/ui';

type CartItem = { product_id: string; name: string; price: number; quantity: number };

export default function POSTerminal() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ps, bs] = await Promise.all([
        apiCall('/api/merchant/products').catch(() => []),
        apiCall('/api/merchant/branches').catch(() => []),
      ]);
      setProducts(Array.isArray(ps) ? ps : []);
      const brs = Array.isArray(bs) ? bs : [];
      setBranches(brs);
      const main = brs.find((b: any) => b.is_main) || brs[0];
      if (main) setBranchId(main.id);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const ql = q.trim().toLowerCase();
    return products.filter((p: any) => (p.name_ar || p.name_en || '').toLowerCase().includes(ql));
  }, [products, q]);

  const addToCart = (p: any) => {
    const price = p.discount_price || p.price;
    setCart(prev => {
      const idx = prev.findIndex(x => x.product_id === p.id);
      if (idx >= 0) return prev.map((x, i) => i === idx ? { ...x, quantity: x.quantity + 1 } : x);
      return [...prev, { product_id: p.id, name: p.name_ar || p.name_en, price, quantity: 1 }];
    });
  };
  const updateQty = (pid: string, delta: number) => setCart(prev =>
    prev.map(x => x.product_id === pid ? { ...x, quantity: Math.max(0, x.quantity + delta) } : x)
      .filter(x => x.quantity > 0));

  const subtotal = cart.reduce((a, x) => a + x.price * x.quantity, 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  const checkout = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      const items = cart.map(x => ({ product_id: x.product_id, name: x.name, price: x.price, quantity: x.quantity, discount: 0 }));
      const r = await apiCall('/api/pos/invoice', {
        method: 'POST',
        body: JSON.stringify({ items, customer_name: customerName, customer_phone: customerPhone, payment_method: paymentMethod, branch_id: branchId, vat_percent: 15 }),
      });
      setCart([]); setCheckoutOpen(false); setCustomerName(''); setCustomerPhone('');
      Alert.alert('✅ تم إنشاء الفاتورة', `رقم الفاتورة: ${r.invoice_number}\nالمجموع: ${r.total.toFixed(2)} ر.س`,
        [{ text: 'موافق' }, { text: 'عرض الفواتير', onPress: () => router.push('/merchant/invoices') }]);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title="نقاط البيع POS" onBack={() => router.back()} rightIcon="receipt" onRight={() => router.push('/merchant/invoices')} subtitle={`${cart.length} في السلة`} />

        {branches.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}>
            {branches.map((b: any) => (
              <Chip key={b.id} label={b.name} icon="business" active={branchId === b.id} onPress={() => setBranchId(b.id)} />
            ))}
          </ScrollView>
        )}

        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن منتج..." placeholderTextColor={colors.onSurfaceTertiary} style={s.searchInput} />
        </View>

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}><SkeletonBox height={80} /><SkeletonBox height={80} /></View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p: any) => p.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: cart.length > 0 ? 200 : 140, gap: spacing.sm }}
            ListEmptyComponent={<EmptyState icon="cube-outline" title="لا يوجد منتجات" description="أضف منتجات من قسم المنتجات أولاً" />}
            renderItem={({ item: p }: any) => {
              const cartItem = cart.find(x => x.product_id === p.id);
              const price = p.discount_price || p.price;
              return (
                <TouchableOpacity style={s.pcard} onPress={() => addToCart(p)} activeOpacity={0.7}>
                  <View style={s.pIcon}><Ionicons name="cube" size={20} color={colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pname} numberOfLines={1}>{p.name_ar || p.name_en}</Text>
                    <Text style={s.pprice}>{price} ر.س</Text>
                  </View>
                  {cartItem ? (
                    <View style={s.qtyRow}>
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); updateQty(p.id, -1); }} style={s.qtyBtn}><Ionicons name="remove" size={16} color={colors.onSurface} /></TouchableOpacity>
                      <Text style={s.qtyText}>{cartItem.quantity}</Text>
                      <TouchableOpacity onPress={(e) => { e.stopPropagation(); updateQty(p.id, 1); }} style={s.qtyBtn}><Ionicons name="add" size={16} color={colors.onSurface} /></TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.addBtn}><Ionicons name="add-circle" size={26} color={colors.brand} /></View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {cart.length > 0 && (
          <View style={s.cartBar}>
            <View style={{ flex: 1 }}>
              <Text style={s.cartLbl}>{cart.reduce((a, x) => a + x.quantity, 0)} قطعة</Text>
              <Text style={s.cartTotal}>{total.toFixed(2)} <Text style={s.cartCur}>ر.س</Text></Text>
            </View>
            <PrimaryButton label="إنهاء البيع" icon="checkmark-circle" onPress={() => setCheckoutOpen(true)} fullWidth={false} />
          </View>
        )}
      </SafeAreaView>

      <Modal visible={checkoutOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCheckoutOpen(false)}>
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <ScreenHeader title="إتمام البيع" onBack={() => setCheckoutOpen(false)} />
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
              <Text style={s.sec}>🧾 الفاتورة</Text>
              {cart.map(x => (
                <View key={x.product_id} style={s.line}>
                  <Text style={s.lineName} numberOfLines={1}>{x.name}</Text>
                  <Text style={s.lineQty}>×{x.quantity}</Text>
                  <Text style={s.lineAmt}>{(x.price * x.quantity).toFixed(2)}</Text>
                </View>
              ))}
              <View style={s.divider} />
              <View style={s.totalRow}><Text style={s.totalLbl}>المجموع الفرعي</Text><Text style={s.totalVal}>{subtotal.toFixed(2)} ر.س</Text></View>
              <View style={s.totalRow}><Text style={s.totalLbl}>ضريبة 15%</Text><Text style={s.totalVal}>{vat.toFixed(2)} ر.س</Text></View>
              <View style={s.totalRow}><Text style={[s.totalLbl, { fontWeight: '900', fontSize: 16 }]}>الإجمالي</Text><Text style={[s.totalVal, { color: colors.brand, fontSize: 18 }]}>{total.toFixed(2)} ر.س</Text></View>

              <Text style={s.sec}>👤 بيانات العميل (اختياري)</Text>
              <TextInput style={s.input} placeholder="اسم العميل" placeholderTextColor={colors.onSurfaceTertiary} value={customerName} onChangeText={setCustomerName} />
              <TextInput style={s.input} placeholder="رقم الجوال" placeholderTextColor={colors.onSurfaceTertiary} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />

              <Text style={s.sec}>💳 طريقة الدفع</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {['cash','card','stc_pay','bank_transfer'].map(m => (
                  <Chip key={m} label={m==='cash'?'💵 كاش':m==='card'?'💳 بطاقة':m==='stc_pay'?'📱 STC Pay':'🏦 تحويل بنكي'} active={paymentMethod===m} onPress={() => setPaymentMethod(m)} />
                ))}
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <PrimaryButton label={saving ? 'جارٍ الإصدار...' : 'إصدار الفاتورة'} icon="checkmark-done" onPress={checkout} loading={saving} disabled={saving} />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, padding: 0 },
  pcard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  pIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  pname: { ...typography.bodyLarge, color: colors.onSurface, fontWeight: '600' },
  pprice: { ...typography.caption, color: colors.brand, marginTop: 2, fontWeight: '700' },
  addBtn: { padding: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.xs },
  qtyBtn: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  qtyText: { ...typography.labelLarge, color: colors.onSurface, minWidth: 20, textAlign: 'center' },
  cartBar: { position: 'absolute', bottom: 88, left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand },
  cartLbl: { ...typography.caption, color: colors.onSurfaceSecondary },
  cartTotal: { ...typography.titleLarge, color: colors.brand, fontWeight: '900', marginTop: 2 },
  cartCur: { fontSize: 12, color: colors.onSurfaceSecondary },
  sec: { ...typography.titleSmall, color: colors.onSurface, marginTop: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  lineName: { flex: 1, color: colors.onSurface, fontSize: 14 },
  lineQty: { color: colors.onSurfaceSecondary, fontSize: 13 },
  lineAmt: { color: colors.brand, fontWeight: '700', fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLbl: { color: colors.onSurfaceSecondary, fontSize: 14 },
  totalVal: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.onSurface, fontSize: 15 },
});
