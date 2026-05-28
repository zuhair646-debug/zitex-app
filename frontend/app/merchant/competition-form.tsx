import { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Switch, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function CompetitionForm() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>({
    title: '', description: '', prize: '', prize_count: '1',
    spend_requirement: '100', start_date: '', end_date: '', draw_date: '',
    max_participants: '1000', requires_approval: true,
  });

  const submit = async () => {
    if (!data.title || !data.prize) { Alert.alert('Required', 'Title and prize are required'); return; }
    setLoading(true);
    try {
      const body = {
        ...data,
        prize_count: parseInt(data.prize_count) || 1,
        spend_requirement: parseFloat(data.spend_requirement) || 0,
        max_participants: parseInt(data.max_participants) || 1000,
        type: 'spend_win', questions: [],
      };
      await apiCall('/api/merchant/competitions', { method: 'POST', body: JSON.stringify(body) });
      const msg = data.requires_approval ? 'Competition submitted for chamber approval' : 'Competition published as public';
      Alert.alert('Success', msg, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>New Competition</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.label}>Title *</Text>
        <TextInput testID="comp-title" style={s.input} value={data.title} onChangeText={t => setData({ ...data, title: t })} placeholder="Eid Special Draw" />
        <Text style={s.label}>Description</Text>
        <TextInput style={[s.input, { height: 80 }]} multiline value={data.description} onChangeText={t => setData({ ...data, description: t })} />
        <Text style={s.label}>Prize *</Text>
        <TextInput testID="comp-prize" style={s.input} value={data.prize} onChangeText={t => setData({ ...data, prize: t })} placeholder="Win iPhone 15 Pro" />
        <Text style={s.label}>Number of Winners</Text>
        <TextInput style={s.input} keyboardType="numeric" value={data.prize_count} onChangeText={t => setData({ ...data, prize_count: t })} />
        <Text style={s.label}>Min Spend Requirement (SAR)</Text>
        <TextInput style={s.input} keyboardType="numeric" value={data.spend_requirement} onChangeText={t => setData({ ...data, spend_requirement: t })} />
        <Text style={s.label}>Start Date</Text>
        <TextInput style={s.input} value={data.start_date} onChangeText={t => setData({ ...data, start_date: t })} placeholder="2025-06-01" />
        <Text style={s.label}>End Date</Text>
        <TextInput style={s.input} value={data.end_date} onChangeText={t => setData({ ...data, end_date: t })} placeholder="2025-06-30" />
        <Text style={s.label}>Draw Date</Text>
        <TextInput style={s.input} value={data.draw_date} onChangeText={t => setData({ ...data, draw_date: t })} placeholder="2025-07-01" />
        <Text style={s.label}>Max Participants</Text>
        <TextInput style={s.input} keyboardType="numeric" value={data.max_participants} onChangeText={t => setData({ ...data, max_participants: t })} />
        <View style={s.approvalBox}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLbl}>Require Chamber Approval</Text>
            <Text style={s.toggleHint}>{data.requires_approval ? 'Will be reviewed by Chamber of Commerce' : 'Will go live immediately as public draw'}</Text>
          </View>
          <Switch testID="req-approval" value={data.requires_approval} onValueChange={v => setData({ ...data, requires_approval: v })} />
        </View>
        <TouchableOpacity testID="submit-comp" style={s.submitBtn} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={s.submitText}>{data.requires_approval ? 'Submit for Approval' : 'Publish Now'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, color: '#0A0A0A' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14 },
  approvalBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 14, borderRadius: 12, marginTop: 16 },
  toggleLbl: { fontSize: 14, fontWeight: '700', color: '#92400E' },
  toggleHint: { fontSize: 11, color: '#78350F', marginTop: 2 },
  submitBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
