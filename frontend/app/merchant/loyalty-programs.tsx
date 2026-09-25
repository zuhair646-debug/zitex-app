import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, StatusBar, Switch, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';
const OK = '#10B981';
const AMBER = '#F59E0B';

export default function LoyaltyProgramsScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiCall('/api/merchant/loyalty/programs');
      setPrograms(d.programs || []);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message);
    } finally { setLoading(false); }
  }, [apiCall]);

  useEffect(() => { load(); }, [load]);

  const openEditor = (p: any) => {
    setEditing(p);
    setCreds(p.credentials || {});
    setRate(String(p.conversion_rate || 0.01));
    setNote(p.merchant_note || '');
  };

  const toggle = async (p: any, enabled: boolean) => {
    try {
      await apiCall(`/api/merchant/loyalty/programs/${p.code}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled, credentials: p.credentials || {}, legal_docs: p.legal_docs || [], conversion_rate: p.conversion_rate, merchant_note: p.merchant_note || '' }),
      });
      await load();
    } catch (e: any) { Alert.alert('خطأ', e?.message); }
  };

  const saveConfig = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await apiCall(`/api/merchant/loyalty/programs/${editing.code}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: editing.enabled,
          credentials: creds,
          legal_docs: editing.legal_docs || [],
          conversion_rate: Number(rate) || 0.01,
          merchant_note: note,
        }),
      });
      setEditing(null);
      await load();
    } catch (e: any) { Alert.alert('خطأ', e?.message); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-forward" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>برامج الولاء السعودية</Text>
          <Text style={s.sub}>فعّل ما تحتاجه بعد الاعتماد القانوني</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          <View style={s.warnBar}>
            <Ionicons name="alert-circle" size={14} color={AMBER} />
            <Text style={s.warnText}>
              معظم البرامج تتطلب عقد شراكة رسمي مع مزوّد الخدمة قبل التفعيل الفعلي. عرّف بيانات الاعتماد بعد استلامها منهم.
            </Text>
          </View>

          {programs.map((p) => (
            <View key={p.code} style={[s.card, { borderColor: p.enabled ? p.brand_color + '80' : BORDER }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[s.logoBox, { borderColor: p.brand_color }]}>
                  <Text style={{ fontSize: 22 }}>{p.logo}</Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.cardTitle}>{p.name_ar}</Text>
                    <View style={[s.typePill, { backgroundColor: p.brand_color + '20', borderColor: p.brand_color }]}>
                      <Text style={[s.typePillText, { color: p.brand_color }]}>{
                        p.type === 'telco' ? 'اتصالات' :
                        p.type === 'bank' ? 'بنك' :
                        p.type === 'airline' ? 'طيران' :
                        p.type === 'coalition' ? 'مشترك' :
                        p.type === 'wallet' ? 'محفظة' :
                        p.type === 'internal' ? 'داخلي' : p.type
                      }</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub} numberOfLines={2}>{p.description_ar}</Text>
                  {p.status === 'sandbox_pending' && (
                    <Text style={s.pendingTag}>⚠️ بانتظار بيانات الاعتماد</Text>
                  )}
                </View>
                <Switch
                  value={!!p.enabled}
                  onValueChange={(v) => toggle(p, v)}
                  trackColor={{ true: p.brand_color, false: BORDER }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={s.rowActions}>
                <TouchableOpacity onPress={() => openEditor(p)} style={s.cfgBtn}>
                  <Ionicons name="settings-outline" size={13} color={GOLD} />
                  <Text style={s.cfgBtnText}>الإعدادات وبيانات الاعتماد</Text>
                </TouchableOpacity>
                {p.kb_url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(p.kb_url)} style={s.cfgBtn}>
                    <Ionicons name="link" size={13} color={GOLD} />
                    <Text style={s.cfgBtnText}>الموقع</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {editing && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <View style={[s.logoBox, { borderColor: editing.brand_color, marginEnd: 10 }]}>
                      <Text style={{ fontSize: 24 }}>{editing.logo}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: TEXT, fontSize: 16, fontWeight: '900', textAlign: 'right' }}>{editing.name_ar}</Text>
                      <Text style={{ color: MUTED, fontSize: 11, textAlign: 'right' }}>{editing.description_ar}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setEditing(null)}><Ionicons name="close" size={22} color={TEXT} /></TouchableOpacity>
                  </View>

                  {editing.legal_docs_required?.length > 0 && (
                    <View style={s.legalBox}>
                      <Text style={s.legalTitle}>📄 الوثائق القانونية المطلوبة</Text>
                      {editing.legal_docs_required.map((d: string, i: number) => (
                        <Text key={i} style={s.legalItem}>• {d}</Text>
                      ))}
                    </View>
                  )}

                  {editing.credential_fields?.length > 0 && (
                    <>
                      <Text style={s.sectionTitle}>🔐 بيانات الاعتماد (API)</Text>
                      {editing.credential_fields.map((f: string) => (
                        <View key={f}>
                          <Text style={s.label}>{f}</Text>
                          <TextInput style={s.input} secureTextEntry={f.includes('secret') || f.includes('key')}
                            value={creds[f] || ''}
                            onChangeText={(v) => setCreds({ ...creds, [f]: v })}
                            placeholder={f}
                            placeholderTextColor={MUTED} />
                        </View>
                      ))}
                    </>
                  )}

                  <Text style={s.sectionTitle}>💱 معدل التحويل</Text>
                  <Text style={s.label}>قيمة النقطة الواحدة بالريال</Text>
                  <TextInput style={s.input} keyboardType="decimal-pad"
                    value={rate} onChangeText={setRate} placeholder="0.01" placeholderTextColor={MUTED} />

                  <Text style={s.label}>ملاحظة داخلية</Text>
                  <TextInput style={[s.input, { minHeight: 60 }]} multiline
                    value={note} onChangeText={setNote} placeholder="اختياري" placeholderTextColor={MUTED} />

                  <TouchableOpacity onPress={saveConfig} style={s.saveBtn} disabled={saving}>
                    {saving ? <ActivityIndicator color={BG} /> : <Text style={s.saveText}>حفظ الإعدادات</Text>}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center' },
  title: { color: GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right', marginHorizontal: 10 },
  sub: { color: MUTED, fontSize: 10, textAlign: 'right', marginHorizontal: 10 },
  warnBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: AMBER + '15', borderColor: AMBER + '80', borderWidth: 1, padding: 10, borderRadius: 10, marginBottom: 10 },
  warnText: { color: TEXT, fontSize: 11, flex: 1, textAlign: 'right', lineHeight: 16 },
  card: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1.5, padding: 12, marginBottom: 8 },
  logoBox: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  cardTitle: { color: TEXT, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  cardSub: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 2, lineHeight: 14 },
  typePill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
  typePillText: { fontSize: 9, fontWeight: '900' },
  pendingTag: { color: AMBER, fontSize: 10, textAlign: 'right', marginTop: 4, fontWeight: '900' },
  rowActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  cfgBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  cfgBtnText: { color: GOLD, fontSize: 11, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', borderTopWidth: 1, borderColor: BORDER },
  label: { color: MUTED, fontSize: 11, textAlign: 'right', marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, color: TEXT, textAlign: 'right' },
  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'right', marginTop: 12, marginBottom: 4 },
  legalBox: { backgroundColor: '#8B5CF615', borderWidth: 1, borderColor: '#8B5CF6', borderRadius: 12, padding: 10, marginTop: 6 },
  legalTitle: { color: '#A78BFA', fontSize: 11, fontWeight: '900', textAlign: 'right', marginBottom: 4 },
  legalItem: { color: TEXT, fontSize: 11, textAlign: 'right', marginTop: 3 },
  saveBtn: { backgroundColor: GOLD, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16 },
  saveText: { color: BG, fontSize: 14, fontWeight: '900' },
});
