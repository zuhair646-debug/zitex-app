import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert,
  ActivityIndicator, Modal, RefreshControl, Platform, StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../_layout';
import { uploadMedia, mediaUrlSync } from '../../src/utils/upload';
import { colors, spacing, radius } from '../../src/theme/tokens';

type Tab = 'ads' | 'affiliates';
type CampaignType = 'ad' | 'affiliate';

const INTEREST_TAGS = [
  { id: 'phones', label: '📱 جوالات' },
  { id: 'laptops', label: '💻 لابتوبات' },
  { id: 'gaming', label: '🎮 ألعاب' },
  { id: 'accessories', label: '🎧 إكسسوارات' },
  { id: 'home', label: '🏠 إلكترونيات منزلية' },
  { id: 'smartwatches', label: '⌚ ساعات ذكية' },
];
const CITIES = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'مكة', 'المدينة', 'الطائف', 'أبها', 'تبوك', 'حائل'];

export default function MarketingPanel() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [tab, setTab] = useState<Tab>('ads');
  const [ads, setAds] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Campaign creation flow
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [campaignType, setCampaignType] = useState<CampaignType>('ad');
  const [form, setForm] = useState<any>({
    title: '', description: '', image: '',
    cta_label: 'تسوّق الآن', cta_link: '',
    target_cities: [] as string[], target_gender: 'all',
    target_interest_tags: [] as string[],
    starts_at: '', ends_at: '',
    commission_percent: '5', incentives: '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, p, f] = await Promise.all([
        apiCall('/api/merchant/marketing/ads').catch(() => []),
        apiCall('/api/merchant/affiliate/applications').catch(() => []),
        apiCall('/api/merchant/affiliate/list').catch(() => []),
      ]);
      setAds(a); setApps(p); setAffiliates(f);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = (type: CampaignType) => {
    setCampaignType(type);
    setForm({
      title: '', description: '', image: '',
      cta_label: type === 'affiliate' ? 'قدّم الآن' : 'تسوّق الآن',
      cta_link: '',
      target_cities: [], target_gender: 'all', target_interest_tags: [],
      starts_at: '', ends_at: '',
      commission_percent: '5', incentives: '',
    });
    setPickerOpen(false);
    setFormOpen(true);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية', 'السماح للوصول للمعرض'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      setForm((f: any) => ({ ...f, image: up.path }));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const toggleCity = (c: string) =>
    setForm((f: any) => ({ ...f, target_cities: f.target_cities.includes(c) ? f.target_cities.filter((x: string) => x !== c) : [...f.target_cities, c] }));
  const toggleTag = (t: string) =>
    setForm((f: any) => ({ ...f, target_interest_tags: f.target_interest_tags.includes(t) ? f.target_interest_tags.filter((x: string) => x !== t) : [...f.target_interest_tags, t] }));

  const submit = async () => {
    if (!form.title.trim()) { Alert.alert('مطلوب', 'اكتب عنوان الحملة'); return; }
    if (campaignType === 'affiliate' && (!form.commission_percent || parseFloat(form.commission_percent) <= 0)) {
      Alert.alert('مطلوب', 'حدد نسبة العمولة'); return;
    }
    setSaving(true);
    try {
      const body: any = {
        campaign_type: campaignType,
        title: form.title,
        description: form.description,
        image: form.image,
        cta_label: form.cta_label || (campaignType === 'affiliate' ? 'قدّم الآن' : 'تسوّق الآن'),
        cta_link: form.cta_link,
        target_cities: form.target_cities,
        target_genders: form.target_gender === 'all' ? [] : [form.target_gender],
        target_interest_tags: form.target_interest_tags,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
      };
      if (campaignType === 'affiliate') {
        body.commission_percent = parseFloat(form.commission_percent) || 0;
        body.incentives = form.incentives;
      }
      await apiCall('/api/merchant/marketing/ads', { method: 'POST', body: JSON.stringify(body) });
      setFormOpen(false);
      load();
      Alert.alert('✅ تم', campaignType === 'affiliate' ? 'تم نشر برنامج المسوقين' : 'تم نشر الإعلان');
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  const deleteAd = (id: string) => Alert.alert('حذف الحملة؟', '', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: async () => {
      try { await apiCall(`/api/merchant/marketing/ads/${id}`, { method: 'DELETE' }); load(); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
    } },
  ]);

  const approveApp = (id: string, name: string) => {
    Alert.alert('الموافقة على المسوق', `الموافقة على ${name}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'موافقة', onPress: async () => {
        try {
          const r = await apiCall(`/api/merchant/affiliate/applications/${id}/approve`, { method: 'POST' });
          Alert.alert('✅ تمت الموافقة', `كود الإحالة: ${r.referral_code}\nالعمولة: ${r.commission_percent}%`);
          load();
        } catch (e: any) { Alert.alert('خطأ', e.message); }
      } },
    ]);
  };
  const rejectApp = (id: string) => Alert.alert('رفض الطلب؟', '', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'رفض', style: 'destructive', onPress: async () => {
      try { await apiCall(`/api/merchant/affiliate/applications/${id}/reject`, { method: 'POST' }); load(); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
    } },
  ]);

  const pending = apps.filter((a: any) => a.status === 'pending');
  const adCampaigns = ads.filter((a: any) => (a.campaign_type || 'ad') === 'ad');
  const affCampaigns = ads.filter((a: any) => a.campaign_type === 'affiliate');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerIcon}>
            <Ionicons name="arrow-back" size={22} color={colors.brand} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>لوحة التسويق</Text>
          <TouchableOpacity testID="marketing-add-btn" onPress={() => setPickerOpen(true)} style={s.headerIcon}>
            <Ionicons name="add" size={26} color={colors.brand} />
          </TouchableOpacity>
        </View>

        <View style={s.segmentWrap}>
          <TouchableOpacity onPress={() => setTab('ads')} style={[s.segment, tab === 'ads' && s.segmentActive]}>
            <Ionicons name="megaphone" size={16} color={tab === 'ads' ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[s.segmentText, tab === 'ads' && s.segmentTextActive]}>الإعلانات ({adCampaigns.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('affiliates')} style={[s.segment, tab === 'affiliates' && s.segmentActive]}>
            <Ionicons name="people" size={16} color={tab === 'affiliates' ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[s.segmentText, tab === 'affiliates' && s.segmentTextActive]}>المسوقون {pending.length > 0 ? `🔔 ${pending.length}` : `(${affiliates.length})`}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} /> :
           tab === 'ads' ? (
            <>
              {adCampaigns.length === 0 && (
                <View style={s.empty}>
                  <Ionicons name="megaphone-outline" size={54} color={colors.onSurfaceTertiary} />
                  <Text style={s.emptyTitle}>لا توجد إعلانات</Text>
                  <Text style={s.emptyDesc}>اضغط + في الأعلى لإنشاء أول إعلان مستهدف مجاناً</Text>
                </View>
              )}
              {adCampaigns.map(ad => (
                <View key={ad.id} style={s.adCard}>
                  {!!ad.image && <Image source={{ uri: mediaUrlSync(ad.image) }} style={s.adImage} contentFit="cover" />}
                  <View style={{ padding: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[s.pill, { backgroundColor: ad.active ? colors.brandTertiary : colors.surfaceTertiary }]}>
                        <Text style={[s.pillText, { color: ad.active ? colors.brand : colors.onSurfaceSecondary }]}>{ad.active ? '● مباشر' : '○ متوقف'}</Text>
                      </View>
                      <Text style={s.adTitle}>{ad.title}</Text>
                    </View>
                    {!!ad.description && <Text style={s.adDesc}>{ad.description}</Text>}
                    <View style={s.adStats}>
                      <View style={s.adStat}><Ionicons name="eye" size={12} color={colors.onSurfaceTertiary} /><Text style={s.adStatText}>{ad.views || 0}</Text></View>
                      <View style={s.adStat}><Ionicons name="hand-left" size={12} color={colors.onSurfaceTertiary} /><Text style={s.adStatText}>{ad.clicks || 0}</Text></View>
                      {!!ad.target_cities?.length && <View style={s.adStat}><Ionicons name="location" size={12} color={colors.onSurfaceTertiary} /><Text style={s.adStatText}>{ad.target_cities.length} مدن</Text></View>}
                      <TouchableOpacity onPress={() => deleteAd(ad.id)} style={{ marginLeft: 'auto' }}>
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <>
              {/* Affiliate Campaigns */}
              {affCampaigns.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>💎 برامج التسويق بالعمولة ({affCampaigns.length})</Text>
                  {affCampaigns.map(c => (
                    <View key={c.id} style={s.affCampCard}>
                      {!!c.image && <Image source={{ uri: mediaUrlSync(c.image) }} style={s.affCampImage} contentFit="cover" />}
                      <View style={{ padding: spacing.md }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <View style={s.commissionBadge}><Text style={s.commissionText}>{c.commission_percent}%</Text></View>
                          <Text style={s.adTitle}>{c.title}</Text>
                        </View>
                        {!!c.description && <Text style={s.adDesc}>{c.description}</Text>}
                        {!!c.incentives && <Text style={s.incentives}>🎁 {c.incentives}</Text>}
                        <View style={s.adStats}>
                          <View style={s.adStat}><Ionicons name="eye" size={12} color={colors.onSurfaceTertiary} /><Text style={s.adStatText}>{c.views || 0} مشاهدة</Text></View>
                          <TouchableOpacity onPress={() => deleteAd(c.id)} style={{ marginLeft: 'auto' }}>
                            <Ionicons name="trash-outline" size={18} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {pending.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>📥 طلبات قيد المراجعة ({pending.length})</Text>
                  {pending.map(a => (
                    <View key={a.id} style={s.appCard}>
                      <View style={s.appAvatar}><Text style={s.appAvText}>{(a.applicant_name || '?').charAt(0)}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.appName}>{a.applicant_name}</Text>
                        <Text style={s.appPhone}>📱 {a.applicant_phone}</Text>
                        {!!a.applicant_city && <Text style={s.appSocial}>📍 {a.applicant_city}</Text>}
                        {!!a.social_handle && <Text style={s.appSocial}>🔗 {a.social_handle}</Text>}
                        {!!a.audience_size && <Text style={s.appSocial}>👥 {(a.audience_size || 0).toLocaleString('ar')} متابع</Text>}
                        {!!a.note && <Text style={s.appNote}>“{a.note}”</Text>}
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity onPress={() => rejectApp(a.id)} style={s.rejectBtn}>
                            <Text style={s.rejectText}>رفض</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => approveApp(a.id, a.applicant_name)} style={s.approveBtn}>
                            <LinearGradient colors={['#F5C518', '#D4AF37']} style={s.approveInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                              <Text style={s.approveText}>موافقة</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <Text style={s.sectionTitle}>🏆 المسوقون النشطون ({affiliates.length})</Text>
              {affiliates.length === 0 && pending.length === 0 && affCampaigns.length === 0 && (
                <View style={s.empty}>
                  <Ionicons name="people-outline" size={54} color={colors.onSurfaceTertiary} />
                  <Text style={s.emptyTitle}>ابدأ برنامج المسوقين</Text>
                  <Text style={s.emptyDesc}>اضغط + وأنشئ برنامج تسويق بالعمولة{'\n'}العملاء سيرون العرض في السوشال ويقدمون</Text>
                </View>
              )}
              {affiliates.map(af => (
                <View key={af.id} style={s.affRow}>
                  <View style={s.affRank}><Text style={s.affRankText}>#{affiliates.indexOf(af) + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.affName}>{af.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 }}>
                      <View style={s.codePill}><Text style={s.codeText}>{af.referral_code}</Text></View>
                      <Text style={s.affCommission}>{af.commission_percent}%</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.affEarn}>{(af.total_earnings || 0).toFixed(0)} ر.س</Text>
                    <Text style={s.affConv}>{af.total_conversions || 0} تحويل • {af.total_clicks || 0} نقرة</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Type picker */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={s.pickerBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={s.pickerCard}>
            <Text style={s.pickerTitle}>أنشئ حملة جديدة</Text>
            <TouchableOpacity testID="picker-ad" style={s.pickerOption} onPress={() => openCreate('ad')}>
              <View style={s.pickerIcon}><Ionicons name="megaphone" size={24} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.pickerOptTitle}>إعلان مستهدف مجاني</Text>
                <Text style={s.pickerOptDesc}>يظهر للعملاء المناسبين بحسب المدينة والاهتمام — بلا ميزانية</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity testID="picker-affiliate" style={s.pickerOption} onPress={() => openCreate('affiliate')}>
              <View style={s.pickerIcon}><Ionicons name="people" size={24} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.pickerOptTitle}>برنامج مسوّقين بالعمولة</Text>
                <Text style={s.pickerOptDesc}>حدد النسبة % والمكافآت. العملاء يقدّمون وتوافق أنت</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unified form modal */}
      <Modal visible={formOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormOpen(false)}>
        <View style={s.root}>
          <StatusBar barStyle="light-content" />
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setFormOpen(false)} style={s.headerIcon}>
                <Ionicons name="close" size={24} color={colors.brand} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>{campaignType === 'affiliate' ? 'برنامج مسوّقين' : 'إعلان مستهدف'}</Text>
              <TouchableOpacity testID="form-submit-btn" onPress={submit} disabled={saving || uploading} style={s.headerIcon}>
                <LinearGradient colors={['#F5C518', '#D4AF37']} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {saving ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: '800' }}>نشر</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
              <Text style={s.label}>عنوان الحملة *</Text>
              <TextInput testID="form-title-input" style={s.input} value={form.title} onChangeText={t => setForm({ ...form, title: t })}
                placeholderTextColor={colors.onSurfaceTertiary}
                placeholder={campaignType === 'affiliate' ? 'انضم لبرنامج مسوّقي زايتكس' : 'خصومات نهاية الأسبوع 30%'} />

              <Text style={s.label}>الوصف</Text>
              <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} multiline value={form.description}
                onChangeText={t => setForm({ ...form, description: t })}
                placeholderTextColor={colors.onSurfaceTertiary}
                placeholder={campaignType === 'affiliate' ? 'اشترك واحصل على عمولة ثابتة من كل عملية شراء تتم عبر رابطك' : 'اشترك بأفضل الأسعار والعروض الحصرية'} />

              {campaignType === 'affiliate' && (
                <>
                  <Text style={s.label}>نسبة العمولة (%) *</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {['2', '5', '10', '15', '20'].map(v => (
                      <TouchableOpacity key={v} onPress={() => setForm({ ...form, commission_percent: v })}
                        style={[s.pctPill, form.commission_percent === v && s.pctPillActive]}>
                        <Text style={[s.pctText, form.commission_percent === v && s.pctTextActive]}>{v}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={[s.input, { marginTop: 8 }]} keyboardType="numeric" value={form.commission_percent}
                    onChangeText={t => setForm({ ...form, commission_percent: t })}
                    placeholderTextColor={colors.onSurfaceTertiary} placeholder="مثال: 7.5" />

                  <Text style={s.label}>🎁 الحوافز والمكافآت (اختياري)</Text>
                  <TextInput testID="form-incentives-input" style={[s.input, { height: 70, textAlignVertical: 'top' }]} multiline value={form.incentives}
                    onChangeText={t => setForm({ ...form, incentives: t })}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    placeholder="أفضل مسوّق شهرياً يحصل على 500 ر.س إضافية" />
                </>
              )}

              <Text style={s.label}>صورة الحملة</Text>
              {form.image ? (
                <View style={s.imgSlot}>
                  <Image source={{ uri: mediaUrlSync(form.image) }} style={s.imgSlotImg} contentFit="cover" />
                  <TouchableOpacity style={s.imgRemove} onPress={() => setForm({ ...form, image: '' })}>
                    <Ionicons name="close" size={16} color="white" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.imgPickBtn} onPress={pickImage} disabled={uploading}>
                  {uploading ? <ActivityIndicator color={colors.brand} /> : <>
                    <Ionicons name="image" size={26} color={colors.brand} />
                    <Text style={s.imgPickText}>اختر صورة (اختياري)</Text>
                  </>}
                </TouchableOpacity>
              )}

              <Text style={s.label}>نص زر الدعوة</Text>
              <TextInput style={s.input} value={form.cta_label} onChangeText={t => setForm({ ...form, cta_label: t })}
                placeholderTextColor={colors.onSurfaceTertiary} placeholder={campaignType === 'affiliate' ? 'قدّم الآن' : 'تسوّق الآن'} />

              {campaignType === 'ad' && (
                <>
                  <Text style={s.label}>رابط الوجهة (اختياري)</Text>
                  <TextInput style={s.input} value={form.cta_link} onChangeText={t => setForm({ ...form, cta_link: t })}
                    placeholderTextColor={colors.onSurfaceTertiary} placeholder="/product/123 أو https://..." autoCapitalize="none" />
                </>
              )}

              <Text style={s.section}>🎯 الاستهداف</Text>

              <Text style={s.label}>المدن (اترك فارغة لكل المدن)</Text>
              <View style={s.chipRow}>
                {CITIES.map(c => {
                  const active = form.target_cities.includes(c);
                  return (
                    <TouchableOpacity key={c} onPress={() => toggleCity(c)} style={[s.chip, active && s.chipActive]}>
                      <Text style={[s.chipText, active && s.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>الجنس المستهدف</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { k: 'all', l: '👥 الجميع' },
                  { k: 'male', l: '👨 رجال' },
                  { k: 'female', l: '👩 نساء' },
                ].map(opt => {
                  const active = form.target_gender === opt.k;
                  return (
                    <TouchableOpacity key={opt.k} onPress={() => setForm({ ...form, target_gender: opt.k })} style={[s.gpill, active && s.gpillActive]}>
                      <Text style={[s.gpillText, active && s.gpillTextActive]}>{opt.l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>الاهتمامات</Text>
              <View style={s.chipRow}>
                {INTEREST_TAGS.map(t => {
                  const active = form.target_interest_tags.includes(t.id);
                  return (
                    <TouchableOpacity key={t.id} onPress={() => toggleTag(t.id)} style={[s.chip, active && s.chipActive]}>
                      <Text style={[s.chipText, active && s.chipTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>يبدأ (YYYY-MM-DD)</Text>
                  <TextInput style={s.input} value={form.starts_at} onChangeText={t => setForm({ ...form, starts_at: t })}
                    placeholderTextColor={colors.onSurfaceTertiary} placeholder="2026-09-01" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>ينتهي (YYYY-MM-DD)</Text>
                  <TextInput style={s.input} value={form.ends_at} onChangeText={t => setForm({ ...form, ends_at: t })}
                    placeholderTextColor={colors.onSurfaceTertiary} placeholder="2026-09-30" />
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.onSurface },
  segmentWrap: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceSecondary },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { color: colors.onSurfaceSecondary, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: colors.onBrandPrimary, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '700', marginTop: spacing.md },
  emptyDesc: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 4, textAlign: 'center' },
  adCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  affCampCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.brand },
  adImage: { width: '100%', height: 140, backgroundColor: colors.surfaceTertiary },
  affCampImage: { width: '100%', height: 140, backgroundColor: colors.surfaceTertiary },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: '700' },
  commissionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.brand },
  commissionText: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 12 },
  adTitle: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  adDesc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 6, lineHeight: 18 },
  incentives: { color: colors.brand, fontSize: 12, marginTop: 6, fontWeight: '600' },
  adStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, flexWrap: 'wrap' },
  adStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adStatText: { color: colors.onSurfaceTertiary, fontSize: 12 },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '800', marginBottom: spacing.md, marginTop: spacing.sm },
  appCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.brand },
  appAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  appAvText: { color: colors.brand, fontWeight: '900', fontSize: 18 },
  appName: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  appPhone: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  appSocial: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  appNote: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  approveBtn: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  approveInner: { paddingVertical: 10, alignItems: 'center' },
  approveText: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 13 },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.error },
  rejectText: { color: colors.error, fontWeight: '700', fontSize: 13 },
  affRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  affRank: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  affRankText: { color: colors.brand, fontWeight: '900', fontSize: 12 },
  affName: { color: colors.onSurface, fontSize: 14, fontWeight: '700' },
  codePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.brandTertiary },
  codeText: { color: colors.brand, fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },
  affCommission: { color: colors.onSurfaceTertiary, fontSize: 11 },
  affEarn: { color: colors.brand, fontSize: 14, fontWeight: '900' },
  affConv: { color: colors.onSurfaceTertiary, fontSize: 10 },
  label: { fontSize: 12, fontWeight: '700', color: colors.brand, marginTop: spacing.md, marginBottom: spacing.xs },
  section: { fontSize: 14, fontWeight: '800', color: colors.onSurface, marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14, textAlign: 'right' },
  imgSlot: { width: '100%', height: 160, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary, position: 'relative' },
  imgSlotImg: { width: '100%', height: '100%' },
  imgRemove: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.error, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  imgPickBtn: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.xl, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, borderStyle: 'dashed', backgroundColor: colors.brandTertiary },
  imgPickText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  gpill: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  gpillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  gpillText: { color: colors.onSurfaceSecondary, fontWeight: '700', fontSize: 12 },
  gpillTextActive: { color: colors.onBrandPrimary, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: colors.onBrandPrimary, fontWeight: '800' },
  pctPill: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  pctPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pctText: { color: colors.onSurfaceSecondary, fontWeight: '800', fontSize: 14 },
  pctTextActive: { color: colors.onBrandPrimary, fontWeight: '900' },
  // Type picker modal
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: spacing.xl + 12 },
  pickerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: '800', marginBottom: spacing.md, textAlign: 'center' },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  pickerIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  pickerOptTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '800' },
  pickerOptDesc: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2, lineHeight: 16 },
});
