import { useT, curLang } from '../../src/i18n';
import { tSync, tf } from '../../src/useAutoT';
import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import TranslatableName from '../../src/components/TranslatableName';
import { useAuth } from '../_layout';

export default function CompetitionDetailScreen() {
  useT(); // re-render when language or on-demand translations change
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apiCall } = useAuth();
  const [comp, setComp] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showDraw, setShowDraw] = useState(false);
  const [drawResult, setDrawResult] = useState<any[]>([]);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([
          apiCall(`/api/competitions/${id}`), apiCall(`/api/competitions/${id}/participants`)
        ]);
        setComp(c); setParticipants(p);
      } catch (e) { console.log(e); } finally { setLoading(false); }
    })();
  }, [id]);

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

  const performDraw = async () => {
    setDrawing(true);
    try {
      const result = await apiCall(`/api/competitions/${id}/draw`, { method: 'POST' });
      setDrawResult(result.winners || []);
      setShowDraw(true);
    } catch (e: any) { Alert.alert(tSync('خطأ', curLang()), e.message); } finally { setDrawing(false); }
  };

  if (loading) return <View style={s.loadWrap}><ActivityIndicator size="large" color="#F5C518" /></View>;
  if (!comp) return <View style={s.loadWrap}><Text>{tSync('غير موجود', curLang())}</Text></View>;

  const isOpen = comp.status === 'open';
  const isEnded = comp.status === 'ended';

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <TouchableOpacity testID="back-btn" style={s.topBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0A0A0A" />
        </TouchableOpacity>
        <TouchableOpacity style={s.topBtn}><Ionicons name="share-outline" size={22} color="#0A0A0A" /></TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.heroWrap}>
          <View style={s.heroBg}><Ionicons name="trophy" size={80} color="#FFF" /></View>
        </View>

        <View style={s.content}>
          <View style={[s.statusBadge, { backgroundColor: isOpen ? '#DCFCE7' : isEnded ? '#F3F4F6' : '#DBEAFE' }]}>
            <Text style={[s.statusText, { color: isOpen ? '#10B981' : isEnded ? '#6B7280' : '#3B82F6' }]}>
              {tSync(isOpen ? 'مفتوحة' : isEnded ? 'منتهية' : 'قريباً', curLang())}
            </Text>
          </View>

          <TranslatableName text={comp.title} style={s.compTitle} />
          <Text style={s.compDesc}>{comp.description}</Text>

          <View style={s.infoGrid}>
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('تاريخ البداية', curLang())}</Text><Text style={s.infoVal}>{comp.start_date}</Text></View>
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('تاريخ السحب', curLang())}</Text><Text style={s.infoVal}>{comp.draw_date}</Text></View>
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('مسموح بالانضمام', curLang())}</Text><Text style={s.infoVal}>{tf('{0} مشارك', curLang(), [comp.max_participants])}</Text></View>
            <View style={s.infoItem}><Text style={s.infoLabel}>{tSync('انضممت مسبقاً', curLang())}</Text><Text style={s.infoVal}>{comp.joined_count}</Text></View>
          </View>

          <View style={s.prizeCard}>
            <Ionicons name="trophy" size={24} color="#F59E0B" />
            <View style={s.prizeInfo}><Text style={s.prizeLabel}>{tSync('الجائزة', curLang())}</Text><Text style={s.prizeText}>{comp.prize}</Text></View>
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
                <View style={s.participantAvatar}><Text style={s.avatarText}>{p.user_name?.[0] || '?'}</Text></View>
                <View style={s.participantInfo}>
                  <Text style={s.participantName}>{p.user_name}</Text>
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
                    <Text style={s.winnerName}>{w.user_name}</Text>
                    <Text style={s.winnerPhone}>{w.user_phone}</Text>
                  </View>
                  <TouchableOpacity style={s.giftBtn}><Text style={s.giftBtnText}>{tSync('احصل على الهدية', curLang())}</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {isOpen && (
            <TouchableOpacity testID="draw-btn" style={s.drawBtn} onPress={performDraw} disabled={drawing}>
              {drawing ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="dice" size={22} color="#FFF" /><Text style={s.drawBtnText}>{tSync('ابدأ السحب', curLang())}</Text></>
              )}
            </TouchableOpacity>
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
              <TouchableOpacity onPress={() => setShowQuiz(false)}><Ionicons name="close" size={24} color="#0A0A0A" /></TouchableOpacity>
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
                <Text style={s.drawName}>{w.user_name}</Text>
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  loadWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  heroWrap: { height: 200, marginHorizontal: 20, borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
  heroBg: { flex: 1, backgroundColor: '#F5C518', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  statusText: { fontSize: 13, fontWeight: '600' },
  compTitle: { fontSize: 22, fontWeight: '800', color: '#0A0A0A', marginBottom: 8 },
  compDesc: { fontSize: 14, color: '#52525B', lineHeight: 22, marginBottom: 16 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  infoItem: { width: '47%', backgroundColor: '#F9F9FB', borderRadius: 12, padding: 12 },
  infoLabel: { fontSize: 11, color: '#A1A1AA', marginBottom: 4 },
  infoVal: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  prizeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FEF3C7', borderRadius: 16, padding: 16, marginBottom: 20 },
  prizeInfo: { flex: 1 },
  prizeLabel: { fontSize: 12, color: '#92400E' },
  prizeText: { fontSize: 16, fontWeight: '700', color: '#92400E' },
  entrySection: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A', marginBottom: 8 },
  entryDesc: { fontSize: 13, color: '#52525B', marginBottom: 12 },
  quizBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F5C518', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignSelf: 'flex-start' },
  quizBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  participantsSection: { marginBottom: 20 },
  participantRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F4F4F5' },
  participantAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#F5C518' },
  participantInfo: { flex: 1 },
  participantName: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  participantPhone: { fontSize: 12, color: '#A1A1AA' },
  winnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  winnerText: { fontSize: 11, color: '#92400E', fontWeight: '600' },
  winnersSection: { marginBottom: 20 },
  winnerRow: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#FEF3C7', borderRadius: 14, marginBottom: 8 },
  winnerRank: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  rankText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  winnerInfo: { flex: 1 },
  winnerName: { fontSize: 15, fontWeight: '600', color: '#0A0A0A' },
  winnerPhone: { fontSize: 12, color: '#52525B' },
  giftBtn: { backgroundColor: '#10B981', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  giftBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  drawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F5C518', borderRadius: 16, paddingVertical: 18, marginBottom: 20 },
  drawBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  quizModal: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quizTitle: { fontSize: 20, fontWeight: '700', color: '#0A0A0A' },
  quizInfo: { fontSize: 13, color: '#52525B', marginBottom: 16 },
  qNumber: { fontSize: 14, fontWeight: '600', color: '#F5C518', marginBottom: 8 },
  question: { fontSize: 16, fontWeight: '600', color: '#0A0A0A', marginBottom: 20, lineHeight: 24 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#E4E4E7', marginBottom: 10 },
  optionSelected: { borderColor: '#F5C518', backgroundColor: '#EFE6FF' },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#E4E4E7' },
  radioSelected: { borderColor: '#F5C518', backgroundColor: '#F5C518' },
  optionText: { fontSize: 14, color: '#52525B' },
  optionTextSelected: { color: '#F5C518', fontWeight: '600' },
  nextBtn: { backgroundColor: '#F5C518', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  drawModal: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32, alignItems: 'center' },
  drawTitle: { fontSize: 22, fontWeight: '800', color: '#0A0A0A', marginTop: 12, marginBottom: 20 },
  drawWinner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, width: '100%' },
  drawRank: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
  drawName: { fontSize: 16, fontWeight: '600', color: '#0A0A0A' },
  closeDrawBtn: { backgroundColor: '#F5C518', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 20 },
  closeDrawText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
