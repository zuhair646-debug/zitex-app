import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantProducts() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/products'); setProducts(d); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Product', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiCall(`/api/merchant/products/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('Error', e.message); }
      }}
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="prod-back" onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Products ({products.length})</Text>
        <TouchableOpacity testID="add-prod" onPress={() => router.push('/merchant/product-form')} style={s.addBtn}><Ionicons name="add" size="22" color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {products.map(p => (
            <View key={p.id} style={s.card}>
              <Image source={{ uri: p.images?.[0] || 'https://via.placeholder.com/100' }} style={s.img} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.name} numberOfLines={1}>{p.name_ar || p.name_en}</Text>
                <Text style={s.price}>{p.discount_price || p.price} SAR</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <View style={[s.badge, p.in_stock ? s.badgeOk : s.badgeBad]}><Text style={[s.badgeText, p.in_stock ? s.badgeTextOk : s.badgeTextBad]}>{p.in_stock ? 'In Stock' : 'Out'}</Text></View>
                  {p.featured && <View style={[s.badge, { backgroundColor: '#FEF3C7' }]}><Text style={[s.badgeText, { color: '#92400E' }]}>Featured</Text></View>}
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity testID={`edit-${p.id}`} onPress={() => router.push({ pathname: '/merchant/product-form', params: { id: p.id } })}><Ionicons name="create-outline" size="22" color="#3B82F6" /></TouchableOpacity>
                <TouchableOpacity testID={`del-${p.id}`} onPress={() => handleDelete(p.id, p.name_ar || p.name_en)}><Ionicons name="trash-outline" size="22" color="#EF4444" /></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  img: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#F3F4F6' },
  name: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  price: { fontSize: 14, color: '#8833FF', fontWeight: '700', marginTop: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeOk: { backgroundColor: '#D1FAE5' },
  badgeBad: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 10, fontWeight: '600' },
  badgeTextOk: { color: '#065F46' },
  badgeTextBad: { color: '#991B1B' },
});
