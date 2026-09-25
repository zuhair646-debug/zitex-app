import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Switch, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';
const OK = '#10B981';
const RED = '#EF4444';

const CARRIERS: Record<string, { name: string; logo: string; color: string }> = {
  smsa:        { name: 'SMSA اكسبرس',    logo: '🚚', color: '#E31E24' },
  aramex:      { name: 'أرامكس',          logo: '📦', color: '#DD1B23' },
  naqel:       { name: 'ناقل اكسبرس',      logo: '🛻', color: '#F58220' },
  jt_express:  { name: 'J&T اكسبرس',      logo: '🚛', color: '#E30613' },
  zajil:       { name: 'زاجل اكسبرس',      logo: '🚐', color: '#00A859' },
  aymakan:     { name: 'أي مكان',          logo: '🗺️','color': '#0067AC' } as any,
  saudi_post:  { name: 'البريد السعودي',   logo: '📮', color: '#005826' },
  dhl:         { name: 'DHL',             logo: '✈️', color: '#FFCC00' },
  fetchr:      { name: 'فيتشر',            logo: '📍', color: '#EB2929' },
  torod:       { name: 'طرود',             logo: '🔀', color: '#0EA5E9' },
};

type Rule = {
  id?: string;
  carrier_code: string;
  branch_id: string;
  city_code: string;
  enabled: boolean;
  priority: number;
  service_level: string;
  base_price: number;
  per_kg_price: number;
  included_kg: number;
  min_days: number;
  max_days: number;
  max_weight_kg: number;
  cod_supported: boolean;
  notes: string;
};

