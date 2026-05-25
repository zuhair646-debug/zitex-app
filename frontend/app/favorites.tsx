import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function FavoritesScreen() {
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

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="fav-back" style={s.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Favorites</Text>
        <Text style={s.count}>{favs.length} items</Text>
      </View>
      {favs.length === 0 ? (
        <View style={s.empty}><Ionicons name="heart-outline" size={48} color="#A1A1AA" /><Text style={s.emptyTitle}>No favorites yet</Text><Text style={s.emptyDesc}>Products you like will appear here</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {favs.map(p => (
            <TouchableOpacity key={p.id} testID={`fav-${p.id}`} style={s.card} onPress={() => router.push(`/product/${p.id}`)}>
              <Image source={{ uri: p.images?.[0] }} style={s.img} />
              <View style={s.info}><Text style={s.name} numberOfLines={1}>{p.name_en}</Text><Text style={s.price}>{p.discount_price || p.price} SAR</Text></View>
              <TouchableOpacity testID={`unfav-${p.id}`} onPress={() => removeFav(p.id)}><Ionicons name="heart" size={22} color="#EF4444" /></TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' }, load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#0A0A0A' }, count: { fontSize: 14, color: '#A1A1AA' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' }, emptyDesc: { fontSize: 14, color: '#52525B' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#F9F9FB', borderRadius: 14, marginBottom: 10 },
  img: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#FFF', marginEnd: 12 },
  info: { flex: 1 }, name: { fontSize: 14, fontWeight: '600', color: '#0A0A0A', marginBottom: 4 },
  price: { fontSize: 15, fontWeight: '800', color: '#8833FF' },
});
