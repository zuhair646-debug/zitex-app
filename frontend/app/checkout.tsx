import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function CheckoutScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddr, setSelectedAddr] = useState(0);
  const [deliveryType, setDeliveryType] = useState<'standard' | 'same_day' | 'scheduled'>('standard');
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [quote, setQuote] = useState<any>(null);
  const [userLat, setUserLat] = useState(0);
  const [userLng, setUserLng] = useState(0);
  const [scheduledSlot, setScheduledSlot] = useState<any>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [a, c, me] = await Promise.all([apiCall('/api/addresses'), apiCall('/api/cart'), apiCall('/api/auth/me')]);
        setAddresses(a); setCart(c);
        const lat = me?.user?.default_lat || 0;
        const lng = me?.user?.default_lng || 0;
        setUserLat(lat); setUserLng(lng);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const refreshQuote = useCallback(async () => {
    if (!userLat || !userLng) return;
    try {
      const itemIds = cart.map(c => c.product?.id).filter(Boolean);
      const q = await apiCall('/api/delivery/quote', { method: 'POST', body: JSON.stringify({
        lat: userLat, lng: userLng, delivery_type: deliveryType, item_ids: itemIds,
      })});
      setQuote(q);
      setDeliveryFee(q.fee?.delivery_fee || 0);
      if (deliveryType === 'scheduled' && q.fee?.scheduled_slots) setAvailableSlots(q.fee.scheduled_slots);
      if (deliveryType !== 'scheduled') setScheduledSlot(null);
      if (q.alternative_note) {
        Alert.alert(
          'تنبيه: المنتجات في فرع بديل',
          `${q.alternative_note.reason}\n${q.alternative_note.available_count}/${q.alternative_note.total_requested} متوفر في الفرع المختار`,
        );
      }
    } catch (e: any) {
      Alert.alert('تعذّر حساب التوصيل', e.message || 'حاول مرة أخرى');
    }
  }, [userLat, userLng, deliveryType, cart]);

  useEffect(() => { refreshQuote(); }, [refreshQuote]);

  const applyCoupon = async () => {
    if (!couponCode) return;
    try {
      const c = await apiCall(`/api/coupons/validate/${couponCode}`);
      const disc = c.discount_type === 'percent' ? Math.min(subtotal * c.discount_value / 100, c.max_discount) : Math.min(c.discount_value, c.max_discount);
      setCouponDiscount(disc); setCouponApplied(c.code);
      Alert.alert('تم تطبيق الكوبون!', `وفّرت ${disc} ر.س`);
    } catch { Alert.alert('غير صالح', 'رمز الكوبون غير صحيح'); }
  };

  const placeOrder = async () => {
    if (addresses.length === 0) { Alert.alert('خطأ', 'يرجى إضافة عنوان أولاً'); return; }
    if (deliveryType === 'scheduled' && !scheduledSlot) { Alert.alert('مطلوب', 'يرجى اختيار فترة التوصيل'); return; }
    setOrdering(true);
    try {
      const addr = addresses[selectedAddr];
      const order = await apiCall('/api/orders', { method: 'POST', body: JSON.stringify({
        address: addr.address, phone: addr.phone || '0500000000', delivery_type: deliveryType,
        payment_method: paymentMethod, notes, coupon_code: couponApplied,
        dest_lat: userLat, dest_lng: userLng,
        branch_id: quote?.branch?.id, branch_lat: quote?.branch?.lat, branch_lng: quote?.branch?.lng,
        scheduled_slot: scheduledSlot,
      })});
      Alert.alert('تم الطلب!', `رقم الطلب #${order.id?.slice(-8)}`, [
        { text: 'تتبع', onPress: () => { router.dismiss(); router.push(`/track-order/${order.id}` as any); } },
        { text: 'طلباتي', onPress: () => { router.dismiss(); router.push('/orders'); } }
      ]);
    } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setOrdering(false); }
  };

  const subtotal = cart.reduce((a, i) => a + ((i.product?.discount_price || i.product?.price || 0) * i.quantity), 0);
  const deliveryCost = deliveryFee;
  const tax = Math.round(subtotal * 0.15);
  const total = subtotal + tax + deliveryCost - couponDiscount;

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color="#8833FF" /></View>;

  const payMethods = [
    { id: 'cash_on_delivery', label: 'الدفع عند الاستلام', icon: 'cash' },
    { id: 'card', label: 'بطاقة ائتمان/مدى', icon: 'card', tag: 'قريباً' },
    { id: 'apple_pay', label: 'Apple Pay', icon: 'logo-apple', tag: 'قريباً' },
    { id: 'tamara', label: 'تمارا (تقسيط)', icon: 'time', tag: 'قريباً' },
  ];

  const deliveryOpts = [
    { id: 'standard' as const, label: 'عادي', time: '٢-٣ أيام', icon: 'cube' },
    { id: 'same_day' as const, label: 'نفس اليوم ⚡', time: 'خلال ٩٠ دقيقة', icon: 'flash' },
    { id: 'scheduled' as const, label: 'مجدول', time: 'اختر الموعد', icon: 'calendar' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>إتمام الطلب</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <Text style={s.sectionTitle}>عنوان التوصيل</Text>
        {!userLat && (
          <TouchableOpacity style={s.warnBox} onPress={() => router.push('/setup-location' as any)}>
            <Ionicons name="warning" size={18} color="#F59E0B" />
            <Text style={s.warnText}>لم يتم تحديد موقعك على الخريطة — اضغط لتحديده</Text>
          </TouchableOpacity>
        )}
        {addresses.length === 0 ? (
          <TouchableOpacity style={s.addAddrBtn} onPress={() => router.push('/addresses')}><Ionicons name="add" size={20} color="#8833FF" /><Text style={s.addAddrText}>إضافة عنوان</Text></TouchableOpacity>
        ) : addresses.map((a, i) => (
          <TouchableOpacity key={a.id} style={[s.addrCard, selectedAddr === i && s.addrActive]} onPress={() => setSelectedAddr(i)}>
            <Ionicons name={selectedAddr === i ? 'radio-button-on' : 'radio-button-off'} size={20} color={selectedAddr === i ? '#8833FF' : '#A1A1AA'} />
            <View style={s.addrInfo}><Text style={s.addrLabel}>{a.label}</Text><Text style={s.addrText} numberOfLines={1}>{a.address}</Text></View>
          </TouchableOpacity>
        ))}

        {quote?.branch && (
          <View style={s.branchBox}>
            <Ionicons name="storefront" size={18} color="#8833FF" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.branchName}>الفرع: {quote.branch.name}</Text>
              <Text style={s.branchDist}>{quote.branch.distance_km} كم {quote.fee?.in_zone ? `• ضمن منطقة "${quote.fee.zone_name}"` : ''}</Text>
            </View>
          </View>
        )}

        <Text style={s.sectionTitle}>نوع التوصيل</Text>
        <View style={{ gap: 8 }}>
          {deliveryOpts.map(opt => (
            <TouchableOpacity key={opt.id} style={[s.shipCard, deliveryType === opt.id && s.shipActive]} onPress={() => setDeliveryType(opt.id)}>
              <Ionicons name={deliveryType === opt.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={deliveryType === opt.id ? '#8833FF' : '#A1A1AA'} />
              <Ionicons name={opt.icon as any} size={20} color="#52525B" />
              <View style={s.shipInfo}><Text style={s.shipLabel}>{opt.label}</Text><Text style={s.shipTime}>{opt.time}</Text></View>
              {deliveryType === opt.id && <Text style={s.shipPrice}>{deliveryFee} ر.س</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {deliveryType === 'scheduled' && (
          <TouchableOpacity style={s.slotBtn} onPress={() => setSlotModalOpen(true)}>
            <Ionicons name="time" size={18} color="#8833FF" />
            <Text style={s.slotBtnText}>{scheduledSlot ? `الفترة: ${scheduledSlot.label} (${scheduledSlot.start} - ${scheduledSlot.end})` : 'اختر فترة التوصيل ←'}</Text>
          </TouchableOpacity>
        )}

        <Text style={s.sectionTitle}>طريقة الدفع</Text>
        {payMethods.map(pm => (
          <TouchableOpacity key={pm.id} style={[s.payCard, paymentMethod === pm.id && s.payActive]} onPress={() => setPaymentMethod(pm.id)}>
            <Ionicons name={paymentMethod === pm.id ? 'radio-button-on' : 'radio-button-off'} size={18} color={paymentMethod === pm.id ? '#8833FF' : '#A1A1AA'} />
            <Ionicons name={pm.icon as any} size={20} color="#52525B" />
            <Text style={s.payLabel}>{pm.label}</Text>
            {pm.tag && <View style={s.payTag}><Text style={s.payTagText}>{pm.tag}</Text></View>}
          </TouchableOpacity>
        ))}

        <Text style={s.sectionTitle}>كود الخصم</Text>
        <View style={s.couponRow}>
          <TextInput style={s.couponInput} placeholder="أدخل كود الخصم" value={couponCode} onChangeText={setCouponCode} autoCapitalize="characters" />
          <TouchableOpacity style={s.couponBtn} onPress={applyCoupon}><Text style={s.couponBtnText}>تطبيق</Text></TouchableOpacity>
        </View>
        {couponApplied ? <Text style={s.couponApplied}>{couponApplied} طُبِّق! -{couponDiscount} ر.س</Text> : null}

        <TextInput style={s.notesInput} placeholder="ملاحظات للطلب (اختياري)" value={notes} onChangeText={setNotes} multiline />

        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>ملخص الطلب</Text>
          <View style={s.summaryRow}><Text style={s.sLabel}>المجموع الفرعي ({cart.length} منتج)</Text><Text style={s.sVal}>{subtotal} ر.س</Text></View>
          <View style={s.summaryRow}><Text style={s.sLabel}>التوصيل</Text><Text style={s.sVal}>{deliveryCost} ر.س</Text></View>
          <View style={s.summaryRow}><Text style={s.sLabel}>الضريبة (١٥٪)</Text><Text style={s.sVal}>{tax} ر.س</Text></View>
          {couponDiscount > 0 && <View style={s.summaryRow}><Text style={[s.sLabel, { color: '#10B981' }]}>خصم الكوبون</Text><Text style={[s.sVal, { color: '#10B981' }]}>-{couponDiscount} ر.س</Text></View>}
          <View style={[s.summaryRow, s.totalRow]}><Text style={s.totalLabel}>المجموع</Text><Text style={s.totalVal}>{total} ر.س</Text></View>
        </View>
      </ScrollView>

      <View style={s.bottomBar}>
        <TouchableOpacity style={s.buyBtn} onPress={placeOrder} disabled={ordering}>
          {ordering ? <ActivityIndicator color="#FFF" /> : <Text style={s.buyText}>اشترِ الآن - {total} ر.س</Text>}
        </TouchableOpacity>
      </View>

      {/* Slot Picker */}
      <Modal visible={slotModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSlotModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setSlotModalOpen(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>اختر الفترة</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {availableSlots.length === 0 && <Text style={{ textAlign: 'center', color: '#9CA3AF', marginTop: 40 }}>لا توجد فترات متاحة</Text>}
            {availableSlots.map((sl, i) => (
              <TouchableOpacity key={i} style={[s.slotItem, scheduledSlot?.label === sl.label && s.slotItemActive]} onPress={() => { setScheduledSlot(sl); setSlotModalOpen(false); }}>
                <Ionicons name="time-outline" size={20} color={scheduledSlot?.label === sl.label ? 'white' : '#8833FF'} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[s.slotLabel, scheduledSlot?.label === sl.label && { color: 'white' }]}>{sl.label}</Text>
                  <Text style={[s.slotTime, scheduledSlot?.label === sl.label && { color: 'white' }]}>{sl.start} - {sl.end}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' }, load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { fontSize: 20, fontWeight: '800', color: '#0A0A0A' },
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginTop: 16, marginBottom: 10, textAlign: 'right' },
  warnBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', padding: 12, borderRadius: 10, marginBottom: 8 },
  warnText: { flex: 1, color: '#92400E', fontSize: 12, fontWeight: '600' },
  addAddrBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#8833FF', borderStyle: 'dashed' },
  addAddrText: { fontSize: 14, color: '#8833FF', fontWeight: '600' },
  addrCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#F9F9FB', marginBottom: 8, borderWidth: 1.5, borderColor: 'transparent' },
  addrActive: { borderColor: '#8833FF', backgroundColor: '#EFE6FF' },
  addrInfo: { flex: 1 }, addrLabel: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' }, addrText: { fontSize: 12, color: '#52525B' },
  branchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3E8FF', padding: 12, borderRadius: 10, marginTop: 6 },
  branchName: { fontSize: 13, fontWeight: '700', color: '#5B21B6' },
  branchDist: { fontSize: 11, color: '#7C3AED' },
  shipCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#F9F9FB', borderWidth: 1.5, borderColor: 'transparent' },
  shipActive: { borderColor: '#8833FF', backgroundColor: '#EFE6FF' },
  shipInfo: { flex: 1 }, shipLabel: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' }, shipTime: { fontSize: 12, color: '#52525B' },
  shipPrice: { fontSize: 14, fontWeight: '700', color: '#8833FF' },
  slotBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3E8FF', padding: 12, borderRadius: 10, marginTop: 8 },
  slotBtnText: { flex: 1, color: '#5B21B6', fontWeight: '700', fontSize: 13 },
  slotItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  slotItemActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  slotLabel: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  slotTime: { fontSize: 12, color: '#6B7280', marginTop: 2 },
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
  notesInput: { backgroundColor: '#F9F9FB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, marginTop: 16, borderWidth: 1, borderColor: '#E4E4E7', height: 60, textAlign: 'right' },
  summaryCard: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginTop: 16 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 12, textAlign: 'right' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sLabel: { fontSize: 13, color: '#52525B' }, sVal: { fontSize: 13, color: '#0A0A0A', fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 10, marginTop: 4 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#0A0A0A' }, totalVal: { fontSize: 20, fontWeight: '900', color: '#8833FF' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 34, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  buyBtn: { backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buyText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});
