import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Switch, Alert, ActivityIndicator, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../_layout';
import { uploadMedia, mediaUrlSync } from '../../src/utils/upload';

const TYPES = [
  { id: 'general', name: 'سحب عام', icon: 'people', desc: 'أي مستخدم مسجّل يمكنه الانضمام' },
  { id: 'qa', name: 'سؤال وجواب', icon: 'help-circle', desc: 'الإجابة الصحيحة تدخل السحب' },
  { id: 'purchase', name: 'شراء بمبلغ', icon: 'cart', desc: 'اشترِ بمبلغ محدد وادخل السحب' },
  { id: 'ugc_video', name: 'فيديو تسويقي', icon: 'videocam', desc: 'الأكثر لايكات يفوز' },
  { id: 'signup', name: 'تسجيل جديد', icon: 'person-add', desc: 'كل مستخدم جديد يدخل تلقائياً' },
];

export default function CompetitionForm() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', phone: '', password: '', email: '' });
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState<'cover' | 'prize' | null>(null);
  const [data, setData] = useState<any>({
    title: '', description: '', prize: '', prize_count: '1',
    competition_type: 'general',
    question: '', correct_answer: '', options: ['', '', '', ''],
    spend_requirement: '0', purchase_mode: 'single',
    max_submissions_per_user: '1', ugc_hashtag: '',
    start_date: '', end_date: '', draw_date: '',
    max_participants: '1000',
    chamber_supervised: false, permit_number: '', assigned_chamber_employee_id: '',
    cover_image: '', prize_image: '',
  });

  const pickPhoto = async (kind: 'cover' | 'prize') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية', 'السماح للوصول للمعرض'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85 });
    if (res.canceled) return;
    setUploading(kind);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      setData((d: any) => ({ ...d, [kind === 'cover' ? 'cover_image' : 'prize_image']: up.path }));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(null); }
  };

  const setOpt = (i: number, v: string) =>
    setData((d: any) => ({ ...d, options: d.options.map((o: string, ix: number) => ix === i ? v : o) }));

  const loadEmps = async () => { try { const r = await apiCall('/api/merchant/chamber-employees'); setEmployees(r); } catch {} };
  useEffect(() => { loadEmps(); }, []);

  const createEmp = async () => {
    if (!newEmp.name || !newEmp.phone || !newEmp.password) { Alert.alert('Required', 'Name, phone, password required'); return; }
    try {
      const r = await apiCall('/api/merchant/chamber-employees', { method: 'POST', body: JSON.stringify(newEmp) });
      Alert.alert('Success', `Employee created. ID: ${r.id}`);
      setShowEmpModal(false); setNewEmp({ name: '', phone: '', password: '', email: '' });
      loadEmps();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const submit = async () => {
    if (!data.title || !data.prize) { Alert.alert('مطلوب', 'العنوان والجائزة مطلوبان'); return; }
    if (data.competition_type === 'qa' && (!data.question || !data.correct_answer)) { Alert.alert('مطلوب', 'السؤال والإجابة الصحيحة مطلوبان'); return; }
    if (data.competition_type === 'ugc_video' && !data.end_date) { Alert.alert('مطلوب', 'تاريخ نهاية المسابقة مطلوب لفيديوهات UGC'); return; }
    if (data.chamber_supervised && (!data.permit_number || !data.assigned_chamber_employee_id)) { Alert.alert('مطلوب', 'رقم التصريح وموظف الغرفة مطلوبان'); return; }
    setLoading(true);
    try {
      const body: any = {
        ...data,
        prize_count: parseInt(data.prize_count) || 1,
        spend_requirement: parseFloat(data.spend_requirement) || 0,
        max_participants: parseInt(data.max_participants) || 1000,
        max_submissions_per_user: parseInt(data.max_submissions_per_user) || 1,
        options: (data.options || []).filter((o: string) => o.trim()),
      };
      await apiCall('/api/merchant/competitions', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('نجاح', 'تم نشر المسابقة', [{ text: 'موافق', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>New Competition</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.sectionTitle}>Type *</Text>
        <View style={s.typeGrid}>
          {TYPES.map(t => (
            <TouchableOpacity key={t.id} onPress={() => setData({ ...data, competition_type: t.id })} style={[s.typeCard, data.competition_type === t.id && s.typeCardActive]}>
              <Ionicons name={t.icon as any} size={22} color={data.competition_type === t.id ? 'white' : '#8833FF'} />
              <Text style={[s.typeName, data.competition_type === t.id && { color: 'white' }]}>{t.name}</Text>
              <Text style={[s.typeDesc, data.competition_type === t.id && { color: 'white' }]}>{t.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>عنوان المسابقة *</Text>
        <TextInput style={s.input} value={data.title} onChangeText={t => setData({ ...data, title: t })} placeholder="سحب العيد الكبير" />
        <Text style={s.label}>الوصف</Text>
        <TextInput style={[s.input, { height: 80 }]} multiline value={data.description} onChangeText={t => setData({ ...data, description: t })} placeholder="تفاصيل المسابقة..." />
        <Text style={s.label}>الجائزة *</Text>
        <TextInput style={s.input} value={data.prize} onChangeText={t => setData({ ...data, prize: t })} placeholder="iPhone 16 Pro" />
        <Text style={s.label}>عدد الفائزين</Text>
        <TextInput style={s.input} keyboardType="numeric" value={data.prize_count} onChangeText={t => setData({ ...data, prize_count: t })} />

        {/* Cover + Prize images (upload) */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>صورة الغلاف</Text>
            {data.cover_image ? (
              <View style={s.imgSlotBox}>
                <Image source={{ uri: mediaUrlSync(data.cover_image) }} style={s.imgSlotImg} contentFit="cover" />
                <TouchableOpacity style={s.imgSlotRm} onPress={() => setData({ ...data, cover_image: '' })}>
                  <Ionicons name="close" size={14} color="white" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.imgPickBox} onPress={() => pickPhoto('cover')} disabled={!!uploading}>
                {uploading === 'cover' ? <ActivityIndicator color="#F5C518" /> : <>
                  <Ionicons name="image" size={22} color="#F5C518" />
                  <Text style={s.imgPickTxt}>غلاف</Text>
                </>}
              </TouchableOpacity>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>صورة الجائزة</Text>
            {data.prize_image ? (
              <View style={s.imgSlotBox}>
                <Image source={{ uri: mediaUrlSync(data.prize_image) }} style={s.imgSlotImg} contentFit="cover" />
                <TouchableOpacity style={s.imgSlotRm} onPress={() => setData({ ...data, prize_image: '' })}>
                  <Ionicons name="close" size={14} color="white" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.imgPickBox} onPress={() => pickPhoto('prize')} disabled={!!uploading}>
                {uploading === 'prize' ? <ActivityIndicator color="#F5C518" /> : <>
                  <Ionicons name="trophy" size={22} color="#F5C518" />
                  <Text style={s.imgPickTxt}>جائزة</Text>
                </>}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {data.competition_type === 'qa' && (
          <>
            <Text style={s.label}>السؤال *</Text>
            <TextInput style={s.input} value={data.question} onChangeText={t => setData({ ...data, question: t })} placeholder="ما عاصمة المملكة العربية السعودية؟" />
            <Text style={s.label}>الخيارات (اضغط ⭐ للإجابة الصحيحة)</Text>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <TouchableOpacity onPress={() => { if (data.options[i]?.trim()) setData({ ...data, correct_answer: data.options[i] }); }} style={s.starBtn} testID={`comp-star-${i}`}>
                  <Ionicons name={data.correct_answer && data.correct_answer === data.options[i] && data.options[i] ? 'star' : 'star-outline'} size={22} color="#F5C518" />
                </TouchableOpacity>
                <TextInput style={[s.input, { flex: 1, marginTop: 0 }]} value={data.options[i]} onChangeText={t => setOpt(i, t)} placeholder={`الخيار ${i + 1}`} testID={`comp-option-${i}`} />
              </View>
            ))}
            <Text style={s.hint}>💡 اكتب الخيارات ثم اضغط ⭐ بجانب الإجابة الصحيحة</Text>
          </>
        )}
        {data.competition_type === 'purchase' && (
          <>
            <Text style={s.label}>الحد الأدنى للشراء (ر.س)</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.spend_requirement} onChangeText={t => setData({ ...data, spend_requirement: t })} />
            <Text style={s.label}>وضع المبلغ</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setData({ ...data, purchase_mode: 'single' })} style={[s.modePill, data.purchase_mode === 'single' && s.modePillActive]}>
                <Text style={[s.modePillText, data.purchase_mode === 'single' && s.modePillTextActive]}>🧾 فاتورة واحدة</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setData({ ...data, purchase_mode: 'accumulated' })} style={[s.modePill, data.purchase_mode === 'accumulated' && s.modePillActive]}>
                <Text style={[s.modePillText, data.purchase_mode === 'accumulated' && s.modePillTextActive]}>➕ تراكمي</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.hint}>0 = أي عملية شراء تؤهل</Text>
          </>
        )}
        {data.competition_type === 'ugc_video' && (
          <>
            <Text style={s.label}>هاشتاق المسابقة (اختياري)</Text>
            <TextInput style={s.input} value={data.ugc_hashtag} onChangeText={t => setData({ ...data, ugc_hashtag: t })} placeholder="زايتكس_challenge" autoCapitalize="none" />
            <Text style={s.label}>الحد الأقصى للفيديوهات لكل مستخدم</Text>
            <TextInput style={s.input} keyboardType="numeric" value={data.max_submissions_per_user} onChangeText={t => setData({ ...data, max_submissions_per_user: t })} />
            <Text style={s.hint}>💡 الأكثر لايكات يفوز — الترتيب يتحدث تلقائياً. عند انتهاء الوقت، يُختار الفائزون تلقائياً.</Text>
          </>
        )}

        <Text style={s.label}>تاريخ السحب</Text>
        <TextInput style={s.input} value={data.draw_date} onChangeText={t => setData({ ...data, draw_date: t })} placeholder="2026-09-01" />
        <Text style={s.label}>تاريخ الانتهاء</Text>
        <TextInput style={s.input} value={data.end_date} onChangeText={t => setData({ ...data, end_date: t })} placeholder="2026-08-30" />

        <View style={s.divider} />
        <Text style={s.sectionTitle}>إشراف الغرفة التجارية</Text>
        <View style={s.toggle}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLbl}>مسابقة تحت إشراف الغرفة</Text>
            <Text style={s.toggleHint}>للسحوبات المرخصة التي تحتاج تصريح</Text>
          </View>
          <Switch value={data.chamber_supervised} onValueChange={v => setData({ ...data, chamber_supervised: v })} trackColor={{ true: '#F5C518' }} />
        </View>
        {data.chamber_supervised && (
          <>
            <Text style={s.label}>رقم التصريح *</Text>
            <TextInput style={s.input} value={data.permit_number} onChangeText={t => setData({ ...data, permit_number: t })} placeholder="CR-2026-1234" />
            <Text style={s.hint}>سيُعرض للعملاء كإثبات للشرعية</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Text style={s.label}>موظف الغرفة المُكلَّف *</Text>
              <TouchableOpacity onPress={() => setShowEmpModal(true)} style={s.smallBtn}><Text style={s.smallBtnText}>+ جديد</Text></TouchableOpacity>
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

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <TouchableOpacity testID="comp-preview-btn" style={[s.submitBtn, { flex: 1, backgroundColor: '#151515', borderWidth: 1, borderColor: '#F5C518' }]} onPress={() => setShowPreview(true)}>
            <Text style={[s.submitText, { color: '#F5C518' }]}>👁️ معاينة</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="comp-submit-btn" style={[s.submitBtn, { flex: 2 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={s.submitText}>نشر المسابقة</Text>}
          </TouchableOpacity>
        </View>

        {/* Preview modal */}
        <Modal visible={showPreview} animationType="slide" transparent={false} onRequestClose={() => setShowPreview(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
            <View style={s.previewHeader}>
              <TouchableOpacity onPress={() => setShowPreview(false)}><Ionicons name="close" size={24} color="#F5C518" /></TouchableOpacity>
              <Text style={s.previewTitle}>معاينة (كما يراها العميل)</Text>
              <View style={{ width: 24 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {!!data.cover_image && <Image source={{ uri: mediaUrlSync(data.cover_image) }} style={s.prevCover} contentFit="cover" />}
              <View style={s.prevCard}>
                <View style={s.prevBadge}><Text style={s.prevBadgeText}>{TYPES.find(t => t.id === data.competition_type)?.name || 'مسابقة'}</Text></View>
                <Text style={s.prevH1}>{data.title || 'عنوان المسابقة'}</Text>
                {!!data.description && <Text style={s.prevDesc}>{data.description}</Text>}
                <LinearGradient colors={['#F5C518', '#D4A017']} style={s.prevPrize} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  {!!data.prize_image && <Image source={{ uri: mediaUrlSync(data.prize_image) }} style={s.prevPrizeImg} contentFit="cover" />}
                  <View style={{ flex: 1 }}>
                    <Text style={s.prevPrizeLbl}>🏆 الجائزة</Text>
                    <Text style={s.prevPrizeName}>{data.prize || '—'}</Text>
                    <Text style={s.prevPrizeSub}>عدد الفائزين: {data.prize_count || 1}</Text>
                  </View>
                </LinearGradient>
                {data.competition_type === 'qa' && !!data.question && (
                  <View style={s.prevQA}>
                    <Text style={s.prevQ}>❓ {data.question}</Text>
                    {data.options.filter((o: string) => o.trim()).map((o: string, i: number) => (
                      <View key={i} style={[s.prevOpt, o === data.correct_answer && s.prevOptCorrect]}>
                        <Text style={s.prevOptTxt}>{o}</Text>
                        {o === data.correct_answer && <Ionicons name="checkmark-circle" size={18} color="#10B981" />}
                      </View>
                    ))}
                  </View>
                )}
                {data.competition_type === 'purchase' && (
                  <View style={s.prevInfoBox}>
                    <Ionicons name="cart" size={18} color="#F5C518" />
                    <Text style={s.prevInfoTxt}>
                      اشترِ بـ {data.spend_requirement || 0} ر.س {data.purchase_mode === 'accumulated' ? 'تراكمياً' : 'في فاتورة واحدة'}
                    </Text>
                  </View>
                )}
                {data.competition_type === 'ugc_video' && (
                  <View style={s.prevInfoBox}>
                    <Ionicons name="videocam" size={18} color="#F5C518" />
                    <Text style={s.prevInfoTxt}>ارفع فيديو تسويقي — الأكثر لايكات يفوز {data.ugc_hashtag ? `• #${data.ugc_hashtag}` : ''}</Text>
                  </View>
                )}
                {data.chamber_supervised && (
                  <View style={s.prevChamber}>
                    <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                    <Text style={s.prevChamberTxt}>معتمدة من الغرفة التجارية • تصريح {data.permit_number}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </ScrollView>

      <Modal visible={showEmpModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEmpModal(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setShowEmpModal(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
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
  starBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  imgPickBox: { alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#F5C518', borderStyle: 'dashed', backgroundColor: '#FFF6E0', gap: 4 },
  imgPickTxt: { fontSize: 11, color: '#8B7500', fontWeight: '700' },
  imgSlotBox: { height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F3F4F6', position: 'relative' },
  imgSlotImg: { width: '100%', height: '100%' },
  imgSlotRm: { position: 'absolute', top: 4, right: 4, backgroundColor: '#EF4444', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  previewTitle: { color: 'white', fontSize: 16, fontWeight: '800' },
  prevCover: { width: '100%', height: 180, borderRadius: 16, marginBottom: 12 },
  prevCard: { backgroundColor: '#151515', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2A2A2A' },
  prevBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#2E2404', marginBottom: 8 },
  prevBadgeText: { color: '#F5C518', fontSize: 11, fontWeight: '800' },
  prevH1: { color: 'white', fontSize: 20, fontWeight: '900', marginBottom: 6 },
  prevDesc: { color: '#D0D0D0', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  prevPrize: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, alignItems: 'center', marginBottom: 12 },
  prevPrizeImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: 'white' },
  prevPrizeLbl: { color: '#0A0A0A', fontWeight: '700', fontSize: 12 },
  prevPrizeName: { color: '#0A0A0A', fontWeight: '900', fontSize: 18, marginTop: 2 },
  prevPrizeSub: { color: '#0A0A0A', fontSize: 11, marginTop: 2 },
  prevQA: { marginTop: 8 },
  prevQ: { color: 'white', fontWeight: '800', fontSize: 15, marginBottom: 10 },
  prevOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#2A2A2A', marginBottom: 8, borderWidth: 1, borderColor: '#2A2A2A' },
  prevOptCorrect: { backgroundColor: '#052E19', borderColor: '#10B981' },
  prevOptTxt: { color: 'white', fontSize: 14, flex: 1, textAlign: 'right' },
  prevInfoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#2E2404', marginTop: 8 },
  prevInfoTxt: { color: '#F5C518', fontSize: 13, fontWeight: '600' },
  prevChamber: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#052E19', borderWidth: 1, borderColor: '#10B981' },
  prevChamberTxt: { color: '#10B981', fontSize: 12, fontWeight: '700' },
  modePill: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', alignItems: 'center', marginTop: 6 },
  modePillActive: { borderColor: '#F5C518', backgroundColor: '#FFF6E0' },
  modePillText: { fontSize: 13, fontWeight: '700', color: '#52525B' },
  modePillTextActive: { color: '#8B7500' },
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
