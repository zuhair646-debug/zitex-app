import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from './_layout';

export default function SetupLocation() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [nearest, setNearest] = useState<any>(null);

  const getMyLocation = async () => {
    setLoading(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Permission', 'Location permission required'); setLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({});
      setLat(String(loc.coords.latitude.toFixed(6)));
      setLng(String(loc.coords.longitude.toFixed(6)));
      // Reverse geocode
      const r = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (r[0]) setAddress([r[0].name, r[0].street, r[0].district, r[0].city, r[0].region].filter(Boolean).join(', '));
      // Find nearest branch
      try { const nb = await apiCall(`/api/branches/nearest?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`); setNearest(nb); } catch {}
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  const save = async () => {
    if (!lat || !lng) { Alert.alert('Required', 'Please set your location first'); return; }
    try {
      await apiCall('/api/users/me/location', { method: 'PUT', body: JSON.stringify({ lat: parseFloat(lat), lng: parseFloat(lng), address }) });
      Alert.alert('Saved', 'Your location is saved', [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.hero}>
        <Ionicons name="location" size="48" color="white" />
        <Text style={s.heroTitle}>Set Your Location</Text>
        <Text style={s.heroSub}>We need your location to calculate accurate delivery fees and find the nearest branch</Text>
      </View>
      <View style={s.body}>
        <TouchableOpacity style={s.gpsBtn} onPress={getMyLocation} disabled={loading}>
          {loading ? <ActivityIndicator color="white" /> : <><Ionicons name="navigate" size="20" color="white" /><Text style={s.gpsBtnText}>Use My Current Location</Text></>}
        </TouchableOpacity>
        <Text style={s.divider}>OR enter manually</Text>
        <Text style={s.label}>Latitude</Text>
        <TextInput style={s.input} keyboardType="numeric" value={lat} onChangeText={setLat} placeholder="24.7136" />
        <Text style={s.label}>Longitude</Text>
        <TextInput style={s.input} keyboardType="numeric" value={lng} onChangeText={setLng} placeholder="46.6753" />
        <Text style={s.label}>Address (auto-filled)</Text>
        <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="Street, District, City" />
        {nearest?.branch && (
          <View style={s.branchInfo}>
            <Ionicons name="storefront" size="20" color="#10B981" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.branchName}>Nearest: {nearest.branch.name}</Text>
              <Text style={s.branchDist}>{nearest.distance_km} km away</Text>
            </View>
          </View>
        )}
        <TouchableOpacity style={s.saveBtn} onPress={save}><Text style={s.saveText}>Save Location</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  hero: { backgroundColor: '#8833FF', padding: 32, alignItems: 'center' },
  heroTitle: { color: 'white', fontSize: 22, fontWeight: '800', marginTop: 12 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginTop: 8 },
  body: { padding: 20 },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', padding: 16, borderRadius: 12 },
  gpsBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
  divider: { textAlign: 'center', color: '#9CA3AF', marginVertical: 16, fontSize: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  branchInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5', padding: 12, borderRadius: 10, marginTop: 16 },
  branchName: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  branchDist: { fontSize: 11, color: '#047857' },
  saveBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
