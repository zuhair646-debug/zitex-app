import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function SupportScreen() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');

  const load = async () => { try { const d = await apiCall('/api/support/tickets'); setTickets(d); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const createTicket = async () => {
    if (!subject || !message) { Alert.alert('Error', 'Please fill all fields'); return; }
    try {
      await apiCall('/api/support/tickets', { method: 'POST', body: JSON.stringify({ subject, message, category }) });
      setShowNew(false); setSubject(''); setMessage('');
      load();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const statusColor = (s: string) => s === 'open' ? '#F59E0B' : s === 'resolved' ? '#10B981' : '#6B7280';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="sup-back" style={s.backBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Support</Text>
        <TouchableOpacity testID="new-ticket-btn" style={s.addBtn} onPress={() => setShowNew(true)}><Ionicons name="add" size={22} color="#8833FF" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        tickets.length === 0 ? (
          <View style={s.empty}><Ionicons name="headset-outline" size={48} color="#A1A1AA" /><Text style={s.emptyTitle}>No tickets</Text>
            <TouchableOpacity style={s.newBtn} onPress={() => setShowNew(true)}><Text style={s.newBtnText}>Create Ticket</Text></TouchableOpacity></View>
        ) : (
          <ScrollView contentContainerStyle={s.list}>
            {tickets.map(t => (
              <View key={t.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={[s.catBadge, { backgroundColor: t.category === 'orders' ? '#DBEAFE' : '#EFE6FF' }]}>
                    <Text style={[s.catText, { color: t.category === 'orders' ? '#3B82F6' : '#8833FF' }]}>{t.category}</Text>
                  </View>
                  <View style={[s.statusDot, { backgroundColor: statusColor(t.status) }]} /><Text style={[s.statusText, { color: statusColor(t.status) }]}>{t.status}</Text>
                </View>
                <Text style={s.ticketSubject}>{t.subject}</Text>
                <Text style={s.ticketMsg} numberOfLines={2}>{t.message}</Text>
                {t.replies?.length > 0 && (
                  <View style={s.replyBox}>
                    <Text style={s.replyAuthor}>{t.replies[t.replies.length - 1].user_name}</Text>
                    <Text style={s.replyText} numberOfLines={2}>{t.replies[t.replies.length - 1].message}</Text>
                  </View>
                )}
                <Text style={s.date}>{t.created_at?.split('T')[0]}</Text>
              </View>
            ))}
          </ScrollView>
        )}

      <Modal visible={showNew} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalWrap}>
          <View style={s.modal}>
            <View style={s.modalHeader}><Text style={s.modalTitle}>New Ticket</Text><TouchableOpacity onPress={() => setShowNew(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity></View>
            <View style={s.catRow}>
              {['general', 'orders', 'services', 'technical'].map(c => (
                <TouchableOpacity key={c} style={[s.catPill, category === c && s.catPillActive]} onPress={() => setCategory(c)}>
                  <Text style={[s.catPillText, category === c && s.catPillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput testID="ticket-subject" style={s.input} placeholder="Subject" value={subject} onChangeText={setSubject} />
            <TextInput testID="ticket-message" style={[s.input, s.textArea]} placeholder="Describe your issue..." value={message} onChangeText={setMessage} multiline numberOfLines={4} textAlignVertical="top" />
            <TouchableOpacity testID="submit-ticket-btn" style={s.submitBtn} onPress={createTicket}><Text style={s.submitText}>Submit Ticket</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#0A0A0A' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  newBtn: { backgroundColor: '#8833FF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  newBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#F9F9FB', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  catText: { fontSize: 11, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginStart: 'auto' },
  statusText: { fontSize: 12, fontWeight: '500' },
  ticketSubject: { fontSize: 15, fontWeight: '600', color: '#0A0A0A', marginBottom: 4 },
  ticketMsg: { fontSize: 13, color: '#52525B', lineHeight: 20, marginBottom: 8 },
  replyBox: { backgroundColor: '#FFF', borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: '#8833FF', marginBottom: 8 },
  replyAuthor: { fontSize: 12, fontWeight: '600', color: '#8833FF', marginBottom: 2 },
  replyText: { fontSize: 12, color: '#52525B' },
  date: { fontSize: 11, color: '#A1A1AA' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0A0A0A' },
  catRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  catPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: '#F9F9FB', borderWidth: 1, borderColor: '#E4E4E7' },
  catPillActive: { backgroundColor: '#8833FF', borderColor: '#8833FF' },
  catPillText: { fontSize: 12, fontWeight: '500', color: '#52525B' },
  catPillTextActive: { color: '#FFF' },
  input: { backgroundColor: '#F9F9FB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: '#E4E4E7' },
  textArea: { height: 100 },
  submitBtn: { backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
