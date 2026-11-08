/** Merchant › Categories: real photos for the home-page category tiles (replaceable anytime). */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../_layout';
import { uploadMedia, mediaUrlSync } from '../../src/utils/upload';
import { tSync } from '../../src/useAutoT';
import { curLang } from '../../src/i18n';
import { notify } from '../../src/utils/notify';
import { colors } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';

const isPhoto = (v?: string) => /^(https?:|\/api\/)/.test(v || '');

export default function MerchantCategories() {
  const { themeKey } = useTheme();
  const s = useMemo(() => makeStyles(), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable
  const router = useRouter();
  const { apiCall } = useAuth();
  const L = (x: string) => tSync(x, curLang());
  const [cats, setCats] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => apiCall('/api/merchant/categories').then(setCats).catch((e: any) => notify(L('خطأ'), e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load once

  const changePhoto = async (c: any) => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!r.granted) return notify(L('الصلاحية مطلوبة'), L('اسمح بالوصول للصور لاختيار صورة القسم'));
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled) return;
    setBusy(c.id);
    try {
      const up = await uploadMedia(res.assets[0].uri, res.assets[0].fileName || 'category.jpg', res.assets[0].mimeType || 'image/jpeg');
      const { id, _id, ...rest } = c;
      await apiCall(`/api/merchant/categories/${c.id}`, { method: 'PUT', body: JSON.stringify({ ...rest, image: up.path }) });
      load();
    } catch (e: any) { notify(L('خطأ'), e.message); } finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}><Ionicons name="chevron-forward" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={s.title}>{L('الأقسام وصورها')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={s.hint}>{L('اضغط على أي قسم لتغيير صورته — تظهر مباشرة في الصفحة الرئيسية للعملاء')}</Text>
      <ScrollView contentContainerStyle={s.grid}>
        {cats.map(c => (
          <TouchableOpacity key={c.id} testID={`cat-edit-${c.id}`} style={s.card} onPress={() => changePhoto(c)} disabled={!!busy}>
            <View style={s.photo}>
              {isPhoto(c.image) ? <Image source={{ uri: mediaUrlSync(c.image) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={{ fontSize: 34 }}>{c.image || '📦'}</Text>}
              {busy === c.id ? <View style={s.overlay}><ActivityIndicator color="#FFFFFF" /></View> : null}
            </View>
            <Text style={s.name} numberOfLines={1}>{c.name_ar || c.name_en}</Text>
            <View style={s.change}><Ionicons name="camera" size={14} color={colors.brand} /><Text style={s.changeTxt}>{L('تغيير الصورة')}</Text></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.onSurfaceSecondary, fontSize: 13, paddingHorizontal: 20, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingBottom: 40 },
  card: { width: '47%', backgroundColor: colors.surface, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: colors.border },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.onSurface, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  change: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4, minHeight: 28 },
  changeTxt: { color: colors.brand, fontSize: 12, fontWeight: '700' },
});
