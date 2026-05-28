import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Switch, Alert, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const TYPES = [
  { id: 'general', name: 'General Draw', icon: 'people', desc: 'Any registered user can join' },
  { id: 'qa', name: 'Q&A Quiz', icon: 'help-circle', desc: 'Users who answer correctly enter' },
  { id: 'purchase', name: 'Purchase Required', icon: 'cart', desc: 'Users who buy a product enter' },
  { id: 'signup', name: 'App Signup', icon: 'person-add', desc: 'Every new user enters automatically' },
];

export default function CompetitionForm() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', phone: '', password: '', email: '' });
  const [data, setData] = useState<any>({
    title: '', description: '', prize: '', prize_count: '1',
    competition_type: 'general',
    question: '', correct_answer: '',
    spend_requirement: '0',
    start_date: '', end_date: '', draw_date: '',
    max_participants: '1000',
    chamber_supervised: false, permit_number: '', assigned_chamber_employee_id: '',
    cover_image: '',
  });

  const loadEmps = async () => { try { const r = await apiCall('/api/merchant/chamber-employees'); setEmployees(r); } catch {} };
  useEffect(() => { loadEmps(); }, []);

  const createEmp = async () => {
    if (!newEmp.name || !newEmp.phone || !newEmp.password) { Alert.alert('Required', 'Name, phone, password required'); return; }
    try {
      const r = await apiCall('/api/merchant/chamber-employees', { method: 'POST', body: JSON.stringify(newEmp) });
      Alert.alert('Success', `Employee created. ID: ${r.id}`);
      setShowEmpModal(false); setNewEmp({ name: '', phone: '', password: '', email: '' });
      loadEmps();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const submit = async () => {
    if (!data.title || !data.prize) { Alert.alert('Required', 'Title and prize required'); return; }
    if (data.competition_type === 'qa' && (!data.question || !data.correct_answer)) { Alert.alert('Required', 'Question and answer required for Q&A type'); return; }
    if (data.chamber_supervised && (!data.permit_number || !data.assigned_chamber_employee_id)) { Alert.alert('Required', 'Permit number and chamber employee required'); return; }
    setLoading(true);
    try {
      const body = { ...data, prize_count: parseInt(data.prize_count) || 1, spend_requirement: parseFloat(data.spend_requirement) || 0, max_participants: parseInt(data.max_participants) || 1000 };
      await apiCall('/api/merchant/competitions', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('Success', 'Competition published', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>New Competition</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.sectionTitle}>Type *</Text>
        <View style={s.typeGrid}>
          {TYPES.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setData({ ...data, competition_type: t.id })} style={[s.typeCard, data.competition_type === t.id && s.typeCardActive]}>
              <Ionicons name={t.icon as any} size="22" color={data.competition_type === t.id ? 'white' : '#8833FF'} />
              <Text style={[s.typeName, data.competition_type === t.id && { color: 'white' }]}>{t.name}</Text>
              <Text style={[s.typeDesc, data.competition_type === t.id && { color: 'white' }]}>{t.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Title *</Text>
        <TextInput style={s.input} value={data.title} onChangeText={t => setData({ ...data, title: t })} placeholder="Eid Special Draw" />
        <Text style={s.label}>Description</Text>
        <TextInput style={[s.input, { height: 80 }]} multiline value={data.description} onChangeText={t => setData({ ...data, description: t })} />
        <Text style={s.label}>Prize *</Text>
        <TextInput style={s.input} value={data.prize} onChangeText={t => setData({ ...data, prize: t })} placeholder="iPhone 16 Pro" />
        <Text style={s.label}>Number of Winners</Text>
        <TextInput style={s.input} keyboardType="numeric" value={data.prize_count} onChangeText={t => setData({ ...data, prize_count: t })} />
        <Text style={s.label}>Cover Image URL</Text>
        <TextInput style={s.input} value={data.cover_image} onChangeText={t => setData({ ...data, cover_image: t })} placeholder="https://..." autoCapitalize="none" />

        {data.competition_type === 'qa' && (
          <>
            <Text style={s.label}>Question *</Text>
            <TextInput style={s.input} value={data.question} onChangeText={t => setData({ ...data, question: t })} placeholder="What is the capital of Saudi Arabia?" />
            <Text style={s.label}>Correct Answer *</Text>
            <TextInput style={s.input} value={data.correct_answer} onChangeText={t => setData({ ...data, correct_answer: t })} placeholder="Riyadh" />
            <Text style={s.hint}>Answer matching is case-insensitive</Text>
          </>
        )}
        {data.competition_type === 'purchase' && (
          <>
            <Text style={s.label}>Minimum Spend (SAR)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.spend_requirement} onChangeText={t => setData({ ...data, spend_requirement: t })} />
            <Text style={s.hint}>0 = any purchase qualifies</Text>
          </>
        )}

        <Text style={s.label}>Draw Date</Text>
        <TextInput style={s.input} value={data.draw_date} onChangeText={t => setData({ ...data, draw_date: t })} placeholder="2025-07-01" />
        <Text style={s.label}>End Date</Text>
        <TextInput style={s.input} value={data.end_date} onChangeText={t => setData({ ...data, end_date: t })} placeholder="2025-06-30" />

        <View style={s.divider} />
        <Text style={s.sectionTitle}>Chamber Supervision</Text>
        <View style={s.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLbl}>Supervised by Chamber of Commerce</Text>
            <Text style={s.toggleHint}>For licensed draws requiring permit</Text>
          </View>
          <Switch value={data.chamber_supervised} onValueChange={v => setData({ ...data, chamber_supervised: v })} />
        </View>
        {data.chamber_supervised && (
          <>
            <Text style={s.label}>Permit Number *</Text>
            <TextInput style={s.input} value={data.permit_number} onChangeText={t => setData({ ...data, permit_number: t })} placeholder="e.g. CR-2025-1234" />
            <Text style={s.hint}>Will be displayed to customers as proof of legitimacy</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Text style={s.label}>Assigned Chamber Employee *</Text>
              <TouchableOpacity onPress={() => setShowEmpModal(true)} style={s.smallBtn}><Text style={s.smallBtnText}>+ New</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
              {employees.length === 0 && <Text style={{ color: '#9CA3AF', padding: 8 }}>No chamber employees. Tap + New to create one.</Text>}
              {employees.map(e => (
                <TouchableOpacity key={e.id} onPress={() => setData({ ...data, assigned_chamber_employee_id: e.id })} style={[s.empChip, data.assigned_chamber_employee_id === e.id && s.empChipActive]}>
                  <Text style={[s.empName, data.assigned_chamber_employee_id === e.id && { color: 'white' }]}>{e.name}</Text>
                  <Text style={[s.empPhone, data.assigned_chamber_employee_id === e.id && { color: 'white' }]}>{e.phone}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={s.submitText}>Publish Competition</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showEmpModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEmpModal(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setShowEmpModal(false)}><Ionicons name="close" size="24" color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>New Chamber Employee</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>Name *</Text>
            <TextInput style={s.input} value={newEmp.name} onChangeText={t => setNewEmp({ ...newEmp, name: t })} />
            <Text style={s.label}>Phone *</Text>
            <TextInput style={s.input} value={newEmp.phone} onChangeText={t => setNewEmp({ ...newEmp, phone: t })} keyboardType="phone-pad" />
            <Text style={s.label}>Password *</Text>
            <TextInput style={s.input} value={newEmp.password} onChangeText={t => setNewEmp({ ...newEmp, password: t })} secureTextEntry />
            <Text style={s.label}>Email</Text>
            <TextInput style={s.input} value={newEmp.email} onChangeText={t => setNewEmp({ ...newEmp, email: t })} keyboardType="email-address" autoCapitalize="none" />
            <TouchableOpacity style={s.submitBtn} onPress={createEmp}><Text style={s.submitText}>Create Employee</Text></TouchableOpacity>
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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0A0A0A', marginTop: 8, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeCard: { width: '48%', backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB' },
  typeCardActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  typeName: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', marginTop: 6 },
  typeDesc: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 },
  toggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 14, borderRadius: 12 },
  toggleLbl: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  toggleHint: { fontSize: 11, color: '#78350F', marginTop: 2 },
  smallBtn: { backgroundColor: '#8833FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  smallBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
  empChip: { backgroundColor: 'white', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', marginRight: 8, minWidth: 140 },
  empChipActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  empName: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  empPhone: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  submitBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
