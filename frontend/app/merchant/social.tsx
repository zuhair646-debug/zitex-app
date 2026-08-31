import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal, RefreshControl, FlatList, Platform, StatusBar } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../_layout';
import { uploadMedia, mediaUrlSync } from '../../src/utils/upload';
import { colors, spacing, radius } from '../../src/theme/tokens';

type Tab = 'posts' | 'comments';
type PostType = 'post' | 'story' | 'poll' | 'question' | 'event';
type MediaItem = { kind: 'image' | 'video'; path: string };

const POST_TYPES: { id: PostType; label: string; icon: any; desc: string }[] = [
  { id: 'post',     label: 'منشور',   icon: 'document-text', desc: 'صور + فيديو + نص' },
  { id: 'story',    label: 'حالة',    icon: 'flash',         desc: 'تختفي بعد 24 ساعة' },
  { id: 'poll',     label: 'استطلاع', icon: 'bar-chart',     desc: 'صوّت بين خيارات' },
  { id: 'question', label: 'سؤال',    icon: 'help-circle',   desc: 'سؤال للجمهور' },
  { id: 'event',    label: 'فعالية',  icon: 'calendar',      desc: 'تاريخ ومكان' },
];

export default function MerchantSocial() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [tab, setTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // create modal
  const [composerOpen, setComposerOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>('post');
  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [locationTag, setLocationTag] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [publishing, setPublishing] = useState(false);

  // comment thread modal
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

  const pickImage = async () => {
    if (postType === 'post' && media.length >= 8) { Alert.alert('الحد', 'يمكن رفع 8 وسائط فقط'); return; }
    const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (r.status !== 'granted') {
      Alert.alert('صلاحية الصور', 'يجب السماح للوصول إلى الصور لإرفاقها');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsMultipleSelection: postType === 'post',
      selectionLimit: postType === 'post' ? Math.max(1, 8 - media.length) : 1,
      quality: 0.85,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const items: MediaItem[] = [];
      for (const a of res.assets) {
        const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
        items.push({ kind: 'image', path: up.path });
      }
      if (postType === 'post') setMedia([...media, ...items].slice(0, 8));
      else setMedia([items[0]]);
    } catch (e: any) { Alert.alert('خطأ الرفع', e.message); }
    finally { setUploading(false); }
  };

  const pickVideo = async () => {
    if (postType !== 'post' && postType !== 'story') { Alert.alert('غير مسموح', 'الفيديو للمنشور أو الحالة فقط'); return; }
    if (media.length >= 8) { Alert.alert('الحد', 'يمكن رفع 8 وسائط فقط'); return; }
    const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (r.status !== 'granted') { Alert.alert('صلاحية', 'يجب السماح للوصول إلى المكتبة'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'] as any, quality: 0.85, videoMaxDuration: 60,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      const it: MediaItem = { kind: 'video', path: up.path };
      if (postType === 'post') setMedia([...media, it].slice(0, 8));
      else setMedia([it]);
    } catch (e: any) { Alert.alert('خطأ الرفع', e.message); }
    finally { setUploading(false); }
  };

  const takePhoto = async () => {
    const r = await ImagePicker.requestCameraPermissionsAsync();
    if (r.status !== 'granted') {
      Alert.alert('صلاحية الكاميرا', 'يجب السماح للوصول إلى الكاميرا');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85, mediaTypes: ['images'] as any });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      const it: MediaItem = { kind: 'image', path: up.path };
      if (postType === 'post') setMedia([...media, it].slice(0, 8));
      else setMedia([it]);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const removeMedia = (i: number) => setMedia(media.filter((_, idx) => idx !== i));
  const updatePollOption = (i: number, v: string) => { const o = [...pollOptions]; o[i] = v; setPollOptions(o); };
  const addPollOption = () => pollOptions.length < 6 && setPollOptions([...pollOptions, '']);
  const removePollOption = (i: number) => pollOptions.length > 2 && setPollOptions(pollOptions.filter((_, idx) => idx !== i));

  const resetComposer = () => { setText(''); setMedia([]); setPollOptions(['', '']); setEventDate(''); setEventLocation(''); setLocationTag(''); setScheduledAt(''); setPostType('post'); };

  const publish = async () => {
    // Validation per type
    if (postType === 'post' && !text.trim() && media.length === 0) { Alert.alert('مطلوب', 'أضف نصاً أو وسائط'); return; }
    if (postType === 'story' && media.length === 0) { Alert.alert('مطلوب', 'الحالة تحتاج صورة أو فيديو'); return; }
    if (postType === 'poll') {
      if (!text.trim()) { Alert.alert('مطلوب', 'اكتب سؤال الاستطلاع'); return; }
      const valid = pollOptions.filter(o => o.trim()).length;
      if (valid < 2) { Alert.alert('مطلوب', 'الاستطلاع يحتاج خيارين على الأقل'); return; }
    }
    if (postType === 'question' && !text.trim()) { Alert.alert('مطلوب', 'اكتب السؤال'); return; }
    if (postType === 'event') {
      if (!text.trim()) { Alert.alert('مطلوب', 'اكتب اسم الفعالية'); return; }
      if (!eventDate.trim()) { Alert.alert('مطلوب', 'حدد تاريخ الفعالية'); return; }
    }

    setPublishing(true);
    try {
      const imagesPaths = media.filter(m => m.kind === 'image').map(m => m.path);
      const videoPath = media.find(m => m.kind === 'video')?.path || '';
      const body: any = {
        text: text.trim(),
        image: imagesPaths[0] || '',
        images: imagesPaths,
        video: videoPath,
        location_tag: locationTag.trim(),
        scheduled_at: scheduledAt.trim(),
        type: postType,
      };
      if (postType === 'poll') body.poll_options = pollOptions.filter(o => o.trim()).map(o => ({ text: o.trim(), votes: 0 }));
      if (postType === 'question') body.question = text.trim();
      if (postType === 'event') { body.event_date = eventDate; body.event_location = eventLocation; }

      await apiCall('/api/merchant/social/posts', { method: 'POST', body: JSON.stringify(body) });
      resetComposer();
      setComposerOpen(false);
      load();
      Alert.alert('✅ تم النشر', postType === 'story' ? 'الحالة ستظهر لـ 24 ساعة' : 'تم نشر المحتوى');
    } catch (e: any) { Alert.alert('خطأ', e.message); } finally { setPublishing(false); }
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

  const typeIcon = (t?: string) => {
    const found = POST_TYPES.find(x => x.id === t);
    return found ? { name: found.icon, color: found.color, label: found.label } : { name: 'document-text', color: '#8833FF', label: 'منشور' };
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}><Ionicons name="arrow-back" size={22} color="#0A0A0A" /></TouchableOpacity>
        <Text style={s.title}>إدارة السوشال ميديا</Text>
        <TouchableOpacity onPress={() => { resetComposer(); setComposerOpen(true); }} style={s.addBtn}><Ionicons name="add" size={22} color="white" /></TouchableOpacity>
      </View>

      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'posts' && s.tabActive]} onPress={() => setTab('posts')}>
          <Text style={[s.tabText, tab === 'posts' && s.tabTextActive]}>📝 المحتوى ({posts.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'comments' && s.tabActive]} onPress={() => setTab('comments')}>
          <Text style={[s.tabText, tab === 'comments' && s.tabTextActive]}>💬 التعليقات ({comments.length})</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#8833FF" style={{ marginTop: 40 }} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
          {tab === 'posts' && <>
            {posts.length === 0 && <Text style={s.empty}>لا يوجد محتوى — اضغط + لإنشاء أول منشور</Text>}
            {posts.map(p => {
              const ti = typeIcon(p.type);
              const isStory = p.type === 'story';
              const isPoll = p.type === 'poll';
              const totalVotes = isPoll ? (p.poll_options || []).reduce((a: number, o: any) => a + (o.votes || 0), 0) : 0;
              return (
                <View key={p.id || p._id} style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={[s.typePill, { backgroundColor: ti.color + '20' }]}>
                      <Ionicons name={ti.name as any} size={13} color={ti.color} />
                      <Text style={[s.typePillText, { color: ti.color }]}>{ti.label}</Text>
                    </View>
                    <Text style={s.author}>{p.author || 'Zitex'}</Text>
                    <TouchableOpacity onPress={() => delPost(p.id || p._id)}><Ionicons name="trash-outline" size={20} color="#EF4444" /></TouchableOpacity>
                  </View>
                  {!!p.text && <Text style={s.text}>{p.text || p.content}</Text>}
                  {(p.images && p.images.length > 0) ? (
                    p.images.length === 1
                      ? <Image source={{ uri: p.images[0] }} style={s.img} />
                      : <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          {p.images.map((u: string, i: number) => <Image key={i} source={{ uri: u }} style={[s.img, { width: 240, marginRight: 8 }]} />)}
                        </ScrollView>
                  ) : (!!p.image && <Image source={{ uri: p.image }} style={s.img} />)}

                  {isPoll && (p.poll_options || []).map((o: any, i: number) => {
                    const pct = totalVotes ? Math.round((o.votes || 0) / totalVotes * 100) : 0;
                    return (
                      <View key={i} style={s.pollRow}>
                        <View style={[s.pollBar, { width: `${pct}%` }]} />
                        <Text style={s.pollText}>{o.text}</Text>
                        <Text style={s.pollVotes}>{pct}% ({o.votes || 0})</Text>
                      </View>
                    );
                  })}
                  {p.type === 'event' && (
                    <View style={s.eventBox}>
                      <Ionicons name="calendar" size={14} color="#10B981" />
                      <Text style={s.eventText}>{p.event_date} • {p.event_location || ''}</Text>
                    </View>
                  )}
                  {isStory && !!p.expires_at && <Text style={s.expiry}>⏱ تنتهي: {new Date(p.expires_at).toLocaleString('ar')}</Text>}

                  <View style={s.statsRow}>
                    <View style={s.stat}><Ionicons name="heart" size={13} color="#EF4444" /><Text style={s.statText}> {p.likes || 0}</Text></View>
                    <TouchableOpacity style={s.commentsBtn} onPress={() => openThread(p.id || p._id)}>
                      <Ionicons name="chatbubble" size={13} color="#3B82F6" />
                      <Text style={s.commentsBtnText}>التعليقات ({p.comments || 0})</Text>
                    </TouchableOpacity>
                    <View style={s.stat}><Ionicons name="eye" size={13} color="#6B7280" /><Text style={s.statText}> {p.views || 0}</Text></View>
                  </View>
                </View>
              );
            })}
          </>}

          {tab === 'comments' && <>
            {comments.length === 0 && <Text style={s.empty}>لا توجد تعليقات حتى الآن</Text>}
            {comments.map(c => (
              <TouchableOpacity key={c.id} style={s.commentCard} onPress={() => openThread(c.post_id)}>
                <View style={s.cmtAvatar}><Text style={s.cmtAvText}>{c.user_name?.charAt(0) || '?'}</Text></View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={s.cmtName}>{c.user_name} {c.is_merchant_reply && <Text style={s.youTag}> (أنت)</Text>}</Text>
                    {!c.is_merchant_reply && <TouchableOpacity onPress={(e) => { e.stopPropagation(); delComment(c.id); }}><Ionicons name="trash-outline" size={16} color="#EF4444" /></TouchableOpacity>}
                  </View>
                  <Text style={s.cmtText} numberOfLines={3}>{c.text}</Text>
                  <Text style={s.cmtPost}>↳ على: {(c.post?.content || c.post?.text || '').slice(0, 60)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>}
        </ScrollView>
      )}

      {/* ─── Composer Modal ─── */}
      <Modal visible={composerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setComposerOpen(false)}>
        <View style={s.composerRoot}>
          <StatusBar barStyle="light-content" />
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <View style={s.composerHeader}>
              <TouchableOpacity onPress={() => setComposerOpen(false)} style={s.headerIcon}>
                <Ionicons name="close" size={24} color={colors.brand} />
              </TouchableOpacity>
              <Text style={s.composerTitle}>محتوى جديد</Text>
              <TouchableOpacity onPress={publish} disabled={publishing || uploading} style={s.publishTopBtn}>
                <LinearGradient colors={['#F5C518', '#D4AF37']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.publishTopInner}>
                  {publishing ? <ActivityIndicator size="small" color={colors.onBrandPrimary} /> : <Text style={s.publishTopText}>نشر</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
              <Text style={s.goldLabel}>نوع المحتوى</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: 4 }}>
                {POST_TYPES.map(t => {
                  const active = postType === t.id;
                  return (
                    <TouchableOpacity key={t.id} style={[s.typeCardGold, active && s.typeCardGoldActive]} onPress={() => setPostType(t.id)}>
                      <View style={[s.typeIconBoxGold, active && { backgroundColor: colors.brand }]}>
                        <Ionicons name={t.icon} size={20} color={active ? colors.onBrandPrimary : colors.brand} />
                      </View>
                      <Text style={[s.typeLabelGold, active && { color: colors.brand }]}>{t.label}</Text>
                      <Text style={s.typeDescGold}>{t.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Text input */}
              {postType !== 'story' && (
                <>
                  <Text style={s.goldLabel}>{postType === 'poll' ? 'سؤال الاستطلاع' : postType === 'question' ? 'السؤال' : postType === 'event' ? 'اسم الفعالية' : 'نص المنشور'} *</Text>
                  <TextInput
                    style={[s.goldInput, { height: postType === 'poll' || postType === 'question' ? 72 : 128, textAlignVertical: 'top' }]}
                    multiline
                    value={text}
                    onChangeText={setText}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    placeholder={postType === 'poll' ? 'ما هو أفضل هاتف لعام 2026؟' : postType === 'question' ? 'ما رأيكم في...؟' : postType === 'event' ? 'افتتاح فرع جديد' : 'ماذا تريد أن تشارك؟'}
                  />
                </>
              )}

              {/* Media (Images + Video) */}
              {(postType === 'post' || postType === 'story') && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
                    <Text style={[s.goldLabel, { marginTop: 0, flex: 1 }]}>{postType === 'story' ? 'وسائط الحالة *' : 'الوسائط (صور + فيديو، حتى 8)'}</Text>
                    <Text style={s.helperCount}>{media.length}/{postType === 'story' ? 1 : 8}</Text>
                  </View>
                  <View style={s.mediaGridGold}>
                    {media.map((m, i) => (
                      <View key={i} style={s.mediaSlotGold}>
                        {m.kind === 'image' ? (
                          <Image source={{ uri: mediaUrlSync(m.path) }} style={s.mediaSlotImg} contentFit="cover" />
                        ) : (
                          <View style={s.videoPlaceholder}>
                            <Ionicons name="videocam" size={26} color={colors.brand} />
                            <Text style={s.videoBadge}>فيديو</Text>
                          </View>
                        )}
                        <TouchableOpacity style={s.mediaRemoveGold} onPress={() => removeMedia(i)}>
                          <Ionicons name="close" size={14} color="white" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {(postType === 'story' ? media.length === 0 : media.length < 8) && (
                      <>
                        <TouchableOpacity style={s.mediaAddGold} onPress={pickImage} disabled={uploading}>
                          <Ionicons name="images" size={22} color={colors.brand} />
                          <Text style={s.mediaAddGoldText}>معرض</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.mediaAddGold} onPress={takePhoto} disabled={uploading}>
                          <Ionicons name="camera" size={22} color={colors.brand} />
                          <Text style={s.mediaAddGoldText}>كاميرا</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.mediaAddGold} onPress={pickVideo} disabled={uploading}>
                          <Ionicons name="videocam" size={22} color={colors.brand} />
                          <Text style={s.mediaAddGoldText}>فيديو</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                  {uploading && (
                    <View style={s.uploadingRowGold}>
                      <ActivityIndicator color={colors.brand} />
                      <Text style={s.uploadingTextGold}>جارٍ رفع الوسائط...</Text>
                    </View>
                  )}
                </>
              )}

              {/* Poll options */}
              {postType === 'poll' && (
                <>
                  <Text style={s.goldLabel}>خيارات الاستطلاع *</Text>
                  {pollOptions.map((opt, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'center' }}>
                      <TextInput style={[s.goldInput, { flex: 1 }]} value={opt} onChangeText={v => updatePollOption(i, v)}
                        placeholderTextColor={colors.onSurfaceTertiary} placeholder={`الخيار ${i + 1}`} />
                      {pollOptions.length > 2 && <TouchableOpacity onPress={() => removePollOption(i)} style={s.removeOptBtnGold}><Ionicons name="close" size={20} color={colors.error} /></TouchableOpacity>}
                    </View>
                  ))}
                  {pollOptions.length < 6 && (
                    <TouchableOpacity onPress={addPollOption} style={s.addOptBtnGold}>
                      <Ionicons name="add-circle" size={16} color={colors.brand} />
                      <Text style={s.addOptTextGold}>إضافة خيار</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* Event extras */}
              {postType === 'event' && (
                <>
                  <Text style={s.goldLabel}>التاريخ والوقت *</Text>
                  <TextInput style={s.goldInput} value={eventDate} onChangeText={setEventDate}
                    placeholderTextColor={colors.onSurfaceTertiary} placeholder="2026-08-20 19:00" />
                  <Text style={s.goldLabel}>المكان</Text>
                  <TextInput style={s.goldInput} value={eventLocation} onChangeText={setEventLocation}
                    placeholderTextColor={colors.onSurfaceTertiary} placeholder="فرع الرياض - شارع الملك فهد" />
                </>
              )}

              {/* Optional: Location tag + Schedule */}
              {(postType === 'post' || postType === 'story') && (
                <>
                  <Text style={s.goldLabel}>📍 موقع (اختياري)</Text>
                  <TextInput style={s.goldInput} value={locationTag} onChangeText={setLocationTag}
                    placeholderTextColor={colors.onSurfaceTertiary} placeholder="الرياض - العليا" />
                  {postType === 'post' && (
                    <>
                      <Text style={s.goldLabel}>⏰ جدولة النشر (اختياري)</Text>
                      <TextInput style={s.goldInput} value={scheduledAt} onChangeText={setScheduledAt}
                        placeholderTextColor={colors.onSurfaceTertiary} placeholder="2026-08-31 20:00 (اتركه فارغاً للنشر الفوري)" />
                    </>
                  )}
                </>
              )}

              {postType === 'story' && <Text style={s.hintGold}>💡 الحالة ستختفي تلقائياً بعد 24 ساعة</Text>}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* ─── Thread Modal ─── */}
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
            contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
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
  title: { flex: 1, fontSize: 16, fontWeight: '800', marginHorizontal: 10, color: '#0A0A0A', textAlign: 'center' },
  addBtn: { backgroundColor: '#8833FF', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  publishTopBtn: { backgroundColor: '#8833FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, minWidth: 70, alignItems: 'center' },
  publishTopText: { color: 'white', fontWeight: '800', fontSize: 13 },
  tabs: { flexDirection: 'row', backgroundColor: 'white', padding: 8, gap: 8 },
  tab: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' },
  tabActive: { backgroundColor: '#8833FF' },
  tabText: { fontSize: 12, color: '#374151', fontWeight: '700' },
  tabTextActive: { color: 'white' },
  card: { backgroundColor: 'white', padding: 14, borderRadius: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  typePillText: { fontSize: 11, fontWeight: '800' },
  author: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0A0A0A', textAlign: 'right' },
  text: { fontSize: 13, color: '#374151', marginBottom: 8 },
  img: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#F3F4F6' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: '#6B7280' },
  commentsBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
  commentsBtnText: { color: '#3B82F6', fontSize: 12, fontWeight: '700' },
  pollRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, padding: 8, marginVertical: 3, overflow: 'hidden' },
  pollBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#EFE6FF' },
  pollText: { flex: 1, fontSize: 12, color: '#0A0A0A', fontWeight: '600', zIndex: 1 },
  pollVotes: { fontSize: 11, color: '#8833FF', fontWeight: '700', zIndex: 1 },
  eventBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#D1FAE5', padding: 8, borderRadius: 8, marginTop: 6 },
  eventText: { fontSize: 12, color: '#065F46', fontWeight: '600' },
  expiry: { fontSize: 11, color: '#EC4899', marginTop: 6, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic', textAlign: 'center' },
  input: { backgroundColor: 'white', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 14, textAlign: 'right' },
  typeCard: { width: 110, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: 'white' },
  typeIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  typeLabel: { fontSize: 13, fontWeight: '800', color: '#0A0A0A' },
  typeDesc: { fontSize: 10, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  imgPreview: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  imgPreviewImg: { width: '100%', height: '100%' },
  removeImgBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  addImgBtn: { width: 80, height: 80, borderRadius: 10, borderWidth: 2, borderColor: '#8833FF', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3E8FF' },
  addImgText: { fontSize: 10, color: '#8833FF', fontWeight: '700', marginTop: 2 },
  removeOptBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addOptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 8, backgroundColor: '#F3E8FF', alignSelf: 'flex-start' },
  addOptText: { color: '#8833FF', fontWeight: '700', fontSize: 13 },
  commentCard: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 8 },
  cmtAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#8833FF', alignItems: 'center', justifyContent: 'center' },
  cmtAvText: { color: 'white', fontWeight: '800' },
  cmtName: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  cmtText: { fontSize: 13, color: '#374151', marginTop: 3 },
  cmtPost: { fontSize: 11, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },
  cmtThread: { backgroundColor: 'white', padding: 12, borderRadius: 10, marginBottom: 6 },
  cmtMerchant: { backgroundColor: '#F3E8FF', borderLeftWidth: 3, borderLeftColor: '#8833FF' },
  youTag: { color: '#8833FF', fontSize: 11, fontWeight: '700' },
  replyBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
  replyTo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F3F4F6', padding: 6, borderRadius: 6, marginBottom: 6 },
  replyToText: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  sendBtn: { backgroundColor: '#8833FF', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 13 },

  // ─── Composer (Tech Cyber Gold) ───
  composerRoot: { flex: 1, backgroundColor: colors.surface },
  composerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  composerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.onSurface },
  publishTopInner: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  goldLabel: { fontSize: 12, fontWeight: '700', color: colors.brand, marginTop: spacing.md, marginBottom: spacing.xs },
  goldInput: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.onSurface, textAlign: 'right' },
  typeCardGold: { width: 110, alignItems: 'center', padding: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  typeCardGoldActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  typeIconBoxGold: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6, backgroundColor: colors.brandTertiary },
  typeLabelGold: { fontSize: 13, fontWeight: '800', color: colors.onSurface },
  typeDescGold: { fontSize: 10, color: colors.onSurfaceTertiary, marginTop: 2, textAlign: 'center' },
  helperCount: { fontSize: 12, color: colors.onSurfaceTertiary },
  mediaGridGold: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mediaSlotGold: { width: 88, height: 88, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary, position: 'relative' },
  mediaSlotImg: { width: '100%', height: '100%' },
  mediaRemoveGold: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.error, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  mediaAddGold: { width: 88, height: 88, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandTertiary },
  mediaAddGoldText: { fontSize: 11, color: colors.brand, marginTop: 4, fontWeight: '600' },
  videoPlaceholder: { flex: 1, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  videoBadge: { fontSize: 10, color: colors.brand, marginTop: 4, fontWeight: '700' },
  uploadingRowGold: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.brandTertiary, padding: spacing.sm, borderRadius: radius.md },
  uploadingTextGold: { color: colors.brand, fontSize: 12, fontWeight: '600' },
  removeOptBtnGold: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addOptBtnGold: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignSelf: 'flex-start' },
  addOptTextGold: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  hintGold: { fontSize: 12, color: colors.brand, marginTop: spacing.md, textAlign: 'center', fontStyle: 'italic' },
});
