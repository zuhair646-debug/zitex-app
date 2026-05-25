import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [svc, setSvc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState(false);
  const [deviceModel, setDeviceModel] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [deliveryType, setDeliveryType] = useState('store');
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    (async () => { try { const d = await apiCall(`/api/services/${id}`); setSvc(d); } catch {} finally { setLoading(false); } })();
  }, [id]);

  const bookService = async () => {
    setBooking(true);
    try {
      await apiCall('/api/services/book', { method: 'POST', body: JSON.stringify({
        service_name: svc.name, device_model: deviceModel, issue_desc: issueDesc,
        delivery_type: deliveryType, phone: '0500000000'
      })});
      setShowBook(false);
      Alert.alert('Booked!', 'Your service has been booked successfully. We will contact you shortly.');
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setBooking(false); }
  };

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color="#8833FF" /></View>;
  if (!svc) return <View style={s.load}><Text>Not found</Text></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <TouchableOpacity testID="svc-back" style={s.topBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.topTitle}>{svc.name}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={[s.heroIcon, { backgroundColor: svc.color + '18' }]}><Ionicons name={svc.icon as any} size={48} color={svc.color} /></View>
        <Text style={s.svcName}>{svc.name}</Text>
        <Text style={s.svcDesc}>{svc.desc}</Text>

        <View style={s.priceCard}>
          <View style={s.priceRow}><Text style={s.priceLabel}>Service Price</Text><Text style={s.priceVal}>{svc.price} SAR</Text></View>
          {svc.inspection_price > 0 && <View style={s.priceRow}><Text style={s.priceLabel}>Inspection Price</Text><Text style={s.priceVal}>{svc.inspection_price} SAR</Text></View>}
          <View style={s.priceRow}><Text style={s.priceLabel}>Total Requests</Text><Text style={s.priceVal}>{svc.total_requests}</Text></View>
          <View style={s.priceRow}><Text style={s.priceLabel}>Turnaround</Text><Text style={s.priceVal}>{svc.turnaround}</Text></View>
        </View>

        {svc.inspection_price > 0 && (
          <View style={s.noteCard}>
            <Ionicons name="information-circle" size={20} color="#F59E0B" />
            <Text style={s.noteText}>All services are subject to inspection service. Inspection Price: {svc.inspection_price} SAR</Text>
          </View>
        )}

        <Text style={s.sectionTitle}>Service Options</Text>
        <View style={s.optionsGrid}>
          <View style={s.optionItem}>
            <Ionicons name={svc.delivery_available ? 'checkmark-circle' : 'close-circle'} size={20} color={svc.delivery_available ? '#10B981' : '#EF4444'} />
            <Text style={s.optionLabel}>Delivery</Text>
            <Text style={s.optionVal}>{svc.delivery_available ? 'Available' : 'Not available'}</Text>
          </View>
          <View style={s.optionItem}>
            <Ionicons name={svc.home_pickup ? 'checkmark-circle' : 'close-circle'} size={20} color={svc.home_pickup ? '#10B981' : '#EF4444'} />
            <Text style={s.optionLabel}>Home pickup</Text>
            <Text style={s.optionVal}>{svc.home_pickup ? 'Available' : 'Not available'}</Text>
          </View>
          <View style={s.optionItem}>
            <Ionicons name={svc.warranty_available ? 'checkmark-circle' : 'close-circle'} size={20} color={svc.warranty_available ? '#10B981' : '#EF4444'} />
            <Text style={s.optionLabel}>Warranty</Text>
            <Text style={s.optionVal}>{svc.warranty_available ? `${svc.warranty_days} days` : 'Not available'}</Text>
          </View>
        </View>

        <View style={s.ratingCard}>
          <Ionicons name="star" size={20} color="#FACC15" />
          <Text style={s.ratingVal}>{svc.rating}</Text>
          <Text style={s.ratingCount}>{svc.review_count} reviews</Text>
        </View>
      </ScrollView>

      <View style={s.bottomBar}>
        <TouchableOpacity testID="get-service-btn" style={s.getBtn} onPress={() => setShowBook(true)}>
          <Text style={s.getBtnText}>Get service</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showBook} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalWrap}>
          <View style={s.modal}>
            <View style={s.modalHeader}><Text style={s.modalTitle}>Book {svc.name}</Text><TouchableOpacity onPress={() => setShowBook(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity></View>
            <TextInput testID="device-model" style={s.input} placeholder="Device model (e.g. iPhone 16 Pro)" value={deviceModel} onChangeText={setDeviceModel} />
            <TextInput testID="issue-desc" style={[s.input, s.textArea]} placeholder="Describe the issue..." value={issueDesc} onChangeText={setIssueDesc} multiline numberOfLines={3} textAlignVertical="top" />
            <Text style={s.fieldLabel}>Delivery Type</Text>
            <View style={s.deliveryRow}>
              {[{ val: 'store', label: 'In Store', icon: 'storefront' }, { val: 'delivery', label: 'Delivery', icon: 'car' }, { val: 'home_pickup', label: 'Home Pickup', icon: 'home' }].map(d => (
                <TouchableOpacity key={d.val} testID={`delivery-${d.val}`} style={[s.deliveryBtn, deliveryType === d.val && s.deliveryActive]}
                  onPress={() => setDeliveryType(d.val)} disabled={d.val === 'delivery' && !svc.delivery_available || d.val === 'home_pickup' && !svc.home_pickup}>
                  <Ionicons name={d.icon as any} size={18} color={deliveryType === d.val ? '#FFF' : '#52525B'} />
                  <Text style={[s.deliveryText, deliveryType === d.val && s.deliveryTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity testID="confirm-book-btn" style={s.confirmBtn} onPress={bookService} disabled={booking}>
              {booking ? <ActivityIndicator color="#FFF" /> : <Text style={s.confirmText}>Confirm Booking</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  content: { paddingHorizontal: 20, paddingBottom: 100 },
  heroIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  svcName: { fontSize: 24, fontWeight: '800', color: '#0A0A0A', textAlign: 'center', marginBottom: 8 },
  svcDesc: { fontSize: 14, color: '#52525B', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  priceCard: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginBottom: 16 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  priceLabel: { fontSize: 14, color: '#52525B' },
  priceVal: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 16 },
  noteText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0A', marginBottom: 12 },
  optionsGrid: { gap: 10, marginBottom: 20 },
  optionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9F9FB', borderRadius: 12, padding: 14 },
  optionLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#0A0A0A' },
  optionVal: { fontSize: 13, color: '#52525B' },
  ratingCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9F9FB', borderRadius: 12, padding: 14 },
  ratingVal: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  ratingCount: { fontSize: 13, color: '#52525B' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 34, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  getBtn: { backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  getBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0A0A0A' },
  input: { backgroundColor: '#F9F9FB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: '#E4E4E7' },
  textArea: { height: 80 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#0A0A0A', marginBottom: 8 },
  deliveryRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  deliveryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F9F9FB', borderWidth: 1, borderColor: '#E4E4E7' },
  deliveryActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  deliveryText: { fontSize: 12, fontWeight: '500', color: '#52525B' },
  deliveryTextActive: { color: '#FFF' },
  confirmBtn: { backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  confirmText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
