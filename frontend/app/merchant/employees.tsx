import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

const DEPARTMENTS = [
  { id: 'marketing', label: 'تسويق / سوشال ميديا', icon: 'megaphone', color: '#EC4899', defaultPerms: ['social', 'banners'] },
  { id: 'inventory', label: 'مخزون / منتجات', icon: 'cube', color: '#8833FF', defaultPerms: ['products', 'orders'] },
  { id: 'support', label: 'دعم فني', icon: 'headset', color: '#10B981', defaultPerms: ['support', 'orders', 'customers'] },
  { id: 'logistics', label: 'لوجستيات', icon: 'car', color: '#3B82F6', defaultPerms: ['drivers', 'branches', 'delivery'] },
  { id: 'competitions', label: 'مسابقات', icon: 'trophy', color: '#F59E0B', defaultPerms: ['competitions'] },
  { id: 'manager', label: 'مدير عام', icon: 'star', color: '#FFD700', defaultPerms: ['all'] },
  { id: 'general', label: 'عام', icon: 'person', color: '#6B7280', defaultPerms: [] },
];

export default function MerchantEmployees() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [perms, setPerms] = useState<{ permissions: string[]; labels: Record<string,string> }>({ permissions: [], labels: {} });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', password: '', department: 'general', permissions: [] as string[], salary_monthly: '0', active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, permsData] = await Promise.all([
        apiCall('/api/merchant/employees'),
        apiCall('/api/merchant/employee-perms')
      ]);
      setItems(list); setPerms(permsData);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm({ name: '', phone: '', password: '', department: 'general', permissions: [], salary_monthly: '0', active: true }); setModalOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setForm({ name: e.name, phone: e.phone, password: '', department: e.department || 'general', permissions: e.permissions || [], salary_monthly: String(e.salary_monthly || 0), active: e.active !== false }); setModalOpen(true); };

  const togglePerm = (p: string) => {
    setForm(f => {
      let perms = [...f.permissions];
      if (p === 'all') return { ...f, permissions: perms.includes('all') ? [] : ['all'] };
      if (perms.includes('all')) perms = perms.filter(x => x !== 'all');
      if (perms.includes(p)) perms = perms.filter(x => x !== p); else perms.push(p);
      return { ...f, permissions: perms };
    });
  };

  const pickDept = (dept: any) => setForm(f => ({ ...f, department: dept.id, permissions: dept.defaultPerms.length ? dept.defaultPerms : f.permissions }));

  const save = async () => {
    if (!form.name || !form.phone) { Alert.alert('مطلوب', 'الاسم ورقم الجوال مطلوبان'); return; }
    if (!editing && !form.password) { Alert.alert('مطلوب', 'كلمة المرور مطلوبة للموظف الجديد'); return; }
    setSaving(true);
    try {
      const body: any = { name: form.name, department: form.department, permissions: form.permissions, salary_monthly: parseFloat(form.salary_monthly) || 0, active: form.active };
      if (form.password) body.password = form.password;
      if (editing) {
        await apiCall(`/api/merchant/employees/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiCall('/api/merchant/employees', { method: 'POST', body: JSON.stringify({ ...body, phone: form.phone, password: form.password }) });
      }
      setModalOpen(false); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  const del = (e: any) => Alert.alert('حذف الموظف؟', e.name, [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/employees/${e.id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('خطأ', e.message); } } }
  ]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>👨‍💼 الموظفون ({items.length})</Text>
        <TouchableOpacity onPress={openNew} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        {items.length === 0 && <Text style={s.empty}>لا يوجد موظفون — اضغط + لإضافة أول موظف</Text>}
        {items.map(e => {
          const dept = DEPARTMENTS.find(d => d.id === e.department) || DEPARTMENTS[6];
          return (
            <View key={e.id} style={s.empCard}>
              <View style={[s.empIcon, { backgroundColor: dept.color + '20' }]}><Ionicons name={dept.icon as any} size={22} color={dept.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.empName}>{e.name} {!e.active && <Text style={s.inactive}>(معطّل)</Text>}</Text>
                <Text style={s.empMeta}>{e.phone} • {dept.label}</Text>
                <View style={s.permRow}>
                  {(e.permissions || []).slice(0, 4).map((p: string) => <View key={p} style={s.permTag}><Text style={s.permTagText}>{perms.labels[p] || p}</Text></View>)}
                  {(e.permissions || []).length > 4 && <Text style={s.morePerms}>+{e.permissions.length - 4}</Text>}
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity onPress={() => openEdit(e)}><Ionicons name="create-outline" size={20} color="#3B82F6" /></TouchableOpacity>
                <TouchableOpacity onPress={() => del(e)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModalOpen(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>{editing ? 'تعديل الموظف' : 'موظف جديد'}</Text>
            <TouchableOpacity onPress={save} disabled={saving}>{saving ? <ActivityIndicator size="small" color="#8833FF" /> : <Text style={{ color: '#8833FF', fontWeight: '800' }}>حفظ</Text>}</TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14 }}>
            <Text style={s.lbl}>الاسم *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={t => setForm(f => ({ ...f, name: t }))} placeholder="محمد أحمد" />
            <Text style={s.lbl}>رقم الجوال *</Text>
            <TextInput style={s.input} value={form.phone} onChangeText={t => setForm(f => ({ ...f, phone: t }))} placeholder="05xxxxxxxx" keyboardType="phone-pad" editable={!editing} />
            <Text style={s.lbl}>كلمة المرور {editing && '(اتركها فارغة للإبقاء على الحالية)'}</Text>
            <TextInput style={s.input} value={form.password} onChangeText={t => setForm(f => ({ ...f, password: t }))} placeholder="********" secureTextEntry />
            <Text style={s.lbl}>الراتب الشهري (ر.س)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={form.salary_monthly} onChangeText={t => setForm(f => ({ ...f, salary_monthly: t }))} />

            <Text style={s.section}>🏢 القسم</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {DEPARTMENTS.map(d => (
                <TouchableOpacity key={d.id} style={[s.deptCard, form.department === d.id && { borderColor: d.color, backgroundColor: d.color + '15' }]} onPress={() => pickDept(d)}>
                  <Ionicons name={d.icon as any} size={18} color={d.color} />
                  <Text style={s.deptText}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.section}>🔐 الصلاحيات</Text>
            <Text style={s.hint}>اختر القسم أعلاه يحدد الصلاحيات تلقائياً، أو خصصها يدوياً</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {perms.permissions.map(p => (
                <TouchableOpacity key={p} style={[s.permCard, form.permissions.includes(p) && s.permActive]} onPress={() => togglePerm(p)}>
                  <Ionicons name={form.permissions.includes(p) ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={form.permissions.includes(p) ? '#8833FF' : '#9CA3AF'} />
                  <Text style={[s.permLbl, form.permissions.includes(p) && s.permLblActive]}>{perms.labels[p]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {editing && (
              <View style={s.activeRow}>
                <Text style={s.lbl}>حالة الحساب</Text>
                <Switch value={form.active} onValueChange={v => setForm(f => ({ ...f, active: v }))} />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white' },
  title: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  empCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8 },
  empIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empName: { fontSize: 14, fontWeight: '800', color: '#0A0A0A' },
  empMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  inactive: { color: '#EF4444', fontSize: 11 },
  permRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  permTag: { backgroundColor: '#F3E8FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  permTagText: { fontSize: 10, color: '#7C3AED', fontWeight: '700' },
  morePerms: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  lbl: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', textAlign: 'right' },
  section: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', marginTop: 16, marginBottom: 8 },
  deptCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  deptText: { fontSize: 12, fontWeight: '700' },
  permCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  permActive: { backgroundColor: '#F3E8FF', borderColor: '#8833FF' },
  permLbl: { fontSize: 12, color: '#6B7280' },
  permLblActive: { color: '#7C3AED', fontWeight: '700' },
  activeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 10, marginTop: 14 },
});