export default function ShippingMatrixScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, b] = await Promise.all([
        apiCall('/api/merchant/shipping/matrix'),
        apiCall('/api/merchant/branches').catch(() => ({ branches: [] })),
      ]);
      setRules(m.rules || []);
      setCities(m.cities || []);
      setBranches(b.branches || b || []);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { load(); }, [load]);

  const newRule = (): Rule => ({
    carrier_code: 'smsa',
    branch_id: '',
    city_code: '',
    enabled: true,
    priority: 5,
    service_level: 'standard',
    base_price: 25,
    per_kg_price: 5,
    included_kg: 1,
    min_days: 1,
    max_days: 3,
    max_weight_kg: 30,
    cod_supported: true,
    notes: '',
  });

  const saveRule = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await apiCall(`/api/merchant/shipping/matrix/${editing.id}`, {
          method: 'PUT', body: JSON.stringify(editing),
        });
      } else {
        await apiCall('/api/merchant/shipping/matrix', {
          method: 'POST', body: JSON.stringify(editing),
        });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const removeRule = async (r: Rule) => {
    if (!r.id) return;
    Alert.alert('حذف القاعدة', 'هل أنت متأكد من حذف هذه القاعدة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف', style: 'destructive',
        onPress: async () => {
          try {
            await apiCall(`/api/merchant/shipping/matrix/${r.id}`, { method: 'DELETE' });
            await load();
          } catch (e: any) { Alert.alert('خطأ', e?.message); }
        }
      },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>مصفوفة الشحن الذكية</Text>
          <Text style={s.sub}>حدد شركات الشحن لكل مدينة وفرع</Text>
        </View>
        <TouchableOpacity onPress={() => setEditing(newRule())} style={s.addBtn}>
          <Ionicons name="add" size={20} color={BG} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <View style={s.infoBar}>
            <Ionicons name="information-circle" size={14} color={GOLD} />
            <Text style={s.infoText}>
              كل قاعدة تربط شركة شحن بمدينة/فرع. القواعد الأكثر تخصيصاً تفوز عند تعارض الأولوية.
            </Text>
          </View>

          {rules.length === 0 && (
            <View style={s.empty}>
              <Text style={{ color: MUTED, textAlign: 'center' }}>لا توجد قواعد. اضغط + لإضافة قاعدة جديدة</Text>
            </View>
          )}

          {rules.map((r) => {
            const carrier = CARRIERS[r.carrier_code] || { name: r.carrier_code, logo: '📦', color: MUTED };
            const cityName = r.city_code ? cities.find((c) => c.code === r.city_code)?.name_ar : 'كل المدن';
            const branchName = r.branch_id ? branches.find((b: any) => (b.id || b._id) === r.branch_id)?.name : 'كل الفروع';
            return (
              <View key={r.id} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[s.logoBox, { borderColor: carrier.color }]}>
                    <Text style={{ fontSize: 18 }}>{carrier.logo}</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.cardTitle}>{carrier.name}</Text>
                      {!r.enabled && <View style={s.pillOff}><Text style={s.pillOffText}>موقوفة</Text></View>}
                    </View>
                    <Text style={s.cardSub}>{cityName} · {branchName}</Text>
                    <Text style={s.cardMeta}>
                      {r.base_price}ر.س + {r.per_kg_price}ر.س/كجم · {r.min_days}-{r.max_days} أيام · أولوية {r.priority}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditing(r)} style={s.iconBtn}>
                    <Ionicons name="pencil" size={16} color={GOLD} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeRule(r)} style={[s.iconBtn, { marginStart: 6 }]}>
                    <Ionicons name="trash" size={16} color={RED} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Edit modal */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: GOLD, fontSize: 16, fontWeight: '900', flex: 1, textAlign: 'right' }}>
                  {editing?.id ? 'تعديل قاعدة شحن' : 'قاعدة شحن جديدة'}
                </Text>
                <TouchableOpacity onPress={() => setEditing(null)}><Ionicons name="close" size={22} color={TEXT} /></TouchableOpacity>
              </View>

              {editing && (
                <>
                  <Text style={s.label}>شركة الشحن</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {Object.keys(CARRIERS).map((code) => {
                      const c = CARRIERS[code];
                      const active = editing.carrier_code === code;
                      return (
                        <TouchableOpacity key={code}
                          onPress={() => setEditing({ ...editing, carrier_code: code })}
                          style={[s.chip, active && { borderColor: c.color, backgroundColor: c.color + '20' }]}>
                          <Text style={{ fontSize: 14 }}>{c.logo}</Text>
                          <Text style={[s.chipText, active && { color: c.color }]}>{c.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Text style={s.label}>المدينة (فارغ = كل المدن)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => setEditing({ ...editing, city_code: '' })}
                      style={[s.chip, editing.city_code === '' && { borderColor: GOLD, backgroundColor: GOLD + '20' }]}>
                      <Text style={[s.chipText, editing.city_code === '' && { color: GOLD }]}>كل المدن</Text>
                    </TouchableOpacity>
                    {cities.map((c) => (
                      <TouchableOpacity key={c.code}
                        onPress={() => setEditing({ ...editing, city_code: c.code })}
                        style={[s.chip, editing.city_code === c.code && { borderColor: GOLD, backgroundColor: GOLD + '20' }]}>
                        <Text style={[s.chipText, editing.city_code === c.code && { color: GOLD }]}>{c.name_ar}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={s.label}>الفرع (فارغ = كل الفروع)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => setEditing({ ...editing, branch_id: '' })}
                      style={[s.chip, editing.branch_id === '' && { borderColor: GOLD, backgroundColor: GOLD + '20' }]}>
                      <Text style={[s.chipText, editing.branch_id === '' && { color: GOLD }]}>كل الفروع</Text>
                    </TouchableOpacity>
                    {branches.map((b: any) => {
                      const bid = b.id || b._id;
                      return (
                        <TouchableOpacity key={bid}
                          onPress={() => setEditing({ ...editing, branch_id: bid })}
                          style={[s.chip, editing.branch_id === bid && { borderColor: GOLD, backgroundColor: GOLD + '20' }]}>
                          <Text style={[s.chipText, editing.branch_id === bid && { color: GOLD }]}>{b.name || b.name_ar}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>السعر الأساسي (ر.س)</Text>
                      <TextInput style={s.input} keyboardType="decimal-pad"
                        value={String(editing.base_price)}
                        onChangeText={(v) => setEditing({ ...editing, base_price: Number(v) || 0 })} />
                    </View>
                    <View style={{ flex: 1, marginStart: 8 }}>
                      <Text style={s.label}>سعر الكيلو الزائد</Text>
                      <TextInput style={s.input} keyboardType="decimal-pad"
                        value={String(editing.per_kg_price)}
                        onChangeText={(v) => setEditing({ ...editing, per_kg_price: Number(v) || 0 })} />
                    </View>
                  </View>

                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>أقل مدة (أيام)</Text>
                      <TextInput style={s.input} keyboardType="numeric"
                        value={String(editing.min_days)}
                        onChangeText={(v) => setEditing({ ...editing, min_days: Number(v) || 1 })} />
                    </View>
                    <View style={{ flex: 1, marginStart: 8 }}>
                      <Text style={s.label}>أقصى مدة</Text>
                      <TextInput style={s.input} keyboardType="numeric"
                        value={String(editing.max_days)}
                        onChangeText={(v) => setEditing({ ...editing, max_days: Number(v) || 3 })} />
                    </View>
                    <View style={{ flex: 1, marginStart: 8 }}>
                      <Text style={s.label}>الأولوية</Text>
                      <TextInput style={s.input} keyboardType="numeric"
                        value={String(editing.priority)}
                        onChangeText={(v) => setEditing({ ...editing, priority: Number(v) || 5 })} />
                    </View>
                  </View>

                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>أقصى وزن (كجم)</Text>
                      <TextInput style={s.input} keyboardType="decimal-pad"
                        value={String(editing.max_weight_kg)}
                        onChangeText={(v) => setEditing({ ...editing, max_weight_kg: Number(v) || 30 })} />
                    </View>
                    <View style={{ flex: 1, marginStart: 8 }}>
                      <Text style={s.label}>يدعم COD</Text>
                      <View style={s.switchWrap}>
                        <Switch value={editing.cod_supported}
                          onValueChange={(v) => setEditing({ ...editing, cod_supported: v })}
                          trackColor={{ true: OK, false: BORDER }} />
                      </View>
                    </View>
                    <View style={{ flex: 1, marginStart: 8 }}>
                      <Text style={s.label}>مفعّلة</Text>
                      <View style={s.switchWrap}>
                        <Switch value={editing.enabled}
                          onValueChange={(v) => setEditing({ ...editing, enabled: v })}
                          trackColor={{ true: GOLD, false: BORDER }} />
                      </View>
                    </View>
                  </View>

                  <Text style={s.label}>ملاحظات (اختياري)</Text>
                  <TextInput style={[s.input, { minHeight: 60 }]} multiline
                    value={editing.notes}
                    onChangeText={(v) => setEditing({ ...editing, notes: v })} />

                  <TouchableOpacity onPress={saveRule} style={s.saveBtn} disabled={saving}>
                    {saving ? <ActivityIndicator color={BG} /> : (
                      <Text style={s.saveText}>{editing.id ? 'حفظ التعديل' : 'إنشاء القاعدة'}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right', marginHorizontal: 10 },
  sub: { color: MUTED, fontSize: 10, textAlign: 'right', marginHorizontal: 10 },
  addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  infoBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, padding: 10, borderRadius: 10, marginBottom: 10 },
  infoText: { color: TEXT, fontSize: 11, flex: 1, textAlign: 'right', lineHeight: 16 },
  card: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 8 },
  logoBox: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  cardTitle: { color: TEXT, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  cardSub: { color: GOLD, fontSize: 11, textAlign: 'right', marginTop: 2 },
  cardMeta: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 },
  pillOff: { backgroundColor: RED + '20', borderColor: RED, borderWidth: 1, paddingHorizontal: 6, borderRadius: 6 },
  pillOffText: { color: RED, fontSize: 9, fontWeight: '900' },
  iconBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', borderTopWidth: 1, borderColor: BORDER },
  label: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, color: TEXT, textAlign: 'right' },
  row: { flexDirection: 'row' },
  switchWrap: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 6, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { color: TEXT, fontSize: 11, fontWeight: '700' },
  saveBtn: { backgroundColor: GOLD, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  saveText: { color: BG, fontSize: 14, fontWeight: '900' },
});
