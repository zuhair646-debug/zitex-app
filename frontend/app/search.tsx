import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

const { width } = Dimensions.get('window');
const CARD_W = (width - 56) / 2;

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; categoryName?: string; condition?: string }>();
  const { apiCall } = useAuth();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState(params.category || '');
  const [conditionFilter, setConditionFilter] = useState(params.condition || '');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    apiCall('/api/categories').then(setCategories).catch(() => {});
    searchProducts();
  }, []);

  const searchProducts = async (cat?: string) => {
    setLoading(true);
    try {
      let url = '/api/products?limit=30';
      if (query) url += `&search=${encodeURIComponent(query)}`;
      const catId = cat !== undefined ? cat : selectedCat;
      if (catId) url += `&category=${catId}`;
      if (conditionFilter) url += `&condition=${conditionFilter}`;
      const data = await apiCall(url);
      // Client-side fallback filter on condition (in case backend doesn't filter)
      const filtered = conditionFilter ? (data.products || []).filter((p: any) => p.condition === conditionFilter) : (data.products || []);
      setProducts(filtered);
      setTotal(conditionFilter ? filtered.length : (data.total || filtered.length));
    } catch (e) { console.log(e); } finally { setLoading(false); }
  };

  const selectCategory = (catId: string) => {
    const newCat = selectedCat === catId ? '' : catId;
    setSelectedCat(newCat);
    searchProducts(newCat);
  };

  const catIcons: Record<string, string> = { 'Phones': 'phone-portrait', 'Tablets': 'tablet-portrait', 'Laptops': 'laptop', 'Accessories': 'headset', 'Smartwatches': 'watch', 'Gaming': 'game-controller' };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="search-back-btn" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color="#A1A1AA" />
          <TextInput testID="search-input" style={styles.searchInput} placeholder="Search products..." placeholderTextColor="#A1A1AA"
            value={query} onChangeText={setQuery} onSubmitEditing={() => searchProducts()} returnKeyType="search" />
          {query ? (
            <TouchableOpacity testID="clear-search-btn" onPress={() => { setQuery(''); searchProducts(); }}>
              <Ionicons name="close-circle" size={20} color="#A1A1AA" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Categories Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
        <TouchableOpacity testID="filter-all" style={[styles.catPill, !selectedCat && styles.catPillActive]} onPress={() => selectCategory('')}>
          <Text style={[styles.catPillText, !selectedCat && styles.catPillTextActive]}>All</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity testID={`filter-cat-${c.id}`} key={c.id} style={[styles.catPill, selectedCat === c.id && styles.catPillActive]} onPress={() => selectCategory(c.id)}>
            <Ionicons name={(catIcons[c.name_en] || 'grid') as any} size={16} color={selectedCat === c.id ? '#FFF' : '#52525B'} />
            <Text style={[styles.catPillText, selectedCat === c.id && styles.catPillTextActive]}>{c.name_en}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.resultCount}>{total} results</Text>

      {loading ? (
        <View style={styles.loadWrap}><ActivityIndicator size="large" color="#8833FF" /></View>
      ) : products.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search" size={48} color="#A1A1AA" />
          <Text style={styles.emptyText}>No results found</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
          {products.map((p) => (
            <TouchableOpacity testID={`search-product-${p.id}`} key={p.id} style={styles.productCard}
              onPress={() => router.push(`/product/${p.id}`)}>
              <Image source={{ uri: p.images?.[0] }} style={styles.productImg} />
              {!!p.discount_price && <View style={styles.discBadge}><Text style={styles.discText}>خصم</Text></View>}
              {p.condition !== 'new' && <View style={styles.usedBadge}><Text style={styles.usedText}>مستعمل</Text></View>}
              <Text style={styles.productName} numberOfLines={2}>{p.name_en}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color="#FACC15" />
                <Text style={styles.ratingVal}>{p.rating}</Text>
              </View>
              <Text style={styles.price}>{p.discount_price || p.price} ر.س</Text>
              {!!p.discount_price && <Text style={styles.oldPrice}>{p.price} ر.س</Text>}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9FB', borderRadius: 12, paddingHorizontal: 14, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#0A0A0A' },
  catScroll: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, backgroundColor: '#F9F9FB', borderWidth: 1, borderColor: '#E4E4E7' },
  catPillActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  catPillText: { fontSize: 13, fontWeight: '600', color: '#52525B' },
  catPillTextActive: { color: '#FFFFFF' },
  resultCount: { paddingHorizontal: 20, paddingVertical: 6, fontSize: 13, color: '#A1A1AA' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 16, color: '#52525B' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 16, paddingBottom: 32 },
  productCard: { width: CARD_W, backgroundColor: '#FFF', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#F4F4F5' },
  productImg: { width: '100%', height: CARD_W - 24, borderRadius: 12, backgroundColor: '#F9F9FB', marginBottom: 8 },
  discBadge: { position: 'absolute', top: 16, left: 16, backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  usedBadge: { position: 'absolute', top: 16, right: 16, backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  usedText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  productName: { fontSize: 13, fontWeight: '600', color: '#0A0A0A', marginBottom: 4, lineHeight: 20 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  ratingVal: { fontSize: 12, fontWeight: '600', color: '#0A0A0A' },
  price: { fontSize: 15, fontWeight: '800', color: '#8833FF' },
  oldPrice: { fontSize: 11, color: '#A1A1AA', textDecorationLine: 'line-through' },
});
