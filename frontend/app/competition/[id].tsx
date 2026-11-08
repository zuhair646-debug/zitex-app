import { useT, curLang } from '../../src/i18n';
import { tSync, tf } from '../../src/useAutoT';
import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import TranslatableName, { NameInitial } from '../../src/components/TranslatableName';
import { useTheme } from '../../src/theme/ThemeContext';
import { colors } from '../../src/theme/tokens';
import { useAuth } from '../_layout';
import DrawProof from '../../src/components/draw/DrawProof';
import Countdown from '../../src/components/Countdown';

export default function CompetitionDetailScreen() {
  const s = useSStyles();
  useT(); // re-render when language or on-demand translations change
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiCall, user } = useAuth();
  const [comp, setComp] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showDraw, setShowDraw] = useState(false);
  const [drawResult, setDrawResult] = useState<any[]>([]);
  const [drawing, setDrawing] = useState(false);

  const load = async () => {
    try {
      const [c, p] = await Promise.all([
        apiCall(`/api/competitions/${id}`), apiCall(`/api/competitions/${id}/participants`)
      ]);
      setComp(c); setParticipants(p);
    } catch (e) { console.log(e); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- reload per competition

  const handleAnswer = (idx: number) => {
    const newAnswers = [...answers]; newAnswers[currentQ] = idx; setAnswers(newAnswers);
  };

  const nextQuestion = async () => {
    if (currentQ < (comp?.questions?.length || 0) - 1) { setCurrentQ(currentQ + 1); }
    else {
      try {
        const result = await apiCall(`/api/competitions/${id}/answer`, { method: 'POST', body: JSON.stringify({ answers }) });
        setShowQuiz(false);
        if (result.passed) Alert.alert(tSync('مبروك!', curLang()), tf('حصلت على {0}% وانضممت إلى السحب!', curLang(), [result.score.toFixed(0)]));
        else Alert.alert(tSync('للأسف!', curLang()), tf('حصلت على {0}%. تحتاج 70% للتأهل. حاول مرة أخرى!', curLang(), [result.score.toFixed(0)]));
      } catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); }
    }
  };

  const claimPrize = () => {
    const send = async (method: 'pickup' | 'delivery') => {
      try {
        await apiCall(`/api/competitions/${id}/claim`, { method: 'POST', body: JSON.stringify({ method }) });
        setComp({ ...comp, winners: comp.winners.map((w: any) => w.user_id === user?.id ? { ...w, prize_status: 'claimed' } : w) });
        Alert.alert(tSync('✅ تم', curLang()), tSync('تم إرسال طلب الجائزة للتاجر وبيتواصل معك', curLang()));
      } catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); }
    };
    Alert.alert(tSync('استلام الجائزة', curLang()), tSync('كيف تبي تستلم جائزتك؟', curLang()), [
      { text: tSync('إلغاء', curLang()), style: 'cancel' },
      { text: tSync('من الفرع', curLang()), onPress: () => send('pickup') },
      { text: tSync('توصيل', curLang()), onPress: () => send('delivery') },
    ]);
  };

  const performDraw = () => router.push({ pathname: '/draw-studio', params: { id: String(id) } } as any);

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color={colors.brand} /></View>;
  if (!comp) return <View style={s.loadWrap}><Text>{tSync('غير موجود', curLang())}</Text></View>;

  // entry_open comes from the server (status + start/end dates + running draw)
  const isOpen = comp.entry_open ?? comp.status === 'open';
  const notStarted = comp.phase ? comp.phase === 'soon' : !isOpen && !!comp.start_date && new Date(comp.start_date) > new Date();
  const isEnded = !isOpen && !notStarted;
  const day = (v?: string) => (v ? String(v).slice(0, 10) : '');
  const isStaff = ['merchant', 'chamber'].includes(user?.role || '');

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <TouchableOpacity testID="back-btn" style={s.topBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <TouchableOpacity style={s.topBtn}><Ionicons name="share-outline" size={22} color={colors.onSurface} /></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.heroWrap}>
          <View style={s.heroBg}><Ionicons name="trophy" size={80} color="#FFF" /></View>
        </View>

        <View style={s.content}>
          <View style={[s.statusBadge, { backgroundColor: comp.result_hidden ? '#FEF3C7' : isOpen ? '#DCFCE7' : isEnded ? '#F3F4F6' : '#DBEAFE' }]}>
            <Text style={[s.statusText, { color: comp.result_hidden ? '#92400E' : isOpen ? '#10B981' : isEnded ? '#6B7280' : '#3B82F6' }]}>
              {tSync(comp.result_hidden ? 'تم السحب — الإعلان قريباً' : isOpen ? 'مفتوحة' : isEnded ? 'منتهية' : 'قريباً', curLang())}
            </Text>
          </View>
          <Text style={s.byLine}>{tSync(comp.chamber_supervised ? 'بإشراف الغرفة التجارية' : 'سحب المتجر', curLang())}{!comp.chamber_supervised && comp.presenter_name ? ` • ${comp.presenter_name}` : ''}{comp.chamber_supervised && comp.permit_number ? ` • ${tSync('تصريح', curLang())} ${comp.permit_number}` : ''}</Text>

          {(isOpen || notStarted || comp.result_hidden || (comp.reveal_at && !comp.winners?.length && !comp.revealed_at)) && comp.competition_type !== 'ugc_video' ? (
            <View style={s.timerBox} testID="comp-countdown">
              <Ionicons name="time" size={18} color={colors.brand} />
              <Text style={s.timerLbl}>{tSync(comp.result_hidden || !isOpen && !notStarted ? 'إعلان الفائزين بعد' : notStarted ? 'تبدأ بعد' : 'تنتهي المشاركة بعد', curLang())}</Text>
              <Countdown style={s.timerVal} dayLabel={tSync('ي', curLang())} onDone={load}
                to={comp.result_hidden || (!isOpen && !notStarted) ? (comp.reveal_at || comp.draw_opens_at) : notStarted ? comp.start_date : (String(comp.end_date || '').length === 10 ? `${comp.end_date}T23:59:59+03:00` : comp.end_date)} />
            </View>
          ) : null}
          {comp.result_hidden ? <Text style={s.hiddenNote}>{tSync('تم إجراء السحب وتوثيقه — الفائزون وفيديو السحب يظهرون هنا تلقائياً لما ينتهي العدّاد 🎉', curLang())}</Text> : null}

          <TranslatableName text={comp.title} style={s.compTitle} />
          <TranslatableName text={comp.description} style={s.compDesc} inline={false} />

          <View style={s.infoGrid}>
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('تاريخ البداية', curLang())}</Text><Text style={s.infoVal}>{day(comp.start_date || comp.created_at) || '—'}</Text></View>
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('آخر يوم للمشاركة', curLang())}</Text><Text style={s.infoVal}>{day(comp.end_date) || '—'}</Text></View>
            {comp.competition_type !== 'ugc_video' && (
              <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('تاريخ السحب', curLang())}</Text><Text style={s.infoVal}>{day(comp.draw_opens_at || comp.draw_date) || '—'}</Text></View>
            )}
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('مسموح بالانضمام', curLang())}</Text><Text style={s.infoVal}>{tf('{0} مشارك', curLang(), [comp.max_participants])}</Text></View>
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('انضممت مسبقاً', curLang())}</Text><Text style={s.infoVal}>{comp.joined_count}</Text></View>
          </View>

          <View style={s.prizeCard}>
            <Ionicons name="trophy" size={24} color="#F59E0B" />
            <View style={s.prizeInfo}><Text style={s.prizeLabel}>{tSync('الجائزة', curLang())}</Text><TranslatableName text={comp.prize} style={s.prizeText} /></View>
          </View>

          {comp.questions?.length > 0 && isOpen && (
            <View style={s.entrySection}>
              <Text style={s.sectionTitle}>{tSync('شرط الدخول', curLang())}</Text>
              <Text style={s.entryDesc}>{tSync('أجب على 70% من الأسئلة للانضمام إلى السحب', curLang())}</Text>
              <TouchableOpacity testID="start-quiz-btn" style={s.quizBtn} onPress={() => { setShowQuiz(true); setCurrentQ(0); setAnswers([]); }}>
                <Ionicons name="help-circle" size={20} color="#FFF" />
                <Text style={s.quizBtnText}>{tf('أجب على الأسئلة ({0} سؤال)', curLang(), [comp.questions.length])}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.participantsSection}>
            <Text style={s.sectionTitle}>{tf('المشاركون ({0})', curLang(), [participants.length])}</Text>
            {participants.slice(0, 10).map((p, i) => (
              <View key={i} style={s.participantRow}>
                <View style={s.participantAvatar}><NameInitial name={p.user_name} style={s.avatarText} /></View>
                <View style={s.participantInfo}>
                  <TranslatableName text={p.user_name || ''} style={s.participantName} />
                  <Text style={s.participantPhone}>{p.user_phone}</Text>
                </View>
                {comp.winners?.some((w: any) => w.user_name === p.user_name) && (
                  <View style={s.winnerBadge}><Ionicons name="trophy" size={14} color="#F59E0B" /><Text style={s.winnerText}>{tSync('الفائز!', curLang())}</Text></View>
                )}
              </View>
            ))}
          </View>

          {isEnded && comp.winners?.length > 0 && (
            <View style={s.winnersSection}>
              <Text style={s.sectionTitle}>{tSync('الفائزون', curLang())}</Text>
              {comp.winners.map((w: any, i: number) => (
                <View key={i} style={s.winnerRow}>
                  <View style={s.winnerRank}><Text style={s.rankText}>#{i + 1}</Text></View>
                  <View style={s.winnerInfo}>
                    <TranslatableName text={w.user_name || ''} style={s.winnerName} />
                    <Text style={s.winnerPhone}>{w.user_phone}</Text>
                  </View>
                  {w.user_id === user?.id && (!w.prize_status || w.prize_status === 'pending') ? (
                    <TouchableOpacity testID="claim-prize-btn" style={s.giftBtn} onPress={() => claimPrize()}><Text style={s.giftBtnText}>{tSync('احصل على الهدية', curLang())}</Text></TouchableOpacity>
                  ) : w.prize_status && w.prize_status !== 'pending' ? (
                    <Text testID="prize-status-text" style={[s.giftBtnText, { color: '#92400E' }]}>{tSync(w.prize_status === 'delivered' ? 'تم التسليم ✅' : 'تم طلب الجائزة', curLang())}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          <DrawProof competitionId={String(id)} />

          {isOpen && ['general', 'signup'].includes(comp.competition_type || 'general') && !['merchant', 'chamber', 'employee', 'driver'].includes(user?.role || '') && (
            <TouchableOpacity testID="join-competition-btn" style={s.quizBtn} onPress={async () => {
              try { const r = await apiCall(`/api/competitions/${id}/join`, { method: 'POST' }); Alert.alert('🎉', tSync(r.already ? 'أنت مشترك بالفعل' : 'تم تسجيلك في المسابقة', curLang())); setComp((x: any) => ({ ...x, joined_count: (x?.joined_count || 0) + (r.already ? 0 : 1) })); }
              catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); }
            }}>
              <Text style={s.quizBtnText}>{tSync('اشترك في المسابقة', curLang())}</Text>
            </TouchableOpacity>
          )}

          {isStaff && comp.competition_type !== 'ugc_video' && (comp.draw_ready || comp.winners_finalized_at) && (
            <TouchableOpacity testID="draw-btn" style={s.drawBtn} onPress={performDraw} disabled={drawing}>
              {drawing ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="dice" size={22} color="#FFF" /><Text style={s.drawBtnText}>{tSync(comp.winners_finalized_at ? 'استوديو السحب والفائزون' : 'ابدأ السحب', curLang())}</Text></>
              )}
            </TouchableOpacity>
          )}
          {isStaff && !comp.draw_ready && !comp.winners_finalized_at && comp.competition_type !== 'ugc_video' && (
            <Text testID="draw-locked-note" style={s.drawLockedNote}>
              {isOpen
                ? tf('🔒 المشاركة مفتوحة حتى نهاية {0} — السحب يفتح بعدها', curLang(), [day(comp.end_date) || '—'])
                : tf('🔒 انتهت المشاركة — موعد السحب {0}', curLang(), [day(comp.draw_opens_at) || '—'])}
            </Text>
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Quiz Modal */}
      <Modal visible={showQuiz} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.quizModal}>
            <View style={s.quizHeader}>
              <Text style={s.quizTitle}>{tSync('أجب على الأسئلة', curLang())}</Text>
              <TouchableOpacity onPress={() => setShowQuiz(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></TouchableOpacity>
            </View>
            <Text style={s.quizInfo}>{tSync('أجب على 70% من الأسئلة للانضمام', curLang())}</Text>
            <Text style={s.qNumber}>{currentQ + 1}/{comp.questions?.length || 0}</Text>
            <Text style={s.question}>{comp.questions?.[currentQ]?.q}</Text>
            {comp.questions?.[currentQ]?.options?.map((opt: string, i: number) => (
              <TouchableOpacity key={i} testID={`answer-${i}`} style={[s.optionBtn, answers[currentQ] === i && s.optionSelected]}
                onPress={() => handleAnswer(i)}>
                <View style={[s.radioCircle, answers[currentQ] === i && s.radioSelected]} />
                <Text style={[s.optionText, answers[currentQ] === i && s.optionTextSelected]}>{opt}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity testID="next-q-btn" style={[s.nextBtn, answers[currentQ] === undefined && s.nextBtnDisabled]}
              onPress={nextQuestion} disabled={answers[currentQ] === undefined}>
              <Text style={s.nextBtnText}>{tSync(currentQ < (comp.questions?.length || 0) - 1 ? 'التالي' : 'إرسال الإجابات', curLang())}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Draw Result Modal */}
      <Modal visible={showDraw} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={s.drawModal}>
            <Ionicons name="trophy" size={48} color="#F59E0B" />
            <Text style={s.drawTitle}>{tSync('تم الإعلان عن الفائزين!', curLang())}</Text>
            {drawResult.map((w, i) => (
              <View key={i} style={s.drawWinner}>
                <Text style={s.drawRank}>#{i + 1}</Text>
                <TranslatableName text={w.user_name || ''} style={s.drawName} />
              </View>
            ))}
            <TouchableOpacity style={s.closeDrawBtn} onPress={() => setShowDraw(false)}>
              <Text style={s.closeDrawText}>{tSync('إغلاق', curLang())}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  heroWrap: { height: 200, marginHorizontal: 20, borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
  heroBg: { flex: 1, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  statusText: { fontSize: 13, fontWeight: '600' },
  byLine: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  timerBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1A1405', borderRadius: 14, padding: 12, marginBottom: 12 },
  timerLbl: { color: '#E8C778', fontSize: 13, fontWeight: '700', flex: 1 },
  timerVal: { color: colors.brand, fontSize: 18, fontWeight: '900' },
  hiddenNote: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, fontSize: 13, fontWeight: '600', marginBottom: 12, lineHeight: 20 },
  compTitle: { fontSize: 22, fontWeight: '800', color: colors.onSurface, marginBottom: 8 },
  compDesc: { fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 22, marginBottom: 16 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  infoItem: { width: '47%', backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 12 },
  infoLabel: { fontSize: 11, color: colors.onSurfaceSecondary, fontWeight: '600', marginBottom: 4 },
  infoVal: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  prizeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FEF3C7', borderRadius: 16, padding: 16, marginBottom: 20 },
  prizeInfo: { flex: 1 },
  prizeLabel: { fontSize: 12, color: '#92400E' },
  prizeText: { fontSize: 16, fontWeight: '700', color: '#92400E' },
  entrySection: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  entryDesc: { fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 12 },
  quizBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignSelf: 'flex-start' },
  quizBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  participantsSection: { marginBottom: 20 },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  participantAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.brand },
  participantInfo: { flex: 1 },
  participantName: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  participantPhone: { fontSize: 12, color: colors.onSurfaceTertiary },
  winnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  winnerText: { fontSize: 11, color: '#92400E', fontWeight: '600' },
  winnersSection: { marginBottom: 20 },
  winnerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#FEF3C7', borderRadius: 14, marginBottom: 8 },
  winnerRank: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  rankText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  winnerInfo: { flex: 1 },
  winnerName: { fontSize: 15, fontWeight: '600', color: colors.onSurface },
  winnerPhone: { fontSize: 12, color: colors.onSurfaceSecondary },
  giftBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  giftBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  drawLockedNote: { textAlign: 'center', color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: '600', paddingVertical: 12, marginBottom: 16 },
  drawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.brand, borderRadius: 16, paddingVertical: 18, marginBottom: 20 },
  drawBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  quizModal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quizTitle: { fontSize: 20, fontWeight: '700', color: colors.onSurface },
  quizInfo: { fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 16 },
  qNumber: { fontSize: 14, fontWeight: '600', color: colors.brand, marginBottom: 8 },
  question: { fontSize: 16, fontWeight: '600', color: colors.onSurface, marginBottom: 20, lineHeight: 24 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, marginBottom: 10 },
  optionSelected: { borderColor: colors.brand, backgroundColor: '#EFE6FF' },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  optionText: { fontSize: 14, color: colors.onSurfaceSecondary },
  optionTextSelected: { color: colors.brand, fontWeight: '600' },
  nextBtn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  drawModal: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32, alignItems: 'center' },
  drawTitle: { fontSize: 22, fontWeight: '800', color: colors.onSurface, marginTop: 12, marginBottom: 20 },
  drawWinner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, width: '100%' },
  drawRank: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
  drawName: { fontSize: 16, fontWeight: '600', color: colors.onSurface },
  closeDrawBtn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 20 },
  closeDrawText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
}), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable
}

