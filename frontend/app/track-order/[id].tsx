import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import ZitexMap from '../../src/components/MapView';

const STATUS_ORDER = ['pending', 'processing', 'ready_for_pickup', 'assigned', 'picked_up', 'delivered'];
const STATUS_AR: Record<string, string> = {
  pending: 'قيد الانتظار', processing: 'قيد التحضير', ready_for_pickup: 'جاهز للاستلام',
  assigned: 'تم تعيين سائق', picked_up: 'تم الاستلام - في الطريق', delivered: 'تم التوصيل',
};

export default function TrackOrder() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiCall } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const o = await apiCall(`/api/orders/${id}/tracking`); setOrder(o); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;
  if (!order) return <View style={s.center}><Text>لم يتم العثور على الطلب</Text></View>;

  const stepIdx = STATUS_ORDER.indexOf(order.status);
  const showMap = ['assigned', 'picked_up'].includes(order.status) && (order.driver_lat || order.dest_lat);
  const openExternalMap = () => {
    if (order.driver_lat && order.driver_lng)
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${order.driver_lat},${order.driver_lng}`);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>تتبع الطلب</Text>
        <TouchableOpacity onPress={load}><Ionicons name="refresh" size={20} color="#8833FF" /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={s.orderCard}>
          <Text style={s.orderNo}>#{order.id?.slice(-8).toUpperCase()}</Text>
          <Text style={s.orderStatus}>{STATUS_AR[order.status] || order.status}</Text>
          <Text style={s.orderTotal}>{order.total?.toFixed(2)} ر.س</Text>
          {order.eta_minutes && <Text style={s.eta}>الوصول المتوقع: {order.eta_minutes} دقيقة</Text>}
        </View>

        {showMap && (
          <View style={{ marginTop: 14 }}>
            <Text style={s.section}>📍 الموقع المباشر</Text>
            <ZitexMap
              mode="tracking"
              driverLat={order.driver_lat}
              driverLng={order.driver_lng}
              destLat={order.dest_lat}
              destLng={order.dest_lng}
              branchLat={order.branch_lat}
              branchLng={order.branch_lng}
              initialLat={order.driver_lat || order.dest_lat || 24.7136}
              initialLng={order.driver_lng || order.dest_lng || 46.6753}
              height={300}
            />
            <Text style={s.mapHint}>🟠 السائق · 🟣 الفرع · 🟢 موقعك</Text>
          </View>
        )}

        <Text style={s.section}>تقدم الطلب</Text>
        <View style={s.steps}>
          {STATUS_ORDER.map((st, i) => (
            <View key={st} style={s.step}>
              <View style={[s.stepDot, i <= stepIdx ? s.stepDotActive : null]}>
                {i <= stepIdx && <Ionicons name="checkmark" size={12} color="white" />}
              </View>
              <Text style={[s.stepLabel, i <= stepIdx && s.stepLabelActive]}>{STATUS_AR[st]}</Text>
            </View>
          ))}
        </View>

        {order.driver_name ? (
          <View style={s.driverBox}>
            <Text style={s.section}>السائق</Text>
            <View style={s.driverRow}>
              <View style={s.avatar}><Text style={s.avatarText}>{order.driver_name?.charAt(0)}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.driverName}>{order.driver_name}</Text>
                <Text style={s.driverPhone}>{order.driver_phone}</Text>
              </View>
              {order.driver_phone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${order.driver_phone}`)} style={s.callBtn}>
                  <Ionicons name="call" size={20} color="white" />
                </TouchableOpacity>
              )}
            </View>
            {order.driver_lat && order.driver_lng && (
              <TouchableOpacity onPress={openExternalMap} style={s.mapBtn}>
                <Ionicons name="map" size={16} color="white" />
                <Text style={s.mapBtnText}>فتح في خرائط Google</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : order.status === 'pending' || order.status === 'processing' ? (
          <Text style={s.empty}>قيد تجهيز الطلب — سيتم تعيين سائق قريباً</Text>
        ) : null}

        <Text style={s.section}>عنوان التوصيل</Text>
        <View style={s.box}><Text style={s.text}>{order.address}</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white' },
  backBtn: { padding: 4 }, title: { fontSize: 18, fontWeight: '700' },
  orderCard: { backgroundColor: '#8833FF', padding: 16, borderRadius: 16, alignItems: 'center' },
  orderNo: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  orderStatus: { color: 'white', fontSize: 18, fontWeight: '900', marginVertical: 8 },
  orderTotal: { color: '#FBBF24', fontSize: 20, fontWeight: '800' },
  eta: { color: 'white', fontSize: 12, marginTop: 6, opacity: 0.9 },
  section: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', marginTop: 16, marginBottom: 8 },
  steps: { backgroundColor: 'white', padding: 14, borderRadius: 12 },
  step: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  stepDotActive: { backgroundColor: '#10B981' },
  stepLabel: { fontSize: 13, color: '#9CA3AF' },
  stepLabelActive: { color: '#0A0A0A', fontWeight: '600' },
  driverBox: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginTop: 8 },
  driverRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#8833FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontSize: 18, fontWeight: '800' },
  driverName: { fontSize: 14, fontWeight: '700' },
  driverPhone: { fontSize: 12, color: '#6B7280' },
  callBtn: { backgroundColor: '#10B981', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#3B82F6', padding: 10, borderRadius: 8, marginTop: 10 },
  mapBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
  mapHint: { fontSize: 11, color: '#6B7280', textAlign: 'center', marginTop: 6 },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
  box: { backgroundColor: 'white', padding: 12, borderRadius: 10 },
  text: { fontSize: 13, color: '#374151', textAlign: 'right' },
});
