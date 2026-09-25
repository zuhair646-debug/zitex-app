import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './_layout';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';
const OK = '#10B981';
const RED = '#EF4444';
const AMBER = '#F59E0B';

const RESOLUTIONS = [
  { code: 'refund',       label: 'استرداد المبلغ', icon: 'cash' },
  { code: 'exchange',     label: 'استبدال',        icon: 'swap-horizontal' },
  { code: 'repair',       label: 'إصلاح ضمان',    icon: 'construct' },
  { code: 'store_credit', label: 'رصيد في المحفظة', icon: 'wallet' },
];

export default function CreateRMAScreen() {
  const router = useRouter();
  const { apiCall, token } = useAuth();
  const params = useLocalSearchParams<{ order_id?: string; product_id?: string }>();
  const orderId = String(params.order_id || '');
  const preselectPid = String(params.product_id || '');

  const [step, setStep] = useState<'pick' | 'form'>(preselectPid ? 'form' : 'pick');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<any[]>([]);

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [resolution, setResolution] = useState('refund');
  const [imei, setImei] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [r, rd] = await Promise.all([
          apiCall(`/api/my/orders/${orderId}/returnable`),
          apiCall('/api/rma/reasons'),
        ]);
        setItems(r.items || []);
        setReasons(rd.reasons || []);
        if (preselectPid) {
          const found = (r.items || []).find((it: any) => it.product_id === preselectPid);
          if (found) setSelectedItem(found);
        }
      } catch (e: any) {
        Alert.alert('خطأ', e?.message);
      } finally { setLoading(false); }
    })();
  }, [orderId, preselectPid]);

  const currentReason = reasons.find((r) => r.code === reasonCode);

  const pickMedia = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('صلاحية الصور', 'يرجى منح صلاحية الوصول للصور');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      // @ts-ignore RN form-data blob shape
      form.append('file', { uri: asset.uri, name: asset.fileName || `media.${asset.uri.split('.').pop()}`, type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg') });
      const base = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const resp = await fetch(`${base}/api/upload`, {
        method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'فشل الرفع');
      setMedia([...media, data.url]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message);
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!selectedItem || !reasonCode) {
      Alert.alert('تنبيه', 'اختر المنتج والسبب');
      return;
    }
    if (currentReason?.requires_media && media.length === 0) {
      Alert.alert('تنبيه', 'يجب رفع صور أو فيديو للمنتج');
      return;
    }
    setSaving(true);
    try {
      const r = await apiCall('/api/rmas', {
        method: 'POST',
        body: JSON.stringify({
          order_id: orderId,
          product_id: selectedItem.product_id,
          product_name: selectedItem.product_name,
          qty: selectedItem.qty,
          unit_price: selectedItem.unit_price,
          type: currentReason?.auto_defect ? 'warranty' : 'return',
          reason_code: reasonCode,
          reason_text: reasonText,
          resolution,
          media,
          imei_or_serial: imei,
        }),
      });
      Alert.alert('تم', r.message || 'تم رفع طلبك', [
        { text: 'حسناً', onPress: () => router.replace('/my-returns') },
      ]);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message);
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>طلب إرجاع / ضمان</Text>
          <Text style={s.sub}>{step === 'pick' ? 'اختر المنتج' : 'أكمل تفاصيل الطلب'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
      ) : step === 'pick' ? (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <Text style={s.hint}>اختر المنتج الذي تريد إرجاعه أو طلب ضمان له</Text>
          {items.map((it: any) => (
            <TouchableOpacity key={it.product_id}
              disabled={!it.allow_return && !it.warranty_days}
              onPress={() => { setSelectedItem(it); setStep('form'); }}
              style={[s.itemCard, (!it.allow_return && !it.warranty_days) && { opacity: 0.4 }]}>
              <View style={{ flexDirection: 'row' }}>
                {it.product_image ? (
                  <Image source={{ uri: it.product_image.startsWith('http') ? it.product_image : (process.env.EXPO_PUBLIC_BACKEND_URL || '') + it.product_image }} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="cube" size={22} color={MUTED} />
                  </View>
                )}
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={s.itemTitle} numberOfLines={1}>{it.product_name}</Text>
                  <Text style={s.itemSub}>{it.qty} × {it.unit_price.toFixed(2)} ر.س</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {it.allow_return && it.days_left > 0 && (
                      <View style={[s.badge, { backgroundColor: OK + '20', borderColor: OK }]}>
                        <Text style={[s.badgeText, { color: OK }]}>يمكن إرجاعه · {it.days_left} يوم متبقي</Text>
                      </View>
                    )}
                    {it.warranty_days > 0 && (
                      <View style={[s.badge, { backgroundColor: '#8B5CF620', borderColor: '#8B5CF6' }]}>
                        <Text style={[s.badgeText, { color: '#A78BFA' }]}>ضمان {it.warranty_days} يوم</Text>
                      </View>
                    )}
                    {it.has_active_rma && (
                      <View style={[s.badge, { backgroundColor: AMBER + '20', borderColor: AMBER }]}>
                        <Text style={[s.badgeText, { color: AMBER }]}>يوجد طلب سابق</Text>
                      </View>
                    )}
                    {!it.allow_return && !it.warranty_days && (
                      <View style={[s.badge, { backgroundColor: RED + '20', borderColor: RED }]}>
                        <Text style={[s.badgeText, { color: RED }]}>غير قابل للإرجاع</Text>
                      </View>
                    )}
                  </View>
                </View>
                {(it.allow_return || it.warranty_days > 0) && (
                  <Ionicons name="chevron-back" size={16} color={MUTED} />
                )}
              </View>
            </TouchableOpacity>
          ))}
          {items.length === 0 && (
            <Text style={{ color: MUTED, textAlign: 'center', padding: 40 }}>لا توجد منتجات قابلة للإرجاع</Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {selectedItem && (
            <View style={s.itemCard}>
              <View style={{ flexDirection: 'row' }}>
                {selectedItem.product_image ? (
                  <Image source={{ uri: selectedItem.product_image.startsWith('http') ? selectedItem.product_image : (process.env.EXPO_PUBLIC_BACKEND_URL || '') + selectedItem.product_image }} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="cube" size={22} color={MUTED} />
                  </View>
                )}
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={s.itemTitle}>{selectedItem.product_name}</Text>
                  <Text style={s.itemSub}>{selectedItem.qty} × {selectedItem.unit_price?.toFixed(2)} ر.س</Text>
                </View>
              </View>
            </View>
          )}

          <Text style={s.label}>سبب الإرجاع</Text>
          {reasons.map((r: any) => (
            <TouchableOpacity key={r.code}
              onPress={() => setReasonCode(r.code)}
              style={[s.reasonRow, reasonCode === r.code && { borderColor: GOLD, backgroundColor: GOLD + '15' }]}>
              <View style={s.reasonIcon}>
                <Ionicons name={r.auto_defect ? 'warning' : 'return-up-back'} size={16} color={r.auto_defect ? RED : TEXT} />
              </View>
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <Text style={s.reasonLabel}>{r.label_ar}</Text>
                {r.requires_media && <Text style={s.reasonHint}>يتطلب رفع صور/فيديو</Text>}
              </View>
              {reasonCode === r.code && <Ionicons name="checkmark-circle" size={18} color={GOLD} />}
            </TouchableOpacity>
          ))}

          <Text style={s.label}>الحل المطلوب</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {RESOLUTIONS.map((r) => (
              <TouchableOpacity key={r.code}
                onPress={() => setResolution(r.code)}
                style={[s.resCard, resolution === r.code && { borderColor: GOLD, backgroundColor: GOLD + '15' }]}>
                <Ionicons name={r.icon as any} size={16} color={resolution === r.code ? GOLD : TEXT} />
                <Text style={[s.resText, resolution === r.code && { color: GOLD }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>تفاصيل المشكلة</Text>
          <TextInput style={[s.input, { minHeight: 90 }]} multiline
            value={reasonText} onChangeText={setReasonText}
            placeholder="اشرح المشكلة بالتفصيل..." placeholderTextColor={MUTED} />

          <Text style={s.label}>IMEI / الرقم التسلسلي (اختياري للأجهزة)</Text>
          <TextInput style={s.input}
            value={imei} onChangeText={setImei}
            placeholder="مثال: 351234567890123" placeholderTextColor={MUTED} />

          <Text style={s.label}>
            صور/فيديو للمنتج {currentReason?.requires_media ? '(مطلوب)' : '(اختياري)'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {media.map((m, i) => (
              <View key={i} style={{ position: 'relative' }}>
                <Image source={{ uri: m.startsWith('http') ? m : (process.env.EXPO_PUBLIC_BACKEND_URL || '') + m }} style={s.mediaThumb} />
                <TouchableOpacity onPress={() => setMedia(media.filter((_, x) => x !== i))} style={s.removeBtn}>
                  <Ionicons name="close" size={12} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={pickMedia} style={s.addMediaBtn} disabled={uploading}>
              {uploading ? <ActivityIndicator color={GOLD} /> : (
                <>
                  <Ionicons name="add" size={22} color={GOLD} />
                  <Text style={{ color: GOLD, fontSize: 10 }}>إضافة</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={submit} style={s.submitBtn} disabled={saving}>
            {saving ? <ActivityIndicator color={BG} /> : <Text style={s.submitText}>إرسال الطلب للمتجر</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right', marginHorizontal: 10 },
  sub: { color: MUTED, fontSize: 10, textAlign: 'right', marginHorizontal: 10 },
  hint: { color: MUTED, fontSize: 11, textAlign: 'right', marginBottom: 10 },
  itemCard: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12, marginBottom: 8 },
  thumb: { width: 58, height: 58, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  itemTitle: { color: TEXT, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  itemSub: { color: GOLD, fontSize: 11, textAlign: 'right', marginTop: 2 },
  badge: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 9, fontWeight: '900' },
  label: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, color: TEXT, textAlign: 'right' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 10, borderRadius: 10, marginBottom: 6 },
  reasonIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  reasonLabel: { color: TEXT, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  reasonHint: { color: AMBER, fontSize: 9, textAlign: 'right', marginTop: 2 },
  resCard: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  resText: { color: TEXT, fontSize: 11, fontWeight: '700' },
  mediaThumb: { width: 68, height: 68, borderRadius: 10 },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  addMediaBtn: { width: 68, height: 68, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: GOLD, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  submitBtn: { backgroundColor: GOLD, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  submitText: { color: BG, fontSize: 14, fontWeight: '900' },
});
