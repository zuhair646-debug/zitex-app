import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function DeliverySettings() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [data, setData] = useState<any>({ base_fee: '10', base_distance_km: '10', per_km_rate: '1.2', max_distance_km: '50', same_day_flat_price: '30', zones: [] });
  const [loading, setLoading] = useState(true);
  const [zoneModal, setZoneModal] = useState(false);
  const [zone, setZone] = useState<any>({ name: '', center_lat: '', center_lng: '', radius_km: '5', fixed_price: '30', delivery_type: 'same_day' });

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/delivery/settings'); setData({ ...d, base_fee: String(d.base_fee || 10), base_distance_km: String(d.base_distance_km || 10), per_km_rate: String(d.per_km_rate || 1.2), max_distance_km: String(d.max_distance_km || 50), same_day_flat_price: String(d.same_day_flat_price || 30), zones: d.zones || [] }); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const body = { base_fee: parseFloat(data.base_fee), base_distance_km: parseFloat(data.base_distance_km), per_km_rate: parseFloat(data.per_km_rate), max_distance_km: parseFloat(data.max_distance_km), same_day_flat_price: parseFloat(data.same_day_flat_price), zones: data.zones };
      await apiCall('/api/merchant/delivery/settings', { method: 'PUT', body: JSON.stringify(body) });
      Alert.alert('Saved', 'Delivery settings updated');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const addZone = () => {
    if (!zone.name || !zone.center_lat || !zone.center_lng || !zone.fixed_price) { Alert.alert('Required', 'Fill all zone fields'); return; }
    const newZone = { ...zone, center_lat: parseFloat(zone.center_lat), center_lng: parseFloat(zone.center_lng), radius_km: parseFloat(zone.radius_km), fixed_price: parseFloat(zone.fixed_price) };
    setData({ ...data, zones: [...data.zones, newZone] });
    setZone({ name: '', center_lat: '', center_lng: '', radius_km: '5', fixed_price: '30', delivery_type: 'same_day' });
    setZoneModal(false);
  };
  const delZone = (i: number) => setData({ ...data, zones: data.zones.filter((_: any, idx: number) => idx !== i) });

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Delivery Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.section}>📦 Standard Delivery (distance-based)</Text>
        <View style={s.box}>
          <Text style={s.label}>Base Fee (SAR) inside base distance</Text>
          <TextInput style={s.input} keyboardType="numeric" value={data.base_fee} onChangeText={t => setData({ ...data, base_fee: t })} />
          <Text style={s.label}>Base Distance (km)</Text>
          <TextInput style={s.input} keyboardType="numeric" value={data.base_distance_km} onChangeText={t => setData({ ...data, base_distance_km: t })} />
          <Text style={s.label}>Per-Km Rate (SAR/km) above base</Text>
          <TextInput style={s.input} keyboardType="numeric" value={data.per_km_rate} onChangeText={t => setData({ ...data, per_km_rate: t })} />
          <Text style={s.label}>Max Delivery Distance (km)</Text>
          <TextInput style={s.input} keyboardType="numeric" value={data.max_distance_km} onChangeText={t => setData({ ...data, max_distance_km: t })} />
        </View>

        <Text style={s.section}>⚡ Same-Day Delivery (fast)</Text>
        <View style={s.box}>
          <Text style={s.label}>Same-Day Flat Price (SAR)</Text>
          <TextInput style={s.input} keyboardType="numeric" value={data.same_day_flat_price} onChangeText={t => setData({ ...data, same_day_flat_price: t })} />
          <Text style={s.hint}>Used if no zone matches the customer location</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <Text style={s.section}>📍 Custom Zones ({data.zones.length})</Text>
          <TouchableOpacity onPress={() => setZoneModal(true)} style={s.addZoneBtn}><Text style={s.addZoneText}>+ Add Zone</Text></TouchableOpacity>
        </View>
        {data.zones.length === 0 && <Text style={s.hint}>Define custom zones (e.g. neighborhoods) with fixed prices</Text>}
        {data.zones.map((z: any, i: number) => (
          <View key={i} style={s.zoneCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.zoneName}>{z.name}</Text>
              <Text style={s.zoneInfo}>Center: {z.center_lat}, {z.center_lng} • Radius: {z.radius_km}km</Text>
              <Text style={s.zonePrice}>{z.fixed_price} SAR • {z.delivery_type === 'same_day' ? 'Same-Day' : 'Standard'}</Text>
            </View>
            <TouchableOpacity onPress={() => delZone(i)}><Ionicons name="trash-outline" size="20" color="#EF4444" /></TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.saveBtn} onPress={save}><Text style={s.saveText}>Save Settings</Text></TouchableOpacity>
      </ScrollView>

      <Modal visible={zoneModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setZoneModal(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setZoneModal(false)}><Ionicons name="close" size="24" color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>Add Zone</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>Zone Name *</Text>
            <TextInput style={s.input} value={zone.name} onChangeText={t => setZone({ ...zone, name: t })} placeholder="Al Olaya District" />
            <Text style={s.label}>Center Latitude *</Text>
            <TextInput style={s.input} keyboardType="numeric" value={zone.center_lat} onChangeText={t => setZone({ ...zone, center_lat: t })} placeholder="24.6877" />
            <Text style={s.label}>Center Longitude *</Text>
            <TextInput style={s.input} keyboardType="numeric" value={zone.center_lng} onChangeText={t => setZone({ ...zone, center_lng: t })} placeholder="46.7219" />
            <Text style={s.hint}>Get from Google Maps: right-click on a location → copy coordinates</Text>
            <Text style={s.label}>Radius (km)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={zone.radius_km} onChangeText={t => setZone({ ...zone, radius_km: t })} />
            <Text style={s.label}>Fixed Price (SAR)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={zone.fixed_price} onChangeText={t => setZone({ ...zone, fixed_price: t })} />
            <Text style={s.label}>Delivery Type</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.opt, zone.delivery_type === 'same_day' && s.optActive]} onPress={() => setZone({ ...zone, delivery_type: 'same_day' })}><Text style={[s.optText, zone.delivery_type === 'same_day' && s.optTextActive]}>Same-Day</Text></TouchableOpacity>
              <TouchableOpacity style={[s.opt, zone.delivery_type === 'standard' && s.optActive]} onPress={() => setZone({ ...zone, delivery_type: 'standard' })}><Text style={[s.optText, zone.delivery_type === 'standard' && s.optTextActive]}>Standard</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={s.saveBtn} onPress={addZone}><Text style={s.saveText}>Add Zone</Text></TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 }, title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  section: { fontSize: 14, fontWeight: '700', color: '#0A0A0A', marginTop: 16, marginBottom: 8 },
  box: { backgroundColor: 'white', padding: 14, borderRadius: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 4 },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  addZoneBtn: { backgroundColor: '#8833FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addZoneText: { color: 'white', fontSize: 12, fontWeight: '700' },
  zoneCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8 },
  zoneName: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  zoneInfo: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  zonePrice: { fontSize: 12, fontWeight: '700', color: '#8833FF', marginTop: 2 },
  opt: { flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', padding: 10, borderRadius: 10, alignItems: 'center' },
  optActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  optText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  optTextActive: { color: 'white' },
  saveBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
