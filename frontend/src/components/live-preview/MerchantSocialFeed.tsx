import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions, Modal, RefreshControl, ActivityIndicator, TextInput, Alert, FlatList, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LP, K, KM } from './theme';

const { width } = Dimensions.get('window');
const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} س`;
  return `${Math.floor(diff / 86400)} ي`;
};

/**
 * Merchant Social Feed — 1:1 visual clone of the customer social feed
 * with a Luxe Dark "Glass" overlay for merchant-only analytics.
 *
 * Renders posts identically to what the customer sees, but adds:
 *   - Glass "Insights" pill on each post
 *   - Bottom Analytics Sheet showing likers, sharers, links, direct-reply
 *   - Filter chips (all / needs reply / top)
 */
export default function MerchantSocialFeed({ apiCall, onOpenPost }: any) {
  const [posts, setPosts] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [storeInfo, setStoreInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storyOpen, setStoryOpen] = useState<any>(null);
  const [voted, setVoted] = useState<Record<string, number>>({});
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'needs_reply' | 'top'>('all');

  // Insights sheet
  const [insightsPost, setInsightsPost] = useState<any>(null);
  const [insightsDetail, setInsightsDetail] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsTab, setInsightsTab] = useState<'stats' | 'likers' | 'sharers' | 'comments'>('stats');

  const openInsights = useCallback(async (post: any, tab: 'stats' | 'likers' | 'sharers' | 'comments' = 'stats') => {
    setInsightsPost(post);
    setInsightsTab(tab);
    setInsightsLoading(true);
    setInsightsDetail(null);
    try {
      const detail = await apiCall(`/api/merchant/social/posts/${post.id}/detail`);
      setInsightsDetail(detail);
    } catch (e: any) {
      // Fallback to embedded data
      setInsightsDetail({ post, likers: post.liked_by || [], sharers: post.shared_by || [], comments: post.comments || [], kpis: { views: post.views, likes: post.likes, comment_count: (post.comments || []).length, shares: post.shares } });
    } finally {
      setInsightsLoading(false);
    }
  }, [apiCall]);

  // Merchant reply modal (from a specific comment)
  const [replying, setReplying] = useState<{ postId: string; commentId: string; commentText: string; userName: string } | null>(null);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    try {
      const [postsData, storiesData, supportData] = await Promise.all([
        apiCall('/api/social/posts'),
        apiCall('/api/social/stories').catch(() => []),
        apiCall('/api/store/support').catch(() => null),
      ]);
      setPosts((postsData || []).filter((p: any) => p.type !== 'story'));
      setStories(storiesData || []);
      setStoreInfo(supportData);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [apiCall]);

  useEffect(() => { load(); const iv = setInterval(load, 25000); return () => clearInterval(iv); }, [load]);

  const displayed = useMemo(() => {
    if (filter === 'needs_reply') {
      return posts.filter(p => (Array.isArray(p.comments) ? p.comments : []).some((c: any) => !c.store_reply && !c.is_merchant_reply));
    }
    if (filter === 'top') return [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    return posts;
  }, [posts, filter]);

  const votePoll = async (postId: string, optionIndex: number) => {
    if (voted[postId] === optionIndex) return;
    setVoted({ ...voted, [postId]: optionIndex });
    setPosts(posts.map(p => {
      if (p.id !== postId) return p;
      const opts = [...(p.poll_options || [])];
      if (voted[postId] != null) opts[voted[postId]] = { ...opts[voted[postId]], votes: Math.max(0, (opts[voted[postId]].votes || 0) - 1) };
      opts[optionIndex] = { ...opts[optionIndex], votes: (opts[optionIndex].votes || 0) + 1 };
      return { ...p, poll_options: opts };
    }));
    try { await apiCall(`/api/social/posts/${postId}/vote`, { method: 'POST', body: JSON.stringify({ option_index: optionIndex }) }); } catch {}
  };

  const sendReply = async () => {
    if (!replying || !replyText.trim()) return;
    try {
      await apiCall(`/api/social/posts/${replying.postId}/comments/${replying.commentId}/store-reply`, {
        method: 'POST', body: JSON.stringify({ text: replyText.trim() }),
      });
      Alert.alert('تم', 'تم إرسال ردك باسم المتجر ✨');
      // Optimistic update: inject reply into current post
      const rt = replyText.trim();
      const rid = replying.commentId;
      const pid = replying.postId;
      setPosts(prev => prev.map(p => p.id === pid ? {
        ...p,
        comments: (p.comments || []).map((c: any) => c.id === rid ? { ...c, store_reply: rt } : c),
      } : p));
      setInsightsPost((prev: any) => prev ? {
        ...prev,
        comments: (prev.comments || []).map((c: any) => c.id === rid ? { ...c, store_reply: rt } : c),
      } : prev);
      setReplying(null); setReplyText(''); load();
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  if (loading) return <ActivityIndicator size="large" color={LP.GOLD} style={{ marginTop: 40 }} />;

  return (
    <>
      {/* Preview banner */}
      <BlurView intensity={30} tint="dark" style={s.merchantBanner}>
        <Ionicons name="eye" size={14} color={LP.GOLD} />
        <Text style={s.merchantBannerText}>عرض التاجر — تطابق تام مع تجربة العميل ✨</Text>
      </BlurView>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingVertical: 6 }}>
        {[
          { k: 'all', label: 'كل المنشورات', icon: 'grid' },
          { k: 'needs_reply', label: 'يحتاج رد', icon: 'chatbubble-ellipses' },
          { k: 'top', label: 'الأكثر تفاعلاً', icon: 'flame' },
        ].map((f: any) => (
          <TouchableOpacity key={f.k} onPress={() => setFilter(f.k)}
            style={[s.filterChip, filter === f.k && s.filterChipActive]}>
            <Ionicons name={f.icon} size={12} color={filter === f.k ? LP.BG : LP.GOLD} />
            <Text style={[s.filterChipText, filter === f.k && { color: LP.BG }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={LP.GOLD} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Stories row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesRow}>
          {stories.length === 0 && (
            <View style={s.storyItem}>
              <View style={[s.storyCircle, { borderColor: LP.BORDER }]}>
                <View style={s.storyAvatar}><Ionicons name="storefront" size={22} color={LP.MUTED} /></View>
              </View>
              <Text style={s.storyLabel} numberOfLines={1}>لا حالات</Text>
            </View>
          )}
          {stories.map(st => (
            <TouchableOpacity key={st.id} style={s.storyItem} onPress={() => setStoryOpen(st)}>
              <View style={s.storyCircle}>
                {st.image ? <Image source={{ uri: st.image }} style={s.storyAvatarImg} /> : <View style={s.storyAvatar}><Ionicons name="storefront" size={22} color={LP.GOLD} /></View>}
              </View>
              <Text style={s.storyLabel} numberOfLines={1}>{st.author || 'Store'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Posts */}
        {displayed.length === 0 && <Text style={s.empty}>لا توجد منشورات</Text>}
        {displayed.map((post: any) => {
          const postId = post.id || post._id;
          const isPoll = post.type === 'poll';
          const isQuestion = post.type === 'question';
          const isEvent = post.type === 'event';
          const totalVotes = isPoll ? (post.poll_options || []).reduce((a: number, o: any) => a + (o.votes || 0), 0) : 0;
          const userVoted = voted[postId];
          const commentCount = Array.isArray(post.comments) ? post.comments.length : (post.comments_count || post.comments || 0);
          const unansweredCount = Array.isArray(post.comments) ? post.comments.filter((c: any) => !c.store_reply && !c.is_merchant_reply).length : 0;

          return (
            <View key={postId} style={s.postCard}>
              {/* Merchant overlay pill — insights */}
              <TouchableOpacity style={s.insightsFab} onPress={() => onOpenPost ? onOpenPost(post) : openInsights(post, 'stats')}>
                <BlurView intensity={40} tint="dark" style={s.insightsPill}>
                  <Ionicons name="analytics" size={14} color={LP.GOLD} />
                  <Text style={{ color: LP.GOLD, fontSize: 11, fontWeight: '900' }}>إحصائيات</Text>
                </BlurView>
              </TouchableOpacity>

              {/* Needs-reply badge */}
              {unansweredCount > 0 && (
                <View style={s.replyBadge}>
                  <Ionicons name="chatbubble-ellipses" size={11} color="#FFF" />
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>{unansweredCount} يحتاج رد</Text>
                </View>
              )}

              {isQuestion && (
                <View style={s.qBadge}><Ionicons name="help-circle" size={14} color="#F59E0B" /><Text style={s.qBadgeText}>سؤال</Text></View>
              )}
              {isEvent && (
                <View style={[s.qBadge, { backgroundColor: '#D1FAE5' }]}><Ionicons name="calendar" size={14} color="#10B981" /><Text style={[s.qBadgeText, { color: '#065F46' }]}>فعالية</Text></View>
              )}
              <View style={s.postHeader}>
                <View style={s.postAvatar}><Ionicons name="storefront" size={18} color="#F5C518" /></View>
                <View style={s.postAuthorInfo}>
                  <Text style={s.postAuthor}>{post.author || 'Zenrex Store'}</Text>
                  <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
                </View>
                <View style={s.postViews}>
                  <Ionicons name="eye-outline" size={14} color="#A1A1AA" />
                  <Text style={s.viewsText}>{KM(post.views || 0)}</Text>
                </View>
              </View>

              {!!post.text && <Text style={s.postText}>{post.text}</Text>}

              {(post.images && post.images.length > 1) ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} pagingEnabled style={s.imgScroll}>
                  {post.images.map((img: string, i: number) => <Image key={i} source={{ uri: img }} style={s.multiImg} />)}
                </ScrollView>
              ) : (post.image || (post.images && post.images[0])) ? (
                <Image source={{ uri: post.image || post.images[0] }} style={s.postImage} />
              ) : null}

              {isEvent && (
                <View style={s.eventBox}>
                  <Ionicons name="time" size={14} color="#10B981" />
                  <Text style={s.eventText}>📅 {post.event_date} {post.event_location && `• 📍 ${post.event_location}`}</Text>
                </View>
              )}

              {isPoll && (post.poll_options || []).map((opt: any, i: number) => {
                const pct = totalVotes ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
                const isSelected = userVoted === i;
                return (
                  <TouchableOpacity key={i} style={[s.pollOption, isSelected && s.pollSelected]} onPress={() => votePoll(postId, i)}>
                    <View style={[s.pollBarFill, { width: `${pct}%`, backgroundColor: isSelected ? '#8833FF40' : '#FFF7DA' }]} />
                    <Text style={[s.pollOptionText, isSelected && { fontWeight: '800' }]}>{opt.text}</Text>
                    <Text style={[s.pollPct, isSelected && { color: '#F5C518' }]}>{pct}%</Text>
                  </TouchableOpacity>
                );
              })}
              {isPoll && <Text style={s.totalVotesText}>{totalVotes} صوت</Text>}

              <View style={s.postActions}>
                <TouchableOpacity style={s.actionItem} onPress={() => openInsights(post, 'likers')}>
                  <Ionicons name="heart" size={22} color="#EF4444" />
                  <Text style={s.actionCount}>{KM(post.likes || 0)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionItem} onPress={() => openInsights(post, 'comments')}>
                  <Ionicons name="chatbubble-outline" size={20} color="#52525B" />
                  <Text style={s.actionCount}>{commentCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionItem} onPress={() => openInsights(post, 'sharers')}>
                  <Ionicons name="share-social-outline" size={20} color="#52525B" />
                  <Text style={s.actionCount}>{KM(post.shares || 0)}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={s.detailsInlineBtn} onPress={() => onOpenPost ? onOpenPost(post) : openInsights(post, 'stats')}>
                  <Ionicons name="analytics" size={14} color={LP.BG} />
                  <Text style={{ color: LP.BG, fontSize: 11, fontWeight: '900' }}>التفاصيل</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>

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

      {/* Insights Sheet — Merchant Analytics Overlay */}
      <Modal visible={!!insightsPost} animationType="slide" transparent onRequestClose={() => { setInsightsPost(null); setInsightsDetail(null); }}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <TouchableOpacity onPress={() => { setInsightsPost(null); setInsightsDetail(null); }}><Ionicons name="close" size={22} color={LP.TEXT} /></TouchableOpacity>
              <Text style={s.sheetTitle}>إحصائيات المنشور — شفافية كاملة</Text>
              <View style={{ width: 22 }} />
            </View>

            {/* Tabs */}
            {insightsPost && (
              <View style={s.insightsTabRow}>
                {[
                  { k: 'stats', l: 'نظرة عامة', i: 'stats-chart', count: null },
                  { k: 'likers', l: 'المُعجبون', i: 'heart', count: (insightsDetail?.likers || insightsPost.liked_by || []).length },
                  { k: 'comments', l: 'التعليقات', i: 'chatbubbles', count: (insightsDetail?.comments || insightsPost.comments || []).length },
                  { k: 'sharers', l: 'المشاركات', i: 'share-social', count: (insightsDetail?.sharers || insightsPost.shared_by || []).length },
                ].map((t: any) => (
                  <TouchableOpacity key={t.k} onPress={() => setInsightsTab(t.k)} style={[s.insightsTab, insightsTab === t.k && s.insightsTabActive]}>
                    <Ionicons name={t.i as any} size={12} color={insightsTab === t.k ? LP.BG : LP.MUTED} />
                    <Text style={[s.insightsTabText, insightsTab === t.k && { color: LP.BG, fontWeight: '900' }]}>{t.l}</Text>
                    {t.count != null && t.count > 0 && (
                      <View style={[s.tabBadge, insightsTab === t.k && { backgroundColor: LP.BG + 'AA' }]}>
                        <Text style={[s.tabBadgeText, insightsTab === t.k && { color: LP.GOLD }]}>{t.count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
              {insightsLoading && <ActivityIndicator color={LP.GOLD} style={{ marginTop: 40 }} />}
              {!insightsLoading && insightsPost && (
                <>
                  {insightsTab === 'stats' && (
                    <>
                      <View style={s.previewCard}>
                        {(insightsPost.image || insightsPost.images?.[0]) && (
                          <Image source={{ uri: insightsPost.image || insightsPost.images[0] }} style={{ width: '100%', height: 150, borderRadius: 12, marginBottom: 8 }} />
                        )}
                        {!!insightsPost.text && <Text style={{ color: LP.TEXT, fontSize: 13, textAlign: 'right' }} numberOfLines={3}>{insightsPost.text}</Text>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        <StatMini icon="eye" label="مشاهدات" value={KM(insightsDetail?.kpis?.views ?? insightsPost.views ?? 0)} color={LP.INFO} onPress={null} />
                        <StatMini icon="heart" label="إعجابات" value={KM(insightsDetail?.kpis?.likes ?? insightsPost.likes ?? 0)} color="#EF4444" onPress={() => setInsightsTab('likers')} />
                        <StatMini icon="chatbubble" label="تعليقات" value={KM(insightsDetail?.kpis?.comment_count ?? (insightsPost.comments || []).length)} color={LP.WARN} onPress={() => setInsightsTab('comments')} />
                        <StatMini icon="share-social" label="مشاركات" value={KM(insightsDetail?.kpis?.shares ?? insightsPost.shares ?? 0)} color={LP.SUCCESS} onPress={() => setInsightsTab('sharers')} />
                      </View>
                    </>
                  )}

                  {insightsTab === 'likers' && (
                    <LikersView likers={insightsDetail?.likers || insightsPost.liked_by || []} totalLikes={insightsDetail?.kpis?.likes ?? insightsPost.likes ?? 0} />
                  )}

                  {insightsTab === 'sharers' && (
                    <SharersView sharers={insightsDetail?.sharers || insightsPost.shared_by || []} totalShares={insightsDetail?.kpis?.shares ?? insightsPost.shares ?? 0} />
                  )}

                  {insightsTab === 'comments' && (
                    <CommentsView
                      comments={insightsDetail?.comments || insightsPost.comments || []}
                      onReply={(c: any) => { setReplying({ postId: insightsPost.id, commentId: c.id, commentText: c.text, userName: c.user_name }); setReplyText(''); }}
                    />
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reply Modal */}
      <Modal visible={!!replying} transparent animationType="slide" onRequestClose={() => setReplying(null)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: '70%' }]}>
            <View style={s.sheetHandle} />
            <View style={{ padding: 16 }}>
              <Text style={s.sheetTitle}>رد على {replying?.userName || 'التعليق'} باسم المتجر ✨</Text>
              {replying && (
                <View style={s.commentPreview}>
                  <Text style={{ color: LP.MUTED, fontSize: 11, textAlign: 'right' }}>تعليق العميل:</Text>
                  <Text style={{ color: LP.TEXT, fontSize: 12, marginTop: 4, textAlign: 'right' }}>💬 {replying.commentText}</Text>
                </View>
              )}
              <TextInput style={s.replyInput} placeholder="اكتب ردك..." placeholderTextColor={LP.MUTED}
                multiline value={replyText} onChangeText={setReplyText} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={s.btnGhost} onPress={() => setReplying(null)}>
                  <Text style={{ color: LP.MUTED, fontWeight: '800' }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnPrimary} onPress={sendReply}>
                  <Ionicons name="send" size={16} color={LP.BG} />
                  <Text style={{ color: LP.BG, fontWeight: '900' }}>إرسال</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ─────── HELPERS ─────── */
function StatMini({ icon, label, value, color, onPress }: any) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap onPress={onPress} activeOpacity={0.75} style={s.statMini}>
      <View style={[s.statIcon, { backgroundColor: color + '25' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={{ color: LP.TEXT, fontSize: 18, fontWeight: '900', textAlign: 'right' }}>{value}</Text>
      <Text style={{ color: LP.MUTED, fontSize: 10, textAlign: 'right' }}>{label}</Text>
      {onPress && (
        <View style={{ position: 'absolute', bottom: 6, left: 6 }}>
          <Ionicons name="chevron-back" size={12} color={LP.MUTED} />
        </View>
      )}
    </Wrap>
  );
}

function LikersView({ likers, totalLikes }: any) {
  const showing = likers?.length || 0;
  if (showing === 0) {
    return (
      <View style={{ alignItems: 'center', padding: 40 }}>
        <Ionicons name="heart-outline" size={40} color={LP.MUTED} />
        <Text style={{ color: LP.MUTED, marginTop: 8 }}>لم يعجب أحد بعد</Text>
      </View>
    );
  }
  return (
    <>
      <View style={s.headerNote}>
        <Ionicons name="heart" size={14} color="#EF4444" />
        <Text style={s.headerNoteText}>{totalLikes.toLocaleString('ar-SA')} إعجاب — عرض {showing} مستخدم</Text>
      </View>
      {likers.map((u: any, i: number) => (
        <View key={u.user_id || i} style={s.userRow}>
          <View style={[s.userAvatar, { backgroundColor: '#EF4444' + '30' }]}>
            {u.user_avatar ? <Image source={{ uri: u.user_avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} /> :
              <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 14 }}>{(u.user_name || '?')[0]}</Text>}
          </View>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={s.userName}>{u.user_name || 'مستخدم'}</Text>
            <Text style={s.userMeta}>❤️ {timeAgo(u.created_at)}</Text>
          </View>
          <Ionicons name="heart" size={16} color="#EF4444" />
        </View>
      ))}
    </>
  );
}

const PLATFORM_META: any = {
  tiktok:    { icon: 'logo-tiktok',    color: '#FE2C55', label: 'تيك توك' },
  snapchat:  { icon: 'logo-snapchat',  color: '#FFFC00', label: 'سناب شات' },
  instagram: { icon: 'logo-instagram', color: '#E1306C', label: 'إنستقرام' },
  whatsapp:  { icon: 'logo-whatsapp',  color: '#25D366', label: 'واتساب' },
  twitter:   { icon: 'logo-twitter',   color: '#1DA1F2', label: 'إكس' },
  copy_link: { icon: 'link',           color: LP.GOLD,   label: 'نسخ الرابط' },
};

function SharersView({ sharers, totalShares }: any) {
  if (!sharers || sharers.length === 0) {
    return (
      <View style={{ alignItems: 'center', padding: 40 }}>
        <Ionicons name="share-social-outline" size={40} color={LP.MUTED} />
        <Text style={{ color: LP.MUTED, marginTop: 8 }}>لم يشارك أحد المنشور بعد</Text>
      </View>
    );
  }
  // Group by platform
  const groups: any = {};
  sharers.forEach((sh: any) => {
    const p = sh.platform || 'copy_link';
    if (!groups[p]) groups[p] = [];
    groups[p].push(sh);
  });
  const entries = Object.entries(groups).sort((a: any, b: any) => b[1].length - a[1].length);
  return (
    <>
      <View style={s.headerNote}>
        <Ionicons name="share-social" size={14} color={LP.SUCCESS} />
        <Text style={s.headerNoteText}>{totalShares.toLocaleString('ar-SA')} مشاركة إجمالية — عرض {sharers.length} مستخدم</Text>
      </View>
      {/* Platform summary chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6, marginBottom: 8 }}>
        {entries.map(([plat, list]: any) => {
          const meta = PLATFORM_META[plat] || PLATFORM_META.copy_link;
          return (
            <View key={plat} style={[s.platformChip, { borderColor: meta.color, backgroundColor: meta.color + '15' }]}>
              <Ionicons name={meta.icon} size={12} color={meta.color} />
              <Text style={[s.platformChipText, { color: meta.color }]}>{meta.label}</Text>
              <View style={[s.platformCount, { backgroundColor: meta.color }]}>
                <Text style={{ color: '#0B0C10', fontSize: 10, fontWeight: '900' }}>{list.length}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      {/* Grouped list */}
      {entries.map(([plat, list]: any) => {
        const meta = PLATFORM_META[plat] || PLATFORM_META.copy_link;
        return (
          <View key={plat} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <View style={[s.platformIcon2, { backgroundColor: meta.color + '25' }]}>
                <Ionicons name={meta.icon} size={12} color={meta.color} />
              </View>
              <Text style={[s.groupTitle, { color: meta.color }]}>{meta.label} ({list.length})</Text>
            </View>
            {list.map((sh: any, i: number) => (
              <View key={i} style={s.userRow}>
                <View style={[s.userAvatar, { backgroundColor: meta.color + '30' }]}>
                  <Text style={{ color: meta.color, fontWeight: '900', fontSize: 14 }}>{(sh.user_name || '?')[0]}</Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={s.userName}>{sh.user_name || 'مستخدم'}</Text>
                  <Text style={s.userMeta}>شارك عبر {meta.label} · {timeAgo(sh.created_at)}</Text>
                </View>
                <Ionicons name={meta.icon} size={16} color={meta.color} />
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}

function CommentsView({ comments, onReply }: any) {
  if (!comments || comments.length === 0) {
    return (
      <View style={{ alignItems: 'center', padding: 40 }}>
        <Ionicons name="chatbubbles-outline" size={40} color={LP.MUTED} />
        <Text style={{ color: LP.MUTED, marginTop: 8 }}>لا توجد تعليقات بعد</Text>
      </View>
    );
  }
  const unread = comments.filter((c: any) => !c.store_reply).length;
  return (
    <>
      <View style={s.headerNote}>
        <Ionicons name="chatbubbles" size={14} color={LP.WARN} />
        <Text style={s.headerNoteText}>{comments.length} تعليق — {unread} يحتاج رد</Text>
      </View>
      {comments.map((c: any) => (
        <View key={c.id} style={s.commentCard}>
          <View style={[s.userAvatar, { backgroundColor: LP.GOLD + '30', width: 36, height: 36, borderRadius: 18 }]}>
            <Text style={{ color: LP.GOLD, fontWeight: '900', fontSize: 13 }}>{(c.user_name || '?')[0]}</Text>
          </View>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: LP.GOLD, fontSize: 12, fontWeight: '900' }}>{c.user_name}</Text>
              <Text style={{ color: LP.MUTED, fontSize: 10 }}>· {timeAgo(c.created_at)}</Text>
            </View>
            <Text style={{ color: LP.TEXT, fontSize: 12, marginTop: 3, textAlign: 'right' }}>{c.text}</Text>
            {!!c.store_reply && (
              <View style={s.storeReply}>
                <Ionicons name="checkmark-circle" size={11} color={LP.GOLD} />
                <Text style={{ color: LP.GOLD, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right', marginHorizontal: 4 }}>ردّ المتجر: {c.store_reply}</Text>
              </View>
            )}
            {!c.store_reply && (
              <TouchableOpacity style={s.replyBtnMerc} onPress={() => onReply(c)}>
                <Ionicons name="arrow-undo" size={11} color={LP.BG} />
                <Text style={{ color: LP.BG, fontSize: 10, fontWeight: '900' }}>رد باسم المتجر</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </>
  );
}

function SheetSection({ icon, title }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, gap: 6 }}>
      <Ionicons name={icon} size={14} color={LP.GOLD} />
      <Text style={{ color: LP.GOLD, fontSize: 12, fontWeight: '900', textAlign: 'right' }}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  merchantBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: LP.BORDER,
    backgroundColor: '#1A1C2380', overflow: 'hidden',
  },
  merchantBannerText: { color: LP.GOLD, fontSize: 11, fontWeight: '900', flex: 1, textAlign: 'right' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LP.CARD, borderWidth: 1, borderColor: LP.BORDER, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  filterChipActive: { backgroundColor: LP.GOLD, borderColor: LP.GOLD },
  filterChipText: { color: LP.GOLD, fontSize: 11, fontWeight: '800' },
  storiesRow: { paddingHorizontal: 16, gap: 14, paddingVertical: 12 },
  storyItem: { alignItems: 'center', width: 68 },
  storyCircle: { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: LP.GOLD, alignItems: 'center', justifyContent: 'center', marginBottom: 4, padding: 2 },
  storyAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: LP.CARD, alignItems: 'center', justifyContent: 'center' },
  storyAvatarImg: { width: 50, height: 50, borderRadius: 25 },
  storyLabel: { fontSize: 10, color: LP.MUTED, fontWeight: '500', textAlign: 'center' },

  // Card matches customer feed
  postCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#F9F9FB', borderRadius: 20, padding: 16, position: 'relative' },
  insightsFab: { position: 'absolute', top: 12, left: 12, zIndex: 10 },
  insightsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: LP.GOLD,
    backgroundColor: 'rgba(11,12,16,0.9)', overflow: 'hidden',
  },
  replyBadge: {
    position: 'absolute', top: 12, right: 12, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  qBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  qBadgeText: { fontSize: 11, color: '#92400E', fontWeight: '700' },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 24 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF7DA', alignItems: 'center', justifyContent: 'center', marginEnd: 10 },
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
  pollSelected: { borderColor: '#F5C518', borderWidth: 2 },
  pollBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#FFF7DA' },
  pollOptionText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0A0A0A', zIndex: 1 },
  pollPct: { fontSize: 13, fontWeight: '700', color: '#F5C518', zIndex: 1 },
  totalVotesText: { fontSize: 11, color: '#A1A1AA', textAlign: 'center', marginBottom: 8 },
  postActions: { flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 12, color: '#52525B', fontWeight: '500' },
  detailsInlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LP.GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  empty: { textAlign: 'center', color: LP.MUTED, marginTop: 40 },

  // Story Viewer
  storyViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  storyClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  storyImage: { width: '100%', height: '70%' },
  storyFooter: { position: 'absolute', bottom: 40, left: 20, right: 20 },
  storyAuthor: { color: 'white', fontSize: 16, fontWeight: '800' },
  storyText: { color: 'white', fontSize: 14, marginTop: 6 },
  storyTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },

  // Insights sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: LP.BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', borderTopWidth: 1, borderColor: LP.BORDER },
  sheetHandle: { width: 46, height: 4, borderRadius: 2, backgroundColor: '#3A3D48', alignSelf: 'center', marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: LP.BORDER },
  sheetTitle: { flex: 1, color: LP.GOLD, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  previewCard: { backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 14, padding: 10 },
  statMini: { flexBasis: '47%', flexGrow: 1, backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 14, padding: 12, alignItems: 'flex-end' },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarChip: { width: 60, alignItems: 'center' },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: LP.GOLD, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, padding: 10, borderRadius: 12, marginBottom: 4 },
  commentCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 12, padding: 10, marginBottom: 6, gap: 8 },
  storeReply: { flexDirection: 'row', alignItems: 'center', backgroundColor: LP.GOLD + '15', borderWidth: 1, borderColor: LP.GOLD + '55', borderRadius: 8, padding: 6, marginTop: 6 },
  replyBtnMerc: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: LP.GOLD, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  commentPreview: { backgroundColor: LP.CARD, borderWidth: 1, borderColor: LP.BORDER, borderRadius: 12, padding: 12, marginTop: 12 },
  replyInput: { backgroundColor: LP.CARD, borderWidth: 1, borderColor: LP.BORDER, color: LP.TEXT, borderRadius: 12, padding: 12, textAlign: 'right', minHeight: 90, marginTop: 12 },
  btnGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: LP.CARD, borderWidth: 1, borderColor: LP.BORDER },
  btnPrimary: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: LP.GOLD },

  // Insights tabs
  insightsTabRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  insightsTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, paddingVertical: 8, borderRadius: 999 },
  insightsTabActive: { backgroundColor: LP.GOLD, borderColor: LP.GOLD },
  insightsTabText: { color: LP.MUTED, fontSize: 10, fontWeight: '700' },
  tabBadge: { minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: LP.GOLD, alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { color: LP.BG, fontSize: 9, fontWeight: '900' },

  // User rows for likers/sharers/comments
  headerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, padding: 10, borderRadius: 12, marginBottom: 10 },
  headerNoteText: { color: LP.TEXT, fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  userRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, padding: 10, borderRadius: 12, marginBottom: 6 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userName: { color: LP.TEXT, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  userMeta: { color: LP.MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 },
  platformChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  platformChipText: { fontSize: 11, fontWeight: '900' },
  platformCount: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  platformIcon2: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { fontSize: 11, fontWeight: '900', flex: 1, textAlign: 'right' },
});
