import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, Modal, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantServices() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', desc: '', price: '', warranty_days: '90', icon: 'construct', color: '#8833FF', published: true, warranty_available: true });

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/services'); setServices(d); } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ name: '', desc: '', price: '', warranty_days: '90', icon: 'construct', color: '#8833FF', published: true, warranty_available: true }); setModalOpen(true); };
  const openEdit = (sv: any) => { setEditing(sv); setForm({ ...sv, price: String(sv.price), warranty_days: String(sv.warranty_days || 0) }); setModalOpen(true); };

  const save = async () => {
    if (!form.name || !form.price) { Alert.alert('Required', 'Name and price required'); return; }
    try {
      const body = { ...form, price: parseFloat(form.price), warranty_days: parseInt(form.warranty_days) || 0, inspection_price: 0, turnaround: '1-2 Days', delivery_available: true, home_pickup: true };
      if (editing) await apiCall(`/api/merchant/services/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiCall('/api/merchant/services', { method: 'POST', body: JSON.stringify(body) });
      setModalOpen(false); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const del = (id: string, name: string) => {
    Alert.alert('حذف', `حذف "${name}"؟`, [{ text: 'إلغاء', style: 'cancel' }, { text: 'حذف', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/services/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('خطأ', e.message); } } }]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Services ({services.length})</Text>
        <TouchableOpacity testID="add-svc" onPress={openCreate} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {services.map(sv => (
            <View key={sv.id} style={s.card}>
              <View style={[s.iconBox, { backgroundColor: sv.color + '20' }]}><Ionicons name={sv.icon} size={24} color={sv.color} /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.name}>{sv.name}</Text>
                <Text style={s.desc} numberOfLines={1}>{sv.desc}</Text>
                <Text style={s.price}>{sv.price} SAR</Text>
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity onPress={() => openEdit(sv)}><Ionicons name="create-outline" size={22} color="#3B82F6" /></TouchableOpacity>
                <TouchableOpacity onPress={() => del(sv.id, sv.name)}><Ionicons name="trash-outline" size={22} color="#EF4444" /></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      }
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModalOpen(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>{editing ? 'Edit' : 'New'} Service</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>Service Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={t => setForm({ ...form, name: t })} placeholder="Screen Repair" />
            <Text style={s.label}>Description</Text>
            <TextInput style={[s.input, { height: 80 }]} multiline value={form.desc} onChangeText={t => setForm({ ...form, desc: t })} />
            <Text style={s.label}>Price (SAR) *</Text>
            <TextInput style={s.input} keyboardType="numeric" value={form.price} onChangeText={t => setForm({ ...form, price: t })} />
            <Text style={s.label}>Warranty Days</Text>
            <TextInput style={s.input} keyboardType="numeric" value={form.warranty_days} onChangeText={t => setForm({ ...form, warranty_days: t })} />
            <View style={s.toggle}><Text style={s.toggleLbl}>Warranty Available</Text><Switch value={form.warranty_available} onValueChange={v => setForm({ ...form, warranty_available: v })} /></View>
            <View style={s.toggle}><Text style={s.toggleLbl}>Published</Text><Switch value={form.published} onValueChange={v => setForm({ ...form, published: v })} /></View>
            <TouchableOpacity style={s.saveBtn} onPress={save}><Text style={s.saveText}>Save</Text></TouchableOpacity>
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
  card: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
  iconBox: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  desc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  price: { fontSize: 14, color: '#8833FF', fontWeight: '700', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 10, marginTop: 8 },
  toggleLbl: { fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
