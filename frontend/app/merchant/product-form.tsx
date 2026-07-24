import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Switch, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function ProductForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { apiCall } = useAuth();
  const [cats, setCats] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({
    name_ar: '', name_en: '', description_ar: '', description_en: '',
    category_id: '', brand_id: '', price: '', discount_price: '',
    condition: 'new', images: [''], in_stock: true, featured: false, published: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const [c, b] = await Promise.all([apiCall('/api/categories'), apiCall('/api/brands')]);
        setCats(c); setBrands(b);
        if (id) {
          const p = await apiCall(`/api/products/${id}`);
          setData({ ...p, price: String(p.price), discount_price: p.discount_price ? String(p.discount_price) : '', images: p.images?.length ? p.images : [''] });
        }
      } catch (e: any) { Alert.alert('Error', e.message); }
    })();
  }, []);

  const submit = async () => {
    if (!data.name_ar || !data.price) { Alert.alert('Required', 'Name (AR) and Price are required'); return; }
    setLoading(true);
    try {
      const body = { ...data, price: parseFloat(data.price), discount_price: data.discount_price ? parseFloat(data.discount_price) : null, images: data.images.filter((x: string) => x.trim()) };
      if (id) await apiCall(`/api/merchant/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiCall('/api/merchant/products', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('Success', `Product ${id ? 'updated' : 'created'}`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="pf-back" onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>{id ? 'Edit Product' : 'New Product'}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.label}>Name (Arabic) *</Text>
        <TextInput testID="name-ar" style={s.input} value={data.name_ar} onChangeText={t => setData({ ...data, name_ar: t })} placeholder="اسم المنتج" />
        <Text style={s.label}>Name (English)</Text>
        <TextInput testID="name-en" style={s.input} value={data.name_en} onChangeText={t => setData({ ...data, name_en: t })} placeholder="Product name" />
        <Text style={s.label}>Description (Arabic)</Text>
        <TextInput style={[s.input, { height: 80 }]} multiline value={data.description_ar} onChangeText={t => setData({ ...data, description_ar: t })} />
        <Text style={s.label}>Price (SAR) *</Text>
        <TextInput testID="price" style={s.input} keyboardType="numeric" value={data.price} onChangeText={t => setData({ ...data, price: t })} placeholder="999" />
        <Text style={s.label}>Discount Price (optional)</Text>
        <TextInput style={s.input} keyboardType="numeric" value={data.discount_price} onChangeText={t => setData({ ...data, discount_price: t })} placeholder="799" />
        <Text style={s.label}>Image URL</Text>
        <TextInput testID="image" style={s.input} value={data.images[0]} onChangeText={t => setData({ ...data, images: [t] })} placeholder="https://..." autoCapitalize="none" />
        <Text style={s.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {cats.map(c => (
            <TouchableOpacity key={c.id} onPress={() => setData({ ...data, category_id: c.id })} style={[s.chip, data.category_id === c.id && s.chipActive]}>
              <Text style={[s.chipText, data.category_id === c.id && s.chipTextActive]}>{c.name_en}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={s.label}>Brand</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {brands.map(b => (
            <TouchableOpacity key={b.id} onPress={() => setData({ ...data, brand_id: b.id })} style={[s.chip, data.brand_id === b.id && s.chipActive]}>
              <Text style={[s.chipText, data.brand_id === b.id && s.chipTextActive]}>{b.name_en}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={s.toggle}><Text style={s.toggleLabel}>In Stock</Text><Switch value={data.in_stock} onValueChange={v => setData({ ...data, in_stock: v })} /></View>
        <View style={s.toggle}><Text style={s.toggleLabel}>Featured</Text><Switch value={data.featured} onValueChange={v => setData({ ...data, featured: v })} /></View>
        <View style={s.toggle}><Text style={s.toggleLabel}>Published</Text><Switch value={data.published} onValueChange={v => setData({ ...data, published: v })} /></View>
        <TouchableOpacity testID="submit" style={s.submitBtn} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={s.submitText}>{id ? 'Update Product' : 'Create Product'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8 },
  chipActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: 'white', fontWeight: '600' },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 10, marginTop: 8 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  submitBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
