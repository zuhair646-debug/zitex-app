import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Switch } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../_layout';
import { uploadMedia, mediaUrlSync } from '../../src/utils/upload';

const GOLD = '#F5C518';
const BG = '#0A0A0A';
const CARD = '#151515';
const BORDER = '#2A2A2A';
const TEXT = '#FFFFFF';
const MUTED = '#9CA3AF';

const STATUS_FLOW = [
  { id: 'pending', label: 'قيد الاستلام' },
  { id: 'received', label: 'مستلم' },
  { id: 'in_progress', label: 'قيد الإصلاح' },
  { id: 'ready', label: 'جاهز' },
  { id: 'completed', label: 'مكتمل' },
];

export default function MerchantServiceBookings() {
  const { service_id } = useLocalSearchParams<{ service_id?: string }>();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const all = await apiCall('/api/merchant/bookings');
      setBookings(service_id ? all.filter((b: any) => b.service_id === service_id) : all);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  }, [service_id]);
  useEffect(() => { load(); }, [load]);

  const openBooking = async (b: any) => {
    try { const full = await apiCall(`/api/services/bookings/${b.id}`); setSelected(full); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const updateStatus = async (bid: string, status: string) => {
    try {
      await apiCall(`/api/merchant/bookings/${bid}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      const full = await apiCall(`/api/services/bookings/${bid}`);
      setSelected(full); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color={GOLD} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}><Ionicons name="arrow-back" size={22} color={GOLD} /></TouchableOpacity>
        <Text style={s.title}>حجوزات الخدمات ({bookings.length})</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {bookings.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={54} color={GOLD} />
            <Text style={s.emptyText}>لا توجد حجوزات بعد</Text>
          </View>
        )}
        {bookings.map(b => (
          <TouchableOpacity key={b.id} style={s.card} onPress={() => openBooking(b)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.svcName}>{b.service_name}</Text>
              <View style={s.statusPill}><Text style={s.statusText}>{STATUS_FLOW.find(x => x.id === b.status)?.label || b.status}</Text></View>
            </View>
            <Text style={s.customer}>👤 {b.customer_name || '—'} • {b.customer_phone || b.phone}</Text>
            <Text style={s.device}>📱 {b.device_model}</Text>
            <Text style={s.issue} numberOfLines={2}>{b.issue_desc}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={s.total}>الإجمالي: {b.total_amount || b.service_price || 0} ر.س</Text>
              {b.delivery_type === 'home_pickup' && <Text style={s.pickup}>🚗 استلام منزلي ({b.distance_km || 0} كم)</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selected && (
        <BookingDetailModal
          booking={selected}
          onClose={() => setSelected(null)}
          onStatus={updateStatus}
          apiCall={apiCall}
          onRefresh={async () => { const full = await apiCall(`/api/services/bookings/${selected.id}`); setSelected(full); }}
        />
      )}
    </SafeAreaView>
  );
}

function BookingDetailModal({ booking, onClose, onStatus, apiCall, onRefresh }: any) {
  const [composerOpen, setComposerOpen] = useState(false);
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={GOLD} /></TouchableOpacity>
          <Text style={s.title}>{booking.service_name}</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.infoBox}>
            <Row label="العميل" value={booking.customer_name || '—'} />
            <Row label="الهاتف" value={booking.customer_phone || booking.phone} />
            <Row label="الجهاز" value={booking.device_model} />
            <Row label="المشكلة" value={booking.issue_desc} />
            {booking.delivery_type === 'home_pickup' && (
              <>
                <Row label="نوع الاستلام" value="استلام من المنزل" />
                <Row label="العنوان" value={booking.address} />
                <Row label="المسافة" value={`${booking.distance_km || 0} كم`} />
                <Row label="رسم الاستلام" value={`${booking.pickup_fee || 0} ر.س`} />
              </>
            )}
            <Row label="الإجمالي" value={`${booking.total_amount || 0} ر.س`} bold />
          </View>

          <Text style={s.sec}>الحالة الحالية</Text>
          <View style={s.statusRow}>
            {STATUS_FLOW.map(st => (
              <TouchableOpacity key={st.id} onPress={() => onStatus(booking.id, st.id)}
                style={[s.statBtn, booking.status === st.id && s.statBtnActive]}>
                <Text style={[s.statBtnText, booking.status === st.id && s.statBtnTextActive]}>{st.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
            <Text style={s.sec}>🎥 تحديثات للعميل</Text>
            <TouchableOpacity onPress={() => setComposerOpen(true)} style={s.addBtn}>
              <Ionicons name="add" size={18} color={BG} />
              <Text style={s.addBtnText}>فيديو</Text>
            </TouchableOpacity>
          </View>
          {(booking.updates || []).length === 0 ? (
            <View style={s.emptyBox}><Text style={s.emptySub}>لم ترسل تحديثات بعد</Text></View>
          ) : (booking.updates || []).map((u: any) => (
            <UpdateCard key={u.id} update={u} apiCall={apiCall} onChange={onRefresh} />
          ))}
        </ScrollView>

        {composerOpen && (
          <VideoComposer bookingId={booking.id} apiCall={apiCall}
            onDone={async () => { setComposerOpen(false); await onRefresh(); }}
            onCancel={() => setComposerOpen(false)} />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Row({ label, value, bold }: any) {
  return (
    <View style={s.row}>
      <Text style={s.rowLbl}>{label}</Text>
      <Text style={[s.rowVal, bold && { fontWeight: '900', color: GOLD }]}>{value || '—'}</Text>
    </View>
  );
}

function UpdateCard({ update, apiCall, onChange }: any) {
  const player = useVideoPlayer(update.video_url ? mediaUrlSync(update.video_url) : '', p => { p.loop = false; });
  const [isPub, setIsPub] = useState(!!update.is_public_experience);
  const [isSocial, setIsSocial] = useState(!!update.crosspost_to_social);
  const toggle = async (key: 'is_public_experience' | 'crosspost_to_social', v: boolean) => {
    try {
      await apiCall(`/api/services/updates/${update.id}`, { method: 'PUT',
        body: JSON.stringify({ [key]: v }) });
      onChange && onChange();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };
  const del = () => Alert.alert('حذف', 'حذف هذا التحديث؟', [
    { text: 'إلغاء' },
    { text: 'حذف', style: 'destructive', onPress: async () => {
      try { await apiCall(`/api/services/updates/${update.id}`, { method: 'DELETE' }); onChange && onChange(); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
    }},
  ]);
  return (
    <View style={s.updateCard}>
      {update.video_url ? (
        <VideoView player={player} style={s.updateVideo} contentFit="cover" nativeControls />
      ) : update.image_url ? (
        <Image source={{ uri: mediaUrlSync(update.image_url) }} style={s.updateVideo} contentFit="cover" />
      ) : null}
      {!!update.caption && <Text style={s.updateCap}>{update.caption}</Text>}
      <View style={s.toggleMini}>
        <Text style={s.toggleMiniLbl}>عرض كتجربة عملاء</Text>
        <Switch value={isPub} onValueChange={(v) => { setIsPub(v); toggle('is_public_experience', v); }}
          trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={isPub ? BG : '#FFF'} />
      </View>
      <View style={s.toggleMini}>
        <Text style={s.toggleMiniLbl}>نشر في السوشيال</Text>
        <Switch value={isSocial} onValueChange={(v) => { setIsSocial(v); toggle('crosspost_to_social', v); }}
          trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={isSocial ? BG : '#FFF'} />
      </View>
      {update.avg_rating > 0 && (
        <View style={s.rateInfo}>
          <Ionicons name="star" size={14} color={GOLD} />
          <Text style={s.rateText}>{update.avg_rating} ({update.review_count} تقييم)</Text>
        </View>
      )}
      <TouchableOpacity style={s.delBtn} onPress={del}><Ionicons name="trash-outline" size={18} color="#EF4444" /></TouchableOpacity>
    </View>
  );
}

function VideoComposer({ bookingId, apiCall, onDone, onCancel }: any) {
  const [caption, setCaption] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isPub, setIsPub] = useState(true);
  const [isSocial, setIsSocial] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية', 'مطلوب السماح للمعرض'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'] as any, quality: 0.7, videoMaxDuration: 60,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || 'update.mp4', a.mimeType || 'video/mp4');
      setVideoUrl(up.path); setImageUrl('');
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية', 'مطلوب السماح للمعرض'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      setImageUrl(up.path); setVideoUrl('');
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!videoUrl && !imageUrl) { Alert.alert('مطلوب', 'ارفع فيديو أو صورة'); return; }
    setSaving(true);
    try {
      await apiCall('/api/services/updates', { method: 'POST',
        body: JSON.stringify({ booking_id: bookingId, video_url: videoUrl, image_url: imageUrl,
          caption, is_public_experience: isPub, crosspost_to_social: isSocial }) });
      onDone && onDone();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel}><Ionicons name="close" size={24} color={GOLD} /></TouchableOpacity>
          <Text style={s.title}>تحديث جديد</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={pickVideo} style={s.mediaBtn} disabled={uploading}>
              <Ionicons name="videocam" size={22} color={GOLD} />
              <Text style={s.mediaBtnText}>فيديو (≤60ث)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickImage} style={s.mediaBtn} disabled={uploading}>
              <Ionicons name="camera" size={22} color={GOLD} />
              <Text style={s.mediaBtnText}>صورة</Text>
            </TouchableOpacity>
          </View>
          {uploading && <ActivityIndicator color={GOLD} style={{ marginTop: 12 }} />}
          {videoUrl ? <Text style={s.pathText}>✅ فيديو مرفوع</Text> : null}
          {imageUrl ? <Text style={s.pathText}>✅ صورة مرفوعة</Text> : null}

          <Text style={s.label}>التعليق</Text>
          <TextInput style={[s.input, { height: 100 }]} multiline value={caption} onChangeText={setCaption}
            placeholder="اشرح للعميل ما اكتشفت أو ما تعمل عليه الآن..." placeholderTextColor={MUTED} />

          <View style={s.toggleMini}>
            <Text style={s.toggleMiniLbl}>عرض كتجربة عملاء (عام)</Text>
            <Switch value={isPub} onValueChange={setIsPub}
              trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={isPub ? BG : '#FFF'} />
          </View>
          <View style={s.toggleMini}>
            <Text style={s.toggleMiniLbl}>نشر أيضاً في السوشيال ميديا</Text>
            <Switch value={isSocial} onValueChange={setIsSocial}
              trackColor={{ true: GOLD, false: '#3A3A3C' }} thumbColor={isSocial ? BG : '#FFF'} />
          </View>

          <TouchableOpacity style={s.saveBtn} onPress={submit} disabled={saving || uploading}>
            {saving ? <ActivityIndicator color={BG} /> : <Text style={s.saveText}>إرسال للعميل</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER },
  iconBtn: { padding: 4 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: TEXT, textAlign: 'center' },
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { color: TEXT, fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  svcName: { fontSize: 15, fontWeight: '900', color: TEXT, flex: 1, textAlign: 'right' },
  statusPill: { backgroundColor: '#2E2404', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { color: GOLD, fontSize: 11, fontWeight: '800' },
  customer: { fontSize: 12, color: MUTED, marginTop: 4, textAlign: 'right' },
  device: { fontSize: 12, color: MUTED, marginTop: 2, textAlign: 'right' },
  issue: { fontSize: 12, color: '#D0D0D0', marginTop: 4, textAlign: 'right' },
  total: { fontSize: 13, color: GOLD, fontWeight: '800' },
  pickup: { fontSize: 11, color: '#60A5FA', fontWeight: '700' },
  infoBox: { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLbl: { fontSize: 13, color: MUTED },
  rowVal: { fontSize: 13, color: TEXT, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  sec: { fontSize: 14, fontWeight: '800', color: TEXT, marginTop: 4, marginBottom: 8, textAlign: 'right' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  statBtnActive: { backgroundColor: GOLD, borderColor: GOLD },
  statBtnText: { fontSize: 12, color: MUTED, fontWeight: '700' },
  statBtnTextActive: { color: BG, fontWeight: '900' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  addBtnText: { color: BG, fontWeight: '800', fontSize: 12 },
  emptyBox: { alignItems: 'center', padding: 30, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER },
  emptySub: { fontSize: 12, color: MUTED },
  updateCard: { backgroundColor: CARD, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, marginBottom: 12, position: 'relative' },
  updateVideo: { width: '100%', height: 220, backgroundColor: '#000' },
  updateCap: { fontSize: 13, color: TEXT, padding: 12, textAlign: 'right' },
  toggleMini: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER },
  toggleMiniLbl: { color: TEXT, fontSize: 13, fontWeight: '700' },
  rateInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderTopWidth: 1, borderTopColor: BORDER },
  rateText: { color: GOLD, fontSize: 12, fontWeight: '700' },
  delBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 8 },
  mediaBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20, borderRadius: 12, borderWidth: 1.5, borderColor: GOLD, borderStyle: 'dashed', backgroundColor: '#332905' },
  mediaBtnText: { color: GOLD, fontSize: 13, fontWeight: '800' },
  pathText: { color: '#10B981', fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'right' },
  label: { fontSize: 13, fontWeight: '700', color: GOLD, marginTop: 14, marginBottom: 6, textAlign: 'right' },
  input: { backgroundColor: CARD, color: TEXT, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: BORDER, fontSize: 14, textAlign: 'right' },
  saveBtn: { backgroundColor: GOLD, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  saveText: { color: BG, fontWeight: '900', fontSize: 16 },
});
