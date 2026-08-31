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

export default function MarketingPanel() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [tab, setTab] = useState<Tab>('ads');
  const [ads, setAds] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Ad create modal
  const [adModal, setAdModal] = useState(false);
  const [adForm, setAdForm] = useState<any>({
    title: '', description: '', image: '', cta_label: 'تسوّق الآن', cta_link: '',
    target_cities: '', budget: '',
    target_gender: 'all',
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

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية', 'يجب السماح للوصول للمعرض'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.85 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      setAdForm((f: any) => ({ ...f, image: up.path }));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const submitAd = async () => {
    if (!adForm.title.trim()) { Alert.alert('مطلوب', 'اكتب عنوان الإعلان'); return; }
    setSaving(true);
    try {
      const body = {
        ...adForm,
        target_cities: adForm.target_cities.split(',').map((c: string) => c.trim()).filter(Boolean),
        target_genders: adForm.target_gender === 'all' ? [] : [adForm.target_gender],
        budget: parseFloat(adForm.budget) || 0,
      };
      await apiCall('/api/merchant/marketing/ads', { method: 'POST', body: JSON.stringify(body) });
      setAdModal(false);
      setAdForm({ title: '', description: '', image: '', cta_label: 'تسوّق الآن', cta_link: '', target_cities: '', budget: '', target_gender: 'all' });
      load();
      Alert.alert('✅ تم', 'تم نشر الإعلان');
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  const deleteAd = (id: string) => Alert.alert('حذف الإعلان؟', '', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: async () => {
      try { await apiCall(`/api/merchant/marketing/ads/${id}`, { method: 'DELETE' }); load(); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
    } },
  ]);

  const approveApp = (id: string, name: string) => {
    Alert.alert('الموافقة على المسوق', `الموافقة على ${name}؟ سيتم إنشاء حساب مسوق فوراً.`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'موافقة', onPress: async () => {
        try {
          const r = await apiCall(`/api/merchant/affiliate/applications/${id}/approve`, { method: 'POST' });
          Alert.alert('✅ تمت الموافقة', `كود الإحالة: ${r.referral_code}`);
          load();
        } catch (e: any) { Alert.alert('خطأ', e.message); }
      } },
    ]);
  };
  const rejectApp = (id: string) => {
    Alert.alert('رفض الطلب؟', 'لا يمكن التراجع', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'رفض', style: 'destructive', onPress: async () => {
        try { await apiCall(`/api/merchant/affiliate/applications/${id}/reject`, { method: 'POST' }); load(); }
        catch (e: any) { Alert.alert('خطأ', e.message); }
      } },
    ]);
  };

  const pending = apps.filter((a: any) => a.status === 'pending');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerIcon}>
            <Ionicons name="arrow-back" size={22} color={colors.brand} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>لوحة التسويق</Text>
          <TouchableOpacity onPress={() => setAdModal(true)} style={s.headerIcon}>
            <Ionicons name="add" size={26} color={colors.brand} />
          </TouchableOpacity>
        </View>

        {/* Segmented control */}
        <View style={s.segmentWrap}>
          <TouchableOpacity onPress={() => setTab('ads')} style={[s.segment, tab === 'ads' && s.segmentActive]}>
            <Ionicons name="megaphone" size={16} color={tab === 'ads' ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[s.segmentText, tab === 'ads' && s.segmentTextActive]}>الإعلانات ({ads.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('affiliates')} style={[s.segment, tab === 'affiliates' && s.segmentActive]}>
            <Ionicons name="people" size={16} color={tab === 'affiliates' ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[s.segmentText, tab === 'affiliates' && s.segmentTextActive]}>المسوقون ({pending.length > 0 ? `${pending.length} 🔔` : affiliates.length})</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} />
          ) : tab === 'ads' ? (
            <>
              {/* Stats */}
              <View style={s.statsRow}>
                <View style={s.statCard}>
                  <Text style={s.statNum}>{ads.length}</Text>
                  <Text style={s.statLbl}>إعلانات نشطة</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statNum}>{ads.reduce((a, x) => a + (x.views || 0), 0)}</Text>
                  <Text style={s.statLbl}>مشاهدة</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statNum}>{ads.reduce((a, x) => a + (x.clicks || 0), 0)}</Text>
                  <Text style={s.statLbl}>نقرة</Text>
                </View>
              </View>

              {ads.length === 0 && (
                <View style={s.empty}>
                  <Ionicons name="megaphone-outline" size={54} color={colors.onSurfaceTertiary} />
                  <Text style={s.emptyTitle}>لا توجد حملات تسويقية</Text>
                  <Text style={s.emptyDesc}>اضغط + في الأعلى لإطلاق أول حملة</Text>
                </View>
              )}
              {ads.map(ad => (
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
                      <View style={s.adStat}><Ionicons name="wallet" size={12} color={colors.onSurfaceTertiary} /><Text style={s.adStatText}>{(ad.budget || 0).toFixed(0)} ر.س</Text></View>
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
              {/* Pending applications */}
              {pending.length > 0 && (
                <>
                  <Text style={s.sectionTitle}>📥 طلبات قيد المراجعة ({pending.length})</Text>
                  {pending.map(a => (
                    <View key={a.id} style={s.appCard}>
                      <View style={s.appAvatar}><Text style={s.appAvText}>{(a.applicant_name || '?').charAt(0)}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.appName}>{a.applicant_name}</Text>
                        <Text style={s.appPhone}>{a.applicant_phone}</Text>
                        {!!a.social_handle && <Text style={s.appSocial}>📱 {a.social_handle}</Text>}
                        {!!a.audience_size && <Text style={s.appSocial}>👥 {a.audience_size.toLocaleString('ar')} متابع</Text>}
                        {!!a.note && <Text style={s.appNote}>{a.note}</Text>}
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
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
              {affiliates.length === 0 && pending.length === 0 && (
                <View style={s.empty}>
                  <Ionicons name="people-outline" size={54} color={colors.onSurfaceTertiary} />
                  <Text style={s.emptyTitle}>لا يوجد مسوقون بعد</Text>
                  <Text style={s.emptyDesc}>سيظهر هنا المسوقون بعد الموافقة على طلباتهم</Text>
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
                    <Text style={s.affConv}>{af.total_conversions || 0} تحويل</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Ad Create Modal */}
      <Modal visible={adModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAdModal(false)}>
        <View style={s.root}>
          <StatusBar barStyle="light-content" />
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setAdModal(false)} style={s.headerIcon}>
                <Ionicons name="close" size={24} color={colors.brand} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>إعلان جديد</Text>
              <TouchableOpacity onPress={submitAd} disabled={saving || uploading} style={s.headerIcon}>
                <LinearGradient colors={['#F5C518', '#D4AF37']} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {saving ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: '800' }}>نشر</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
              <Text style={s.label}>عنوان الإعلان *</Text>
              <TextInput style={s.input} value={adForm.title} onChangeText={t => setAdForm({ ...adForm, title: t })}
                placeholderTextColor={colors.onSurfaceTertiary} placeholder="مثال: خصم 50% على جميع الجوالات" />

              <Text style={s.label}>الوصف</Text>
              <TextInput style={[s.input, { height: 80 }]} multiline value={adForm.description}
                onChangeText={t => setAdForm({ ...adForm, description: t })}
                placeholderTextColor={colors.onSurfaceTertiary}
                placeholder="تفاصيل الإعلان..." />

              <Text style={s.label}>صورة الإعلان</Text>
              {adForm.image ? (
                <View style={s.imgSlot}>
                  <Image source={{ uri: mediaUrlSync(adForm.image) }} style={s.imgSlotImg} contentFit="cover" />
                  <TouchableOpacity style={s.imgRemove} onPress={() => setAdForm({ ...adForm, image: '' })}>
                    <Ionicons name="close" size={16} color="white" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.imgPickBtn} onPress={pickImage} disabled={uploading}>
                  {uploading ? <ActivityIndicator color={colors.brand} /> : <>
                    <Ionicons name="image" size={26} color={colors.brand} />
                    <Text style={s.imgPickText}>اختر صورة</Text>
                  </>}
                </TouchableOpacity>
              )}

              <Text style={s.label}>زر الدعوة (CTA)</Text>
              <TextInput style={s.input} value={adForm.cta_label} onChangeText={t => setAdForm({ ...adForm, cta_label: t })}
                placeholderTextColor={colors.onSurfaceTertiary} placeholder="تسوّق الآن" />

              <Text style={s.label}>رابط الوجهة (اختياري)</Text>
              <TextInput style={s.input} value={adForm.cta_link} onChangeText={t => setAdForm({ ...adForm, cta_link: t })}
                placeholderTextColor={colors.onSurfaceTertiary} placeholder="/product/123 أو https://..." autoCapitalize="none" />

              <Text style={s.label}>المدن المستهدفة (افصل بفاصلة)</Text>
              <TextInput style={s.input} value={adForm.target_cities} onChangeText={t => setAdForm({ ...adForm, target_cities: t })}
                placeholderTextColor={colors.onSurfaceTertiary} placeholder="الرياض، جدة، الدمام (اتركه فارغاً لكل المدن)" />

              <Text style={s.label}>الجنس المستهدف</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { k: 'all', l: '👥 الجميع' },
                  { k: 'male', l: '👨 رجال' },
                  { k: 'female', l: '👩 نساء' },
                ].map(opt => {
                  const active = adForm.target_gender === opt.k;
                  return (
                    <TouchableOpacity key={opt.k} onPress={() => setAdForm({ ...adForm, target_gender: opt.k })} style={[s.gpill, active && s.gpillActive]}>
                      <Text style={[s.gpillText, active && s.gpillTextActive]}>{opt.l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.label}>الميزانية (ر.س)</Text>
              <TextInput style={s.input} keyboardType="numeric" value={adForm.budget}
                onChangeText={t => setAdForm({ ...adForm, budget: t })}
                placeholderTextColor={colors.onSurfaceTertiary} placeholder="500" />
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
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 22, fontWeight: '900' },
  statLbl: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '700', marginTop: spacing.md },
  emptyDesc: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 4, textAlign: 'center' },
  adCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  adImage: { width: '100%', height: 140, backgroundColor: colors.surfaceTertiary },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: '700' },
  adTitle: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: '700' },
  adDesc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 6 },
  adStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  adStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adStatText: { color: colors.onSurfaceTertiary, fontSize: 12 },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '800', marginBottom: spacing.md, marginTop: spacing.sm },
  appCard: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.brand },
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
  affConv: { color: colors.onSurfaceTertiary, fontSize: 11 },
  label: { fontSize: 12, fontWeight: '700', color: colors.brand, marginTop: spacing.md, marginBottom: spacing.xs },
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
});
