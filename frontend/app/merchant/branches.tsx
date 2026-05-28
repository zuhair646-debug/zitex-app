import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantBranches() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', address: '', lat: '24.7136', lng: '46.6753', phone: '', open_hours: '9:00 AM - 11:00 PM', published: true });

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/branches'); setBranches(d); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ name: '', address: '', lat: '24.7136', lng: '46.6753', phone: '', open_hours: '9:00 AM - 11:00 PM', published: true }); setModal(true); };
  const openEdit = (b: any) => { setEditing(b); setForm({ ...b, lat: String(b.lat), lng: String(b.lng) }); setModal(true); };

  const save = async () => {
    if (!form.name || !form.lat || !form.lng) { Alert.alert('Required', 'Name, lat, lng required'); return; }
    try {
      const body = { ...form, lat: parseFloat(form.lat), lng: parseFloat(form.lng) };
      if (editing) await apiCall(`/api/merchant/branches/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiCall('/api/merchant/branches', { method: 'POST', body: JSON.stringify(body) });
      setModal(false); load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const del = (id: string, n: string) => Alert.alert('Delete?', `Delete "${n}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/branches/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('Error', e.message); } } }]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Branches ({branches.length})</Text>
        <TouchableOpacity onPress={openCreate} style={s.addBtn}><Ionicons name="add" size="22" color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {branches.length === 0 && <Text style={s.empty}>No branches yet. Tap + to add.</Text>}
          {branches.map(b => (
            <View key={b.id} style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{b.name}</Text>
                <Text style={s.addr}>{b.address}</Text>
                <Text style={s.coords}>{b.lat}, {b.lng}</Text>
                <Text style={s.hours}>{b.open_hours}</Text>
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity onPress={() => openEdit(b)}><Ionicons name="create-outline" size="22" color="#3B82F6" /></TouchableOpacity>
                <TouchableOpacity onPress={() => del(b.id, b.name)}><Ionicons name="trash-outline" size="22" color="#EF4444" /></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      }
      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size="24" color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>{editing ? 'Edit' : 'New'} Branch</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>Branch Name *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={t => setForm({ ...form, name: t })} placeholder="Main Branch - Riyadh" />
            <Text style={s.label}>Address</Text>
            <TextInput style={s.input} value={form.address} onChangeText={t => setForm({ ...form, address: t })} placeholder="King Fahd Rd..." />
            <Text style={s.label}>Latitude *</Text>
            <TextInput style={s.input} keyboardType="numeric" value={form.lat} onChangeText={t => setForm({ ...form, lat: t })} placeholder="24.7136" />
            <Text style={s.label}>Longitude *</Text>
            <TextInput style={s.input} keyboardType="numeric" value={form.lng} onChangeText={t => setForm({ ...form, lng: t })} placeholder="46.6753" />
            <Text style={s.hint}>Get coordinates from Google Maps: right-click on location → copy coordinates</Text>
            <Text style={s.label}>Phone</Text>
            <TextInput style={s.input} value={form.phone} onChangeText={t => setForm({ ...form, phone: t })} keyboardType="phone-pad" />
            <Text style={s.label}>Opening Hours</Text>
            <TextInput style={s.input} value={form.open_hours} onChangeText={t => setForm({ ...form, open_hours: t })} />
            <View style={s.toggle}><Text style={s.toggleLbl}>Published</Text><Switch value={!!form.published} onValueChange={v => setForm({ ...form, published: v })} /></View>
            <TouchableOpacity style={s.saveBtn} onPress={save}><Text style={s.saveText}>Save Branch</Text></TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 }, title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  addr: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  coords: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  hours: { fontSize: 11, color: '#10B981', marginTop: 2 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 10, marginTop: 8 },
  toggleLbl: { fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
