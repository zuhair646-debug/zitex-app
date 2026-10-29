import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Modal, StatusBar, FlatList, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import BarcodeScannerModal from '../../src/components/BarcodeScannerModal';
import { notify } from '../../src/utils/notify';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { openInvoicePrint } from '../../src/utils/invoicePrint';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ScreenHeader, PrimaryButton, SecondaryButton, EmptyState, SkeletonBox, Badge, FilterTabs, Chip } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { TX, tSync, tf } from '../../src/useAutoT';
import { useT, curLang } from '../../src/i18n';
import TranslatableName from '../../src/components/TranslatableName';

type CartItem = { product_id: string; name: string; price: number; quantity: number };

export default function POSTerminal() {
  const { lang } = useT();
  const s = useSStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiCall, user } = useAuth();
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
  const [scanOpen, setScanOpen] = useState(false);
  const [quick, setQuick] = useState<{ barcode: string; name: string; price: string; stock: string } | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [done, setDone] = useState<{ id: string; number: string; total: number; hasPhone: boolean } | null>(null);
  const perms: string[] = (user as any)?.permissions || [];
  const canAddProducts = (user as any)?.role === 'merchant' || perms.includes('all') || perms.includes('products');

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
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const ql = q.trim().toLowerCase();
    return products.filter((p: any) => (p.name_ar || p.name_en || '').toLowerCase().includes(ql)
      || (p.barcode || '').toLowerCase() === ql || (p.sku || '').toLowerCase() === ql);
  }, [products, q]);

  const onScanned = async (code: string) => {
    setScanOpen(false);
    let p = products.find((x: any) => x.barcode === code || x.sku === code);
    if (!p) {
      try { p = await apiCall(`/api/merchant/products/by-barcode/${encodeURIComponent(code)}`); } catch { p = null; }
    }
    if (p) {
      if (!products.some((x: any) => x.id === p.id)) setProducts(prev => [p, ...prev]);
      addToCart(p);
      return;
    }
    setQuick({ barcode: code, name: '', price: '', stock: '1' });
  };

  const saveQuick = async () => {
    if (!quick) return;
    const price = parseFloat(quick.price);
    if (!quick.name.trim() || !(price > 0)) { notify(tSync('حقول مطلوبة', lang), tSync('الاسم والسعر مطلوبان', lang)); return; }
    setQuickSaving(true);
    try {
      const p = await apiCall('/api/merchant/products/quick-add', {
        method: 'POST',
        body: JSON.stringify({ barcode: quick.barcode, name_ar: quick.name.trim(), price, stock: parseInt(quick.stock || '0', 10) || 0, branch_id: branchId }),
      });
      setProducts(prev => [p, ...prev]);
      addToCart(p);
      setQuick(null);
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
    finally { setQuickSaving(false); }
  };

  const sendWhatsApp = async (invoiceId: string) => {
    try {
      const r = await apiCall(`/api/pos/invoice/${invoiceId}/whatsapp`);
      await Linking.openURL(r.url);
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  };

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
      const hadPhone = !!customerPhone.trim();
      setCart([]); setCheckoutOpen(false); setCustomerName(''); setCustomerPhone('');
      // Inventory is unified: the sale already decremented the same stock used by the online store.
      setProducts(prev => prev.map((p: any) => {
        const ln = items.find(x => x.product_id === p.id);
        return ln && p.stock != null ? { ...p, stock: Math.max(0, p.stock - ln.quantity) } : p;
      }));
      setDone({ id: r.id, number: r.invoice_number, total: r.total, hasPhone: hadPhone });
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScreenHeader title={tSync("نقاط البيع POS", lang)} onBack={() => router.back()} rightIcon="receipt" onRight={() => router.push('/merchant/invoices')} subtitle={tf('{0} في السلة', lang, [cart.length])} />

        {branches.length > 0 && (
          <FilterTabs
            testIDPrefix="pos-branch"
            value={branchId || ''}
            onChange={setBranchId}
            items={branches.map((b: any) => ({ key: b.id, label: tSync(b.name || '', lang), icon: 'business' as const }))}
          />
        )}

        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput testID="pos-search-input" value={q} onChangeText={setQ} placeholder={tSync("ابحث بالاسم أو الباركود...", lang)} placeholderTextColor={colors.onSurfaceTertiary} style={s.searchInput} />
          <TouchableOpacity testID="pos-scan-btn" onPress={() => setScanOpen(true)} style={s.scanBtn} accessibilityLabel="scan">
            <Ionicons name="barcode-outline" size={22} color={colors.onBrandPrimary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}><SkeletonBox height={80} /><SkeletonBox height={80} /></View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p: any) => p.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: cart.length > 0 ? 260 : 200, gap: spacing.sm }}
            ListEmptyComponent={<EmptyState icon="cube-outline" title={tSync("لا يوجد منتجات", lang)} description={tSync('أضف منتجات من قسم المنتجات أولاً', lang)} />}
            renderItem={({ item: p }: any) => {
              const cartItem = cart.find(x => x.product_id === p.id);
              const price = p.discount_price || p.price;
              return (
                <TouchableOpacity style={s.pcard} onPress={() => addToCart(p)} activeOpacity={0.7}>
                  <View style={s.pIcon}><Ionicons name="cube" size={20} color={colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <TranslatableName
                      text={p.name_ar || p.name_en}
                      sourceLang="ar"
                      style={s.pname}
                      numberOfLines={1}
                      iconSize={11}
                    />
                    <Text style={s.pprice}>{price} {tSync('ر.س', lang)}{p.stock != null ? `  ·  ${tSync('المخزون', lang)}: ${p.stock}` : ''}</Text>
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
          <View style={[s.cartBar, { bottom: 72 + Math.max(insets.bottom, spacing.md) + 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.cartLbl}>{cart.reduce((a, x) => a + x.quantity, 0)} {tSync('قطعة', lang)}</Text>
              <Text style={s.cartTotal}>{total.toFixed(2)} <TX style={s.cartCur}>ر.س</TX></Text>
            </View>
            <PrimaryButton testID="pos-checkout-btn" label={tSync("إنهاء البيع", lang)} icon="checkmark-circle" onPress={() => setCheckoutOpen(true)} fullWidth={false} />
          </View>
        )}
      </SafeAreaView>

      <Modal visible={checkoutOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCheckoutOpen(false)}>
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <ScreenHeader title={tSync("إتمام البيع", lang)} onBack={() => setCheckoutOpen(false)} />
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
              <TX style={s.sec}>🧾 الفاتورة</TX>
              {cart.map(x => (
                <View key={x.product_id} style={s.line}>
                  <TranslatableName text={x.name || ''} style={s.lineName} numberOfLines={1} />
                  <Text style={s.lineQty}>×{x.quantity}</Text>
                  <Text style={s.lineAmt}>{(x.price * x.quantity).toFixed(2)}</Text>
                </View>
              ))}
              <View style={s.divider} />
              <View style={s.totalRow}><TX style={s.totalLbl}>المجموع الفرعي</TX><Text style={s.totalVal}>{subtotal.toFixed(2)} {tSync('ر.س', lang)}</Text></View>
              <View style={s.totalRow}><TX style={s.totalLbl}>ضريبة 15%</TX><Text style={s.totalVal}>{vat.toFixed(2)} {tSync('ر.س', lang)}</Text></View>
              <View style={s.totalRow}><TX style={[s.totalLbl, { fontWeight: '900', fontSize: 16 }]}>الإجمالي</TX><Text style={[s.totalVal, { color: colors.brand, fontSize: 18 }]}>{total.toFixed(2)} {tSync('ر.س', lang)}</Text></View>

              <TX style={s.sec}>👤 بيانات العميل (اختياري)</TX>
              <TextInput testID="pos-customer-name" style={s.input} placeholder={tSync("اسم العميل", lang)} placeholderTextColor={colors.onSurfaceTertiary} value={customerName} onChangeText={setCustomerName} />
              <TextInput testID="pos-customer-phone" style={s.input} placeholder={tSync("رقم الجوال", lang)} placeholderTextColor={colors.onSurfaceTertiary} value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />

              <TX style={s.sec}>💳 طريقة الدفع</TX>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {['cash','card','stc_pay','bank_transfer'].map(m => (
                  <Chip key={m} label={m==='cash'?'💵 كاش':m==='card'?'💳 بطاقة':m==='stc_pay'?'📱 STC Pay':'🏦 تحويل بنكي'} active={paymentMethod===m} onPress={() => setPaymentMethod(m)} />
                ))}
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <PrimaryButton testID="pos-issue-invoice" label={saving ? tSync('جارٍ الإصدار...', curLang()) : tSync('إصدار الفاتورة', curLang())} icon="checkmark-done" onPress={checkout} loading={saving} disabled={saving} />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <BarcodeScannerModal visible={scanOpen} onClose={() => setScanOpen(false)} onScanned={onScanned} />

      <Modal visible={!!done} transparent animationType="fade" onRequestClose={() => setDone(null)}>
        <View style={s.overlay}>
          <View style={s.sheet} testID="pos-sale-done">
            <Ionicons name="checkmark-circle" size={48} color={colors.brand} style={{ alignSelf: 'center' }} />
            <Text style={[s.sec, { textAlign: 'center' }]}>{tSync('✅ تم إنشاء الفاتورة', lang)}</Text>
            <Text style={s.codeText}>{done?.number}</Text>
            <Text style={[s.totalVal, { textAlign: 'center', fontSize: 18 }]}>{done?.total.toFixed(2)} {tSync('ر.س', lang)}</Text>
            {done?.hasPhone ? (
              <PrimaryButton testID="pos-done-whatsapp" label={tSync('إرسال واتساب', lang)} icon="logo-whatsapp" onPress={() => done && sendWhatsApp(done.id)} />
            ) : null}
            <SecondaryButton testID="pos-done-print" label={tSync('طباعة', lang)} icon="print" onPress={() => done && openInvoicePrint(done.id, 'thermal')} />
            <SecondaryButton testID="pos-done-new" label={tSync('بيع جديد', lang)} onPress={() => setDone(null)} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!quick} transparent animationType="fade" onRequestClose={() => setQuick(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
          <View style={s.sheet} testID="pos-quick-add">
            <TX style={s.sec}>منتج غير مسجل</TX>
            <Text style={s.codeText}>{quick?.barcode}</Text>
            {!canAddProducts ? (
              <>
                <TX style={s.totalLbl}>هذا الباركود غير موجود في المخزون. اطلب من المدير إضافة المنتج.</TX>
                <SecondaryButton testID="quick-close" label={tSync('إغلاق', lang)} onPress={() => setQuick(null)} />
              </>
            ) : (<>
            <TX style={s.totalLbl}>أضفه كمنتج جديد وسيدخل السلة مباشرة</TX>
            <TextInput testID="quick-name" style={s.input} placeholder={tSync('اسم المنتج', lang)} placeholderTextColor={colors.onSurfaceTertiary}
              value={quick?.name} onChangeText={t => setQuick(v => v && { ...v, name: t })} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput testID="quick-price" style={[s.input, { flex: 1, minWidth: 0 }]} placeholder={tSync('السعر قبل الضريبة', lang)} placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="decimal-pad" value={quick?.price} onChangeText={t => setQuick(v => v && { ...v, price: t })} />
              <TextInput testID="quick-stock" style={[s.input, { flex: 1, minWidth: 0 }]} placeholder={tSync('الكمية', lang)} placeholderTextColor={colors.onSurfaceTertiary}
                keyboardType="number-pad" value={quick?.stock} onChangeText={t => setQuick(v => v && { ...v, stock: t })} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}><SecondaryButton testID="quick-cancel" label={tSync('إلغاء', lang)} onPress={() => setQuick(null)} /></View>
              <View style={{ flex: 1 }}><PrimaryButton testID="quick-save" label={tSync('حفظ وإضافة', lang)} icon="checkmark" onPress={saveQuick} loading={quickSaving} disabled={quickSaving} /></View>
            </View>
            </>)}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}



function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, padding: 0 },
  scanBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  codeText: { color: colors.brand, fontSize: 15, fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  pcard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  pIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  pname: { ...typography.bodyLarge, color: colors.onSurface, fontWeight: '600' },
  pprice: { ...typography.caption, color: colors.brand, marginTop: 2, fontWeight: '700' },
  addBtn: { padding: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.xs },
  qtyBtn: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  qtyText: { ...typography.labelLarge, color: colors.onSurface, minWidth: 20, textAlign: 'center' },
  cartBar: { position: 'absolute', bottom: 100, left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand },
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
}), [themeKey]);
}
