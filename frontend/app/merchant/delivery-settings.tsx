import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import ZitexMap from '../../src/components/MapView';

type Zone = {
  name: string;
  polygon?: [number, number][];
  center_lat?: number;
  center_lng?: number;
  radius_km?: number;
  fixed_price: number;
  delivery_type: 'any' | 'same_day' | 'scheduled' | 'standard';
  eta_minutes?: number;
};

type Slot = { label: string; start: string; end: string };

const TABS = ['standard', 'sameday', 'scheduled', 'zones'] as const;
const TAB_LABELS: Record<typeof TABS[number], string> = {
  standard: '📦 عادي', sameday: '⚡ نفس اليوم', scheduled: '⏰ مجدول', zones: '🗺️ المناطق'
};

export default function DeliverySettings() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<typeof TABS[number]>('standard');
  const [zoneModal, setZoneModal] = useState(false);
  const [editingZone, setEditingZone] = useState<{ idx: number; zone: Zone } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/api/delivery/settings');
      setData({
        base_fee: String(d.base_fee ?? 10),
        base_distance_km: String(d.base_distance_km ?? 10),
        per_km_rate: String(d.per_km_rate ?? 1.2),
        max_distance_km: String(d.max_distance_km ?? 50),
        same_day_enabled: d.same_day_enabled !== false,
        same_day_flat_price: String(d.same_day_flat_price ?? 30),
        scheduled_enabled: d.scheduled_enabled !== false,
        scheduled_flat_price: String(d.scheduled_flat_price ?? 20),
        scheduled_slots: d.scheduled_slots || [],
        zones: d.zones || [],
      });
    } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        base_fee: parseFloat(data.base_fee) || 0,
        base_distance_km: parseFloat(data.base_distance_km) || 0,
        per_km_rate: parseFloat(data.per_km_rate) || 0,
        max_distance_km: parseFloat(data.max_distance_km) || 50,
        same_day_enabled: data.same_day_enabled,
        same_day_flat_price: parseFloat(data.same_day_flat_price) || 0,
        scheduled_enabled: data.scheduled_enabled,
        scheduled_flat_price: parseFloat(data.scheduled_flat_price) || 0,
        scheduled_slots: data.scheduled_slots,
        zones: data.zones,
      };
      await apiCall('/api/merchant/delivery/settings', { method: 'PUT', body: JSON.stringify(body) });
      Alert.alert('تم الحفظ', 'تم تحديث إعدادات التوصيل بنجاح');
    } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setSaving(false); }
  };

  const addSlot = () => {
    setData({ ...data, scheduled_slots: [...data.scheduled_slots, { label: 'فترة جديدة', start: '10:00', end: '14:00' }] });
  };
  const updSlot = (i: number, key: keyof Slot, v: string) => {
    const slots = [...data.scheduled_slots]; slots[i] = { ...slots[i], [key]: v }; setData({ ...data, scheduled_slots: slots });
  };
  const delSlot = (i: number) => setData({ ...data, scheduled_slots: data.scheduled_slots.filter((_: any, idx: number) => idx !== i) });

  const openNewZone = () => { setEditingZone({ idx: -1, zone: { name: '', fixed_price: 30, delivery_type: 'any', polygon: [], eta_minutes: 60 } }); setZoneModal(true); };
  const openEditZone = (i: number) => { setEditingZone({ idx: i, zone: { ...data.zones[i] } }); setZoneModal(true); };
  const saveZone = () => {
    if (!editingZone) return;
    const z = editingZone.zone;
    if (!z.name) { Alert.alert('مطلوب', 'يرجى إدخال اسم المنطقة'); return; }
    if ((!z.polygon || z.polygon.length < 3) && (!z.center_lat || !z.radius_km)) { Alert.alert('مطلوب', 'ارسم منطقة على الخريطة أو حدد دائرة'); return; }
    const zones = [...data.zones];
    if (editingZone.idx === -1) zones.push(z); else zones[editingZone.idx] = z;
    setData({ ...data, zones });
    setZoneModal(false);
  };
  const delZone = (i: number) => {
    Alert.alert('حذف المنطقة', 'هل أنت متأكد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => setData({ ...data, zones: data.zones.filter((_: any, idx: number) => idx !== i) }) }
    ]);
  };

  if (loading || !data) return <View style={s.center}><ActivityIndicator size="large" color="#8833FF" /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>إعدادات التوصيل</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveTopBtn}>
          {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={s.saveTopText}>حفظ</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{TAB_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {tab === 'standard' && <>
          <Text style={s.section}>📦 التوصيل العادي (حسب المسافة)</Text>
          <View style={s.box}>
            <Text style={s.label}>الرسوم الأساسية (ر.س) داخل النطاق الأساسي</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.base_fee} onChangeText={t => setData({ ...data, base_fee: t })} />
            <Text style={s.label}>النطاق الأساسي (كم)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.base_distance_km} onChangeText={t => setData({ ...data, base_distance_km: t })} />
            <Text style={s.label}>السعر لكل كم إضافي (ر.س/كم)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.per_km_rate} onChangeText={t => setData({ ...data, per_km_rate: t })} />
            <Text style={s.label}>أقصى مسافة توصيل (كم)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.max_distance_km} onChangeText={t => setData({ ...data, max_distance_km: t })} />
            <Text style={s.hint}>مثال: 10 ر.س لأول 10 كم + 1.2 ر.س لكل كم إضافي</Text>
          </View>
        </>}

        {tab === 'sameday' && <>
          <View style={s.toggleBox}>
            <Text style={s.section}>⚡ التوصيل في نفس اليوم</Text>
            <Switch value={data.same_day_enabled} onValueChange={v => setData({ ...data, same_day_enabled: v })} />
          </View>
          <View style={s.box}>
            <Text style={s.label}>السعر الثابت لنفس اليوم (ر.س)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.same_day_flat_price} onChangeText={t => setData({ ...data, same_day_flat_price: t })} editable={data.same_day_enabled} />
            <Text style={s.hint}>يُطبق إذا لم تتطابق أي منطقة محددة</Text>
          </View>
        </>}

        {tab === 'scheduled' && <>
          <View style={s.toggleBox}>
            <Text style={s.section}>⏰ التوصيل المجدول</Text>
            <Switch value={data.scheduled_enabled} onValueChange={v => setData({ ...data, scheduled_enabled: v })} />
          </View>
          <View style={s.box}>
            <Text style={s.label}>السعر الثابت للتوصيل المجدول (ر.س)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.scheduled_flat_price} onChangeText={t => setData({ ...data, scheduled_flat_price: t })} editable={data.scheduled_enabled} />
            <Text style={s.hint}>أرخص من نفس اليوم لأن العميل يختار موعداً مرناً</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <Text style={s.section}>الفترات المتاحة ({data.scheduled_slots.length})</Text>
            <TouchableOpacity onPress={addSlot} style={s.addSmall}><Text style={s.addSmallText}>+ فترة</Text></TouchableOpacity>
          </View>
          {data.scheduled_slots.map((sl: Slot, i: number) => (
            <View key={i} style={s.slotCard}>
              <TextInput style={[s.input, { flex: 2 }]} placeholder="اسم الفترة" value={sl.label} onChangeText={t => updSlot(i, 'label', t)} />
              <TextInput style={[s.input, { width: 70 }]} placeholder="09:00" value={sl.start} onChangeText={t => updSlot(i, 'start', t)} />
              <Text style={{ fontSize: 12 }}>-</Text>
              <TextInput style={[s.input, { width: 70 }]} placeholder="12:00" value={sl.end} onChangeText={t => updSlot(i, 'end', t)} />
              <TouchableOpacity onPress={() => delSlot(i)}><Ionicons name="trash" size={18} color="#EF4444" /></TouchableOpacity>
            </View>
          ))}
        </>}

        {tab === 'zones' && <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.section}>🗺️ مناطق بأسعار ثابتة ({data.zones.length})</Text>
            <TouchableOpacity onPress={openNewZone} style={s.addZoneBtn}><Text style={s.addZoneText}>+ منطقة</Text></TouchableOpacity>
          </View>
          <Text style={s.hint}>ارسم مضلعات على الخريطة (مثل أحياء) واحدد سعراً ثابتاً</Text>
          {data.zones.length > 0 && (
            <View style={{ marginVertical: 12 }}>
              <ZitexMap mode="tracking" height={220} showZones={data.zones.map((z: Zone) => ({ ...z, color: z.delivery_type === 'same_day' ? '#F59E0B' : z.delivery_type === 'scheduled' ? '#3B82F6' : '#8833FF' }))} />
            </View>
          )}
          {data.zones.map((z: Zone, i: number) => (
            <View key={i} style={s.zoneCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.zoneName}>{z.name}</Text>
                <Text style={s.zoneInfo}>
                  {z.polygon && z.polygon.length >= 3 ? `مضلع (${z.polygon.length} نقاط)` : `دائرة نصف قطر ${z.radius_km} كم`}
                </Text>
                <Text style={s.zonePrice}>{z.fixed_price} ر.س • {z.delivery_type === 'same_day' ? 'نفس اليوم' : z.delivery_type === 'scheduled' ? 'مجدول' : z.delivery_type === 'standard' ? 'عادي' : 'الكل'}</Text>
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity onPress={() => openEditZone(i)}><Ionicons name="create-outline" size={20} color="#3B82F6" /></TouchableOpacity>
                <TouchableOpacity onPress={() => delZone(i)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity>
              </View>
            </View>
          ))}
        </>}
      </ScrollView>

      {editingZone && (
        <Modal visible={zoneModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setZoneModal(false)}>
          <SafeAreaView style={s.safe}>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setZoneModal(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
              <Text style={s.title}>{editingZone.idx === -1 ? 'منطقة جديدة' : 'تعديل المنطقة'}</Text>
              <TouchableOpacity onPress={saveZone}><Text style={{ color: '#8833FF', fontWeight: '800', fontSize: 15 }}>تم</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 12 }}>
              <Text style={s.label}>اسم المنطقة *</Text>
              <TextInput style={s.input} value={editingZone.zone.name} onChangeText={t => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, name: t } })} placeholder="مثل: حي العليا" />

              <Text style={s.label}>سعر التوصيل الثابت (ر.س) *</Text>
              <TextInput style={s.input} keyboardType="numeric" value={String(editingZone.zone.fixed_price || '')} onChangeText={t => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, fixed_price: parseFloat(t) || 0 } })} />

              <Text style={s.label}>زمن الوصول التقديري (دقيقة)</Text>
              <TextInput style={s.input} keyboardType="numeric" value={String(editingZone.zone.eta_minutes || 60)} onChangeText={t => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, eta_minutes: parseInt(t) || 60 } })} />

              <Text style={s.label}>نوع التوصيل المطبق على هذه المنطقة</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(['any', 'same_day', 'scheduled', 'standard'] as const).map(t => (
                  <TouchableOpacity key={t} style={[s.opt, editingZone.zone.delivery_type === t && s.optActive]} onPress={() => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, delivery_type: t } })}>
                    <Text style={[s.optText, editingZone.zone.delivery_type === t && s.optTextActive]}>{t === 'any' ? 'الكل' : t === 'same_day' ? 'نفس اليوم' : t === 'scheduled' ? 'مجدول' : 'عادي'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.section, { marginTop: 14 }]}>ارسم المنطقة على الخريطة</Text>
              <Text style={s.hint}>اضغط على الخريطة لإضافة نقاط (3 نقاط أو أكثر لإغلاق المضلع)</Text>
              <View style={{ marginTop: 8 }}>
                <ZitexMap
                  mode="polygon"
                  initialLat={24.7136} initialLng={46.6753}
                  polygon={editingZone.zone.polygon || []}
                  onPolygonChange={(points) => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, polygon: points } })}
                  height={320}
                />
              </View>
              <Text style={s.hint}>عدد النقاط الحالية: {editingZone.zone.polygon?.length || 0}</Text>

              <Text style={[s.section, { marginTop: 14 }]}>أو استخدم دائرة (إذا لم ترسم مضلعاً)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[s.input, { flex: 1 }]} placeholder="خط العرض" keyboardType="numeric" value={String(editingZone.zone.center_lat || '')} onChangeText={t => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, center_lat: parseFloat(t) || undefined } })} />
                <TextInput style={[s.input, { flex: 1 }]} placeholder="خط الطول" keyboardType="numeric" value={String(editingZone.zone.center_lng || '')} onChangeText={t => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, center_lng: parseFloat(t) || undefined } })} />
                <TextInput style={[s.input, { flex: 1 }]} placeholder="نصف قطر كم" keyboardType="numeric" value={String(editingZone.zone.radius_km || '')} onChangeText={t => setEditingZone({ ...editingZone, zone: { ...editingZone.zone, radius_km: parseFloat(t) || undefined } })} />
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 }, title: { fontSize: 16, fontWeight: '800', color: '#0A0A0A' },
  saveTopBtn: { backgroundColor: '#8833FF', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, minWidth: 70, alignItems: 'center' },
  saveTopText: { color: 'white', fontWeight: '800', fontSize: 13 },
  tabs: { padding: 10, gap: 6, backgroundColor: 'white' },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#F3F4F6' },
  tabActive: { backgroundColor: '#8833FF' },
  tabText: { fontSize: 13, color: '#374151', fontWeight: '700' },
  tabTextActive: { color: 'white' },
  section: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', marginTop: 8, marginBottom: 8 },
  box: { backgroundColor: 'white', padding: 14, borderRadius: 12 },
  toggleBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 4 },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  input: { backgroundColor: 'white', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', textAlign: 'right' },
  addZoneBtn: { backgroundColor: '#8833FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addZoneText: { color: 'white', fontSize: 12, fontWeight: '700' },
  addSmall: { backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  addSmallText: { color: 'white', fontSize: 12, fontWeight: '700' },
  zoneCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8 },
  zoneName: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  zoneInfo: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  zonePrice: { fontSize: 12, fontWeight: '700', color: '#8833FF', marginTop: 2 },
  slotCard: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  opt: { backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  optActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  optText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  optTextActive: { color: 'white' },
});
