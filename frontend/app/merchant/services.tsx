import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, Modal, Switch } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAuth } from '../_layout';
import { uploadMedia, mediaUrlSync } from '../../src/utils/upload';

const GOLD = '#F5C518';
const BG = '#0A0A0A';
const CARD = '#151515';
const BORDER = '#2A2A2A';
const TEXT = '#FFFFFF';
const MUTED = '#9CA3AF';

const CATEGORIES = [
  { id: 'repair', name: 'إصلاح', icon: 'construct' },
  { id: 'replacement', name: 'تبديل', icon: 'swap-horizontal' },
  { id: 'installation', name: 'تركيب', icon: 'download' },
  { id: 'diagnostic', name: 'فحص', icon: 'search' },
  { id: 'other', name: 'أخرى', icon: 'ellipsis-horizontal' },
];

const DEFAULT_FORM = {
  name: '', desc: '', long_description: '',
  category: 'repair', icon: 'construct', color: '#F5C518',
  images: [] as string[],
  price: '', inspection_price: '0',
  turnaround: '1-2 أيام',
  delivery_available: true, home_pickup: true,
  pickup_base_fee: '10', pickup_price_per_km: '3',
  shop_lat: null as number | null, shop_lng: null as number | null,
  warranty_available: true, warranty_days: '90', warranty_terms: '',
  published: true,
};

