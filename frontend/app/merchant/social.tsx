import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Image, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

export default function MerchantSocial() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState('');
  const [image, setImage] = useState('');

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/social/posts'); setPosts(d); } catch (e: any) { Alert.alert('Error', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!text.trim()) { Alert.alert('Required', 'Add text'); return; }
    try { await apiCall('/api/merchant/social/posts', { method: 'POST', body: JSON.stringify({ text, image, type: 'post' }) }); setText(''); setImage(''); setModalOpen(false); load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const del = (id: string) => Alert.alert('Delete Post?', 'This cannot be undone', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/social/posts/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('Error', e.message); } } }]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size="22" color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>Social Posts ({posts.length})</Text>
        <TouchableOpacity testID="new-post" onPress={() => setModalOpen(true)} style={s.addBtn}><Ionicons name="add" size="22" color="white" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> :
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 16 }}>
          {posts.map(p => (
            <View key={p.id} style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.author}>{p.author}</Text>
                <TouchableOpacity testID={`del-${p.id}`} onPress={() => del(p.id)}><Ionicons name="trash-outline" size="20" color="#EF4444" /></TouchableOpacity>
              </View>
              <Text style={s.text}>{p.text}</Text>
              {p.image ? <Image source={{ uri: p.image }} style={s.img} /> : null}
              <View style={s.stats}>
                <Text style={s.stat}><Ionicons name="heart" size="13" color="#EF4444" /> {p.likes || 0}</Text>
                <Text style={s.stat}><Ionicons name="chatbubble" size="13" color="#3B82F6" /> {p.comments || 0}</Text>
                <Text style={s.stat}><Ionicons name="eye" size="13" color="#6B7280" /> {p.views || 0}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      }
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModalOpen(false)}><Ionicons name="close" size="24" color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>New Post</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>Post Text *</Text>
            <TextInput testID="post-text" style={[s.input, { height: 120 }]} multiline value={text} onChangeText={setText} placeholder="What do you want to share?" />
            <Text style={s.label}>Image URL (optional)</Text>
            <TextInput style={s.input} value={image} onChangeText={setImage} placeholder="https://..." autoCapitalize="none" />
            <TouchableOpacity testID="publish" style={s.publishBtn} onPress={post}><Text style={s.publishText}>Publish</Text></TouchableOpacity>
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
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  author: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  text: { fontSize: 13, color: '#374151', marginBottom: 8 },
  img: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#F3F4F6' },
  stats: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat: { fontSize: 12, color: '#6B7280' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14 },
  publishBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  publishText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
