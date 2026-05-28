import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, Image, RefreshControl, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';

type Tab = 'posts' | 'comments';

export default function MerchantSocial() {
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [tab, setTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState('');
  const [image, setImage] = useState('');

  const [replyPostId, setReplyPostId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyParent, setReplyParent] = useState<any>(null);
  const [postComments, setPostComments] = useState<any[]>([]);
  const [threadModalOpen, setThreadModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === 'posts') { const d = await apiCall('/api/social/posts'); setPosts(d); }
      else { const d = await apiCall('/api/merchant/social/comments'); setComments(d); }
    } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setLoading(false); setRefreshing(false); }
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const post = async () => {
    if (!text.trim()) { Alert.alert('مطلوب', 'أضف نص المنشور'); return; }
    try { await apiCall('/api/merchant/social/posts', { method: 'POST', body: JSON.stringify({ text, image, type: 'post' }) }); setText(''); setImage(''); setModalOpen(false); load(); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const delPost = (id: string) => Alert.alert('حذف المنشور؟', 'لا يمكن التراجع', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: async () => { try { await apiCall(`/api/merchant/social/posts/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { Alert.alert('خطأ', e.message); } } }
  ]);

  const openThread = async (postId: string) => {
    setReplyPostId(postId); setThreadModalOpen(true); setReplyParent(null); setReplyText('');
    try { const d = await apiCall(`/api/social/posts/${postId}/comments`); setPostComments(d); } catch {}
  };

  const sendReply = async () => {
    if (!replyText.trim() || !replyPostId) return;
    try {
      await apiCall(`/api/social/posts/${replyPostId}/comments`, { method: 'POST', body: JSON.stringify({ text: replyText, reply_to: replyParent?.id }) });
      setReplyText(''); setReplyParent(null);
      const d = await apiCall(`/api/social/posts/${replyPostId}/comments`); setPostComments(d);
      if (tab === 'comments') load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const delComment = (cid: string) => Alert.alert('حذف التعليق؟', '', [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'حذف', style: 'destructive', onPress: async () => {
      try {
        await apiCall(`/api/merchant/social/comments/${cid}`, { method: 'DELETE' });
        if (replyPostId) { const d = await apiCall(`/api/social/posts/${replyPostId}/comments`); setPostComments(d); }
        if (tab === 'comments') load();
      } catch (e: any) { Alert.alert('خطأ', e.message); }
    } }
  ]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>{tab === 'posts' ? `المنشورات (${posts.length})` : `التعليقات (${comments.length})`}</Text>
        {tab === 'posts' && <TouchableOpacity onPress={() => setModalOpen(true)} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>}
        {tab === 'comments' && <View style={{ width: 36 }} />}
      </View>

      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'posts' && s.tabActive]} onPress={() => setTab('posts')}>
          <Text style={[s.tabText, tab === 'posts' && s.tabTextActive]}>📝 المنشورات</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'comments' && s.tabActive]} onPress={() => setTab('comments')}>
          <Text style={[s.tabText, tab === 'comments' && s.tabTextActive]}>💬 صندوق التعليقات</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 14 }}>
          {tab === 'posts' && <>
            {posts.length === 0 && <Text style={s.empty}>لا توجد منشورات بعد</Text>}
            {posts.map(p => (
              <View key={p.id} style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.author}>{p.author || 'Zitex'}</Text>
                  <TouchableOpacity onPress={() => delPost(p.id)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity>
                </View>
                <Text style={s.text}>{p.text || p.content}</Text>
                {p.image || p.image_url ? <Image source={{ uri: p.image || p.image_url }} style={s.img} /> : null}
                <View style={s.statsRow}>
                  <Text style={s.stat}><Ionicons name="heart" size={13} color="#EF4444" /> {p.likes || 0}</Text>
                  <TouchableOpacity style={s.commentsBtn} onPress={() => openThread(p.id)}>
                    <Ionicons name="chatbubble" size={13} color="#3B82F6" />
                    <Text style={s.commentsBtnText}>التعليقات ({p.comments || 0})</Text>
                  </TouchableOpacity>
                  <Text style={s.stat}><Ionicons name="eye" size={13} color="#6B7280" /> {p.views || 0}</Text>
                </View>
              </View>
            ))}
          </>}

          {tab === 'comments' && <>
            {comments.length === 0 && <Text style={s.empty}>لا توجد تعليقات حتى الآن</Text>}
            {comments.map(c => (
              <TouchableOpacity key={c.id} style={s.commentCard} onPress={() => openThread(c.post_id)}>
                <View style={s.cmtAvatar}><Text style={s.cmtAvText}>{c.user_name?.charAt(0) || '?'}</Text></View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.cmtName}>{c.user_name} {c.is_merchant_reply && <Text style={s.youTag}> (أنت)</Text>}</Text>
                    {!c.is_merchant_reply && <TouchableOpacity onPress={(e) => { e.stopPropagation(); delComment(c.id); }}><Ionicons name="trash-outline" size={16} color="#EF4444" /></TouchableOpacity>}
                  </View>
                  <Text style={s.cmtText} numberOfLines={3}>{c.text}</Text>
                  <Text style={s.cmtPost}>↳ على: {(c.post?.content || c.post?.text || '').slice(0, 60)}{(c.post?.content || c.post?.text || '').length > 60 ? '...' : ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>}
        </ScrollView>
      )}

      {/* New Post Modal */}
      <Modal visible={modalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setModalOpen(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>منشور جديد</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Text style={s.label}>نص المنشور *</Text>
            <TextInput style={[s.input, { height: 120, textAlignVertical: 'top' }]} multiline value={text} onChangeText={setText} placeholder="ماذا تريد أن تشارك؟" />
            <Text style={s.label}>رابط الصورة (اختياري)</Text>
            <TextInput style={s.input} value={image} onChangeText={setImage} placeholder="https://..." autoCapitalize="none" />
            <TouchableOpacity style={s.publishBtn} onPress={post}><Text style={s.publishText}>نشر</Text></TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Thread / Comments Modal */}
      <Modal visible={threadModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setThreadModalOpen(false)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setThreadModalOpen(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>التعليقات</Text>
            <View style={{ width: 36 }} />
          </View>
          <FlatList
            data={postComments}
            keyExtractor={c => c.id || c._id || String(Math.random())}
            contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={s.empty}>لا توجد تعليقات بعد</Text>}
            renderItem={({ item: c }) => (
              <View style={[s.cmtThread, c.is_merchant_reply && s.cmtMerchant, !!c.reply_to && { marginLeft: 24 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.cmtName}>{c.user_name} {c.is_merchant_reply && <Text style={s.youTag}>✓ التاجر</Text>}</Text>
                  {!c.is_merchant_reply && <TouchableOpacity onPress={() => delComment(c.id)}><Ionicons name="trash-outline" size={15} color="#EF4444" /></TouchableOpacity>}
                </View>
                <Text style={s.cmtText}>{c.text}</Text>
                {!c.is_merchant_reply && (
                  <TouchableOpacity onPress={() => setReplyParent(c)} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#8833FF', fontSize: 11, fontWeight: '700' }}>الرد ↩</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
          <View style={s.replyBar}>
            {replyParent && (
              <View style={s.replyTo}>
                <Text style={s.replyToText}>الرد على: {replyParent.user_name}</Text>
                <TouchableOpacity onPress={() => setReplyParent(null)}><Ionicons name="close" size={16} color="#6B7280" /></TouchableOpacity>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[s.input, { flex: 1 }]} value={replyText} onChangeText={setReplyText} placeholder="اكتب رداً..." />
              <TouchableOpacity style={s.sendBtn} onPress={sendReply}><Ionicons name="send" size={18} color="white" /></TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', marginHorizontal: 10, color: '#0A0A0A', textAlign: 'center' },
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: 'white', padding: 8, gap: 8 },
  tab: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' },
  tabActive: { backgroundColor: '#8833FF' },
  tabText: { fontSize: 13, color: '#374151', fontWeight: '700' },
  tabTextActive: { color: 'white' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  author: { fontSize: 14, fontWeight: '800', color: '#0A0A0A' },
  text: { fontSize: 13, color: '#374151', marginBottom: 8 },
  img: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#F3F4F6' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
  stat: { fontSize: 12, color: '#6B7280' },
  commentsBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  commentsBtnText: { color: '#3B82F6', fontSize: 12, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, textAlign: 'right' },
  publishBtn: { backgroundColor: '#8833FF', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  publishText: { color: 'white', fontWeight: '800', fontSize: 16 },
  commentCard: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8 },
  cmtAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#8833FF', alignItems: 'center', justifyContent: 'center' },
  cmtAvText: { color: 'white', fontWeight: '800' },
  cmtName: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  cmtText: { fontSize: 13, color: '#374151', marginTop: 3 },
  cmtPost: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  cmtThread: { backgroundColor: 'white', padding: 12, borderRadius: 10, marginBottom: 6 },
  cmtMerchant: { backgroundColor: '#F3E8FF', borderLeftWidth: 3, borderLeftColor: '#8833FF' },
  youTag: { color: '#8833FF', fontSize: 11, fontWeight: '700' },
  replyBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  replyTo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F3F4F6', padding: 6, borderRadius: 6, marginBottom: 6 },
  replyToText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  sendBtn: { backgroundColor: '#8833FF', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 13 },
});
