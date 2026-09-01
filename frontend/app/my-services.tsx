import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { mediaUrlSync } from '../src/utils/upload';

const PURPLE = '#8833FF';

const STEPS = [
  { key: 'pending', label: 'قيد الاستلام', icon: 'time' },
  { key: 'received', label: 'مستلم', icon: 'archive' },
  { key: 'in_progress', label: 'قيد الإصلاح', icon: 'construct' },
  { key: 'ready', label: 'جاهز', icon: 'checkmark-circle' },
  { key: 'completed', label: 'مكتمل', icon: 'sparkles' },
];

export default function MyServices() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/services/bookings/my'); setBookings(d); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openBooking = async (b: any) => {
    try { const full = await apiCall(`/api/services/bookings/${b.id}`); setSelected(full); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const currentStep = (status: string) => STEPS.findIndex(x => x.key === status);

  if (loading) return <View style={s.load}><ActivityIndicator size="large" color={PURPLE} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>خدماتي</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
        {bookings.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="construct-outline" size={54} color="#D4D4D8" />
            <Text style={s.emptyText}>لا يوجد لديك خدمات</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/services')} style={s.emptyBtn}>
              <Text style={s.emptyBtnText}>تصفح الخدمات</Text>
            </TouchableOpacity>
          </View>
        )}
        {bookings.map(b => {
          const step = currentStep(b.status);
          return (
            <TouchableOpacity key={b.id} style={s.card} onPress={() => openBooking(b)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.svcName}>{b.service_name}</Text>
                <View style={s.statusBadge}><Text style={s.statusText}>{STEPS.find(x => x.key === b.status)?.label || b.status}</Text></View>
              </View>
              <Text style={s.device}>{b.device_model}</Text>
              <Text style={s.issue} numberOfLines={2}>{b.issue_desc}</Text>
              <View style={s.timeline}>
                {STEPS.map((st, i) => (
                  <View key={st.key} style={{ flex: 1, alignItems: 'center' }}>
                    <View style={[s.stepDot, i <= step && s.stepDotActive, i === step && s.stepDotCurrent]}>
                      <Ionicons name={st.icon as any} size={12} color={i <= step ? 'white' : '#9CA3AF'} />
                    </View>
                    <Text style={[s.stepLabel, i <= step && s.stepLabelActive]}>{st.label}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <Text style={s.total}>الإجمالي: {b.total_amount || b.service_price || 0} ر.س</Text>
                <Text style={s.hint}>اضغط للتفاصيل ›</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <BookingDetail booking={selected} onClose={() => { setSelected(null); load(); }} apiCall={apiCall} />
    </SafeAreaView>
  );
}

function BookingDetail({ booking, onClose, apiCall }: any) {
  if (!booking) return null;
  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
          <Text style={s.title}>{booking.service_name}</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>معلومات الحجز</Text>
            <Row label="الجهاز" value={booking.device_model} />
            <Row label="المشكلة" value={booking.issue_desc} />
            <Row label="الحالة" value={STEPS.find(x => x.key === booking.status)?.label || booking.status} />
            {booking.pickup_fee > 0 && <Row label="رسم الاستلام" value={`${booking.pickup_fee} ر.س`} />}
            <Row label="الإجمالي" value={`${booking.total_amount || 0} ر.س`} bold />
          </View>

          <Text style={s.sec}>🎥 تحديثات الفني</Text>
          {(booking.updates || []).length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="videocam-outline" size={40} color="#D4D4D8" />
              <Text style={s.emptySub}>الفني لم يشارك تحديثات بعد</Text>
            </View>
          ) : (
            (booking.updates || []).map((u: any) => (
              <UpdateItem key={u.id} update={u} bookingId={booking.id} apiCall={apiCall} />
            ))
          )}

          {booking.status === 'completed' && (
            <FinalRating bookingId={booking.id} apiCall={apiCall} existing={booking.reviews?.find((r: any) => !r.update_id)} />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Row({ label, value, bold }: any) {
  return (
    <View style={s.row}><Text style={s.rowLbl}>{label}</Text><Text style={[s.rowVal, bold && { fontWeight: '900', color: PURPLE }]}>{value || '—'}</Text></View>
  );
}

function UpdateItem({ update, bookingId, apiCall }: any) {
  const player = useVideoPlayer(update.video_url ? mediaUrlSync(update.video_url) : '', p => { p.loop = false; });
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (stars < 1) { Alert.alert('التقييم مطلوب'); return; }
    setSaving(true);
    try {
      await apiCall('/api/services/reviews', { method: 'POST',
        body: JSON.stringify({ booking_id: bookingId, update_id: update.id, stars, comment }) });
      setSubmitted(true);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };
  return (
    <View style={s.updateCard}>
      {update.video_url ? (
        <VideoView player={player} style={s.updateVideo} contentFit="cover" nativeControls />
      ) : update.image_url ? (
        <Image source={{ uri: mediaUrlSync(update.image_url) }} style={s.updateVideo} contentFit="cover" />
      ) : null}
      {!!update.caption && <Text style={s.updateCap}>{update.caption}</Text>}
      {!submitted ? (
        <View style={s.rateBox}>
          <Text style={s.rateTitle}>قيّم الفيديو</Text>
          <View style={{ flexDirection: 'row', gap: 4, marginVertical: 6 }}>
            {[1,2,3,4,5].map(i => (
              <TouchableOpacity key={i} onPress={() => setStars(i)}>
                <Ionicons name={i <= stars ? 'star' : 'star-outline'} size={28} color="#F5C518" />
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.rateInput} placeholder="تعليق (اختياري)" value={comment} onChangeText={setComment} />
          <TouchableOpacity style={s.rateBtn} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="white" /> : <Text style={s.rateBtnText}>إرسال</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.thanks}><Ionicons name="checkmark-circle" size={18} color="#10B981" /><Text style={s.thanksText}>شكراً على تقييمك</Text></View>
      )}
    </View>
  );
}

function FinalRating({ bookingId, apiCall, existing }: any) {
  const [stars, setStars] = useState(existing?.stars || 0);
  const [comment, setComment] = useState(existing?.comment || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!existing);
  const submit = async () => {
    if (stars < 1) { Alert.alert('التقييم مطلوب'); return; }
    setSaving(true);
    try {
      await apiCall('/api/services/reviews', { method: 'POST',
        body: JSON.stringify({ booking_id: bookingId, update_id: '', stars, comment }) });
      setSaved(true);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };
  return (
    <View style={s.finalCard}>
      <Text style={s.sec}>⭐ تقييمك النهائي للخدمة</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 8 }}>
        {[1,2,3,4,5].map(i => (
          <TouchableOpacity key={i} onPress={() => !saved && setStars(i)}>
            <Ionicons name={i <= stars ? 'star' : 'star-outline'} size={32} color="#F5C518" />
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={s.rateInput} placeholder="شارك تجربتك..." value={comment} onChangeText={setComment} editable={!saved} multiline />
      {!saved && (
        <TouchableOpacity style={s.rateBtn} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="white" /> : <Text style={s.rateBtnText}>إرسال التقييم</Text>}
        </TouchableOpacity>
      )}
      {saved && <View style={s.thanks}><Ionicons name="checkmark-circle" size={18} color="#10B981" /><Text style={s.thanksText}>تم استلام تقييمك</Text></View>}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  iconBtn: { padding: 4 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0A0A0A', textAlign: 'center' },
  empty: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { fontSize: 15, color: '#6B7280', fontWeight: '700' },
  emptyBtn: { backgroundColor: PURPLE, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: 'white', fontWeight: '800' },
  card: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  svcName: { fontSize: 15, fontWeight: '900', color: '#0A0A0A', flex: 1, textAlign: 'right' },
  statusBadge: { backgroundColor: '#F4ECFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, color: PURPLE, fontWeight: '800' },
  device: { fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: 'right' },
  issue: { fontSize: 12, color: '#4B5563', marginTop: 4, textAlign: 'right' },
  timeline: { flexDirection: 'row', marginTop: 12, marginBottom: 6 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: PURPLE },
  stepDotCurrent: { transform: [{ scale: 1.15 }] },
  stepLabel: { fontSize: 9, color: '#9CA3AF', marginTop: 4, fontWeight: '600' },
  stepLabelActive: { color: PURPLE, fontWeight: '800' },
  total: { fontSize: 13, color: '#0A0A0A', fontWeight: '800' },
  hint: { fontSize: 11, color: PURPLE, fontWeight: '700' },
  infoBox: { backgroundColor: 'white', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', marginBottom: 8, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLbl: { fontSize: 13, color: '#6B7280' },
  rowVal: { fontSize: 13, color: '#0A0A0A', fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  sec: { fontSize: 14, fontWeight: '800', color: '#0A0A0A', marginTop: 8, marginBottom: 8, textAlign: 'right' },
  emptyBox: { alignItems: 'center', padding: 30, gap: 8, backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  emptySub: { fontSize: 12, color: '#9CA3AF' },
  updateCard: { backgroundColor: 'white', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  updateVideo: { width: '100%', height: 220, backgroundColor: '#000' },
  updateCap: { fontSize: 13, color: '#0A0A0A', padding: 12, textAlign: 'right' },
  rateBox: { padding: 12, borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  rateTitle: { fontSize: 13, fontWeight: '700', color: '#0A0A0A', textAlign: 'right' },
  rateInput: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 13, textAlign: 'right' },
  rateBtn: { backgroundColor: PURPLE, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8 },
  rateBtnText: { color: 'white', fontWeight: '800' },
  thanks: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', padding: 10, backgroundColor: '#F0FDF4' },
  thanksText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  finalCard: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB' },
});
