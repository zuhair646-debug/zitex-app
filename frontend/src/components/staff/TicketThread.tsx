import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { tSync } from '../../useAutoT';
import { useT } from '../../i18n';
import { notify } from '../../utils/notify';
import { AttachmentPicker, AttachmentThumbs } from './Attachments';
import { PRIORITY_COLOR } from './Kanban';

export const TICKET_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'مفتوحة', color: '#3B82F6' },
  in_progress: { label: 'قيد المعالجة', color: '#F59E0B' },
  waiting: { label: 'بانتظار العميل', color: '#A855F7' },
  resolved: { label: 'تم الحل', color: '#10B981' },
};
export const PRIORITY_LABEL: Record<string, string> = { low: 'أولوية منخفضة', normal: 'أولوية عادية', high: 'أولوية عالية', urgent: 'أولوية عاجلة' };
export const CATEGORY_LABEL: Record<string, string> = { general: 'عام', orders: 'الطلبات', services: 'الخدمات', payments: 'الدفع', job: 'طلب توظيف', technical: 'مشكلة تقنية' };

/** Full-screen ticket conversation. `staff` adds status / priority / assignee controls. */
export function TicketThread({ ticketId, staff, apiCall, onClose, onChanged }: {
  ticketId: string | null; staff?: boolean; apiCall: (u: string, o?: any) => Promise<any>; onClose: () => void; onChanged?: () => void;
}) {
  const s = useS();
  const { lang } = useT();
  const [t, setT] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [att, setAtt] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const base = staff ? '/api/merchant/tickets' : '/api/support/tickets';

  const load = useCallback(async () => {
    if (!ticketId) return;
    try { setT(await apiCall(`${base}/${ticketId}`)); } catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setT(null); setMsg(''); setAtt([]); load();
    if (staff && ticketId) apiCall('/api/merchant/staff-directory').then(setStaffList).catch(() => {});
  }, [ticketId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!msg.trim() && !att.length) return;
    setSending(true);
    try {
      await apiCall(`${base}/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message: msg, attachments: att }) });
      setMsg(''); setAtt([]); await load(); onChanged?.();
    } catch (e: any) { notify(tSync('خطأ', lang), e.message); } finally { setSending(false); }
  };

  const update = async (patch: any) => {
    try { await apiCall(`/api/merchant/tickets/${ticketId}`, { method: 'PUT', body: JSON.stringify(patch) }); await load(); onChanged?.(); }
    catch (e: any) { notify(tSync('خطأ', lang), e.message); }
  };

  const st = TICKET_STATUS[t?.status] || TICKET_STATUS.open;
  return (
    <Modal visible={!!ticketId} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.header}>
            <TouchableOpacity testID="ticket-close" onPress={onClose} style={s.hBtn}><Ionicons name="close" size={24} color={colors.onSurface} /></TouchableOpacity>
            <Text style={s.hTitle} numberOfLines={1}>{t?.subject || tSync('التذكرة', lang)}</Text>
            <View style={s.hBtn} />
          </View>
          {!t ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}>
              <View style={s.metaRow}>
                <View style={[s.pill, { backgroundColor: st.color + '22' }]}><Text style={[s.pillTxt, { color: st.color }]}>{tSync(st.label, lang)}</Text></View>
                <View style={[s.pill, { backgroundColor: (PRIORITY_COLOR[t.priority] || '#3B82F6') + '22' }]}><Text style={[s.pillTxt, { color: PRIORITY_COLOR[t.priority] || '#3B82F6' }]}>{tSync(PRIORITY_LABEL[t.priority] || 'أولوية عادية', lang)}</Text></View>
                <View style={s.pill}><Text style={s.pillTxt}>{tSync(CATEGORY_LABEL[t.category] || t.category || 'عام', lang)}</Text></View>
              </View>
              {staff && (
                <>
                  <Text style={s.label}>{tSync('الحالة', lang)}</Text>
                  <View style={s.metaRow}>
                    {Object.entries(TICKET_STATUS).map(([k, v]) => (
                      <TouchableOpacity key={k} testID={`ticket-status-${k}`} style={[s.opt, t.status === k && { backgroundColor: v.color, borderColor: v.color }]} onPress={() => update({ status: k })}>
                        <Text style={[s.optTxt, t.status === k && { color: '#FFFFFF' }]}>{tSync(v.label, lang)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.label}>{tSync('الأولوية', lang)}</Text>
                  <View style={s.metaRow}>
                    {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                      <TouchableOpacity key={k} style={[s.opt, t.priority === k && { backgroundColor: PRIORITY_COLOR[k], borderColor: PRIORITY_COLOR[k] }]} onPress={() => update({ priority: k })}>
                        <Text style={[s.optTxt, t.priority === k && { color: '#FFFFFF' }]}>{tSync(v, lang)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.label}>{tSync('مسندة إلى', lang)}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {staffList.map(e => (
                      <TouchableOpacity key={e.id} testID={`ticket-assign-${e.id}`} style={[s.opt, t.assignee_id === e.id && { backgroundColor: colors.brand, borderColor: colors.brand }]} onPress={() => update({ assignee_id: e.id })}>
                        <Text style={[s.optTxt, t.assignee_id === e.id && { color: colors.onBrandPrimary }]}>{e.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={s.customer}>👤 {t.user_name || '—'}  {t.user_phone ? `• ${t.user_phone}` : ''}</Text>
                </>
              )}
              <View style={s.bubble}>
                <Text style={s.bubbleName}>{t.user_name || tSync('العميل', lang)}</Text>
                <Text style={s.bubbleTxt}>{t.message}</Text>
                <AttachmentThumbs paths={t.attachments} />
                <Text style={s.time}>{(t.created_at || '').slice(0, 16).replace('T', ' ')}</Text>
              </View>
              {(t.replies || []).map((r: any, i: number) => (
                <View key={i} style={[s.bubble, r.is_staff && s.bubbleStaff]}>
                  <Text style={[s.bubbleName, r.is_staff && { color: colors.brand }]}>{r.is_staff ? '🎧 ' : ''}{r.user_name}</Text>
                  {!!r.message && <Text style={s.bubbleTxt}>{r.message}</Text>}
                  <AttachmentThumbs paths={r.attachments} />
                  <Text style={s.time}>{(r.created_at || '').slice(0, 16).replace('T', ' ')}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          <View style={s.composer}>
            <AttachmentThumbs paths={att} onRemove={i => setAtt(att.filter((_, j) => j !== i))} />
            <View style={s.inputRow}>
              <AttachmentPicker testID="ticket-attach" onAdd={p => setAtt(a => [...a, p].slice(0, 5))} />
              <TextInput testID="ticket-reply-input" style={s.input} value={msg} onChangeText={setMsg} multiline placeholder={tSync('اكتب ردك...', lang)} placeholderTextColor={colors.onSurfaceTertiary} />
              <TouchableOpacity testID="ticket-reply-send" style={s.send} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="send" size={18} color={colors.onBrandPrimary} />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function useS() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    hBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    hTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '900', color: colors.onSurface },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.surfaceSecondary },
    pillTxt: { fontSize: 11, fontWeight: '800', color: colors.onSurfaceSecondary },
    label: { fontSize: 12, fontWeight: '800', color: colors.onSurfaceSecondary, marginTop: 4 },
    opt: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
    optTxt: { fontSize: 12, fontWeight: '700', color: colors.onSurface },
    customer: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 4 },
    bubble: { padding: 12, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: 4 },
    bubbleStaff: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
    bubbleName: { fontSize: 12, fontWeight: '900', color: colors.onSurface },
    bubbleTxt: { fontSize: 14, color: colors.onSurface, lineHeight: 21 },
    time: { fontSize: 10, color: colors.onSurfaceTertiary },
    composer: { padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 10, color: colors.onSurface, fontSize: 14 },
    send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
