import TranslatableName from '../src/components/TranslatableName';
import { tSync } from '../src/useAutoT';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT, curLang } from '../src/i18n';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';
import { notify } from '../src/utils/notify';
import { AttachmentPicker, AttachmentThumbs } from '../src/components/staff/Attachments';
import { TicketThread, TICKET_STATUS, CATEGORY_LABEL } from '../src/components/staff/TicketThread';

const NEW_CATS = ['orders', 'services', 'payments', 'technical', 'general'];

export default function SupportScreen() {
  const s = useS();
  const router = useRouter();
  const { apiCall } = useAuth();
  const { lang } = useT();
  const [info, setInfo] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '', category: 'orders', priority: 'normal' });
  const [att, setAtt] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadTickets = useCallback(() => apiCall('/api/support/tickets').then(setTickets).catch(() => {}), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.all([apiCall('/api/store/support').then(setInfo).catch(() => setInfo({})), loadTickets()]).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openLink = async (url: string) => {
    try { await Linking.openURL(url); } catch { notify(tSync('خطأ', curLang()), tSync('تعذر فتح الرابط', curLang())); }
  };

  const submit = async () => {
    if (form.subject.trim().length < 2 || form.message.trim().length < 2) { notify(tSync('اكتب عنوان المشكلة وتفاصيلها', lang)); return; }
    setSaving(true);
    try {
      await apiCall('/api/support/tickets', { method: 'POST', body: JSON.stringify({ ...form, attachments: att }) });
      setNewOpen(false); setForm({ subject: '', message: '', category: 'orders', priority: 'normal' }); setAtt([]);
      loadTickets(); notify(tSync('تم فتح التذكرة ✅ سيرد عليك فريق الدعم قريباً', lang));
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); } finally { setSaving(false); }
  };

  if (loading || !info) return <View style={s.center}><ActivityIndicator size="large" color={colors.brand} /></View>;

  const channels = [
    { id: 'whatsapp', label: tSync('واتساب', lang), sub: info.whatsapp, icon: 'logo-whatsapp', color: '#25D366', url: info.whatsapp ? `https://wa.me/${info.whatsapp}` : '' },
    { id: 'phone', label: tSync('اتصال هاتفي', lang), sub: info.phone, icon: 'call', color: '#3B82F6', url: info.phone ? `tel:${info.phone}` : '' },
    { id: 'email', label: tSync('البريد الإلكتروني', lang), sub: info.email, icon: 'mail', color: '#EF4444', url: info.email ? `mailto:${info.email}` : '' },
    { id: 'instagram', label: 'Instagram', sub: info.instagram, icon: 'logo-instagram', color: '#E1306C', url: info.instagram ? `https://instagram.com/${info.instagram.replace('@','')}` : '' },
    { id: 'twitter', label: 'X (Twitter)', sub: info.twitter, icon: 'logo-twitter', color: '#1D9BF0', url: info.twitter ? `https://twitter.com/${info.twitter.replace('@','')}` : '' },
    { id: 'tiktok', label: 'TikTok', sub: info.tiktok, icon: 'logo-tiktok', color: '#FE2C55', url: info.tiktok ? `https://tiktok.com/@${info.tiktok.replace('@','')}` : '' },
    { id: 'snapchat', label: 'Snapchat', sub: info.snapchat, icon: 'logo-snapchat', color: '#F7C600', url: info.snapchat ? `https://snapchat.com/add/${info.snapchat.replace('@','')}` : '' },
    { id: 'telegram', label: 'Telegram', sub: info.telegram, icon: 'paper-plane', color: '#0088CC', url: info.telegram ? `https://t.me/${info.telegram.replace('@','')}` : '' },
  ].filter(c => c.sub);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.hBtn}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={s.title}>🎧 {tSync('الدعم الفني', lang)}</Text>
        <View style={s.hBtn} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.hero}>
          <Ionicons name="headset" size={36} color={colors.onBrandPrimary} />
          <Text style={s.heroTitle}>{tSync('كيف يمكننا مساعدتك؟', lang)}</Text>
          {!!info.working_hours && <TranslatableName text={info.working_hours} style={s.heroSub} />}
          <TouchableOpacity testID="new-ticket-btn" style={s.heroBtn} onPress={() => setNewOpen(true)}>
            <Ionicons name="add-circle" size={18} color={colors.brand} />
            <Text style={s.heroBtnTxt}>{tSync('افتح تذكرة دعم', lang)}</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.section}>🎫 {tSync('تذاكري', lang)}</Text>
        {tickets.length === 0 ? <Text style={s.empty}>{tSync('لا توجد تذاكر بعد', lang)}</Text> : tickets.map(t => {
          const st = TICKET_STATUS[t.status] || TICKET_STATUS.open;
          return (
            <TouchableOpacity key={t.id} testID={`my-ticket-${t.id}`} style={s.ticket} onPress={() => setOpenId(t.id)} activeOpacity={0.85}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.tSubject} numberOfLines={1}>{t.subject}</Text>
                <Text style={s.tMeta}>{tSync(CATEGORY_LABEL[t.category] || 'عام', lang)} • {(t.updated_at || t.created_at || '').slice(0, 10)} • 💬 {(t.replies || []).length}</Text>
              </View>
              <View style={[s.pill, { backgroundColor: st.color + '22' }]}><Text style={[s.pillTxt, { color: st.color }]}>{tSync(st.label, lang)}</Text></View>
            </TouchableOpacity>
          );
        })}

        {info.contact_via_social_first && (
          <View style={s.tipBox}>
            <Ionicons name="information-circle" size={18} color={colors.info} />
            <Text style={s.tipText}>{tSync('للرد السريع، تواصل عبر السوشال ميديا أو الواتساب', lang)}</Text>
          </View>
        )}

        <Text style={s.section}>{tSync('وسائل التواصل', lang)}</Text>
        <View style={s.grid}>
          {channels.map(c => (
            <TouchableOpacity key={c.id} style={[s.card, { borderColor: c.color + '40' }]} onPress={() => openLink(c.url)}>
              <View style={[s.iconBox, { backgroundColor: c.color + '20' }]}>
                <Ionicons name={c.icon as any} size={24} color={c.color} />
              </View>
              <TranslatableName text={c.label} style={s.cardLabel} noToggle />
              <Text style={s.cardSub} numberOfLines={1}>{c.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!info.address && (<>
          <Text style={s.section}>📍 {tSync('عنوان المتجر', lang)}</Text>
          <View style={s.addrBox}><TranslatableName text={info.address} style={s.addrText} inline={false} /></View>
        </>)}
      </ScrollView>

      <Modal visible={newOpen} transparent animationType="slide" onRequestClose={() => setNewOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetBg}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setNewOpen(false)} />
          <View style={s.sheet}>
            <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
              <Text style={s.sheetTitle}>{tSync('تذكرة دعم جديدة', lang)}</Text>
              <View style={s.chips}>
                {NEW_CATS.map(c => (
                  <TouchableOpacity key={c} style={[s.chip, form.category === c && s.chipOn]} onPress={() => setForm({ ...form, category: c })}>
                    <Text style={[s.chipTxt, form.category === c && { color: colors.onBrandPrimary }]}>{tSync(CATEGORY_LABEL[c], lang)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput testID="ticket-subject" style={s.input} value={form.subject} onChangeText={v => setForm({ ...form, subject: v })} placeholder={tSync('عنوان المشكلة', lang)} placeholderTextColor={colors.onSurfaceTertiary} />
              <TextInput testID="ticket-message" style={[s.input, { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]} multiline value={form.message} onChangeText={v => setForm({ ...form, message: v })} placeholder={tSync('اشرح المشكلة بالتفصيل', lang)} placeholderTextColor={colors.onSurfaceTertiary} />
              <View style={s.chips}>
                {[['normal', 'أولوية عادية'], ['high', 'أولوية عالية'], ['urgent', 'أولوية عاجلة']].map(([k, l]) => (
                  <TouchableOpacity key={k} style={[s.chip, form.priority === k && s.chipOn]} onPress={() => setForm({ ...form, priority: k })}>
                    <Text style={[s.chipTxt, form.priority === k && { color: colors.onBrandPrimary }]}>{tSync(l, lang)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AttachmentPicker testID="new-ticket-attach" onAdd={p => setAtt(a => [...a, p].slice(0, 5))} />
                <Text style={s.tMeta}>{tSync('أرفق صور المشكلة (حتى 5)', lang)}</Text>
              </View>
              <AttachmentThumbs paths={att} onRemove={i => setAtt(att.filter((_, j) => j !== i))} />
              <TouchableOpacity testID="ticket-submit" style={s.submit} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={s.submitTxt}>{tSync('إرسال التذكرة', lang)}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <TicketThread ticketId={openId} apiCall={apiCall} onClose={() => setOpenId(null)} onChanged={loadTickets} />
    </SafeAreaView>
  );
}

function useS() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    hBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontWeight: '800', color: colors.onSurface },
    hero: { backgroundColor: colors.brand, padding: 24, borderRadius: 18, alignItems: 'center', marginBottom: 14 },
    heroTitle: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: '800', marginTop: 8 },
    heroSub: { color: colors.onBrandPrimary, opacity: 0.85, fontSize: 12, marginTop: 4 },
    heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: colors.surface, paddingHorizontal: 18, minHeight: 44, borderRadius: 22 },
    heroBtnTxt: { color: colors.brand, fontWeight: '900' },
    tipBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.infoSoft, padding: 10, borderRadius: 10, marginVertical: 14 },
    tipText: { fontSize: 12, color: colors.info, fontWeight: '600', flex: 1 },
    section: { fontSize: 15, fontWeight: '800', color: colors.onSurface, marginTop: 6, marginBottom: 10 },
    empty: { color: colors.onSurfaceTertiary, textAlign: 'center', paddingVertical: 12 },
    ticket: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
    tSubject: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
    tMeta: { fontSize: 11, color: colors.onSurfaceSecondary },
    pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    pillTxt: { fontSize: 11, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    card: { width: '47%', backgroundColor: colors.surfaceSecondary, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1.5 },
    iconBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    cardLabel: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
    cardSub: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
    addrBox: { backgroundColor: colors.surfaceSecondary, padding: 14, borderRadius: 10, marginTop: 4 },
    addrText: { fontSize: 13, color: colors.onSurface },
    sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
    sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.onSurface, textAlign: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, justifyContent: 'center' },
    chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipTxt: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
    input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, color: colors.onSurface, fontSize: 14 },
    submit: { minHeight: 50, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    submitTxt: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 15 },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
