import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantDrivers() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({ name: '', phone: '', password: 'driver1234', vehicle_info: '', payment_model: 'commission', salary_monthly: '0', bonus_threshold_orders: '20', bonus_per_extra_order: '2', commission_type: 'fixed', merchant_commission_value: '5' });

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/drivers'); setDrivers(d); } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.phone) { Alert.alert('Required', 'Name and phone required'); return; }
    try {
      const body = { ...form, salary_monthly: parseFloat(form.salary_monthly) || 0, bonus_threshold_orders: parseInt(form.bonus_threshold_orders) || 0, bonus_per_extra_order: parseFloat(form.bonus_per_extra_order) || 0, merchant_commission_value: parseFloat(form.merchant_commission_value) || 0 };
      await apiCall('/api/merchant/drivers', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('Created', `Driver login: ${form.phone} / ${form.password}`);
      setModal(false); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };
  const del = (id: string, n: string) => Alert.alert('حذف؟', `حذف "${n}"؟`, [{ text: 'إلغاء', style: 'cancel' }, { text: 'حذف', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/drivers/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('خطأ', e.message); } } }]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>السائقون ({drivers.length})</Text>
        <TouchableOpacity onPress={() => setModal(true)} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {drivers.length === 0 && <Text style={s.empty}>لا يوجد سائقون بعد. اضغط + لإضافة سائق.</Text>}
          {drivers.map(d => (
            <View key={d.id} style={s.card}>
              <View style={[s.statusDot, { backgroundColor: d.online ? '#10B981' : '#9CA3AF' }]} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.name}>{d.name}</Text>
                <Text style={s.phone}>{d.phone} • {d.vehicle_info || 'لا توجد مركبة'}</Text>
                <Text style={s.payment}>{d.payment_model === 'salary' ? `راتب ${d.salary_monthly} ر.س / شهرياً` : `عمولة: ${d.commission_type === 'percentage' ? d.merchant_commission_value + '%' : d.merchant_commission_value + ' ر.س'} لكل طلب`}</Text>
                <Text style={s.stats}>الإجمالي: {d.total_deliveries || 0} • اليوم: {d.today_deliveries || 0} • المحفظة: {(d.wallet_balance || 0).toFixed(0)} ر.س</Text>
              </View>
              <TouchableOpacity onPress={() => del(d.id, d.name)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      }
      <Modal visible={modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModal(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>سائق جديد</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>الاسم *</Text><TextInput style={s.input} value={form.name} onChangeText={t => setForm({ ...form, name: t })} />
            <Text style={s.label}>رقم الجوال *</Text><TextInput style={s.input} value={form.phone} onChangeText={t => setForm({ ...form, phone: t })} keyboardType="phone-pad" />
            <Text style={s.label}>كلمة مرور الدخول *</Text><TextInput style={s.input} value={form.password} onChangeText={t => setForm({ ...form, password: t })} secureTextEntry />
            <Text style={s.label}>معلومات المركبة</Text><TextInput style={s.input} value={form.vehicle_info} onChangeText={t => setForm({ ...form, vehicle_info: t })} placeholder="Toyota Hilux 2022" />
            <Text style={s.label}>نموذج الدفع</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.opt, form.payment_model === 'commission' && s.optActive]} onPress={() => setForm({ ...form, payment_model: 'commission' })}><Text style={[s.optText, form.payment_model === 'commission' && s.optTextActive]}>عمولة لكل طلب</Text></TouchableOpacity>
              <TouchableOpacity style={[s.opt, form.payment_model === 'salary' && s.optActive]} onPress={() => setForm({ ...form, payment_model: 'salary' })}><Text style={[s.optText, form.payment_model === 'salary' && s.optTextActive]}>راتب شهري</Text></TouchableOpacity>
            </View>
            {form.payment_model === 'commission' && (<>
              <Text style={s.label}>نوع العمولة</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.opt, form.commission_type === 'fixed' && s.optActive]} onPress={() => setForm({ ...form, commission_type: 'fixed' })}><Text style={[s.optText, form.commission_type === 'fixed' && s.optTextActive]}>مبلغ ثابت</Text></TouchableOpacity>
                <TouchableOpacity style={[s.opt, form.commission_type === 'percentage' && s.optActive]} onPress={() => setForm({ ...form, commission_type: 'percentage' })}><Text style={[s.optText, form.commission_type === 'percentage' && s.optTextActive]}>نسبة مئوية</Text></TouchableOpacity>
              </View>
              <Text style={s.label}>حصة التاجر ({form.commission_type === 'percentage' ? '%' : 'ر.س'} لكل طلب)</Text>
              <TextInput style={s.input} keyboardType="numeric" value={form.merchant_commission_value} onChangeText={t => setForm({ ...form, merchant_commission_value: t })} />
              <Text style={s.hint}>الباقي يذهب لمحفظة السائق</Text>
            </>)}
            {form.payment_model === 'salary' && (<>
              <Text style={s.label}>الراتب الشهري (ر.س)</Text>
              <TextInput style={s.input} keyboardType="numeric" value={form.salary_monthly} onChangeText={t => setForm({ ...form, salary_monthly: t })} placeholder="3000" />
              <Text style={s.label}>حد المكافأة (طلبات/يوم)</Text>
              <TextInput style={s.input} keyboardType="numeric" value={form.bonus_threshold_orders} onChangeText={t => setForm({ ...form, bonus_threshold_orders: t })} />
              <Text style={s.label}>مكافأة الطلب الإضافي (ر.س)</Text>
              <TextInput style={s.input} keyboardType="numeric" value={form.bonus_per_extra_order} onChangeText={t => setForm({ ...form, bonus_per_extra_order: t })} />
              <Text style={s.hint}>فوق الحد، يكسب السائق مكافأة لكل طلب إضافي</Text>
            </>)}
            <TouchableOpacity style={s.saveBtn} onPress={save}><Text style={s.saveText}>إضافة السائق</Text></TouchableOpacity>
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
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  phone: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  payment: { fontSize: 11, color: '#8833FF', marginTop: 4, fontWeight: '600' },
  stats: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  opt: { flex: 1, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', padding: 10, borderRadius: 10, alignItems: 'center' },
  optActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  optText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  optTextActive: { color: 'white' },
  saveBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
