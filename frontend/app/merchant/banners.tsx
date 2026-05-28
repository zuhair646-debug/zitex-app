import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantBanners() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<any>({ title_ar: '', title_en: '', image: '', type: 'normal', published: true, order: 1 });

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/banners'); setBanners(d); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.image) { Alert.alert('Required', 'Image URL required'); return; }
    try { await apiCall('/api/merchant/banners', { method: 'POST', body: JSON.stringify({ ...form, order: parseInt(form.order) || 1 }) }); setForm({ title_ar: '', title_en: '', image: '', type: 'normal', published: true, order: 1 }); setModalOpen(false); load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const del = (id: string) => Alert.alert('Delete Banner?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/banners/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('Error', e.message); } } }]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Banners ({banners.length})</Text>
        <TouchableOpacity testID="add-banner" onPress={() => setModalOpen(true)} style={s.addBtn}><Ionicons name="add" size="22" color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {banners.map(b => (
            <View key={b.id} style={s.card}>
              <Image source={{ uri: b.image }} style={s.img} />
              <View style={s.cardBody}>
                <Text style={s.bTitle}>{b.title_ar || b.title_en || 'Banner'}</Text>
                <TouchableOpacity onPress={() => del(b.id)}><Ionicons name="trash-outline" size="22" color="#EF4444" /></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      }
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModalOpen(false)}><Ionicons name="close" size="24" color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>New Banner</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>Image URL *</Text>
            <TextInput style={s.input} value={form.image} onChangeText={t => setForm({ ...form, image: t })} placeholder="https://..." autoCapitalize="none" />
            <Text style={s.label}>Title (Arabic)</Text>
            <TextInput style={s.input} value={form.title_ar} onChangeText={t => setForm({ ...form, title_ar: t })} />
            <Text style={s.label}>Title (English)</Text>
            <TextInput style={s.input} value={form.title_en} onChangeText={t => setForm({ ...form, title_en: t })} />
            <Text style={s.label}>Order</Text>
            <TextInput style={s.input} keyboardType="numeric" value={String(form.order)} onChangeText={t => setForm({ ...form, order: t })} />
            <TouchableOpacity style={s.saveBtn} onPress={save}><Text style={s.saveText}>Save Banner</Text></TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: 'white', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  img: { width: '100%', height: 120, backgroundColor: '#F3F4F6' },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  bTitle: { fontSize: 14, fontWeight: '600', color: '#0A0A0A', flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  saveBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
