import { useMemo,  useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions, Modal, RefreshControl, ActivityIndicator, TextInput, Alert, FlatList, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { colors } from '../../src/theme/tokens';
import { useAuth } from '../_layout';
import MediaCarousel from '../../src/components/MediaCarousel';
import TranslatableName, { NameInitial } from '../../src/components/TranslatableName';
import { TX, tSync, tf } from '../../src/useAutoT';
import { useT, curLang } from '../../src/i18n';
import ConfirmSheet from '../../src/components/ConfirmSheet';
import { notify } from '../../src/utils/notify';

const { width } = Dimensions.get('window');

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);
const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return tSync('الآن', curLang());
  if (diff < 3600) return tf('{0} د', curLang(), [Math.floor(diff / 60)]);
  if (diff < 86400) return tf('{0} س', curLang(), [Math.floor(diff / 3600)]);
  return tf('{0} ي', curLang(), [Math.floor(diff / 86400)]);
};

export default function SocialScreen() {
  const { lang } = useT();
  const s = useSStyles();
  const [reportId, setReportId] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const sendReport = async () => {
    const id = reportId; setReportId(null);
    try { await apiCall(`/api/social/posts/${id}/report`, { method: 'POST', body: JSON.stringify({ reason: 'محتوى مخالف لسياسة المجتمع' }) }); notify(tSync('شكراً — تم استلام البلاغ', curLang())); }
    catch (e: any) { notify(tSync('خطأ', curLang()), e.message); }
  };
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [voted, setVoted] = useState<Record<string, number>>({});
  const [posts, setPosts] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [storeInfo, setStoreInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storyOpen, setStoryOpen] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  // Comments thread
  const [threadPostId, setThreadPostId] = useState<string | null>(null);
  const [threadComments, setThreadComments] = useState<any[]>([]);
  const [threadText, setThreadText] = useState('');

  const load = useCallback(async () => {
    try {
      const [postsData, storiesData, supportData, campaignsData] = await Promise.all([
        apiCall('/api/social/posts'),
        apiCall('/api/social/stories').catch(() => []),
        apiCall('/api/store/support').catch(() => null),
        apiCall('/api/marketing/ads/active').catch(() => []),
      ]);
      // Filter out stories from main feed (they're already in stories row)
      setPosts((postsData || []).filter((p: any) => p.type !== 'story'));
      setStories(storiesData || []);
      setStoreInfo(supportData);
      setCampaigns(campaignsData || []);
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
    try { await apiCall(`/api/social/posts/${postId}/vote`, { method: 'POST', body: JSON.stringify({ option_index: optionIndex }) }); } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };

  const openThread = async (postId: string) => {
    setThreadPostId(postId);
    try { const d = await apiCall(`/api/social/posts/${postId}/comments`); setThreadComments(d); } catch {}
  };

  const openContact = async (type: 'whatsapp' | 'phone' | 'email' | 'instagram' | 'tiktok' | 'snapchat' | 'twitter' | 'telegram') => {
    if (!storeInfo) return;
    const v = storeInfo[type];
    if (!v) { Alert.alert(tSync('غير متوفر', lang), tf('لم يضف المتجر {0} بعد', lang, [type])); return; }
    let url = '';
    switch (type) {
      case 'whatsapp': url = `https://wa.me/${String(v).replace(/[^0-9]/g, '')}`; break;
      case 'phone':    url = `tel:${v}`; break;
      case 'email':    url = `mailto:${v}`; break;
      case 'instagram':url = `https://instagram.com/${String(v).replace('@','')}`; break;
      case 'tiktok':   url = `https://tiktok.com/@${String(v).replace('@','')}`; break;
      case 'snapchat': url = `https://snapchat.com/add/${String(v).replace('@','')}`; break;
      case 'twitter':  url = `https://twitter.com/${String(v).replace('@','')}`; break;
      case 'telegram': url = `https://t.me/${String(v).replace('@','')}`; break;
    }
    try { await Linking.openURL(url); } catch { Alert.alert(tSync('خطأ', lang), tSync('تعذر فتح الرابط', curLang())); }
  };
  const sendComment = async () => {
    if (!threadText.trim() || !threadPostId) return;
    try {
      await apiCall(`/api/social/posts/${threadPostId}/comments`, { method: 'POST', body: JSON.stringify({ text: threadText }) });
      setThreadText('');
      const d = await apiCall(`/api/social/posts/${threadPostId}/comments`); setThreadComments(d);
      // update count
      setPosts(posts.map(p => p.id === threadPostId ? { ...p, comments: Array.isArray(p.comments) ? p.comments.length + 1 : (p.comments || 0) + 1 } : p));
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TX style={s.title}>السوشال</TX>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {user?.role === 'merchant' && (
            <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/merchant/social' as any)}>
              <Ionicons name="settings-outline" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.headerBtn}>
            <Ionicons name="bookmark-outline" size={20} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} /> : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Community policy */}
          <TouchableOpacity testID="social-policy-btn" style={s.policyBar} onPress={() => setPolicyOpen(true)}>
            <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
            <Text style={s.policyTxt}>{tSync('مجتمع شفاف: تجارب وتقييمات حقيقية — اقرأ سياسة المجتمع', lang)}</Text>
          </TouchableOpacity>
          {/* Stories row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storiesRow}>
            {stories.length === 0 && (
              <View style={s.storyItem}>
                <View style={[s.storyCircle, { borderColor: '#E5E7EB' }]}>
                  <View style={s.storyAvatar}><Ionicons name="storefront" size={22} color={colors.onSurfaceTertiary} /></View>
                </View>
                <TX style={s.storyLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>لا حالات</TX>
              </View>
            )}
            {stories.map(st => (
              <TouchableOpacity key={st.id} style={s.storyItem} onPress={() => setStoryOpen(st)}>
                <View style={s.storyCircle}>
                  {st.image ? <Image source={{ uri: st.image }} style={s.storyAvatarImg} /> : <View style={s.storyAvatar}><Ionicons name="storefront" size={22} color={colors.brand} /></View>}
                </View>
                <Text style={s.storyLabel} numberOfLines={1}>{st.author || 'Store'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Marketing campaign cards */}
          {campaigns.length > 0 && campaigns.map((c: any) => {
            const isAff = c.campaign_type === 'affiliate';
            const label = c.cta_label || (isAff ? tSync('قدّم الآن', curLang()) : tSync('تسوّق الآن', curLang()));
            const onPress = async () => {
              try { await apiCall(`/api/marketing/ads/${c.id}/track?event=click`, { method: 'POST' }); } catch {}
              if (isAff) {
                router.push({
                  pathname: '/affiliate-apply',
                  params: {
                    merchant_id: c.merchant_id,
                    merchant_name: c.merchant_name || '',
                    campaign_id: c.id,
                    commission: String(c.commission_percent || ''),
                  },
                });
              } else if (c.cta_link) {
                if (c.cta_link.startsWith('http')) Linking.openURL(c.cta_link);
                else router.push(c.cta_link as any);
              }
            };
            return (
              <TouchableOpacity key={c.id} onPress={onPress} style={s.campaignCard} activeOpacity={0.9}>
                {!!c.image && <Image source={{ uri: c.image?.startsWith('http') ? c.image : `${(process.env.EXPO_PUBLIC_BACKEND_URL || '')}/api/files/${c.image}` }} style={s.campaignImage} />}
                <View style={s.campaignBody}>
                  <View style={s.campaignBadgeRow}>
                    <View style={[s.campaignBadge, isAff && s.campaignBadgeGold]}>
                      <Text style={[s.campaignBadgeText, isAff && s.campaignBadgeTextGold]}>{isAff ? tf('🎁 {0}% عمولة', lang, [c.commission_percent]) : tSync('📢 إعلان', curLang())}</Text>
                    </View>
                    <Text style={s.campaignMerchant}>{c.merchant_name}</Text>
                  </View>
                  <TranslatableName text={c.title} style={s.campaignTitle} />
                  {!!c.description && <Text style={s.campaignDesc} numberOfLines={3}>{c.description}</Text>}
                  {!!c.incentives && isAff && <Text style={s.campaignIncentives}>🎯 {c.incentives}</Text>}
                  <View style={s.campaignCta}>
                    <Text style={s.campaignCtaText}>{label}</Text>
                    <Ionicons name="arrow-back" size={16} color={colors.onSurface} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Posts */}
          {posts.length === 0 && campaigns.length === 0 && <TX style={s.empty}>لا توجد منشورات بعد</TX>}
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
                  <View style={s.qBadge}><Ionicons name="help-circle" size={14} color="#F59E0B" /><TX style={s.qBadgeText}>سؤال</TX></View>
                )}
                {isEvent && (
                  <View style={[s.qBadge, { backgroundColor: '#D1FAE5' }]}><Ionicons name="calendar" size={14} color="#10B981" /><TX style={[s.qBadgeText, { color: '#065F46' }]}>فعالية</TX></View>
                )}
                {post.linked_competition_id ? (
                  <TouchableOpacity testID={`post-competition-${postId}`} style={[s.qBadge, { backgroundColor: colors.surfaceSecondary, minHeight: 36 }]} onPress={() => router.push(`/competition/${post.linked_competition_id}` as any)}>
                    <Ionicons name={post.type === 'competition_result' ? 'trophy' : 'gift'} size={14} color={colors.brand} />
                    <Text style={[s.qBadgeText, { color: '#F5C518' }]}>{post.badge || ''} • {tSync(post.type === 'competition_result' ? 'شاهد النتيجة' : 'شارك الآن', curLang())}</Text>
                  </TouchableOpacity>
                ) : null}
                {post.question ? (
                  <View style={s.qaBox} testID={`post-qa-${postId}`}>
                    <Text style={s.qaQ}>❓ {post.question}</Text>
                    {(post.options || []).map((o: string, i: number) => (
                      <TouchableOpacity key={i} style={s.qaOpt} onPress={() => router.push(`/competition/${post.linked_competition_id}` as any)}>
                        <Text style={s.qaOptTxt}>{String.fromCharCode(65 + i)}. {o}</Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={s.qaHint}>{tSync('اختر إجابتك من صفحة المسابقة — الإجابة الصحيحة تدخلك السحب', curLang())}</Text>
                  </View>
                ) : null}
                {post.type === 'experience' ? (
                  <TouchableOpacity testID={`post-service-${postId}`} style={[s.qBadge, { backgroundColor: colors.surfaceSecondary, minHeight: 32 }]} onPress={() => router.push({ pathname: '/service/[id]', params: { id: post.linked_service_id } } as any)}>
                    <Ionicons name="construct" size={14} color={colors.brand} />
                    <Text style={[s.qBadgeText, { color: colors.brand }]}>{post.badge} • {tSync('شاهد الخدمة والتقييمات', curLang())}</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={s.postHeader}>
                  <View style={s.postAvatar}><Ionicons name="storefront" size={18} color={colors.brand} /></View>
                  <View style={s.postAuthorInfo}>
                    <TranslatableName
                      text={post.author || 'Zenrex Store'}
                      style={s.postAuthor}
                      iconSize={11}
                    />
                    <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
                  </View>
                  <View style={s.postViews}>
                    <Ionicons name="eye-outline" size={14} color={colors.onSurfaceTertiary} />
                    <Text style={s.viewsText}>{formatNum(post.views || 0)}</Text>
                  </View>
                </View>

                {!!post.text && <TranslatableName text={post.text} style={s.postText} inline={false} />}

                {/* Images */}
                {(() => {
                  const mediaItems: any[] = [];
                  if (Array.isArray(post.images) && post.images.length > 0) {
                    post.images.forEach((img: string) => mediaItems.push({ type: 'image', url: img }));
                  } else if (Array.isArray(post.media) && post.media.length > 0) {
                    post.media.forEach((m: any) => {
                      if (typeof m === 'string') mediaItems.push({ type: 'image', url: m });
                      else if (m?.url) mediaItems.push(m);
                    });
                  } else if (post.image) {
                    mediaItems.push({ type: 'image', url: post.image });
                  }
                  if (post.video) {
                    mediaItems.push({
                      type: 'video',
                      url: post.video.url || post.video,
                      thumbnail: post.video.thumbnail || post.video_thumbnail,
                      duration: post.video.duration || post.video_duration,
                    });
                  }
                  return mediaItems.length > 0 ? (
                    <View style={{ marginTop: 8, borderRadius: 14, overflow: 'hidden' }}>
                      <MediaCarousel items={mediaItems} borderRadius={14} />
                    </View>
                  ) : null;
                })()}

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
                      <View style={[s.pollBarFill, { width: `${pct}%`, backgroundColor: isSelected ? '#8833FF40' : colors.surfaceSecondary }]} />
                      <TranslatableName text={opt.text} style={[s.pollOptionText, isSelected && { fontWeight: '800' }] as any} />
                      <Text style={[s.pollPct, isSelected && { color: '#F5C518' }]}>{pct}%</Text>
                    </TouchableOpacity>
                  );
                })}
                {isPoll && <Text style={s.totalVotesText}>{totalVotes} {tSync('صوت', lang)}</Text>}

                <View style={s.postActions}>
                  <TouchableOpacity style={s.actionItem} onPress={() => toggleLike(postId)}>
                    <Ionicons name={likedPosts.has(postId) ? 'heart' : 'heart-outline'} size={22} color={likedPosts.has(postId) ? '#EF4444' : colors.onSurfaceSecondary} />
                    <Text style={s.actionCount}>{formatNum(post.likes || 0)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`post-comments-btn-${postId}`} style={s.actionItem} onPress={() => openThread(postId)}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.onSurfaceSecondary} />
                    <Text style={s.actionCount}>{formatNum(Array.isArray(post.comments) ? post.comments.length : (post.comments || 0))}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleBookmark(postId)} style={s.actionItem}>
                    <Ionicons name={bookmarked.has(postId) ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked.has(postId) ? colors.brand : colors.onSurfaceSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity testID={`post-report-${postId}`} onPress={() => setReportId(postId)} style={[s.actionItem, { minWidth: 44, minHeight: 44, justifyContent: 'center' }]} hitSlop={8}>
                    <Ionicons name="flag-outline" size={19} color={colors.onSurfaceSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Contact merchant bar — one-tap channels */}
                {!!(storeInfo && (storeInfo.whatsapp || storeInfo.phone || storeInfo.email || storeInfo.instagram || storeInfo.tiktok || storeInfo.snapchat || storeInfo.twitter || storeInfo.telegram)) && (
                  <View style={s.contactBar}>
                    <TX style={s.contactLabel}>💬 تواصل مع المتجر:</TX>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {!!storeInfo.whatsapp && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#25D366' }]} onPress={() => openContact('whatsapp')}>
                          <Ionicons name="logo-whatsapp" size={14} color="white" />
                          <TranslatableName text="WhatsApp" style={s.chipText} noToggle />
                        </TouchableOpacity>
                      )}
                      {!!storeInfo.phone && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#3B82F6' }]} onPress={() => openContact('phone')}>
                          <Ionicons name="call" size={14} color="white" />
                          <TX style={s.chipText}>اتصال</TX>
                        </TouchableOpacity>
                      )}
                      {!!storeInfo.email && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#EF4444' }]} onPress={() => openContact('email')}>
                          <Ionicons name="mail" size={14} color="white" />
                          <Text style={s.chipText}>{tSync('البريد الإلكتروني', lang)}</Text>
                        </TouchableOpacity>
                      )}
                      {!!storeInfo.instagram && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#E1306C' }]} onPress={() => openContact('instagram')}>
                          <Ionicons name="logo-instagram" size={14} color="white" />
                          <TranslatableName text="Instagram" style={s.chipText} noToggle />
                        </TouchableOpacity>
                      )}
                      {!!storeInfo.tiktok && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#000' }]} onPress={() => openContact('tiktok')}>
                          <Ionicons name="logo-tiktok" size={14} color="white" />
                          <TranslatableName text="TikTok" style={s.chipText} noToggle />
                        </TouchableOpacity>
                      )}
                      {!!storeInfo.snapchat && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#FFC000' }]} onPress={() => openContact('snapchat')}>
                          <Ionicons name="logo-snapchat" size={14} color="white" />
                          <Text style={[s.chipText, { color: '#000' }]}>Snapchat</Text>
                        </TouchableOpacity>
                      )}
                      {!!storeInfo.twitter && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#000' }]} onPress={() => openContact('twitter')}>
                          <Ionicons name="logo-twitter" size={14} color="white" />
                          <TranslatableName text="X / Twitter" style={s.chipText} noToggle />
                        </TouchableOpacity>
                      )}
                      {!!storeInfo.telegram && (
                        <TouchableOpacity style={[s.chip, { backgroundColor: '#0088CC' }]} onPress={() => openContact('telegram')}>
                          <Ionicons name="paper-plane" size={14} color="white" />
                          <TranslatableName text="Telegram" style={s.chipText} noToggle />
                        </TouchableOpacity>
                      )}
                    </ScrollView>
                  </View>
                )}
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
            {!!storyOpen?.text && <TranslatableName text={storyOpen.text} style={s.storyText} inline={false} />}
            <Text style={s.storyTime}>{timeAgo(storyOpen?.created_at)}</Text>
          </View>
        </View>
      </Modal>

      {/* Comments Thread */}
      <Modal visible={!!threadPostId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setThreadPostId(null)}>
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => setThreadPostId(null)}><Ionicons name="close" size={24} color={colors.onSurface} /></TouchableOpacity>
            <TX style={s.title}>التعليقات</TX>
            <View style={{ width: 30 }} />
          </View>
          <FlatList
            data={threadComments}
            keyExtractor={c => c.id || c._id || String(Math.random())}
            contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            ListEmptyComponent={<TX style={s.empty}>كن أول من يعلق</TX>}
            renderItem={({ item: c }) => (
              <View style={[s.cmtCard, c.is_merchant_reply && s.cmtMerchantStyle]}>
                <View style={s.cmtAvatar}><NameInitial name={c.user_name} style={s.cmtAvText} /></View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}><TranslatableName text={c.user_name} style={s.cmtName} />{c.is_merchant_reply && <TX style={s.merchantTag}> ✓ التاجر</TX>}</View>
                  <TranslatableName text={c.text} style={s.cmtText} inline={false} />
                </View>
              </View>
            )}
          />
          <View style={s.commentBar}>
            <TextInput testID="comment-input" style={[s.commentInput]} value={threadText} onChangeText={setThreadText} placeholder={tSync("اكتب تعليقاً...", lang)} />
            <TouchableOpacity testID="comment-send-btn" style={s.sendBtn} onPress={sendComment}><Ionicons name="send" size={18} color="white" /></TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      <ConfirmSheet visible={!!reportId} testID="report-sheet" title={tSync('الإبلاغ عن المنشور', lang)}
        message={tSync('بلّغ فقط عن الإساءة أو الاحتيال أو المحتوى المخل أو نشر بيانات خاصة. الرأي الصادق حتى لو كان سلبياً مسموح ولا يُحذف.', lang)}
        points={[tSync('3 بلاغات مختلفة تُخفي المنشور حتى يراجعه المتجر', lang)]}
        confirmText={tSync('إرسال البلاغ', lang)} cancelText={tSync('إلغاء', lang)} danger onCancel={() => setReportId(null)} onConfirm={sendReport} />
      <ConfirmSheet visible={policyOpen} testID="policy-sheet" title={tSync('سياسة المجتمع', lang)}
        message={tSync('مجتمعنا مبني على الشفافية: تجارب العملاء وتقييماتهم تُنشر كما هي، إيجابية أو سلبية، والمتجر يرد ولا يحذف.', lang)}
        points={[tSync('احترم الآخرين — لا إساءة أو عنصرية', lang), tSync('لا إعلانات مزعجة أو روابط احتيال', lang), tSync('لا تنشر أرقام أو بيانات خاصة لأحد', lang), tSync('التقييم السلبي الصادق حق لك', lang)]}
        confirmText={tSync('فهمت', lang)} cancelText={tSync('إغلاق', lang)} onCancel={() => setPolicyOpen(false)} onConfirm={() => setPolicyOpen(false)} />
    </SafeAreaView>
  );
}

