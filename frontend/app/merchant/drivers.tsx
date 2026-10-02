import { useEffect, useState, useCallback } from 'react';
import { useT } from '../../src/i18n';
import { tSync } from '../../src/useAutoT';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { TX } from '../../src/useAutoT';

export default function MerchantDrivers() {
  const { lang } = useT();

  const router = useRouter();
  const { apiCall } = useAuth();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({ name: '', phone: '', password: 'driver1234', vehicle_info: '', payment_model: 'commission', salary_monthly: '0', bonus_threshold_orders: '20', bonus_per_extra_order: '2', commission_type: 'fixed', merchant_commission_value: '5' });

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/drivers'); setDrivers(d); } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.phone) { Alert.alert('Required', 'Name and phone required'); return; }
    try {
      const body = { ...form, salary_monthly: parseFloat(form.salary_monthly) || 0, bonus_threshold_orders: parseInt(form.bonus_threshold_orders) || 0, bonus_per_extra_order: parseFloat(form.bonus_per_extra_order) || 0, merchant_commission_value: parseFloat(form.merchant_commission_value) || 0 };
      await apiCall('/api/merchant/drivers', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('Created', `Driver login: ${form.phone} / ${form.password}`);
      setModal(false); load();
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };
  const del = (id: string, n: string) => Alert.alert(tSync('حذف؟', lang), `حذف "${n}"؟`, [{ text: 'إلغاء', style: 'cancel' }, { text: 'حذف', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/drivers/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); } } }]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>السائقون ({drivers.length})</Text>
        <TouchableOpacity onPress={() => setModal(true)} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {drivers.length === 0 && <TX style={s.empty}>لا يوجد سائقون بعد. اضغط + لإضافة سائق.</TX>}
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
            <TX style={s.title}>سائق جديد</TX>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <TX style={s.label}>الاسم *</TX><TextInput style={s.input} value={form.name} onChangeText={t => setForm({ ...form, name: t })} />
            <TX style={s.label}>رقم الجوال *</TX><TextInput style={s.input} value={form.phone} onChangeText={t => setForm({ ...form, phone: t })} keyboardType="phone-pad" />
            <TX style={s.label}>كلمة مرور الدخول *</TX><TextInput style={s.input} value={form.password} onChangeText={t => setForm({ ...form, password: t })} secureTextEntry />
            <TX style={s.label}>معلومات المركبة</TX><TextInput style={s.input} value={form.vehicle_info} onChangeText={t => setForm({ ...form, vehicle_info: t })} placeholder="Toyota Hilux 2022" />
            <TX style={s.label}>نموذج الدفع</TX>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.opt, form.payment_model === 'commission' && s.optActive]} onPress={() => setForm({ ...form, payment_model: 'commission' })}><TX style={[s.optText, form.payment_model === 'commission' && s.optTextActive]}>عمولة لكل طلب</TX></TouchableOpacity>
              <TouchableOpacity style={[s.opt, form.payment_model === 'salary' && s.optActive]} onPress={() => setForm({ ...form, payment_model: 'salary' })}><TX style={[s.optText, form.payment_model === 'salary' && s.optTextActive]}>راتب شهري</TX></TouchableOpacity>
            </View>
            {form.payment_model === 'commission' && (<>
              <TX style={s.label}>نوع العمولة</TX>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[s.opt, form.commission_type === 'fixed' && s.optActive]} onPress={() => setForm({ ...form, commission_type: 'fixed' })}><TX style={[s.optText, form.commission_type === 'fixed' && s.optTextActive]}>مبلغ ثابت</TX></TouchableOpacity>
                <TouchableOpacity style={[s.opt, form.commission_type === 'percentage' && s.optActive]} onPress={() => setForm({ ...form, commission_type: 'percentage' })}><TX style={[s.optText, form.commission_type === 'percentage' && s.optTextActive]}>نسبة مئوية</TX></TouchableOpacity>
              </View>
              <Text style={s.label}>حصة التاجر ({form.commission_type === 'percentage' ? '%' : 'ر.س'} لكل طلب)</Text>
              <TextInput style={s.input} keyboardType="numeric" value={form.merchant_commission_value} onChangeText={t => setForm({ ...form, merchant_commission_value: t })} />
              <TX style={s.hint}>الباقي يذهب لمحفظة السائق</TX>
            </>)}
            {form.payment_model === 'salary' && (<>
              <TX style={s.label}>الراتب الشهري (ر.س)</TX>
              <TextInput style={s.input} keyboardType="numeric" value={form.salary_monthly} onChangeText={t => setForm({ ...form, salary_monthly: t })} placeholder="3000" />
              <TX style={s.label}>حد المكافأة (طلبات/يوم)</TX>
              <TextInput style={s.input} keyboardType="numeric" value={form.bonus_threshold_orders} onChangeText={t => setForm({ ...form, bonus_threshold_orders: t })} />
              <TX style={s.label}>مكافأة الطلب الإضافي (ر.س)</TX>
              <TextInput style={s.input} keyboardType="numeric" value={form.bonus_per_extra_order} onChangeText={t => setForm({ ...form, bonus_per_extra_order: t })} />
              <TX style={s.hint}>فوق الحد، يكسب السائق مكافأة لكل طلب إضافي</TX>
            </>)}
            <TouchableOpacity style={s.saveBtn} onPress={save}><TX style={s.saveText}>إضافة السائق</TX></TouchableOpacity>
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