export default function MerchantServices() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...DEFAULT_FORM });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/services'); setServices(d); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...DEFAULT_FORM }); setModalOpen(true); };
  const openEdit = (sv: any) => {
    setEditing(sv);
    setForm({
      ...DEFAULT_FORM, ...sv,
      price: String(sv.price ?? ''),
      inspection_price: String(sv.inspection_price ?? '0'),
      warranty_days: String(sv.warranty_days ?? '90'),
      pickup_base_fee: String(sv.pickup_base_fee ?? '10'),
      pickup_price_per_km: String(sv.pickup_price_per_km ?? '3'),
      images: sv.images || [],
    });
    setModalOpen(true);
  };

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية', 'السماح للوصول للمعرض مطلوب'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsMultipleSelection: true, selectionLimit: 5, quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const a of res.assets) {
        const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
        uploaded.push(up.path);
      }
      setForm((f: any) => ({ ...f, images: [...(f.images || []), ...uploaded] }));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const removeImage = (idx: number) =>
    setForm((f: any) => ({ ...f, images: f.images.filter((_: any, i: number) => i !== idx) }));

  const captureShopLocation = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert('صلاحية الموقع', 'مطلوب السماح بالموقع لتحديد إحداثيات المحل'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      setForm((f: any) => ({ ...f, shop_lat: loc.coords.latitude, shop_lng: loc.coords.longitude }));
      Alert.alert('تم', `تم حفظ الإحداثيات:\n${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const save = async () => {
    if (!form.name || !form.price) { Alert.alert('مطلوب', 'الاسم والسعر مطلوبان'); return; }
    if (form.home_pickup && (form.shop_lat == null || form.shop_lng == null)) {
      Alert.alert('موقع المحل مطلوب', 'لدعم استلام المنزل، حدّد إحداثيات المحل أولاً'); return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        price: parseFloat(form.price) || 0,
        inspection_price: parseFloat(form.inspection_price) || 0,
        warranty_days: parseInt(form.warranty_days) || 0,
        pickup_base_fee: parseFloat(form.pickup_base_fee) || 0,
        pickup_price_per_km: parseFloat(form.pickup_price_per_km) || 0,
      };
      if (editing) await apiCall(`/api/merchant/services/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiCall('/api/merchant/services', { method: 'POST', body: JSON.stringify(body) });
      setModalOpen(false); await load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  const del = (id: string, name: string) => {
    Alert.alert('حذف', `حذف "${name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await apiCall(`/api/merchant/services/${id}`, { method: 'DELETE' }); load(); }
        catch (e: any) { Alert.alert('خطأ', e.message); }
      }},
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}><Ionicons name="arrow-back" size={22} color={GOLD} /></TouchableOpacity>
        <Text style={s.title}>الخدمات ({services.length})</Text>
        <TouchableOpacity testID="add-svc" onPress={openCreate} style={s.addBtn}>
          <Ionicons name="add" size={22} color={BG} />
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} /> :
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {services.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="construct" size={48} color={GOLD} />
              <Text style={s.emptyText}>لا توجد خدمات بعد</Text>
              <TouchableOpacity onPress={openCreate} style={s.emptyBtn}><Text style={s.emptyBtnText}>إضافة أول خدمة</Text></TouchableOpacity>
            </View>
          )}
          {services.map(sv => (
            <TouchableOpacity key={sv.id} style={s.card} onPress={() => router.push(`/merchant/service-bookings?service_id=${sv.id}`)}>
              {sv.images?.[0] ? (
                <Image source={{ uri: mediaUrlSync(sv.images[0]) }} style={s.cardImg} contentFit="cover" />
              ) : (
                <View style={s.cardImgFallback}><Ionicons name={sv.icon || 'construct'} size={28} color={GOLD} /></View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.name}>{sv.name}</Text>
                  {!sv.published && <View style={s.hiddenBadge}><Text style={s.hiddenBadgeText}>مخفية</Text></View>}
                </View>
                <Text style={s.desc} numberOfLines={2}>{sv.desc}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  <Text style={s.price}>{sv.price} ر.س</Text>
                  {sv.warranty_available ? <Text style={s.warranty}>🛡 {sv.warranty_days}ي</Text> : null}
                  {sv.home_pickup ? <Text style={s.pickup}>🚗 استلام منزلي</Text> : null}
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <TouchableOpacity onPress={() => openEdit(sv)}><Ionicons name="create-outline" size={22} color={GOLD} /></TouchableOpacity>
                <TouchableOpacity onPress={() => del(sv.id, sv.name)}><Ionicons name="trash-outline" size={22} color="#EF4444" /></TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      }

      <Modal visible={modalOpen} animationType="slide" transparent={false} onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModalOpen(false)}><Ionicons name="close" size={24} color={GOLD} /></TouchableOpacity>
            <Text style={s.title}>{editing ? 'تعديل' : 'خدمة جديدة'}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>الصور</Text>
            <View style={s.imgRow}>
              {form.images?.map((img: string, i: number) => (
                <View key={i} style={s.imgTile}>
                  <Image source={{ uri: mediaUrlSync(img) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <TouchableOpacity style={s.imgRm} onPress={() => removeImage(i)}><Ionicons name="close" size={14} color="white" /></TouchableOpacity>
                </View>
              ))}
              {(!form.images || form.images.length < 5) && (
                <TouchableOpacity style={s.imgAdd} onPress={pickImages} disabled={uploading}>
                  {uploading ? <ActivityIndicator color={GOLD} /> : <>
                    <Ionicons name="camera" size={20} color={GOLD} />
                    <Text style={s.imgAddText}>إضافة صور</Text>
                  </>}
                </TouchableOpacity>
              )}
            </View>

            <Text style={s.label}>الفئة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setForm({ ...form, category: c.id, icon: c.icon })}
                  style={[s.catPill, form.category === c.id && s.catPillActive]}>
                  <Ionicons name={c.icon as any} size={16} color={form.category === c.id ? BG : GOLD} />
                  <Text style={[s.catPillText, form.category === c.id && { color: BG }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.label}>اسم الخدمة *</Text>
            <TextInput style={s.input} value={form.name} onChangeText={t => setForm({ ...form, name: t })} placeholder="تبديل شاشة iPhone" placeholderTextColor={MUTED} />

            <Text style={s.label}>وصف مختصر</Text>
            <TextInput style={s.input} value={form.desc} onChangeText={t => setForm({ ...form, desc: t })} placeholder="جملة تعريفية قصيرة" placeholderTextColor={MUTED} />

            <Text style={s.label}>الوصف الكامل</Text>
            <TextInput style={[s.input, { height: 100 }]} multiline value={form.long_description}
              onChangeText={t => setForm({ ...form, long_description: t })}
              placeholder="اشرح تفاصيل الخدمة، جودة القطع، ضمانات إضافية، ..." placeholderTextColor={MUTED} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>السعر (ر.س) *</Text>
                <TextInput style={s.input} keyboardType="numeric" value={form.price} onChangeText={t => setForm({ ...form, price: t })} placeholder="299" placeholderTextColor={MUTED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>رسم الفحص (ر.س)</Text>
                <TextInput style={s.input} keyboardType="numeric" value={form.inspection_price} onChangeText={t => setForm({ ...form, inspection_price: t })} placeholder="0" placeholderTextColor={MUTED} />
              </View>
            </View>

            <Text style={s.label}>مدة الإنجاز</Text>
            <TextInput style={s.input} value={form.turnaround} onChangeText={t => setForm({ ...form, turnaround: t })} placeholder="مثال: 1-2 أيام، نفس اليوم، 24 ساعة" placeholderTextColor={MUTED} />

            <View style={s.divider} />
            <Text style={s.section}>🛡 الضمان</Text>
            <View style={s.toggle}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLbl}>ضمان متاح</Text>
                <Text style={s.toggleHint}>يظهر شارة {"«مضمون»"} للعميل</Text>
              </View>
              <Switch value={form.warranty_available} onValueChange={v => setForm({ ...form, warranty_available: v })} trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={form.warranty_available ? BG : '#FFF'} />
            </View>
            {form.warranty_available && (
              <>
                <Text style={s.label}>مدة الضمان (بالأيام)</Text>
                <TextInput style={s.input} keyboardType="numeric" value={form.warranty_days} onChangeText={t => setForm({ ...form, warranty_days: t })} placeholderTextColor={MUTED} />
                <Text style={s.label}>شروط الضمان</Text>
                <TextInput style={[s.input, { height: 70 }]} multiline value={form.warranty_terms}
                  onChangeText={t => setForm({ ...form, warranty_terms: t })}
                  placeholder="مثال: يشمل عيوب الصناعة فقط، لا يشمل السقوط أو الماء..." placeholderTextColor={MUTED} />
              </>
            )}

            <View style={s.divider} />
            <Text style={s.section}>🚗 خيارات التوصيل</Text>
            <View style={s.toggle}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLbl}>استلام + إرجاع من المنزل</Text>
                <Text style={s.toggleHint}>يحسب رسم ديناميكي حسب المسافة (ذهاب وعودة)</Text>
              </View>
              <Switch value={form.home_pickup} onValueChange={v => setForm({ ...form, home_pickup: v })} trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={form.home_pickup ? BG : '#FFF'} />
            </View>

            {form.home_pickup && (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>رسم أساسي (ر.س)</Text>
                    <TextInput style={s.input} keyboardType="numeric" value={form.pickup_base_fee}
                      onChangeText={t => setForm({ ...form, pickup_base_fee: t })} placeholderTextColor={MUTED} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>لكل كم (ر.س)</Text>
                    <TextInput style={s.input} keyboardType="numeric" value={form.pickup_price_per_km}
                      onChangeText={t => setForm({ ...form, pickup_price_per_km: t })} placeholderTextColor={MUTED} />
                  </View>
                </View>
                <Text style={s.hint}>الرسم النهائي = أساسي + المسافة × 2 (ذهاب وإياب) × سعر الكم</Text>

                <Text style={s.label}>موقع المحل *</Text>
                <TouchableOpacity onPress={captureShopLocation} style={s.locBtn}>
                  <Ionicons name="location" size={18} color={BG} />
                  <Text style={s.locBtnText}>
                    {form.shop_lat != null ? `📍 ${form.shop_lat.toFixed(5)}, ${form.shop_lng?.toFixed(5)}` : 'حدّد موقع المحل الآن'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <View style={s.toggle}>
              <Text style={s.toggleLbl}>توصيل بعد الإصلاح</Text>
              <Switch value={form.delivery_available} onValueChange={v => setForm({ ...form, delivery_available: v })} trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={form.delivery_available ? BG : '#FFF'} />
            </View>

            <View style={s.divider} />
            <View style={s.toggle}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLbl}>عرض للعملاء</Text>
                <Text style={s.toggleHint}>إذا مغلق، لن تظهر في التطبيق</Text>
              </View>
              <Switch value={form.published} onValueChange={v => setForm({ ...form, published: v })} trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={form.published ? BG : '#FFF'} />
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={BG} /> : <Text style={s.saveText}>{editing ? 'تحديث الخدمة' : 'حفظ الخدمة'}</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER },
  iconBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', marginLeft: 12, color: TEXT, textAlign: 'right' },
  addBtn: { backgroundColor: GOLD, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', backgroundColor: CARD, padding: 12, borderRadius: 14, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: BORDER },
  cardImg: { width: 60, height: 60, borderRadius: 12 },
  cardImgFallback: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: TEXT },
  desc: { fontSize: 12, color: MUTED, marginTop: 2 },
  price: { fontSize: 14, color: GOLD, fontWeight: '900' },
  warranty: { fontSize: 11, color: '#10B981', fontWeight: '700' },
  pickup: { fontSize: 11, color: '#60A5FA', fontWeight: '700' },
  hiddenBadge: { backgroundColor: '#3A3A3C', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  hiddenBadgeText: { color: MUTED, fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { color: TEXT, fontSize: 16, fontWeight: '700' },
  emptyBtn: { backgroundColor: GOLD, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: BG, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', color: GOLD, marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 11, color: MUTED, marginTop: 4 },
  input: { backgroundColor: CARD, color: TEXT, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: BORDER, fontSize: 14, textAlign: 'right' },
  imgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  imgTile: { width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, position: 'relative' },
  imgRm: { position: 'absolute', top: 2, right: 2, backgroundColor: '#EF4444', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  imgAdd: { width: 72, height: 72, borderRadius: 10, borderWidth: 1.5, borderColor: GOLD, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  imgAddText: { fontSize: 10, color: GOLD, fontWeight: '700' },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: BORDER, marginRight: 8 },
  catPillActive: { backgroundColor: GOLD, borderColor: GOLD },
  catPillText: { color: GOLD, fontSize: 13, fontWeight: '700' },
  section: { fontSize: 15, fontWeight: '800', color: TEXT, marginTop: 8, marginBottom: 8 },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 20 },
  toggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, padding: 14, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: BORDER },
  toggleLbl: { fontSize: 14, fontWeight: '700', color: TEXT, textAlign: 'right' },
  toggleHint: { fontSize: 11, color: MUTED, marginTop: 2, textAlign: 'right' },
  locBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD, paddingVertical: 12, borderRadius: 10, marginTop: 6 },
  locBtnText: { color: BG, fontWeight: '800', fontSize: 13 },
  saveBtn: { backgroundColor: GOLD, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: BG, fontWeight: '900', fontSize: 16 },
});