function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  policyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, padding: 10, borderRadius: 12, backgroundColor: colors.surfaceSecondary, minHeight: 44 },
  policyTxt: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700' },
  qaBox: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surfaceSecondary, gap: 6 },
  qaQ: { color: colors.onSurface, fontWeight: '800', fontSize: 14 },
  qaOpt: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.surface },
  qaOptTxt: { color: colors.onSurface, fontWeight: '600' },
  qaHint: { color: colors.onSurfaceTertiary, fontSize: 11 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.onSurface },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  storiesRow: { paddingHorizontal: 16, gap: 14, paddingVertical: 12 },
  storyItem: { alignItems: 'center', width: 68 },
  storyCircle: { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: '#EC4899', alignItems: 'center', justifyContent: 'center', marginBottom: 4, padding: 2 },
  storyAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(245,197,24,0.15)', alignItems: 'center', justifyContent: 'center' },
  storyAvatarImg: { width: 50, height: 50, borderRadius: 25 },
  storyLabel: { fontSize: 10, color: colors.onSurfaceSecondary, fontWeight: '500', textAlign: 'center' },

  postCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.surfaceSecondary, borderRadius: 20, padding: 16 },
  campaignCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#0A0A0A', borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.brand },
  campaignImage: { width: '100%', height: 140, backgroundColor: '#1F1F1F' },
  campaignBody: { padding: 16 },
  campaignBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  campaignBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#2A2A2A' },
  campaignBadgeGold: { backgroundColor: colors.brand },
  campaignBadgeText: { color: colors.brand, fontSize: 11, fontWeight: '800' },
  campaignBadgeTextGold: { color: colors.onSurface },
  campaignMerchant: { color: '#9CA3AF', fontSize: 11, marginLeft: 'auto' },
  campaignTitle: { color: 'white', fontSize: 17, fontWeight: '900', marginBottom: 4 },
  campaignDesc: { color: '#D0D0D0', fontSize: 13, lineHeight: 20 },
  campaignIncentives: { color: colors.brand, fontSize: 12, marginTop: 8, fontWeight: '700' },
  campaignCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: 12 },
  campaignCtaText: { color: colors.onSurface, fontSize: 15, fontWeight: '900' },
  qBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  qBadgeText: { fontSize: 11, color: '#92400E', fontWeight: '700' },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(245,197,24,0.15)', alignItems: 'center', justifyContent: 'center', marginEnd: 10 },
  postAuthorInfo: { flex: 1 },
  postAuthor: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  postTime: { fontSize: 11, color: colors.onSurfaceTertiary },
  postViews: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewsText: { fontSize: 11, color: colors.onSurfaceTertiary },
  postText: { fontSize: 14, color: colors.onSurface, lineHeight: 22, marginBottom: 12 },
  postImage: { width: '100%', height: 220, borderRadius: 14, marginBottom: 12 },
  imgScroll: { marginBottom: 12 },
  multiImg: { width: width - 72, height: 220, borderRadius: 14, marginRight: 8 },

  eventBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D1FAE5', padding: 10, borderRadius: 10, marginBottom: 10 },
  eventText: { fontSize: 12, color: '#065F46', fontWeight: '700' },

  pollOption: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, marginBottom: 6 },
  pollSelected: { borderColor: colors.brand, borderWidth: 2 },
  pollBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(245,197,24,0.15)' },
  pollOptionText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.onSurface, zIndex: 1 },
  pollPct: { fontSize: 13, fontWeight: '700', color: colors.brand, zIndex: 1 },
  totalVotesText: { fontSize: 11, color: colors.onSurfaceTertiary, textAlign: 'center', marginBottom: 8 },

  postActions: { flexDirection: 'row', gap: 16, paddingTop: 4 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 12, color: colors.onSurfaceSecondary, fontWeight: '500' },
  empty: { textAlign: 'center', color: colors.onSurfaceTertiary, marginTop: 40 },

  contactBar: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  contactLabel: { fontSize: 11, color: '#71717A', fontWeight: '700', marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  chipText: { color: 'white', fontSize: 11, fontWeight: '700' },

  storyViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  storyClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  storyImage: { width: '100%', height: '70%' },
  storyFooter: { position: 'absolute', bottom: 40, left: 20, right: 20 },
  storyAuthor: { color: 'white', fontSize: 16, fontWeight: '800' },
  storyText: { color: 'white', fontSize: 14, marginTop: 6 },
  storyTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },

  cmtCard: { flexDirection: 'row', backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginBottom: 6 },
  cmtMerchantStyle: { backgroundColor: '#F3E8FF' },
  cmtAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  cmtAvText: { color: 'white', fontWeight: '800', fontSize: 12 },
  cmtName: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  cmtText: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  merchantTag: { color: colors.brand, fontSize: 10, fontWeight: '700' },
  commentBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
  commentInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, textAlign: 'right' },
  sendBtn: { backgroundColor: colors.brand, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
}), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable
}

