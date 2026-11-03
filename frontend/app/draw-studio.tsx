/**
 * Draw Studio — chamber officer / merchant runs a provably-fair, filmed draw.
 * Flow: prepare (commitment shown) → record intro (face full-screen) → draw (face shrinks to a corner,
 * reels roll, 1 or up to 4 winners per pull) → finish (seed revealed) → upload → server composes the MP4.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Animated, Platform, Linking, Share, TextInput, Modal, useWindowDimensions, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';
import { tSync, tf } from '../src/useAutoT';
import { uploadMedia } from '../src/utils/upload';
import { notify } from '../src/utils/notify';
import { colors } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';
import RollingReel, { ROLL_MS } from '../src/components/draw/RollingReel';
import TranslatableName from '../src/components/TranslatableName';
import ConfirmSheet from '../src/components/ConfirmSheet';
import Celebration from '../src/components/draw/Celebration';

const API = process.env.EXPO_PUBLIC_BACKEND_URL;
type Phase = 'idle' | 'intro' | 'draw' | 'finishing' | 'uploading' | 'done';

export default function DrawStudio() {
  const { lang } = useT();
  const s = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiCall } = useAuth();
  const [st, setSt] = useState<any>(null);
  const [sess, setSess] = useState<any>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [batch, setBatch] = useState<any[]>([]);
  const [rolling, setRolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoStatus, setVideoStatus] = useState('');
  const [redraw, setRedraw] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState<null | { kind: 'begin' | 'start' | 'finish' | 'redraw'; run: () => void }>(null);
  const [celebrate, setCelebrate] = useState<null | { title: string; subtitle?: string; winners: any[] }>(null);
  const [camPerm, reqCam] = useCameraPermissions();
  const [micPerm, reqMic] = useMicrophonePermissions();
  const cam = useRef<CameraView>(null);
  const recStart = useRef(0);
  const introMs = useRef(0);
  const events = useRef<any[]>([]);
  const recPromise = useRef<Promise<any> | null>(null);
  const pip = useRef(new Animated.Value(0)).current;
  const canFilm = Platform.OS !== 'web';
  const T = (x: string) => tSync(x, lang);

  const load = useCallback(async () => {
    try { setSt(await apiCall(`/api/draws/${id}/studio`)); } catch (e: any) { notify(T('خطأ'), e.message); }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- apiCall/T are recreated each render
  useEffect(() => { load(); }, [load]);

  const ensurePerms = async () => {
    if (!canFilm) return true;
    for (const [perm, req, label] of [[camPerm, reqCam, 'الكاميرا'], [micPerm, reqMic, 'الميكروفون']] as const) {
      if (perm?.granted) continue;
      if (perm && !perm.canAskAgain) {
        notify(T('الإذن مطلوب'), tf('فعّل إذن {0} من الإعدادات لتصوير السحب', lang, [T(label)]), () => Linking.openSettings());
        return false;
      }
      const r = await req();
      if (!r.granted) { notify(T('الإذن مطلوب'), tf('نحتاج {0} لتوثيق السحب بالفيديو', lang, [T(label)])); return false; }
    }
    return true;
  };

  const begin = async (kind: 'initial' | 'redraw', extra: any = {}) => {
    if (!(await ensurePerms())) return;
    setBusy(true);
    try {
      const ss = await apiCall(`/api/draws/${id}/sessions`, { method: 'POST', body: JSON.stringify({ kind, ...extra }) });
      setSess(ss); setBatch([]); setCode(''); events.current = []; pip.setValue(ss.started ? 1 : 0);
      setPhase(ss.started ? 'draw' : 'intro');
      setTimeout(() => {
        recStart.current = Date.now();
        if (canFilm && cam.current) recPromise.current = cam.current.recordAsync({ maxDuration: 900 }).catch(() => null);
      }, 700); // let the camera mount
    } catch (e: any) { notify(T('خطأ'), e.message); } finally { setBusy(false); }
  };

  const startDrawing = async () => {
    if (!/^[0-9]{6}$/.test(code)) return;
    setBusy(true);
    try {
      const st2 = await apiCall(`/api/draws/sessions/${sess.id}/start`, { method: 'POST', body: JSON.stringify({ officer_code: code }) });
      setSess(st2);
    } catch (e: any) { notify(T('خطأ'), e.message); setBusy(false); return; }
    setBusy(false);
    introMs.current = Date.now() - recStart.current;
    Animated.timing(pip, { toValue: 1, duration: 800, useNativeDriver: false }).start();
    setPhase('draw');
  };

  const remaining = sess ? sess.slots - (sess.picks?.length || 0) : 0;

  const pull = async (count: number) => {
    if (rolling || busy) return;
    setBusy(true);
    try {
      const r = await apiCall(`/api/draws/sessions/${sess.id}/pick`, { method: 'POST', body: JSON.stringify({ count }) });
      events.current.push({ t_ms: Date.now() - recStart.current, pick_from: r.winners[0].k, pick_to: r.winners[r.winners.length - 1].k });
      setBatch(r.winners); setRolling(true);
      setSess((x: any) => ({ ...x, picks: [...(x.picks || []), ...r.winners] }));
      setTimeout(() => {
        setRolling(false);
        setCelebrate({ title: T(r.winners.length > 1 ? 'مبروك للفائزين!' : 'مبروك للفائز!'), subtitle: st?.competition?.title, winners: r.winners });
      }, ROLL_MS + 300);
    } catch (e: any) { notify(T('خطأ'), e.message); } finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true); setPhase('finishing');
    try {
      const fin = await apiCall(`/api/draws/sessions/${sess.id}/finish`, { method: 'POST' });
      setSess(fin);
      setCelebrate({ title: T('اكتمل السحب الرسمي 🎉'), subtitle: `${st?.competition?.title || ''} — ${T('النتيجة نهائية وموثقة')}`, winners: fin.picks || [] });
      const finishMs = Date.now() - recStart.current;
      await new Promise(r => setTimeout(r, 3000)); // keep the revealed seed on camera
      const duration = Date.now() - recStart.current;
      if (!canFilm || !cam.current) { setPhase('done'); load(); return; }
      cam.current.stopRecording();
      const vid = await recPromise.current;
      if (!vid?.uri) { notify(T('تنبيه'), T('تعذر حفظ التسجيل — النتيجة محفوظة ويمكنك إعادة المحاولة')); setPhase('done'); return; }
      setPhase('uploading'); setVideoStatus('uploading');
      const up = await uploadMedia(vid.uri, 'draw-face.mp4', 'video/mp4');
      await apiCall(`/api/draws/sessions/${fin.id}/video`, { method: 'POST', body: JSON.stringify({
        face_path: up.path, intro_ms: introMs.current, duration_ms: duration, finish_ms: finishMs, events: events.current }) });
      setVideoStatus('processing');
      poll(fin.id);
    } catch (e: any) { notify(T('خطأ'), e.message); setPhase('done'); } finally { setBusy(false); }
  };

  const poll = async (sid: string) => {
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 4000));
      try {
        const x = await apiCall(`/api/draws/sessions/${sid}`);
        if (x.video_status === 'ready' || x.video_status === 'failed') { setVideoStatus(x.video_status); setSess(x); setPhase('done'); load(); return; }
      } catch { /* keep polling */ }
    }
  };

  const share = (sid: string) => Share.share({ message: `${T('فيديو السحب الرسمي')} — ${st?.competition?.title || ''}\n${API}/api/draws/sessions/${sid}/video.mp4` });


  const CONFIRM: Record<string, { title: string; message: string; points: string[]; ok: string; danger?: boolean }> = {
    begin: { title: T('بدء السحب الرسمي'), message: T('بمجرد البدء تُجمَّد قائمة المشاركين وتُعرض بصمة السحب، ويبدأ تسجيل الفيديو.'),
      points: [T('لا يمكن إضافة أو حذف مشاركين بعد هذه الخطوة'), T('تُقفل المسابقة حتى ينتهي السحب')], ok: T('نعم، ابدأ') },
    start: { title: T('هل أنت متأكد من بدء السحب؟'), message: T('بعد الموافقة لن تستطيع التراجع أو إلغاء السحب أو إعادته. الرقم الذي كتبته يدخل في حساب الفائزين.'),
      points: [T('النتيجة تُحسب رياضياً ولا يمكن تغييرها'), T('كل خطوة تُسجَّل في سجل التدقيق والفيديو')], ok: T('موافق — ابدأ السحب'), danger: true },
    finish: { title: T('إنهاء السحب واعتماد الفائزين'), message: T('سيتم كشف مفتاح السحب وإعلان الفائزين وإشعارهم. النتيجة نهائية.'),
      points: [T('لا يمكن التراجع بعد الاعتماد'), T('السحب البديل متاح فقط بعد 30 يوماً ولسبب موثق')], ok: T('اعتماد النتيجة'), danger: true },
    redraw: { title: T('بدء سحب بديل'), message: T('سيُستبعد الفائز الحالي ويُسحب بديل من نفس قائمة المشاركين الأصلية. السبب يُحفظ ويظهر في الإثبات.'),
      points: [T('لا يمكن التراجع بعد البدء'), T('الحد الأقصى سحبان بديلان لكل جائزة')], ok: T('نعم، ابدأ السحب البديل'), danger: true },
  };
  const overlays = (
    <>
      {confirm ? (
        <ConfirmSheet visible testID="draw-confirm" title={CONFIRM[confirm.kind].title} message={CONFIRM[confirm.kind].message}
          points={CONFIRM[confirm.kind].points} confirmText={CONFIRM[confirm.kind].ok} cancelText={T('تراجع')} danger={CONFIRM[confirm.kind].danger}
          onCancel={() => setConfirm(null)} onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }} />
      ) : null}
      <Celebration visible={!!celebrate} title={celebrate?.title || ''} subtitle={celebrate?.subtitle} winners={celebrate?.winners || []}
        closeText={T('متابعة')} onClose={() => setCelebrate(null)} />
    </>
  );
  if (!st) return <View style={s.center}><ActivityIndicator color={colors.brand} size="large" /></View>;
  const c = st.competition;

  // ─── recording / drawing stage ───
  if (phase !== 'idle' && phase !== 'done') {
    const camStyle = {
      top: pip.interpolate({ inputRange: [0, 1], outputRange: [0, insets.top + 10] }),
      left: pip.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }),
      width: pip.interpolate({ inputRange: [0, 1], outputRange: [width, 108] }),
      height: pip.interpolate({ inputRange: [0, 1], outputRange: [height, 156] }),
      borderRadius: pip.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }),
    };
    return (
      <View style={s.stage}>
        <View style={[s.stageBody, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
          <View style={s.stageHead}>
            <TranslatableName text={c.title} style={s.stageTitle} />
            {c.permit_number ? <Text style={s.stageSub}>{T('بإشراف الغرفة التجارية — تصريح رقم')} {c.permit_number}</Text> : null}
            <Text style={s.stageSub}>{tf('المشاركون المؤهلون: {0} • المتبقي: {1}', lang, [sess?.participants_count || 0, remaining])}</Text>
            <Text style={s.hash}>{T('بصمة السحب')}: {sess?.seed_hash?.slice(0, 20)}…</Text>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
            {batch.length === 0 ? <Text style={s.ready}>{T('جاهزين للسحب')}</Text> : null}
            {batch.map(w => <RollingReel key={w.k} testID={`reel-${w.k}`} names={sess?.names || []} winner={w} compact={batch.length > 1} />)}
            {sess?.seed && phase === 'finishing' ? (
              <View style={s.reveal}><Ionicons name="shield-checkmark" size={20} color={colors.success} />
                <Text style={s.revealTxt}>{T('اكتمل السحب — مفتاح السحب')}: {sess.seed.slice(0, 24)}…</Text></View>
            ) : null}
            {(sess?.picks || []).length > 0 && !rolling ? (
              <View style={s.list}>
                <Text style={s.listTitle}>{T('الفائزون')}</Text>
                {sess.picks.map((w: any) => <Text key={w.k} style={s.listRow}>{w.k}. {w.name}  •  {'\u2066' + w.phone + '\u2069'}</Text>)}
              </View>
            ) : null}
          </ScrollView>
          {phase === 'draw' ? (
            remaining > 0 ? (
              <View style={s.row}>
                <TouchableOpacity testID="studio-pull-1" style={[s.btn, (rolling || busy) && s.dim]} disabled={rolling || busy} onPress={() => pull(1)}>
                  <Ionicons name="dice" size={20} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{T('اسحب فائز')}</Text>
                </TouchableOpacity>
                {remaining > 1 ? (
                  <TouchableOpacity testID="studio-pull-many" style={[s.btnAlt, (rolling || busy) && s.dim]} disabled={rolling || busy} onPress={() => pull(Math.min(4, remaining))}>
                    <Text style={s.btnAltTxt}>{tf('اسحب {0} دفعة وحدة', lang, [Math.min(4, remaining)])}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <TouchableOpacity testID="studio-finish" style={[s.btn, (rolling || busy) && s.dim]} disabled={rolling || busy} onPress={() => setConfirm({ kind: 'finish', run: finish })}>
                <Ionicons name="checkmark-done" size={20} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{T('إنهاء السحب وكشف المفتاح')}</Text>
              </TouchableOpacity>
            )
          ) : null}
          {phase === 'uploading' ? <View style={s.row}><ActivityIndicator color={colors.brand} /><Text style={s.stageSub}>{T('جارِ رفع الفيديو…')}</Text></View> : null}
        </View>

        {canFilm ? (
          <Animated.View style={[s.cam, camStyle]} pointerEvents={phase === 'intro' ? 'auto' : 'none'}>
            <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="front" mode="video" videoQuality="720p" videoBitrate={1500000} />
          </Animated.View>
        ) : null}

        {phase === 'intro' ? (
          <View style={[s.lowerThird, { paddingBottom: insets.bottom + 16 }]}>
            {!canFilm ? <Text style={s.warn}>{T('التصوير متاح في تطبيق الجوال — هنا يتم السحب بدون فيديو')}</Text> : null}
            <Text style={s.ltBrand}>ZENREX — {T('سحب رسمي')}</Text>
            <TranslatableName text={c.title} style={s.ltTitle} />
            {c.permit_number ? <Text style={s.ltSub}>{T('بإشراف الغرفة التجارية — تصريح رقم')} {c.permit_number}</Text> : null}
            <Text style={s.ltSub}>{tf('المشاركون: {0} • بصمة السحب: {1}', lang, [sess?.participants_count || 0, (sess?.seed_hash || '').slice(0, 16) + '…'])}</Text>
            {sess?.kind === 'redraw' ? <Text style={s.ltSub}>{T('سحب بديل عن')}: {sess?.replaced?.name} — {sess?.reason}</Text> : null}
            <Text style={s.ltHint}>{T('عرّف بنفسك وبالمسابقة، ثم اكتب رقماً عشوائياً من 6 خانات أمام الكاميرا واضغط ابدأ السحب')}</Text>
            <TextInput testID="studio-officer-code" style={s.codeInput} value={code} onChangeText={t => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad" maxLength={6} placeholder="••••••" placeholderTextColor="#8A8070" />
            <TouchableOpacity testID="studio-start-draw" style={[s.btn, (code.length !== 6 || busy) && s.dim]} disabled={code.length !== 6 || busy} onPress={() => setConfirm({ kind: 'start', run: startDrawing })}>
              <Ionicons name="play" size={20} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{T('ابدأ السحب')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {overlays}
      </View>
    );
  }

  // ─── overview ───
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity testID="studio-back" style={s.iconBtn} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={s.headerTitle}>{T('استوديو السحب')}</Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <View style={s.card}>
          <TranslatableName text={c.title} style={s.title} />
          <TranslatableName text={String(c.prize || '')} style={s.prize} />
          <Text style={s.meta}>{tf('{0} مشارك • {1} جوائز', lang, [st.participants, c.prize_count])}</Text>
          {c.permit_number ? <View style={s.permit}><Ionicons name="shield-checkmark" size={16} color={colors.brand} /><Text style={s.permitTxt}>{T('تصريح الغرفة التجارية')}: {c.permit_number}</Text></View> : null}
          {c.officer_name ? <Text style={s.meta}>{T('المشرف')}: {c.officer_name}</Text> : null}
        </View>

        <View style={s.card}>
          <View style={s.rowStart}><Ionicons name="lock-closed" size={18} color={colors.brand} /><Text style={s.cardTitle}>{T('كيف نضمن عدالة السحب')}</Text></View>
          <Text style={s.body}>{T('1. نثبّت قائمة المشاركين قبل البدء ونولّد مفتاحاً سرياً، وتُعرض بصمته على الكاميرا.')}</Text>
          <Text style={s.body}>{T('2. كل فائز يُحسب رياضياً من المفتاح وقائمة المشاركين — لا أحد يقدر يختار الفائز.')}</Text>
          <Text style={s.body}>{T('3. بعد السحب نكشف المفتاح، وأي شخص يقدر يعيد الحساب ويتأكد من نفس النتيجة.')}</Text>
        </View>

        {!st.initial_done ? (
          <TouchableOpacity testID="studio-begin" style={[s.btn, busy && s.dim]} disabled={busy || st.participants < 1} onPress={() => st.active_session ? begin('initial') : setConfirm({ kind: 'begin', run: () => begin('initial') })}>
            <Ionicons name="videocam" size={20} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{st.active_session ? T('استكمال السحب المصوّر') : T('ابدأ السحب المصوّر')}</Text>
          </TouchableOpacity>
        ) : null}

        {st.winners.length > 0 ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>{T('الفائزون')}</Text>
            {st.winners.map((w: any) => (
              <View key={w.user_id} style={s.winRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.winName}>{w.rank}. {w.user_name}</Text>
                  <Text style={s.meta}>{'\u2066' + w.user_phone + '\u2069'} • {T(w.prize_status === 'pending' ? 'بانتظار التواصل' : w.prize_status === 'delivered' ? 'تم التسليم' : 'طلب الجائزة')}</Text>
                </View>
                {w.prize_status === 'pending' ? (
                  <TouchableOpacity testID={`studio-redraw-${w.user_id}`} style={[s.smallBtn, !w.redraw_open && s.dim]}
                    onPress={() => w.redraw_open ? setRedraw(w) : notify(T('غير متاح بعد'), tf('السحب البديل متاح بعد 30 يوماً من إعلان الفائز ({0})', lang, [String(w.redraw_available_at || '').slice(0, 10)]))}>
                    <Text style={s.smallBtnTxt}>{T('سحب بديل')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {st.sessions.length > 0 ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>{T('سجل السحوبات الموثقة')}</Text>
            {st.sessions.map((x: any) => (
              <View key={x.id} style={s.winRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.winName}>{T(x.kind === 'redraw' ? 'سحب بديل' : 'السحب الأساسي')} • {String(x.finished_at || '').slice(0, 10)}</Text>
                  <Text style={s.meta}>{T('الفيديو')}: {T(x.video_status === 'ready' ? 'جاهز' : x.video_status === 'processing' ? 'قيد التجهيز' : x.video_status === 'failed' ? 'فشل' : 'بدون فيديو')}</Text>
                </View>
                {x.video_status === 'ready' ? (
                  <TouchableOpacity testID={`studio-share-${x.id}`} style={s.smallBtn} onPress={() => share(x.id)}><Ionicons name="share-social" size={16} color={colors.onBrandPrimary} /></TouchableOpacity>
                ) : x.video_status === 'failed' ? (
                  <TouchableOpacity testID={`studio-retry-${x.id}`} style={s.smallBtn} onPress={async () => {
                    try { await apiCall(`/api/draws/sessions/${x.id}/video/retry`, { method: 'POST' }); load(); poll(x.id); } catch (e: any) { notify(T('خطأ'), e.message); }
                  }}><Ionicons name="refresh" size={16} color={colors.onBrandPrimary} /></TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {phase === 'done' && videoStatus === 'ready' && sess ? (
          <TouchableOpacity testID="studio-share-new" style={s.btn} onPress={() => share(sess.id)}>
            <Ionicons name="share-social" size={20} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{T('شارك فيديو السحب')}</Text>
          </TouchableOpacity>
        ) : null}
        {phase === 'done' && videoStatus === 'processing' ? <Text style={s.meta}>{T('الفيديو قيد التجهيز وبيظهر في صفحة المسابقة تلقائياً')}</Text> : null}
      </ScrollView>

      <Modal transparent animationType="slide" visible={!!redraw} onRequestClose={() => setRedraw(null)}>
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalCard}>
            <Text style={s.cardTitle}>{T('سحب بديل عن')} {redraw?.user_name}</Text>
            <Text style={s.meta}>{T('اكتب سبب الاستبدال (مثال: لم يرد الفائز خلال 30 يوماً حسب وزارة التجارة)')}</Text>
            <TextInput testID="studio-redraw-reason" style={s.input} value={reason} onChangeText={setReason} multiline placeholder={T('السبب')} placeholderTextColor={colors.onSurfaceTertiary} />
            <View style={s.row}>
              <TouchableOpacity style={s.btnAlt} onPress={() => setRedraw(null)}><Text style={s.btnAltTxt}>{T('إلغاء')}</Text></TouchableOpacity>
              <TouchableOpacity testID="studio-redraw-go" style={[s.btn, reason.trim().length < 5 && s.dim]} disabled={reason.trim().length < 5}
                onPress={() => { const w = redraw; setRedraw(null); setConfirm({ kind: 'redraw', run: () => begin('redraw', { replace_user_id: w.user_id, reason }) }); }}>
                <Text style={s.btnTxt}>{T('ابدأ السحب البديل')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {overlays}
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', color: colors.onSurface, fontSize: 17, fontWeight: '800' },
    card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6 },
    title: { color: colors.onSurface, fontSize: 18, fontWeight: '800' },
    prize: { color: colors.brand, fontSize: 15, fontWeight: '700' },
    meta: { color: colors.onSurfaceSecondary, fontSize: 12 },
    permit: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brandTertiary, borderRadius: 10, padding: 8, alignSelf: 'flex-start' },
    permitTxt: { color: colors.brand, fontWeight: '800', fontSize: 12 },
    rowStart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '800' },
    body: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
    btn: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
    btnTxt: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: '800' },
    btnAlt: { flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    btnAltTxt: { color: colors.brand, fontSize: 14, fontWeight: '800' },
    dim: { opacity: 0.45 },
    row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    winRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
    winName: { color: colors.onSurface, fontWeight: '700', fontSize: 14 },
    smallBtn: { minHeight: 40, minWidth: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
    smallBtnTxt: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 12 },
    stage: { flex: 1, backgroundColor: colors.background },
    stageBody: { flex: 1, paddingHorizontal: 16 },
    stageHead: { paddingStart: 124, minHeight: 156, gap: 2 },
    stageTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '900' },
    stageSub: { color: colors.onSurfaceSecondary, fontSize: 12 },
    hash: { color: colors.onSurfaceTertiary, fontSize: 11 },
    ready: { color: colors.brand, fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 40 },
    reveal: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: colors.success, padding: 12, backgroundColor: colors.successSoft },
    revealTxt: { color: colors.success, fontWeight: '700', fontSize: 12, flex: 1 },
    list: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, backgroundColor: colors.surface, gap: 4 },
    listTitle: { color: colors.brand, fontWeight: '800' },
    listRow: { color: colors.onSurface, fontSize: 13 },
    cam: { position: 'absolute', overflow: 'hidden', borderWidth: 2, borderColor: colors.brand, backgroundColor: '#000' },
    lowerThird: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,9,12,0.86)', borderTopWidth: 3, borderTopColor: colors.brand, padding: 16, gap: 4 },
    ltBrand: { color: '#E8C778', fontWeight: '900', letterSpacing: 1 },
    ltTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
    ltSub: { color: '#D9D2C3', fontSize: 12 },
    ltHint: { color: '#E8C778', fontSize: 13, fontWeight: '700', marginVertical: 8 },
    warn: { color: '#FFB020', fontSize: 12, fontWeight: '700' },
    codeInput: { minHeight: 54, borderRadius: 12, borderWidth: 2, borderColor: '#E8C778', color: '#FFFFFF', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: 10, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10, paddingBottom: 32 },
    input: { minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, textAlignVertical: 'top' },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable; themeKey triggers the rebuild
}
