import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from './_layout';
import ZitexMap from '../src/components/MapView';
import { TX, tSync } from '../src/useAutoT';
import { useT, curLang } from '../src/i18n';
import { colors, themed } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';

export default function SetupLocation() {
  useTheme(); // re-render when the app theme changes
  const { lang } = useT();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [lat, setLat] = useState<number>(24.7136);
  const [lng, setLng] = useState<number>(46.6753);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [nearest, setNearest] = useState<any>(null);
  const [hasLocation, setHasLocation] = useState(false);

  const getMyLocation = async () => {
    setLoading(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert(tSync('صلاحية الموقع', lang), tSync('نحتاج إذنك للوصول إلى موقعك لحساب رسوم التوصيل بدقة', curLang())); setLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({});
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      setHasLocation(true);
      try {
        const r = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (r[0]) setAddress([r[0].name, r[0].street, r[0].district, r[0].city, r[0].region].filter(Boolean).join(', '));
      } catch {}
      try { const nb = await apiCall(`/api/branches/nearest?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`); setNearest(nb); } catch {}
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); } finally { setLoading(false); }
  };

  const onMapTap = useCallback(async (newLat: number, newLng: number) => {
    setLat(newLat); setLng(newLng); setHasLocation(true);
    try {
      const r = await Location.reverseGeocodeAsync({ latitude: newLat, longitude: newLng });
      if (r[0]) setAddress([r[0].name, r[0].street, r[0].district, r[0].city, r[0].region].filter(Boolean).join(', '));
    } catch {}
    try { const nb = await apiCall(`/api/branches/nearest?lat=${newLat}&lng=${newLng}`); setNearest(nb); } catch {}
  }, []);

  const save = async () => {
    if (!hasLocation) { Alert.alert(tSync('مطلوب', lang), tSync('يرجى تحديد موقعك على الخريطة أولاً', curLang())); return; }
    try {
      await apiCall('/api/users/me/location', { method: 'PUT', body: JSON.stringify({ lat, lng, address }) });
      Alert.alert(tSync('تم الحفظ', lang), tSync('تم حفظ موقعك بنجاح', curLang()), [{ text: tSync('ممتاز', curLang()), onPress: () => router.replace('/(tabs)') }]);
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <TX style={s.headerTitle}>تحديد موقعك</TX>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={s.hero}>
          <Ionicons name="location" size={36} color="white" />
          <TX style={s.heroTitle}>أين تريد التوصيل؟</TX>
          <TX style={s.heroSub}>اضغط على الخريطة لتحديد موقعك بدقة</TX>
        </View>

        <View style={{ padding: 12 }}>
          <ZitexMap mode="picker" initialLat={lat} initialLng={lng} onLocationChange={onMapTap} height={360} />
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <TouchableOpacity style={s.gpsBtn} onPress={getMyLocation} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <><Ionicons name="navigate" size={18} color="white" /><TX style={s.gpsBtnText}>استخدم موقعي الحالي (GPS)</TX></>}
          </TouchableOpacity>

          {hasLocation && (
            <View style={s.coordBox}>
              <Ionicons name="pin" size={16} color={colors.brand} />
              <Text style={s.coordText}>{lat.toFixed(5)}, {lng.toFixed(5)}</Text>
            </View>
          )}

          <TX style={s.label}>العنوان التفصيلي</TX>
          <TextInput
            style={s.input}
            value={address}
            onChangeText={setAddress}
            placeholder={tSync("مثل: شارع الملك فهد، حي العليا، الرياض", lang)}
            multiline
            numberOfLines={2}
          />

          {nearest?.branch && (
            <View style={s.branchInfo}>
              <Ionicons name="storefront" size={20} color="#10B981" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.branchName}>{tSync('أقرب فرع:', lang)} {nearest.branch.name}</Text>
                <Text style={s.branchDist}>{tSync('على بعد', lang)} {nearest.distance_km} {tSync('كم', lang)}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity style={[s.saveBtn, !hasLocation && { opacity: 0.5 }]} onPress={save} disabled={!hasLocation}>
            <TX style={s.saveText}>حفظ الموقع</TX>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.onSurface },
  hero: { backgroundColor: colors.brand, padding: 20, alignItems: 'center' },
  heroTitle: { color: 'white', fontSize: 20, fontWeight: '900', marginTop: 8 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center', marginTop: 4 },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', padding: 14, borderRadius: 12 },
  gpsBtnText: { color: 'white', fontWeight: '800', fontSize: 14 },
  coordBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brandTertiary, padding: 10, borderRadius: 10, marginTop: 10, justifyContent: 'center' },
  coordText: { fontSize: 12, color: colors.brand, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: colors.onSurfaceSecondary, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: colors.surface, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, textAlign: 'right' },
  branchInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5', padding: 12, borderRadius: 10, marginTop: 14 },
  branchName: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  branchDist: { fontSize: 11, color: '#047857' },
  saveBtn: { backgroundColor: colors.brand, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 18 },
  saveText: { color: 'white', fontWeight: '800', fontSize: 15 },
}));
