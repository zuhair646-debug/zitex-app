import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const STATUS_ORDER = ['pending', 'processing', 'ready_for_pickup', 'assigned', 'picked_up', 'delivered'];

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
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, [load]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;
  if (!order) return <View style={s.center}><Text>Order not found</Text></View>;

  const stepIdx = STATUS_ORDER.indexOf(order.status);
  const openMap = () => {
    if (order.driver_lat && order.driver_lng) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${order.driver_lat},${order.driver_lng}`);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Track Order</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={s.orderCard}>
          <Text style={s.orderNo}>#{order.id?.slice(-8).toUpperCase()}</Text>
          <Text style={s.orderStatus}>{order.status?.replace('_', ' ').toUpperCase()}</Text>
          <Text style={s.orderTotal}>{order.total?.toFixed(2)} SAR</Text>
        </View>

        <Text style={s.section}>Progress</Text>
        <View style={s.steps}>
          {STATUS_ORDER.map((st, i) => (
            <View key={st} style={s.step}>
              <View style={[s.stepDot, i <= stepIdx ? s.stepDotActive : null]}>
                {i <= stepIdx && <Ionicons name="checkmark" size="12" color="white" />}
              </View>
              <Text style={[s.stepLabel, i <= stepIdx && s.stepLabelActive]}>{st.replace('_', ' ')}</Text>
            </View>
          ))}
        </View>

        {order.driver_name ? (
          <View style={s.driverBox}>
            <Text style={s.section}>Driver</Text>
            <View style={s.driverRow}>
              <View style={s.avatar}><Text style={s.avatarText}>{order.driver_name?.charAt(0)}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.driverName}>{order.driver_name}</Text>
                <Text style={s.driverPhone}>{order.driver_phone}</Text>
              </View>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${order.driver_phone}`)}><Ionicons name="call" size="22" color="#10B981" /></TouchableOpacity>
            </View>
            {order.driver_lat && order.driver_lng ? (
              <View style={s.locBox}>
                <Ionicons name="location" size="16" color="#3B82F6" />
                <Text style={s.locText}>Driver at: {order.driver_lat?.toFixed(4)}, {order.driver_lng?.toFixed(4)}</Text>
                <TouchableOpacity onPress={openMap} style={s.mapBtn}><Text style={s.mapBtnText}>Open Map</Text></TouchableOpacity>
              </View>
            ) : <Text style={s.noLoc}>Driver location not available yet</Text>}
          </View>
        ) : <Text style={s.empty}>Waiting for driver to be assigned...</Text>}

        <Text style={s.section}>Delivery Address</Text>
        <View style={s.box}><Text style={s.text}>{order.address}</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white' },
  backBtn: { padding: 4 }, title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12 },
  orderCard: { backgroundColor: '#8833FF', padding: 16, borderRadius: 16, alignItems: 'center' },
  orderNo: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  orderStatus: { color: 'white', fontSize: 18, fontWeight: '900', marginVertical: 8 },
  orderTotal: { color: '#FBBF24', fontSize: 20, fontWeight: '800' },
  section: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', marginTop: 16, marginBottom: 8 },
  steps: { backgroundColor: 'white', padding: 14, borderRadius: 12 },
  step: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  stepDotActive: { backgroundColor: '#10B981' },
  stepLabel: { fontSize: 13, color: '#9CA3AF', textTransform: 'capitalize' },
  stepLabelActive: { color: '#0A0A0A', fontWeight: '600' },
  driverBox: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginTop: 8 },
  driverRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#8833FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontSize: 18, fontWeight: '800' },
  driverName: { fontSize: 14, fontWeight: '700' },
  driverPhone: { fontSize: 12, color: '#6B7280' },
  locBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', padding: 8, borderRadius: 8, marginTop: 10, gap: 6 },
  locText: { flex: 1, fontSize: 11, color: '#1E40AF' },
  mapBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  mapBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
  noLoc: { fontSize: 11, color: '#9CA3AF', marginTop: 8, textAlign: 'center', fontStyle: 'italic' },
  empty: { color: '#9CA3AF', textAlign: 'center', marginTop: 16, fontStyle: 'italic' },
  box: { backgroundColor: 'white', padding: 12, borderRadius: 10 },
  text: { fontSize: 13, color: '#374151' },
});
