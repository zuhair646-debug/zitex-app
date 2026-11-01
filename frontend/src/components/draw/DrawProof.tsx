/** Public draw documentation on a competition page: official draw video(s) + one-tap fairness verification. */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Share } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../app/_layout';
import { useT } from '../../i18n';
import { tSync, tf } from '../../useAutoT';
import { colors } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

function DrawVideo({ sid }: { sid: string }) {
  const s = useStyles();
  const player = useVideoPlayer(`${API}/api/draws/sessions/${sid}/video.mp4`, p => { p.loop = false; });
  return <VideoView testID={`draw-video-${sid}`} player={player} style={s.video} nativeControls contentFit="contain" />;
}

export default function DrawProof({ competitionId }: { competitionId: string }) {
  const { lang } = useT();
  const s = useStyles();
  const { apiCall } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [verify, setVerify] = useState<any>(null);
  const [checking, setChecking] = useState('');
  const T = (x: string) => tSync(x, lang);

  useEffect(() => { apiCall(`/api/draws/public/${competitionId}`).then(setSessions).catch(() => {}); }, [competitionId]);

  const open = async (sid: string) => {
    setChecking(sid);
    try { setVerify(await apiCall(`/api/draws/sessions/${sid}/verify`)); } catch { /* not finished */ } finally { setChecking(''); }
  };

  if (!sessions.length) return null;
  return (
    <View style={s.wrap} testID="draw-proof">
      <View style={s.head}><Ionicons name="shield-checkmark" size={20} color={colors.brand} /><Text style={s.title}>{T('توثيق السحب')}</Text></View>
      {sessions.map(x => (
        <View key={x.id} style={s.card}>
          <Text style={s.kind}>{T(x.kind === 'redraw' ? 'سحب بديل' : 'السحب الرسمي')} • {String(x.finished_at || '').slice(0, 10)}</Text>
          {x.kind === 'redraw' && x.reason ? <Text style={s.meta}>{T('السبب')}: {x.reason}</Text> : null}
          {x.video_status === 'ready' ? <DrawVideo sid={x.id} /> : <Text style={s.meta}>{T(x.video_status === 'processing' ? 'الفيديو قيد التجهيز' : 'لا يوجد فيديو لهذا السحب')}</Text>}
          <Text style={s.meta}>{tf('المشاركون: {0} • الفائزون: {1}', lang, [x.participants_count, x.picks.length])}</Text>
          <View style={s.row}>
            <TouchableOpacity testID={`verify-${x.id}`} style={s.btn} onPress={() => open(x.id)}>
              {checking === x.id ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Ionicons name="checkmark-circle" size={18} color={colors.onBrandPrimary} /><Text style={s.btnTxt}>{T('تحقق من النزاهة')}</Text></>}
            </TouchableOpacity>
            {x.video_status === 'ready' ? (
              <TouchableOpacity testID={`share-draw-${x.id}`} style={s.btnAlt} onPress={() => Share.share({ message: `${API}/api/draws/sessions/${x.id}/video.mp4` })}>
                <Ionicons name="share-social" size={18} color={colors.brand} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}

      <Modal visible={!!verify} transparent animationType="slide" onRequestClose={() => setVerify(null)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <View style={s.head}>
              <Ionicons name={verify?.verified ? 'shield-checkmark' : 'alert-circle'} size={24} color={verify?.verified ? colors.success : colors.error} />
              <Text style={[s.title, { color: verify?.verified ? colors.success : colors.error }]}>{T(verify?.verified ? 'السحب سليم ومطابق' : 'تعذر التحقق')}</Text>
            </View>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 8 }}>
              {[['participants_hash', 'قائمة المشاركين لم تتغير بعد التثبيت'], ['seed_hash', 'المفتاح المكشوف يطابق البصمة المعروضة قبل السحب'], ['winners_replay', 'إعادة الحساب أعطت نفس الفائزين']].map(([k, l]) => (
                <View key={k} style={s.row}><Ionicons name={verify?.checks?.[k] ? 'checkmark-circle' : 'close-circle'} size={18} color={verify?.checks?.[k] ? colors.success : colors.error} /><Text style={s.check}>{T(l)}</Text></View>
              ))}
              <Text style={s.label}>{T('بصمة السحب (قبل البدء)')}</Text><Text selectable style={s.mono}>{verify?.seed_hash}</Text>
              <Text style={s.label}>{T('مفتاح السحب (بعد الانتهاء)')}</Text><Text selectable style={s.mono}>{verify?.seed}</Text>
              <Text style={s.label}>{T('بصمة قائمة المشاركين')}</Text><Text selectable style={s.mono}>{verify?.participants_hash}</Text>
              <Text style={s.label}>{T('الفائزون')}</Text>
              {(verify?.picks || []).map((p: any) => <Text key={p.k} style={s.check}>{p.k}. {p.name} • {'\u2066' + p.phone + '\u2069'} • {T('مشارك رقم')} {p.n}</Text>)}
              <Text style={s.label}>{T('طريقة الحساب')}</Text><Text selectable style={s.mono}>{verify?.algorithm}</Text>
            </ScrollView>
            <TouchableOpacity testID="verify-close" style={s.btn} onPress={() => setVerify(null)}><Text style={s.btnTxt}>{T('إغلاق')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    wrap: { marginTop: 16, gap: 10 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: colors.onSurface, fontSize: 16, fontWeight: '800' },
    card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 },
    kind: { color: colors.brand, fontWeight: '800', fontSize: 13 },
    meta: { color: colors.onSurfaceSecondary, fontSize: 12 },
    video: { width: '100%', aspectRatio: 9 / 16, maxHeight: 460, borderRadius: 12, backgroundColor: '#000' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    btn: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    btnTxt: { color: colors.onBrandPrimary, fontWeight: '800' },
    btnAlt: { width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
    modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, paddingBottom: 32 },
    check: { color: colors.onSurface, fontSize: 13, flex: 1 },
    label: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700', marginTop: 6 },
    mono: { color: colors.onSurface, fontSize: 11, fontFamily: 'monospace' },
  }), [themeKey]);
}
