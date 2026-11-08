import { tSync } from '../src/useAutoT';
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';
import TranslatableName from '../src/components/TranslatableName';
import { colors, themed } from '../src/theme/tokens';

export default function FavoritesScreen() {
  const { lang } = useT();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [favs, setFavs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => { try { const d = await apiCall('/api/favorites'); setFavs(d); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const removeFav = async (productId: string) => {
    await apiCall(`/api/favorites/${productId}`, { method: 'POST' });
    load();
  };

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="fav-back" style={s.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={s.title}>{tSync('المفضلة', lang)}</Text>
        <Text style={s.count}>{favs.length} {tSync('منتج', lang)}</Text>
      </View>
      {favs.length === 0 ? (
        <View style={s.empty}><Ionicons name="heart-outline" size={48} color={colors.onSurfaceTertiary} /><Text style={s.emptyTitle}>{tSync('ما أضفت أي مفضلة لحد الآن', lang)}</Text><Text style={s.emptyDesc}>{tSync('المنتجات اللي عجبتك تظهر هنا', lang)}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {favs.map(p => (
            <TouchableOpacity key={p.id} testID={`fav-${p.id}`} style={s.card} onPress={() => router.push(`/product/${p.id}`)}>
              <Image source={{ uri: p.images?.[0] }} style={s.img} />
              <View style={s.info}>
                <TranslatableName
                  text={lang === 'ar' ? (p.name_ar || p.name_en) : (p.name_en || p.name_ar)}
                  sourceLang={lang === 'ar' ? 'ar' : 'en'}
                  style={s.name}
                  numberOfLines={1}
                  iconSize={11}
                />
                <Text style={s.price}>{p.discount_price || p.price} {tSync('ر.س', lang)}</Text>
              </View>
              <TouchableOpacity testID={`unfav-${p.id}`} onPress={() => removeFav(p.id)}><Ionicons name="heart" size={22} color="#EF4444" /></TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.onSurface }, count: { fontSize: 14, color: colors.onSurfaceTertiary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface }, emptyDesc: { fontSize: 14, color: colors.onSurfaceSecondary },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.background, borderRadius: 14, marginBottom: 10 },
  img: { width: 60, height: 60, borderRadius: 10, backgroundColor: colors.surface, marginEnd: 12 },
  info: { flex: 1 }, name: { fontSize: 14, fontWeight: '600', color: colors.onSurface, marginBottom: 4 },
  price: { fontSize: 15, fontWeight: '800', color: colors.brand },
}));
