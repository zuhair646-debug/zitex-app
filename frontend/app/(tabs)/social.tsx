import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';

const { width } = Dimensions.get('window');

const POSTS = [
  { id: '1', author: 'Tech Store', time: '24 minutes ago', views: 1345, text: 'Welcome to our new store! We are excited to serve you with the latest technology products and accessories. Visit us today!', image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400', likes: 78000, comments: 201, type: 'post' },
  { id: '2', author: 'Tech Store', time: '2 hours ago', views: 892, text: 'Check out our latest collection of iPhone 16 cases and accessories! Premium quality at affordable prices.', image: 'https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=400', likes: 12400, comments: 87, type: 'post' },
  { id: '3', author: 'Tech Store', time: '5 hours ago', views: 2156, text: 'What is the best Phone this year!', type: 'poll', pollOptions: [{ text: 'iPhone 16 Pro', votes: 45 }, { text: 'Samsung S25 Ultra', votes: 32 }, { text: 'Google Pixel 9 Pro', votes: 18 }, { text: 'Other', votes: 5 }], likes: 5200, comments: 156 },
  { id: '4', author: 'Tech Store', time: '1 day ago', views: 3420, text: 'Big sale coming this weekend! Stay tuned for amazing deals on all Samsung products.', image: 'https://images.pexels.com/photos/6373185/pexels-photo-6373185.jpeg?w=400', likes: 23100, comments: 342, type: 'post' },
];

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export default function SocialScreen() {
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { apiCall } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        const data = await apiCall('/api/social/posts');
        setPosts(data);
      } catch {
        // Fallback to static data
        setPosts(POSTS);
      } finally { setLoading(false); }
    })();
  }, []);

  const toggleLike = async (id: string) => {
    setLikedPosts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    try { await apiCall(`/api/social/posts/${id}/like`, { method: 'POST' }); } catch {}
  };
  const toggleBookmark = async (id: string) => {
    setBookmarked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    try { await apiCall(`/api/social/posts/${id}/bookmark`, { method: 'POST' }); } catch {}
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Social</Text>
          <TouchableOpacity testID="bookmarks-btn" style={s.headerBtn}>
            <Ionicons name="bookmark-outline" size={20} color="#0A0A0A" />
          </TouchableOpacity>
        </View>

        {/* Stories row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesRow}>
          <TouchableOpacity testID="add-story" style={s.storyAdd}>
            <View style={s.storyAddCircle}><Ionicons name="add" size={24} color="#8833FF" /></View>
            <Text style={s.storyLabel}>Add story</Text>
          </TouchableOpacity>
          {['Tech Store', 'Store 2', 'Store 3'].map((name, i) => (
            <TouchableOpacity key={i} style={s.storyItem}>
              <View style={s.storyCircle}>
                <View style={s.storyAvatar}><Ionicons name="storefront" size={22} color="#8833FF" /></View>
              </View>
              <Text style={s.storyLabel} numberOfLines={1}>{name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Posts */}
        {(loading ? POSTS : posts).map((post: any) => (
          <View key={post.id || post.author + post.text?.slice(0, 10)} style={s.postCard}>
            {post.is_ad && <View style={s.sponsoredBadge}><Ionicons name="megaphone" size={12} color="#F59E0B" /><Text style={s.sponsoredText}>Sponsored</Text></View>}
            <View style={s.postHeader}>
              <View style={s.postAvatar}><Ionicons name="storefront" size={18} color="#8833FF" /></View>
              <View style={s.postAuthorInfo}>
                <Text style={s.postAuthor}>{post.author}</Text>
                <Text style={s.postTime}>{post.time || timeAgo(post.created_at)}</Text>
              </View>
              <View style={s.postViews}>
                <Ionicons name="eye-outline" size={14} color="#A1A1AA" />
                <Text style={s.viewsText}>{formatNum(post.views || 0)}</Text>
              </View>
              <TouchableOpacity><Ionicons name="ellipsis-horizontal" size={20} color="#A1A1AA" /></TouchableOpacity>
            </View>

            <Text style={s.postText}>{post.text}</Text>

            {post.image && <Image source={{ uri: post.image }} style={s.postImage} />}

            {post.type === 'poll' && (post.poll_options || post.pollOptions) && (
              <View style={s.pollSection}>
                {(post.poll_options || post.pollOptions).map((opt: any, i: number) => {
                  const opts = post.poll_options || post.pollOptions;
                  const totalVotes = opts.reduce((a: number, b: any) => a + (b.votes || 0), 0) || 1;
                  const pct = Math.round(((opt.votes || 0) / totalVotes) * 100);
                  return (
                    <TouchableOpacity key={i} style={s.pollOption}>
                      <View style={s.pollBarBg}><View style={[s.pollBarFill, { width: `${pct}%` }]} /></View>
                      <Text style={s.pollOptionText}>{opt.text}</Text>
                      <Text style={s.pollPct}>{pct}%</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={s.postActions}>
              <TouchableOpacity testID={`like-${post.id}`} style={s.actionItem} onPress={() => toggleLike(post.id)}>
                <Ionicons name={likedPosts.has(post.id) ? 'heart' : 'heart-outline'} size={22} color={likedPosts.has(post.id) ? '#EF4444' : '#52525B'} />
                <Text style={s.actionCount}>{formatNum(post.likes)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionItem}>
                <Ionicons name="chatbubble-outline" size={20} color="#52525B" />
                <Text style={s.actionCount}>{post.comments}</Text>
              </TouchableOpacity>
              <TouchableOpacity testID={`bookmark-${post.id}`} onPress={() => toggleBookmark(post.id)} style={s.actionItem}>
                <Ionicons name={bookmarked.has(post.id) ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked.has(post.id) ? '#8833FF' : '#52525B'} />
              </TouchableOpacity>
              <TouchableOpacity style={s.actionItem}>
                <Ionicons name="share-outline" size={20} color="#52525B" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A0A0A' },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  storiesRow: { paddingHorizontal: 16, gap: 14, paddingVertical: 12 },
  storyAdd: { alignItems: 'center', width: 68 },
  storyAddCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#8833FF', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  storyItem: { alignItems: 'center', width: 68 },
  storyCircle: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: '#8833FF', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  storyAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center' },
  storyLabel: { fontSize: 10, color: '#52525B', fontWeight: '500', textAlign: 'center' },
  postCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#F9F9FB', borderRadius: 20, padding: 16 },
  sponsoredBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  sponsoredText: { fontSize: 11, color: '#92400E', fontWeight: '600' },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginEnd: 10 },
  postAuthorInfo: { flex: 1 },
  postAuthor: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  postTime: { fontSize: 11, color: '#A1A1AA' },
  postViews: { flexDirection: 'row', alignItems: 'center', gap: 3, marginEnd: 10 },
  viewsText: { fontSize: 11, color: '#A1A1AA' },
  postText: { fontSize: 14, color: '#0A0A0A', lineHeight: 22, marginBottom: 12 },
  postImage: { width: '100%', height: 200, borderRadius: 14, marginBottom: 12 },
  pollSection: { gap: 8, marginBottom: 12 },
  pollOption: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14 },
  pollBarBg: { position: 'absolute', left: 0, top: 0, bottom: 0, right: 0 },
  pollBarFill: { height: '100%', backgroundColor: '#EFE6FF' },
  pollOptionText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#0A0A0A', zIndex: 1 },
  pollPct: { fontSize: 13, fontWeight: '700', color: '#8833FF', zIndex: 1 },
  postActions: { flexDirection: 'row', gap: 16, paddingTop: 4 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 12, color: '#52525B', fontWeight: '500' },
});
