import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, Modal, RefreshControl, Share, StatusBar } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './_layout';
import { uploadMedia, mediaUrlSync } from '../src/utils/upload';

export default function UGCContest() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiCall, user } = useAuth();
  const [comp, setComp] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([
        apiCall(`/api/competitions/${id}`),
        apiCall(`/api/competitions/${id}/videos`),
      ]);
      setComp(c); setVideos(v);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية', 'السماح للوصول للفيديوهات'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] as any, quality: 0.85, videoMaxDuration: 60 });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || 'contest.mp4', a.mimeType || 'video/mp4');
      setVideoPath(up.path);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const submitVideo = async () => {
    if (!videoPath) { Alert.alert('مطلوب', 'اختر فيديو أولاً'); return; }
    try {
      await apiCall(`/api/competitions/${id}/videos`, {
        method: 'POST',
        body: JSON.stringify({
          video: videoPath, caption: caption.trim(),
          hashtags: hashtags.split(/[\s،,]/).map(h => h.trim().replace(/^#/, '')).filter(Boolean),
        }),
      });
      setSubmitOpen(false); setVideoPath(''); setCaption(''); setHashtags('');
      load();
      Alert.alert('✅ نجاح', 'تم رفع فيديوك! شارك الرابط مع أصدقائك لجمع اللايكات.');
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const toggleLike = async (vid: string) => {
    // Optimistic UI
    setVideos(vs => vs.map(v => v.id === vid ? { ...v, liked_by_me: !v.liked_by_me, likes: v.likes + (v.liked_by_me ? -1 : 1) } : v).sort((a, b) => b.likes - a.likes).map((v, i) => ({ ...v, rank: i + 1 })));
    try { await apiCall(`/api/competitions/${id}/videos/${vid}/like`, { method: 'POST' }); }
    catch (e: any) { Alert.alert('خطأ', e.message); load(); }
  };

  const openComments = async (vid: string) => {
    setCommentsFor(vid);
    try { const c = await apiCall(`/api/competitions/${id}/videos/${vid}/comments`); setComments(c); }
    catch {}
  };

  const sendComment = async () => {
    if (!newComment.trim() || !commentsFor) return;
    try {
      await apiCall(`/api/competitions/${id}/videos/${commentsFor}/comment`, {
        method: 'POST', body: JSON.stringify({ text: newComment.trim() }),
      });
      setNewComment('');
      const c = await apiCall(`/api/competitions/${id}/videos/${commentsFor}/comments`);
      setComments(c);
      setVideos(vs => vs.map(v => v.id === commentsFor ? { ...v, comments: (v.comments || 0) + 1 } : v));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
  };

  const shareVideo = async (v: any) => {
    try {
      await Share.share({ message: `شاهد فيديو ${v.user_name} في مسابقة ${comp?.title || 'Zitex'}!\n\nصوت له الآن على تطبيق Zitex.` });
      apiCall(`/api/competitions/${id}/videos/${v.id}/share`, { method: 'POST' }).catch(() => {});
    } catch {}
  };

  if (loading) return <View style={s.root}><ActivityIndicator color="#F5C518" style={{ marginTop: 100 }} /></View>;

  const timeLeft = comp?.end_date ? Math.max(0, new Date(comp.end_date).getTime() - Date.now()) : 0;
  const hours = Math.floor(timeLeft / 3600000);
  const days = Math.floor(hours / 24);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#F5C518" />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{comp?.title || 'مسابقة الفيديو'}</Text>
          <View style={s.iconBtn} />
        </View>

        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#F5C518" />}>
          {/* Prize / Countdown hero */}
          <LinearGradient colors={['#F5C518', '#D4A017']} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={s.heroLabel}>🏆 الجائزة</Text>
            <Text style={s.heroPrize}>{comp?.prize}</Text>
            {timeLeft > 0 ? (
              <Text style={s.heroCountdown}>ينتهي خلال {days > 0 ? `${days} أيام و ` : ''}{hours % 24} ساعة</Text>
            ) : (
              <Text style={s.heroCountdown}>انتهت المسابقة</Text>
            )}
          </LinearGradient>

          {!!comp?.description && <Text style={s.desc}>{comp.description}</Text>}

          <View style={s.actionBar}>
            <TouchableOpacity onPress={() => setSubmitOpen(true)} style={s.submitBtn} disabled={timeLeft === 0}>
              <LinearGradient colors={['#F5C518', '#D4AF37']} style={s.submitInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name="videocam" size={18} color="#0A0A0A" />
                <Text style={s.submitText}>إنشاء فيديو</Text>
              </LinearGradient>
            </TouchableOpacity>
            <View style={s.leaderCount}>
              <Text style={s.leaderCountNum}>{videos.length}</Text>
              <Text style={s.leaderCountLbl}>مشارك</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>🏆 قائمة المتصدرين</Text>

          {videos.length === 0 && (
            <View style={s.emptyBox}>
              <Ionicons name="videocam-outline" size={64} color="#4A4A4A" />
              <Text style={s.emptyTitle}>كن أول من يشارك!</Text>
              <Text style={s.emptyDesc}>أنشئ فيديوك الترويجي واحصل على أكبر عدد لايكات للفوز</Text>
            </View>
          )}

          {videos.map(v => (
            <View key={v.id} style={[s.videoCard, v.rank <= 3 && s.videoCardTop]}>
              {v.rank <= 3 && (
                <View style={[s.rankBadge, v.rank === 1 && s.rank1, v.rank === 2 && s.rank2, v.rank === 3 && s.rank3]}>
                  <Text style={s.rankText}>{v.rank === 1 ? '🥇' : v.rank === 2 ? '🥈' : '🥉'} #{v.rank}</Text>
                </View>
              )}
              {v.rank > 3 && <View style={s.rankPlain}><Text style={s.rankPlainText}>#{v.rank}</Text></View>}

              <TouchableOpacity activeOpacity={0.9} onPress={() => apiCall(`/api/competitions/${id}/videos/${v.id}/view`, { method: 'POST' }).catch(() => {})}>
                <View style={s.videoBox}>
                  {v.thumbnail ? (
                    <Image source={{ uri: mediaUrlSync(v.thumbnail) }} style={s.videoThumb} contentFit="cover" />
                  ) : (
                    <View style={s.videoPlaceholder}>
                      <Ionicons name="play-circle" size={54} color="#F5C518" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <View style={{ padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={s.avatar}><Text style={s.avatarText}>{(v.user_name || '?').charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.userName}>{v.user_name || 'مشارك'}</Text>
                    <Text style={s.dateText}>{new Date(v.created_at).toLocaleDateString('ar')}</Text>
                  </View>
                </View>
                {!!v.caption && <Text style={s.caption}>{v.caption}</Text>}
                {!!(v.hashtags?.length) && (
                  <Text style={s.hashtags}>{v.hashtags.map((h: string) => `#${h}`).join(' ')}</Text>
                )}
                <View style={s.actions}>
                  <TouchableOpacity onPress={() => toggleLike(v.id)} style={s.actBtn}>
                    <Ionicons name={v.liked_by_me ? 'heart' : 'heart-outline'} size={22} color={v.liked_by_me ? '#EF4444' : '#9CA3AF'} />
                    <Text style={[s.actText, v.liked_by_me && { color: '#EF4444', fontWeight: '800' }]}>{v.likes || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openComments(v.id)} style={s.actBtn}>
                    <Ionicons name="chatbubble-outline" size={20} color="#9CA3AF" />
                    <Text style={s.actText}>{v.comments || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => shareVideo(v)} style={s.actBtn}>
                    <Ionicons name="share-social-outline" size={20} color="#9CA3AF" />
                    <Text style={s.actText}>{v.shares || 0}</Text>
                  </TouchableOpacity>
                  <View style={s.viewsBadge}><Ionicons name="eye" size={12} color="#6B7280" /><Text style={s.viewsText}>{v.views || 0}</Text></View>
                </View>
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Submit modal */}
      <Modal visible={submitOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSubmitOpen(false)}>
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setSubmitOpen(false)} style={s.iconBtn}>
                <Ionicons name="close" size={24} color="#F5C518" />
              </TouchableOpacity>
              <Text style={s.headerTitle}>فيديو المسابقة</Text>
              <TouchableOpacity onPress={submitVideo} disabled={!videoPath || uploading} style={s.iconBtn}>
                <LinearGradient colors={['#F5C518', '#D4AF37']} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, opacity: (!videoPath || uploading) ? 0.5 : 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={{ color: '#0A0A0A', fontWeight: '800' }}>نشر</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {!videoPath ? (
                <TouchableOpacity style={s.videoPick} onPress={pickVideo} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#F5C518" size="large" /> : (
                    <>
                      <Ionicons name="videocam" size={54} color="#F5C518" />
                      <Text style={s.videoPickText}>اختر فيديو من المعرض</Text>
                      <Text style={s.videoPickHint}>حتى 60 ثانية</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={s.videoPicked}>
                  <Ionicons name="checkmark-circle" size={44} color="#10B981" />
                  <Text style={s.videoPickedText}>تم رفع الفيديو بنجاح</Text>
                  <TouchableOpacity onPress={() => setVideoPath('')} style={{ marginTop: 8 }}>
                    <Text style={{ color: '#EF4444', fontWeight: '700' }}>إعادة اختيار</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={s.label}>وصف الفيديو</Text>
              <TextInput style={[s.input, { height: 90, textAlignVertical: 'top' }]} multiline value={caption} onChangeText={setCaption}
                placeholderTextColor="#6B7280" placeholder="اكتب وصفاً جذاباً..." />
              <Text style={s.label}>الهاشتاقات (افصل بمسافة)</Text>
              <TextInput style={s.input} value={hashtags} onChangeText={setHashtags} autoCapitalize="none"
                placeholderTextColor="#6B7280" placeholder="زايتكس مسابقة أيفون" />
              {!!comp?.ugc_hashtag && (
                <View style={s.forceTag}>
                  <Ionicons name="pricetag" size={14} color="#F5C518" />
                  <Text style={s.forceTagText}>هاشتاق المسابقة: #{comp.ugc_hashtag}</Text>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Comments modal */}
      <Modal visible={!!commentsFor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCommentsFor(null)}>
        <View style={s.root}>
          <SafeAreaView edges={['top']} style={{ flex: 1 }}>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setCommentsFor(null)} style={s.iconBtn}>
                <Ionicons name="close" size={24} color="#F5C518" />
              </TouchableOpacity>
              <Text style={s.headerTitle}>التعليقات ({comments.length})</Text>
              <View style={s.iconBtn} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
              {comments.length === 0 && <Text style={s.emptyC}>كن أول من يعلق!</Text>}
              {comments.map(c => (
                <View key={c.id} style={s.commentRow}>
                  <View style={s.avatar}><Text style={s.avatarText}>{(c.user_name || '?').charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.userName}>{c.user_name}</Text>
                    <Text style={s.commentText}>{c.text}</Text>
                    <Text style={s.dateText}>{new Date(c.created_at).toLocaleDateString('ar')}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={s.commentBar}>
              <TextInput style={s.commentInput} value={newComment} onChangeText={setNewComment}
                placeholderTextColor="#6B7280" placeholder="اكتب تعليقاً..." />
              <TouchableOpacity onPress={sendComment} style={s.sendBtn}>
                <Ionicons name="send" size={18} color="#0A0A0A" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: 'white' },
  hero: { margin: 16, padding: 24, borderRadius: 16, alignItems: 'center' },
  heroLabel: { color: '#0A0A0A', fontWeight: '700', fontSize: 13 },
  heroPrize: { color: '#0A0A0A', fontSize: 24, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  heroCountdown: { color: '#0A0A0A', fontSize: 14, marginTop: 8, fontWeight: '700' },
  desc: { color: '#D0D0D0', fontSize: 13, marginHorizontal: 16, marginBottom: 8, lineHeight: 20 },
  actionBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  submitBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  submitInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  submitText: { color: '#0A0A0A', fontWeight: '900', fontSize: 15 },
  leaderCount: { backgroundColor: '#1F1F1F', borderWidth: 1, borderColor: '#F5C518', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  leaderCountNum: { color: '#F5C518', fontSize: 20, fontWeight: '900' },
  leaderCountLbl: { color: '#9CA3AF', fontSize: 10 },
  sectionTitle: { color: 'white', fontSize: 15, fontWeight: '800', marginHorizontal: 16, marginBottom: 12 },
  emptyBox: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  emptyTitle: { color: 'white', fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyDesc: { color: '#9CA3AF', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  videoCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#151515', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#2A2A2A' },
  videoCardTop: { borderColor: '#F5C518', borderWidth: 1.5 },
  rankBadge: { position: 'absolute', top: 10, left: 10, zIndex: 2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F5C518' },
  rank1: { backgroundColor: '#F5C518' },
  rank2: { backgroundColor: '#C0C0C0' },
  rank3: { backgroundColor: '#CD7F32' },
  rankText: { color: '#0A0A0A', fontWeight: '900', fontSize: 12 },
  rankPlain: { position: 'absolute', top: 10, left: 10, zIndex: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.7)' },
  rankPlainText: { color: 'white', fontWeight: '800', fontSize: 11 },
  videoBox: { width: '100%', height: 260, backgroundColor: '#000' },
  videoThumb: { width: '100%', height: '100%' },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F1F1F' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2E2404', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#F5C518', fontWeight: '900' },
  userName: { color: 'white', fontWeight: '700', fontSize: 13 },
  dateText: { color: '#6B7280', fontSize: 11 },
  caption: { color: '#D0D0D0', fontSize: 13, marginTop: 8, lineHeight: 20 },
  hashtags: { color: '#F5C518', fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A2A', paddingTop: 10 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  viewsBadge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewsText: { color: '#6B7280', fontSize: 11 },
  // Submit
  videoPick: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, borderRadius: 14, borderWidth: 2, borderColor: '#F5C518', borderStyle: 'dashed', backgroundColor: '#151515' },
  videoPickText: { color: '#F5C518', fontSize: 15, fontWeight: '800', marginTop: 10 },
  videoPickHint: { color: '#9CA3AF', fontSize: 11, marginTop: 4 },
  videoPicked: { alignItems: 'center', padding: 30, backgroundColor: '#052E19', borderRadius: 14, borderWidth: 1, borderColor: '#10B981' },
  videoPickedText: { color: '#10B981', fontWeight: '800', marginTop: 8 },
  label: { color: '#F5C518', fontSize: 12, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: '#151515', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A', color: 'white', textAlign: 'right' },
  forceTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: '#2E2404' },
  forceTagText: { color: '#F5C518', fontSize: 12, fontWeight: '700' },
  // Comments
  emptyC: { textAlign: 'center', color: '#6B7280', marginTop: 40 },
  commentRow: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  commentText: { color: '#D0D0D0', fontSize: 13, marginTop: 4, lineHeight: 20 },
  commentBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#151515', borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  commentInput: { flex: 1, backgroundColor: '#0A0A0A', padding: 10, borderRadius: 999, borderWidth: 1, borderColor: '#2A2A2A', color: 'white', textAlign: 'right' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center' },
});
