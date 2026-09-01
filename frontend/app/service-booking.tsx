import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from './_layout';

const PURPLE = '#8833FF';

export default function ServiceBooking() {
  const { service_id } = useLocalSearchParams<{ service_id: string }>();
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [svc, setSvc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deviceModel, setDeviceModel] = useState('');
  const [issue, setIssue] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'store' | 'home_pickup'>('store');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [quote, setQuote] = useState<{ pickup_fee: number; distance_km: number; service_price: number } | null>(null);
  const [fetchingQuote, setFetchingQuote] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall(`/api/services/${service_id}`); setSvc(d); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [service_id]);
  useEffect(() => { load(); }, [load]);

  const useMyLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert('صلاحية الموقع', 'مطلوب السماح بالموقع لحساب رسم الاستلام'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCoords(c);
      // fetch dynamic quote
      setFetchingQuote(true);
      try {
        const q = await apiCall(`/api/services/${service_id}/quote`, {
          method: 'POST', body: JSON.stringify({ dest_lat: c.lat, dest_lng: c.lng }),
        });
        setQuote(q);
      } catch (e: any) { Alert.alert('خطأ', e.message); }
      finally { setFetchingQuote(false); }
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const submit = async () => {
    if (!deviceModel || !issue || !phone) { Alert.alert('مطلوب', 'الجهاز، وصف المشكلة، ورقم الهاتف مطلوبة'); return; }
    if (deliveryType === 'home_pickup' && (!coords || !address)) {
      Alert.alert('مطلوب', 'لاستلام من المنزل، حدّد موقعك والعنوان'); return;
    }
    setSaving(true);
    try {
      const r = await apiCall('/api/services/book', {
        method: 'POST',
        body: JSON.stringify({
          service_id, service_name: svc.name,
          device_model: deviceModel, issue_desc: issue,
          delivery_type: deliveryType, address, phone,
          dest_lat: coords?.lat, dest_lng: coords?.lng,
        }),
      });
      Alert.alert('تم الحجز', `الإجمالي: ${r.total_amount} ر.س`, [
        { text: 'متابعة', onPress: () => router.replace('/my-services') },
      ]);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  if (loading || !svc) return <View style={s.load}><ActivityIndicator size="large" color={PURPLE} /></View>;

  const total = (svc.price || 0) + (deliveryType === 'home_pickup' ? (quote?.pickup_fee || 0) : 0);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>حجز {svc.name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={s.svcCard}>
          <Text style={s.svcName}>{svc.name}</Text>
          <View style={s.svcRow}>
            <Text style={s.svcMeta}>⏱ {svc.turnaround}</Text>
            {svc.warranty_available ? <Text style={s.svcMeta}>🛡 ضمان {svc.warranty_days} يوم</Text> : null}
          </View>
        </View>

        <Text style={s.label}>الجهاز *</Text>
        <TextInput style={s.input} value={deviceModel} onChangeText={setDeviceModel} placeholder="iPhone 15 Pro، سامسونج S24 ..." />

        <Text style={s.label}>وصف المشكلة *</Text>
        <TextInput style={[s.input, { height: 90 }]} multiline value={issue} onChangeText={setIssue} placeholder="اشرح المشكلة بالتفصيل..." />

        <Text style={s.label}>رقم الهاتف للتواصل *</Text>
        <TextInput style={s.input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <Text style={s.label}>طريقة الاستلام</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[s.optCard, deliveryType === 'store' && s.optCardActive]} onPress={() => setDeliveryType('store')}>
            <Ionicons name="storefront" size={22} color={deliveryType === 'store' ? PURPLE : '#6B7280'} />
            <Text style={[s.optTitle, deliveryType === 'store' && s.optTitleActive]}>تسليم بالمحل</Text>
            <Text style={s.optHint}>0 ر.س</Text>
          </TouchableOpacity>
          {svc.home_pickup && (
            <TouchableOpacity style={[s.optCard, deliveryType === 'home_pickup' && s.optCardActive]} onPress={() => setDeliveryType('home_pickup')}>
              <Ionicons name="home" size={22} color={deliveryType === 'home_pickup' ? PURPLE : '#6B7280'} />
              <Text style={[s.optTitle, deliveryType === 'home_pickup' && s.optTitleActive]}>استلام + إرجاع</Text>
              <Text style={s.optHint}>حسب المسافة</Text>
            </TouchableOpacity>
          )}
        </View>

        {deliveryType === 'home_pickup' && (
          <>
            <Text style={s.label}>عنوان الاستلام *</Text>
            <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="الحي، الشارع، رقم المبنى..." />

            <TouchableOpacity onPress={useMyLocation} style={s.locBtn} disabled={fetchingQuote}>
              {fetchingQuote ? <ActivityIndicator color="white" /> : <>
                <Ionicons name="location" size={18} color="white" />
                <Text style={s.locBtnText}>
                  {coords ? `📍 المسافة: ${quote?.distance_km || 0} كم • رسم الاستلام: ${quote?.pickup_fee || 0} ر.س` : 'حدّد موقعي على الخريطة'}
                </Text>
              </>}
            </TouchableOpacity>
            {quote && (
              <View style={s.quoteBox}>
                <Text style={s.quoteLine}>سعر الخدمة: <Text style={s.quoteVal}>{svc.price} ر.س</Text></Text>
                <Text style={s.quoteLine}>رسم الاستلام (ذهاب + إياب): <Text style={s.quoteVal}>{quote.pickup_fee} ر.س</Text></Text>
              </View>
            )}
          </>
        )}

        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLbl}>سعر الخدمة</Text>
            <Text style={s.summaryVal}>{svc.price} ر.س</Text>
          </View>
          {deliveryType === 'home_pickup' && quote && (
            <View style={s.summaryRow}>
              <Text style={s.summaryLbl}>رسم الاستلام</Text>
              <Text style={s.summaryVal}>{quote.pickup_fee} ر.س</Text>
            </View>
          )}
          <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 }]}>
            <Text style={s.totalLbl}>الإجمالي</Text>
            <Text style={s.totalVal}>{total} ر.س</Text>
          </View>
        </View>
      </ScrollView>

      <View style={s.bottomBar}>
        <TouchableOpacity testID="confirm-book" style={s.submitBtn} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="white" /> : <Text style={s.submitText}>تأكيد الحجز — {total} ر.س</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  iconBtn: { padding: 4 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0A0A0A', textAlign: 'center' },
  svcCard: { backgroundColor: '#F4ECFF', padding: 14, borderRadius: 14, marginBottom: 12 },
  svcName: { fontSize: 16, fontWeight: '900', color: PURPLE, textAlign: 'right' },
  svcRow: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  svcMeta: { fontSize: 12, color: '#4B1A99', fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6, textAlign: 'right' },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, textAlign: 'right' },
  optCard: { flex: 1, backgroundColor: 'white', padding: 14, borderRadius: 12, alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: '#E5E7EB' },
  optCardActive: { borderColor: PURPLE, backgroundColor: '#F4ECFF' },
  optTitle: { fontSize: 13, fontWeight: '800', color: '#6B7280' },
  optTitleActive: { color: PURPLE },
  optHint: { fontSize: 11, color: '#9CA3AF' },
  locBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PURPLE, padding: 12, borderRadius: 10, marginTop: 10 },
  locBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  quoteBox: { backgroundColor: '#F0F9FF', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#BFDBFE' },
  quoteLine: { fontSize: 13, color: '#1E40AF', marginBottom: 4, textAlign: 'right' },
  quoteVal: { fontWeight: '900' },
  summaryCard: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginTop: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLbl: { fontSize: 13, color: '#6B7280' },
  summaryVal: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  totalLbl: { fontSize: 15, fontWeight: '900', color: '#0A0A0A' },
  totalVal: { fontSize: 20, fontWeight: '900', color: PURPLE },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 30, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  submitBtn: { backgroundColor: PURPLE, padding: 16, borderRadius: 12, alignItems: 'center' },
  submitText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
