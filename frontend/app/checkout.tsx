import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function CheckoutScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddr, setSelectedAddr] = useState(0);
  const [deliveryType, setDeliveryType] = useState('standard');
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [a, c] = await Promise.all([apiCall('/api/addresses'), apiCall('/api/cart')]);
        setAddresses(a); setCart(c);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const applyCoupon = async () => {
    if (!couponCode) return;
    try {
      const c = await apiCall(`/api/coupons/validate/${couponCode}`);
      const disc = c.discount_type === 'percent' ? Math.min(subtotal * c.discount_value / 100, c.max_discount) : Math.min(c.discount_value, c.max_discount);
      setCouponDiscount(disc); setCouponApplied(c.code);
      Alert.alert('Coupon Applied!', `You saved ${disc} SAR`);
    } catch { Alert.alert('Invalid', 'Coupon code is not valid'); }
  };

  const placeOrder = async () => {
    if (addresses.length === 0) { Alert.alert('Error', 'Please add an address first'); return; }
    setOrdering(true);
    try {
      const addr = addresses[selectedAddr];
      const order = await apiCall('/api/orders', { method: 'POST', body: JSON.stringify({
        address: addr.address, phone: '0500000000', delivery_type: deliveryType,
        payment_method: paymentMethod, notes, coupon_code: couponApplied
      })});
      Alert.alert('Order Placed!', `Order #${order.id?.slice(-8)} has been placed`, [
        { text: 'View Orders', onPress: () => { router.dismiss(); router.push('/orders'); } }
      ]);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setOrdering(false); }
  };

  const subtotal = cart.reduce((a, i) => a + ((i.product?.discount_price || i.product?.price || 0) * i.quantity), 0);
  const deliveryCost = deliveryType === 'express' ? 25 : 15;
  const tax = Math.round(subtotal * 0.15);
  const total = subtotal + tax + deliveryCost - couponDiscount;

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color="#8833FF" /></View>;

  const payMethods = [
    { id: 'cash_on_delivery', label: 'Cash on Delivery', icon: 'cash' },
    { id: 'card', label: 'Credit/Debit Card', icon: 'card', tag: 'Connect Stripe' },
    { id: 'apple_pay', label: 'Apple Pay', icon: 'logo-apple', tag: 'Connect' },
    { id: 'mada', label: 'Mada', icon: 'card', tag: 'Connect' },
    { id: 'tamara', label: 'Tamara (Installments)', icon: 'time', tag: 'Connect Tamara' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="checkout-back" style={s.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Checkout</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <Text style={s.sectionTitle}>Delivery Address</Text>
        {addresses.length === 0 ? (
          <TouchableOpacity style={s.addAddrBtn} onPress={() => router.push('/addresses')}><Ionicons name="add" size={20} color="#8833FF" /><Text style={s.addAddrText}>Add Address</Text></TouchableOpacity>
        ) : addresses.map((a, i) => (
          <TouchableOpacity key={a.id} testID={`addr-${i}`} style={[s.addrCard, selectedAddr === i && s.addrActive]} onPress={() => setSelectedAddr(i)}>
            <Ionicons name={selectedAddr === i ? 'radio-button-on' : 'radio-button-off'} size={20} color={selectedAddr === i ? '#8833FF' : '#A1A1AA'} />
            <View style={s.addrInfo}><Text style={s.addrLabel}>{a.label}</Text><Text style={s.addrText} numberOfLines={1}>{a.address}</Text></View>
          </TouchableOpacity>
        ))}

        <Text style={s.sectionTitle}>Shipping Type</Text>
        <View style={s.shippingRow}>
          {[{ id: 'standard', label: 'Standard', price: '15 SAR', time: '2-3 days' }, { id: 'express', label: 'Express', price: '25 SAR', time: 'Same day' }].map(sh => (
            <TouchableOpacity key={sh.id} testID={`ship-${sh.id}`} style={[s.shipCard, deliveryType === sh.id && s.shipActive]} onPress={() => setDeliveryType(sh.id)}>
              <Ionicons name={deliveryType === sh.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={deliveryType === sh.id ? '#8833FF' : '#A1A1AA'} />
              <View style={s.shipInfo}><Text style={s.shipLabel}>{sh.label}</Text><Text style={s.shipTime}>{sh.time}</Text></View>
              <Text style={s.shipPrice}>{sh.price}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionTitle}>Payment Method</Text>
        {payMethods.map(pm => (
          <TouchableOpacity key={pm.id} testID={`pay-${pm.id}`} style={[s.payCard, paymentMethod === pm.id && s.payActive]} onPress={() => setPaymentMethod(pm.id)}>
            <Ionicons name={paymentMethod === pm.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={paymentMethod === pm.id ? '#8833FF' : '#A1A1AA'} />
            <Ionicons name={pm.icon as any} size={20} color="#52525B" />
            <Text style={s.payLabel}>{pm.label}</Text>
            {pm.tag && <View style={s.payTag}><Text style={s.payTagText}>{pm.tag}</Text></View>}
          </TouchableOpacity>
        ))}

        <Text style={s.sectionTitle}>Coupon Code</Text>
        <View style={s.couponRow}>
          <TextInput testID="coupon-input" style={s.couponInput} placeholder="Enter coupon code" value={couponCode} onChangeText={setCouponCode} autoCapitalize="characters" />
          <TouchableOpacity testID="apply-coupon" style={s.couponBtn} onPress={applyCoupon}><Text style={s.couponBtnText}>Apply</Text></TouchableOpacity>
        </View>
        {couponApplied ? <Text style={s.couponApplied}>{couponApplied} applied! -{couponDiscount} SAR</Text> : null}

        <TextInput testID="order-notes" style={s.notesInput} placeholder="Order notes (optional)" value={notes} onChangeText={setNotes} multiline />

        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>Order Summary</Text>
          <View style={s.summaryRow}><Text style={s.sLabel}>Subtotal ({cart.length} items)</Text><Text style={s.sVal}>{subtotal} SAR</Text></View>
          <View style={s.summaryRow}><Text style={s.sLabel}>Shipping</Text><Text style={s.sVal}>{deliveryCost} SAR</Text></View>
          <View style={s.summaryRow}><Text style={s.sLabel}>Tax (15%)</Text><Text style={s.sVal}>{tax} SAR</Text></View>
          {couponDiscount > 0 && <View style={s.summaryRow}><Text style={[s.sLabel, { color: '#10B981' }]}>Coupon discount</Text><Text style={[s.sVal, { color: '#10B981' }]}>-{couponDiscount} SAR</Text></View>}
          <View style={[s.summaryRow, s.totalRow]}><Text style={s.totalLabel}>TOTAL</Text><Text style={s.totalVal}>{total} SAR</Text></View>
        </View>
      </ScrollView>

      <View style={s.bottomBar}>
        <TouchableOpacity testID="buy-now-btn" style={s.buyBtn} onPress={placeOrder} disabled={ordering}>
          {ordering ? <ActivityIndicator color="#FFF" /> : <Text style={s.buyText}>Buy now - {total} SAR</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' }, load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  content: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginTop: 16, marginBottom: 10 },
  addAddrBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#8833FF', borderStyle: 'dashed' },
  addAddrText: { fontSize: 14, color: '#8833FF', fontWeight: '600' },
  addrCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#F9F9FB', marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent' },
  addrActive: { borderColor: '#8833FF', backgroundColor: '#EFE6FF' },
  addrInfo: { flex: 1 }, addrLabel: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' }, addrText: { fontSize: 12, color: '#52525B' },
  shippingRow: { gap: 8 },
  shipCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#F9F9FB', borderWidth: 1.5, borderColor: 'transparent' },
  shipActive: { borderColor: '#8833FF', backgroundColor: '#EFE6FF' },
  shipInfo: { flex: 1 }, shipLabel: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' }, shipTime: { fontSize: 12, color: '#52525B' },
  shipPrice: { fontSize: 14, fontWeight: '700', color: '#8833FF' },
  payCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#F9F9FB', marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent' },
  payActive: { borderColor: '#8833FF', backgroundColor: '#EFE6FF' },
  payLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#0A0A0A' },
  payTag: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  payTagText: { fontSize: 10, color: '#92400E', fontWeight: '600' },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: { flex: 1, backgroundColor: '#F9F9FB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: '#E4E4E7' },
  couponBtn: { backgroundColor: '#8833FF', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center' },
  couponBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  couponApplied: { fontSize: 13, color: '#10B981', fontWeight: '600', marginTop: 6 },
  notesInput: { backgroundColor: '#F9F9FB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, marginTop: 16, borderWidth: 1, borderColor: '#E4E4E7', height: 60 },
  summaryCard: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginTop: 16 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sLabel: { fontSize: 13, color: '#52525B' }, sVal: { fontSize: 13, color: '#0A0A0A' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 10, marginTop: 4 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' }, totalVal: { fontSize: 18, fontWeight: '800', color: '#8833FF' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 34, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  buyBtn: { backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buyText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
