import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions, Modal, RefreshControl, ActivityIndicator, TextInput, Alert, FlatList, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';

const { width } = Dimensions.get('window');

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} س`;
  return `${Math.floor(diff / 86400)} ي`;
};

export default function SocialScreen() {
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [voted, setVoted] = useState<Record<string, number>>({});
  const [posts, setPosts] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storyOpen, setStoryOpen] = useState<any>(null);

  // Comments thread
  const [threadPostId, setThreadPostId] = useState<string | null>(null);
  const [threadComments, setThreadComments] = useState<any[]>([]);
  const [threadText, setThreadText] = useState('');

  const load = useCallback(async () => {
    try {
      const [postsData, storiesData] = await Promise.all([
        apiCall('/api/social/posts'),
        apiCall('/api/social/stories').catch(() => []),
      ]);
      // Filter out stories from main feed (they're already in stories row)
      setPosts((postsData || []).filter((p: any) => p.type !== 'story'));
      setStories(storiesData || []);
    } catch (e) { console.log(e); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleLike = async (id: string) => {
    setLikedPosts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    try { await apiCall(`/api/social/posts/${id}/like`, { method: 'POST' }); } catch {}
  };
  const toggleBookmark = async (id: string) => {
    setBookmarked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    try { await apiCall(`/api/social/posts/${id}/bookmark`, { method: 'POST' }); } catch {}
  };
  const votePoll = async (postId: string, optionIndex: number) => {
    if (voted[postId] === optionIndex) return;
    setVoted({ ...voted, [postId]: optionIndex });
    // Optimistic local update
    setPosts(posts.map(p => {
      if (p.id !== postId) return p;
      const opts = [...(p.poll_options || [])];
      if (voted[postId] != null) opts[voted[postId]] = { ...opts[voted[postId]], votes: Math.max(0, (opts[voted[postId]].votes || 0) - 1) };
      opts[optionIndex] = { ...opts[optionIndex], votes: (opts[optionIndex].votes || 0) + 1 };
      return { ...p, poll_options: opts };
    }));
    try { await apiCall(`/api/social/posts/${postId}/vote`, { method: 'POST', body: JSON.stringify({ option_index: optionIndex }) }); } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const openThread = async (postId: string) => {
    setThreadPostId(postId);
    try { const d = await apiCall(`/api/social/posts/${postId}/comments`); setThreadComments(d); } catch {}
  };
  const sendComment = async () => {
    if (!threadText.trim() || !threadPostId) return;
    try {
      await apiCall(`/api/social/posts/${threadPostId}/comments`, { method: 'POST', body: JSON.stringify({ text: threadText }) });
      setThreadText('');
      const d = await apiCall(`/api/social/posts/${threadPostId}/comments`); setThreadComments(d);
      // update count
      setPosts(posts.map(p => p.id === threadPostId ? { ...p, comments: (p.comments || 0) + 1 } : p));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>السوشال</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {user?.role === 'merchant' && (
            <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/merchant/social' as any)}>
              <Ionicons name="settings-outline" size={20} color="#0A0A0A" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.headerBtn}>
            <Ionicons name="bookmark-outline" size={20} color="#0A0A0A" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Stories row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesRow}>
            {stories.length === 0 && (
              <View style={s.storyItem}>
                <View style={[s.storyCircle, { borderColor: '#E5E7EB' }]}>
                  <View style={s.storyAvatar}><Ionicons name="storefront" size={22} color="#A1A1AA" /></View>
                </View>
                <Text style={s.storyLabel} numberOfLines={1}>لا حالات</Text>
              </View>
            )}
            {stories.map(st => (
              <TouchableOpacity key={st.id} style={s.storyItem} onPress={() => setStoryOpen(st)}>
                <View style={s.storyCircle}>
                  {st.image ? <Image source={{ uri: st.image }} style={s.storyAvatarImg} /> : <View style={s.storyAvatar}><Ionicons name="storefront" size={22} color="#8833FF" /></View>}
                </View>
                <Text style={s.storyLabel} numberOfLines={1}>{st.author || 'Store'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Posts */}
          {posts.length === 0 && <Text style={s.empty}>لا توجد منشورات بعد</Text>}
          {posts.map((post: any) => {
            const postId = post.id || post._id;
            const isPoll = post.type === 'poll';
            const isQuestion = post.type === 'question';
            const isEvent = post.type === 'event';
            const totalVotes = isPoll ? (post.poll_options || []).reduce((a: number, o: any) => a + (o.votes || 0), 0) : 0;
            const userVoted = voted[postId];

            return (
              <View key={postId} style={s.postCard}>
                {isQuestion && (
                  <View style={s.qBadge}><Ionicons name="help-circle" size={14} color="#F59E0B" /><Text style={s.qBadgeText}>سؤال</Text></View>
                )}
                {isEvent && (
                  <View style={[s.qBadge, { backgroundColor: '#D1FAE5' }]}><Ionicons name="calendar" size={14} color="#10B981" /><Text style={[s.qBadgeText, { color: '#065F46' }]}>فعالية</Text></View>
                )}
                <View style={s.postHeader}>
                  <View style={s.postAvatar}><Ionicons name="storefront" size={18} color="#8833FF" /></View>
                  <View style={s.postAuthorInfo}>
                    <Text style={s.postAuthor}>{post.author || 'Zitex'}</Text>
                    <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
                  </View>
                  <View style={s.postViews}>
                    <Ionicons name="eye-outline" size={14} color="#A1A1AA" />
                    <Text style={s.viewsText}>{formatNum(post.views || 0)}</Text>
                  </View>
                </View>

                {!!post.text && <Text style={s.postText}>{post.text}</Text>}

                {/* Images */}
                {(post.images && post.images.length > 1) ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} pagingEnabled style={s.imgScroll}>
                    {post.images.map((img: string, i: number) => <Image key={i} source={{ uri: img }} style={s.multiImg} />)}
                  </ScrollView>
                ) : (post.image || (post.images && post.images[0])) ? (
                  <Image source={{ uri: post.image || post.images[0] }} style={s.postImage} />
                ) : null}

                {/* Event details */}
                {isEvent && (
                  <View style={s.eventBox}>
                    <Ionicons name="time" size={14} color="#10B981" />
                    <Text style={s.eventText}>📅 {post.event_date} {post.event_location && `• 📍 ${post.event_location}`}</Text>
                  </View>
                )}

                {/* Poll */}
                {isPoll && (post.poll_options || []).map((opt: any, i: number) => {
                  const pct = totalVotes ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
                  const isSelected = userVoted === i;
                  return (
                    <TouchableOpacity key={i} style={[s.pollOption, isSelected && s.pollSelected]} onPress={() => votePoll(postId, i)}>
                      <View style={[s.pollBarFill, { width: `${pct}%`, backgroundColor: isSelected ? '#8833FF40' : '#EFE6FF' }]} />
                      <Text style={[s.pollOptionText, isSelected && { fontWeight: '800' }]}>{opt.text}</Text>
                      <Text style={[s.pollPct, isSelected && { color: '#8833FF' }]}>{pct}%</Text>
                    </TouchableOpacity>
                  );
                })}
                {isPoll && <Text style={s.totalVotesText}>{totalVotes} صوت</Text>}

                <View style={s.postActions}>
                  <TouchableOpacity style={s.actionItem} onPress={() => toggleLike(postId)}>
                    <Ionicons name={likedPosts.has(postId) ? 'heart' : 'heart-outline'} size={22} color={likedPosts.has(postId) ? '#EF4444' : '#52525B'} />
                    <Text style={s.actionCount}>{formatNum(post.likes || 0)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionItem} onPress={() => openThread(postId)}>
                    <Ionicons name="chatbubble-outline" size={20} color="#52525B" />
                    <Text style={s.actionCount}>{post.comments || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleBookmark(postId)} style={s.actionItem}>
                    <Ionicons name={bookmarked.has(postId) ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked.has(postId) ? '#8833FF' : '#52525B'} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Story Viewer */}
      <Modal visible={!!storyOpen} animationType="fade" transparent onRequestClose={() => setStoryOpen(null)}>
        <View style={s.storyViewer}>
          <TouchableOpacity style={s.storyClose} onPress={() => setStoryOpen(null)}><Ionicons name="close" size={28} color="white" /></TouchableOpacity>
          {storyOpen?.image && <Image source={{ uri: storyOpen.image }} style={s.storyImage} resizeMode="contain" />}
          <View style={s.storyFooter}>
            <Text style={s.storyAuthor}>📖 {storyOpen?.author || 'Store'}</Text>
            {!!storyOpen?.text && <Text style={s.storyText}>{storyOpen.text}</Text>}
            <Text style={s.storyTime}>{timeAgo(storyOpen?.created_at)}</Text>
          </View>
        </View>
      </Modal>

      {/* Comments Thread */}
      <Modal visible={!!threadPostId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setThreadPostId(null)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setThreadPostId(null)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
            <Text style={s.title}>التعليقات</Text>
            <View style={{ width: 30 }} />
          </View>
          <FlatList
            data={threadComments}
            keyExtractor={c => c.id || c._id || String(Math.random())}
            contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={s.empty}>كن أول من يعلق</Text>}
            renderItem={({ item: c }) => (
              <View style={[s.cmtCard, c.is_merchant_reply && s.cmtMerchantStyle]}>
                <View style={s.cmtAvatar}><Text style={s.cmtAvText}>{c.user_name?.charAt(0) || '?'}</Text></View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={s.cmtName}>{c.user_name} {c.is_merchant_reply && <Text style={s.merchantTag}>✓ التاجر</Text>}</Text>
                  <Text style={s.cmtText}>{c.text}</Text>
                </View>
              </View>
            )}
          />
          <View style={s.commentBar}>
            <TextInput style={[s.commentInput]} value={threadText} onChangeText={setThreadText} placeholder="اكتب تعليقاً..." />
            <TouchableOpacity style={s.sendBtn} onPress={sendComment}><Ionicons name="send" size={18} color="white" /></TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A0A0A' },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  storiesRow: { paddingHorizontal: 16, gap: 14, paddingVertical: 12 },
  storyItem: { alignItems: 'center', width: 68 },
  storyCircle: { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: '#EC4899', alignItems: 'center', justifyContent: 'center', marginBottom: 4, padding: 2 },
  storyAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center' },
  storyAvatarImg: { width: 50, height: 50, borderRadius: 25 },
  storyLabel: { fontSize: 10, color: '#52525B', fontWeight: '500', textAlign: 'center' },

  postCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#F9F9FB', borderRadius: 20, padding: 16 },
  qBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  qBadgeText: { fontSize: 11, color: '#92400E', fontWeight: '700' },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginEnd: 10 },
  postAuthorInfo: { flex: 1 },
  postAuthor: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  postTime: { fontSize: 11, color: '#A1A1AA' },
  postViews: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewsText: { fontSize: 11, color: '#A1A1AA' },
  postText: { fontSize: 14, color: '#0A0A0A', lineHeight: 22, marginBottom: 12 },
  postImage: { width: '100%', height: 220, borderRadius: 14, marginBottom: 12 },
  imgScroll: { marginBottom: 12 },
  multiImg: { width: width - 72, height: 220, borderRadius: 14, marginRight: 8 },

  eventBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D1FAE5', padding: 10, borderRadius: 10, marginBottom: 10 },
  eventText: { fontSize: 12, color: '#065F46', fontWeight: '700' },

  pollOption: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14, marginBottom: 6 },
  pollSelected: { borderColor: '#8833FF', borderWidth: 2 },
  pollBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#EFE6FF' },
  pollOptionText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0A0A0A', zIndex: 1 },
  pollPct: { fontSize: 13, fontWeight: '700', color: '#8833FF', zIndex: 1 },
  totalVotesText: { fontSize: 11, color: '#A1A1AA', textAlign: 'center', marginBottom: 8 },

  postActions: { flexDirection: 'row', gap: 16, paddingTop: 4 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 12, color: '#52525B', fontWeight: '500' },
  empty: { textAlign: 'center', color: '#A1A1AA', marginTop: 40 },

  storyViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  storyClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  storyImage: { width: '100%', height: '70%' },
  storyFooter: { position: 'absolute', bottom: 40, left: 20, right: 20 },
  storyAuthor: { color: 'white', fontSize: 16, fontWeight: '800' },
  storyText: { color: 'white', fontSize: 14, marginTop: 6 },
  storyTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },

  cmtCard: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 6 },
  cmtMerchantStyle: { backgroundColor: '#F3E8FF' },
  cmtAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#8833FF', alignItems: 'center', justifyContent: 'center' },
  cmtAvText: { color: 'white', fontWeight: '800', fontSize: 12 },
  cmtName: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  cmtText: { fontSize: 13, color: '#374151', marginTop: 2 },
  merchantTag: { color: '#8833FF', fontSize: 10, fontWeight: '700' },
  commentBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
  commentInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, textAlign: 'right' },
  sendBtn: { backgroundColor: '#8833FF', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
