import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LP, K, KM } from './theme';
import { KpiCard, Sparkline, HBar, Section } from './atoms';
import { ExportButton } from './AlertsAndExport';

const DAY_LABELS = ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];
const SOURCE_LABEL: Record<string, string> = {
  link: 'رابط دعوة',
  organic: 'تصفح عادي',
  push: 'إشعار',
  social_share: 'مشاركة اجتماعية',
  ad: 'إعلان مدفوع',
};
const SOURCE_COLOR: Record<string, string> = {
  link: LP.INFO,
  organic: LP.MUTED,
  push: LP.MAGENTA,
  social_share: LP.SUCCESS,
  ad: LP.WARN,
};

const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)}د`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}س`;
  return `${Math.floor(diff / 86400)}ي`;
};

export default function CompetitionDetailSheet({ competitionId, apiCall, onClose }: any) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'participants' | 'winners' | 'rules'>('overview');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await apiCall(`/api/merchant/competitions/${competitionId}/analytics`);
        if (alive) setData(d);
      } catch (e: any) { Alert.alert('خطأ', e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [competitionId]);

  if (loading || !data) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={st.overlay}>
          <View style={st.sheet}>
            <View style={st.handle} />
            <ActivityIndicator color={LP.GOLD} style={{ marginTop: 40 }} />
          </View>
        </View>
      </Modal>
    );
  }

  const comp = data.competition;
  const isEnded = comp.status === 'ended' || (data.winner_details || []).length > 0;
  const peakHour = data.peak_hour;
  const peakHourLabel = `${peakHour === 0 ? 12 : peakHour > 12 ? peakHour - 12 : peakHour}${peakHour < 12 ? 'ص' : 'م'}`;
  const maxDaily = Math.max(1, ...(data.daily_series || []).map((x: any) => x.count));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.sheet}>
          <View style={st.handle} />

          {/* Glass header */}
          <BlurView intensity={40} tint="dark" style={st.headerGlass}>
            <TouchableOpacity onPress={onClose} style={st.closeBtn}>
              <Ionicons name="close" size={22} color={LP.TEXT} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={[st.statusPill, { backgroundColor: isEnded ? '#3F3F4680' : '#065F4680' }]}>
              <View style={[st.dot, { backgroundColor: isEnded ? LP.MUTED : LP.SUCCESS }]} />
              <Text style={[st.statusText, { color: isEnded ? LP.MUTED : LP.SUCCESS }]}>{isEnded ? 'منتهية' : 'مباشرة'}</Text>
            </View>
          </BlurView>

          {/* Hero with banner */}
          {comp.image ? (
            <View style={{ position: 'relative' }}>
              <Image source={{ uri: comp.image }} style={{ width: '100%', height: 180 }} contentFit="cover" />
              <LinearGradient colors={['transparent', LP.BG]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 }} />
              <View style={{ position: 'absolute', bottom: 14, left: 14, right: 14, alignItems: 'center' }}>
                <View style={st.trophyBadge}>
                  <Ionicons name="trophy" size={16} color={LP.GOLD} />
                  <Text style={st.prizeText} numberOfLines={1}>{comp.prize || 'جائزة قيّمة'}</Text>
                </View>
                <Text style={st.heroTitle} numberOfLines={2}>{comp.title}</Text>
              </View>
            </View>
          ) : (
            <LinearGradient colors={[LP.GOLD + '30', LP.BG]} style={{ padding: 20, alignItems: 'center' }}>
              <Ionicons name="trophy" size={50} color={LP.GOLD} />
              <Text style={st.heroTitle}>{comp.title}</Text>
              {!!comp.prize && <Text style={st.prizeText}>🏆 {comp.prize}</Text>}
            </LinearGradient>
          )}

          {/* Tabs */}
          <View style={st.tabRow}>
            {[
              { k: 'overview', l: 'نظرة عامة', i: 'stats-chart' },
              { k: 'participants', l: 'المشاركون', i: 'people', c: data.kpis.total_participants },
              { k: 'winners', l: 'الفائزون', i: 'trophy', c: (data.winner_details || []).length },
              { k: 'rules', l: 'الشروط', i: 'document-text' },
            ].map((t: any) => (
              <TouchableOpacity key={t.k} onPress={() => setTab(t.k)} style={[st.tab, tab === t.k && st.tabActive]}>
                <Ionicons name={t.i as any} size={12} color={tab === t.k ? LP.BG : LP.MUTED} />
                <Text style={[st.tabText, tab === t.k && { color: LP.BG, fontWeight: '900' }]}>{t.l}</Text>
                {t.c != null && t.c > 0 && (
                  <View style={[st.tabBadge, tab === t.k && { backgroundColor: LP.BG + 'AA' }]}>
                    <Text style={[st.tabBadgeText, tab === t.k && { color: LP.GOLD }]}>{t.c}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {tab === 'overview' && (
              <>
                {/* KPI cards */}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <KpiCard icon="people" label="إجمالي المشاركين" value={K(data.kpis.total_participants)} color={LP.GOLD} />
                  <KpiCard icon="person" label="مستخدم فريد" value={K(data.kpis.unique_users)} color={LP.INFO} />
                  <KpiCard icon="add-circle" label="متابع مكتسب" value={`+${K(data.kpis.followers_gained)}`} color={LP.SUCCESS} />
                  <KpiCard icon="trending-up" label="معدل التفاعل" value={`${data.kpis.engagement_rate}%`} color={LP.MAGENTA} />
                </View>

                {/* Peak chips */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <View style={st.peakChip}>
                    <Ionicons name="flame" size={12} color={LP.GOLD} />
                    <Text style={st.peakLabel}>ذروة الساعة</Text>
                    <Text style={st.peakValue}>{peakHourLabel}</Text>
                  </View>
                  <View style={st.peakChip}>
                    <Ionicons name="calendar" size={12} color={LP.GOLD} />
                    <Text style={st.peakLabel}>ذروة اليوم</Text>
                    <Text style={st.peakValue}>{DAY_LABELS[data.peak_day_of_week] || '—'}</Text>
                  </View>
                </View>

                {/* Daily trend */}
                {(data.daily_series || []).length > 0 && (
                  <>
                    <Section icon="pulse" title="نبض المشاركات اليومي" />
                    <View style={st.chartBox}>
                      <Sparkline data={data.daily_series.map((x: any) => x.count)} color={LP.GOLD} height={80} />
                    </View>
                  </>
                )}

                {/* Sources */}
                {(data.sources || []).length > 0 && (
                  <>
                    <Section icon="link" title="مصادر المشاركين" />
                    {data.sources.map((row: any) => {
                      const total = data.sources.reduce((a: number, b: any) => a + b.count, 0) || 1;
                      const pct = (row.count / total) * 100;
                      return (
                        <HBar key={row.source} label={SOURCE_LABEL[row.source] || row.source}
                          value={row.count} max={data.sources[0].count}
                          color={SOURCE_COLOR[row.source] || LP.GOLD}
                          secondary={`${pct.toFixed(1)}%`} />
                      );
                    })}
                  </>
                )}

                {/* Top cities */}
                {(data.top_cities || []).length > 0 && (
                  <>
                    <Section icon="map" title="أكثر المدن مشاركة" />
                    {data.top_cities.map((c: any, i: number) => (
                      <HBar key={c.city} label={c.city} value={c.count} max={data.top_cities[0].count}
                        color={i === 0 ? LP.GOLD : LP.INFO} />
                    ))}
                  </>
                )}
              </>
            )}

            {tab === 'participants' && (
              <>
                <View style={st.headerNote}>
                  <Ionicons name="people" size={14} color={LP.GOLD} />
                  <Text style={st.headerNoteText}>{K(data.kpis.total_participants)} مشارك — عرض آخر {(data.all_participants || []).length}</Text>
                </View>
                {(data.all_participants || []).length === 0 && (
                  <View style={{ alignItems: 'center', padding: 40 }}>
                    <Ionicons name="people-outline" size={40} color={LP.MUTED} />
                    <Text style={{ color: LP.MUTED, marginTop: 8 }}>لا مشاركون بعد</Text>
                    <Text style={{ color: LP.MUTED, fontSize: 11, marginTop: 4 }}>روّج للمسابقة على السوشيال ميديا</Text>
                  </View>
                )}
                {(data.all_participants || []).slice().reverse().map((p: any, i: number) => (
                  <View key={i} style={st.userRow}>
                    <View style={st.userAvatar}>
                      <Text style={{ color: LP.BG, fontWeight: '900', fontSize: 14 }}>{(p.user_name || '?')[0]}</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={st.userName}>{p.user_name || 'مستخدم'}</Text>
                      <Text style={st.userMeta}>
                        {p.user_city ? `${p.user_city} · ` : ''}
                        {SOURCE_LABEL[p.source] || p.source} · {timeAgo(p.created_at)}
                      </Text>
                    </View>
                    {p.user_phone && (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${p.user_phone}`)} style={st.callBtn}>
                        <Ionicons name="call" size={12} color={LP.BG} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}

            {tab === 'winners' && (
              <>
                {(data.winner_details || []).length === 0 ? (
                  <View style={{ alignItems: 'center', padding: 40 }}>
                    <Ionicons name="trophy-outline" size={40} color={LP.MUTED} />
                    <Text style={{ color: LP.MUTED, marginTop: 8 }}>لم يتم اختيار الفائزين بعد</Text>
                    {!isEnded && <Text style={{ color: LP.GOLD, fontSize: 11, marginTop: 6 }}>المسابقة ما تزال مباشرة</Text>}
                  </View>
                ) : (
                  <>
                    <View style={st.headerNote}>
                      <Ionicons name="trophy" size={14} color={LP.GOLD} />
                      <Text style={st.headerNoteText}>🏆 {(data.winner_details || []).length} فائز</Text>
                    </View>
                    {data.winner_details.map((w: any, i: number) => (
                      <LinearGradient key={i} colors={[LP.GOLD + '25', LP.CARD_2]} style={st.winnerCard}>
                        <View style={st.winnerRankBig}>
                          <Text style={{ color: LP.BG, fontWeight: '900', fontSize: 18 }}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.winnerName}>{w.user_name}</Text>
                          <Text style={st.winnerMeta}>
                            {w.user_city ? `${w.user_city} · ` : ''}
                            {(w.user_phone || '').slice(-4).padStart(4, '•')}
                          </Text>
                          <Text style={st.winnerPrize}>🏆 {w.prize_awarded || comp.prize}</Text>
                          {!!w.picked_at && <Text style={{ color: LP.MUTED, fontSize: 10, textAlign: 'right', marginTop: 3 }}>اختير في: {(w.picked_at || '').slice(0, 10)}</Text>}
                        </View>
                        {w.user_phone && (
                          <TouchableOpacity onPress={() => Linking.openURL(`tel:${w.user_phone}`)} style={st.callBtnGold}>
                            <Ionicons name="call" size={14} color={LP.BG} />
                          </TouchableOpacity>
                        )}
                      </LinearGradient>
                    ))}
                  </>
                )}
              </>
            )}

            {tab === 'rules' && (
              <>
                <Section icon="information-circle" title="عن المسابقة" />
                <View style={st.infoBox}>
                  {comp.description ? (
                    <Text style={st.descText}>{comp.description}</Text>
                  ) : (
                    <Text style={[st.descText, { color: LP.MUTED }]}>لا يوجد وصف مضاف</Text>
                  )}
                </View>

                <Section icon="trophy" title="الجائزة" />
                <View style={st.infoBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: LP.GOLD + '30', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="gift" size={20} color={LP.GOLD} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: LP.GOLD, fontSize: 14, fontWeight: '900', textAlign: 'right' }}>{comp.prize}</Text>
                      {!!comp.prize_details && <Text style={{ color: LP.MUTED, fontSize: 11, textAlign: 'right', marginTop: 2 }}>{comp.prize_details}</Text>}
                    </View>
                  </View>
                  {comp.max_winners > 1 && (
                    <Text style={{ color: LP.INFO, fontSize: 11, marginTop: 8, textAlign: 'right' }}>👥 {comp.max_winners} فائز</Text>
                  )}
                </View>

                <Section icon="checkmark-circle" title="شروط المشاركة" />
                <View style={st.infoBox}>
                  {(comp.rules || []).map((r: string, i: number) => (
                    <View key={i} style={st.ruleRow}>
                      <View style={st.ruleBullet}><Text style={{ color: LP.BG, fontWeight: '900', fontSize: 10 }}>{i + 1}</Text></View>
                      <Text style={st.ruleText}>{r}</Text>
                    </View>
                  ))}
                </View>

                <Section icon="calendar" title="التوقيتات" />
                <View style={st.infoBox}>
                  <View style={st.timelineRow}>
                    <Ionicons name="play-circle" size={16} color={LP.SUCCESS} />
                    <Text style={st.timelineText}>البداية: {(comp.starts_at || comp.created_at || '').slice(0, 10)}</Text>
                  </View>
                  <View style={st.timelineRow}>
                    <Ionicons name="stop-circle" size={16} color={LP.DANGER} />
                    <Text style={st.timelineText}>النهاية: {(comp.ends_at || '').slice(0, 10) || 'مفتوحة'}</Text>
                  </View>
                </View>

                <Section icon="options" title="نوع المسابقة" />
                <View style={st.infoBox}>
                  <Text style={{ color: LP.TEXT, fontSize: 13, textAlign: 'right' }}>
                    {comp.competition_type === 'story_share' ? '📸 مشاركة قصة' :
                     comp.competition_type === 'referral' ? '🔗 دعوة أصدقاء' :
                     comp.competition_type === 'ugc' ? '🎬 محتوى مستخدم' :
                     comp.competition_type === 'simple' ? '✨ مشاركة بسيطة' :
                     comp.competition_type || 'مسابقة عامة'}
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: LP.BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '95%', borderTopWidth: 1, borderColor: LP.BORDER },
  handle: { width: 46, height: 4, borderRadius: 2, backgroundColor: '#3A3D48', alignSelf: 'center', marginTop: 8 },
  headerGlass: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: LP.BORDER },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '900' },

  trophyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(11,12,16,0.85)', borderWidth: 1, borderColor: LP.GOLD, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginBottom: 8 },
  prizeText: { color: LP.GOLD, fontSize: 12, fontWeight: '900' },
  heroTitle: { color: LP.TEXT, fontSize: 18, fontWeight: '900', textAlign: 'center' },

  tabRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingTop: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, paddingVertical: 8, borderRadius: 999 },
  tabActive: { backgroundColor: LP.GOLD, borderColor: LP.GOLD },
  tabText: { color: LP.MUTED, fontSize: 10, fontWeight: '700' },
  tabBadge: { minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: LP.GOLD, alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { color: LP.BG, fontSize: 9, fontWeight: '900' },

  peakChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LP.GOLD + '15', borderWidth: 1, borderColor: LP.GOLD + '55', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  peakLabel: { color: LP.MUTED, fontSize: 10 },
  peakValue: { color: LP.GOLD, fontSize: 12, fontWeight: '900' },

  chartBox: { backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 14, padding: 10, alignItems: 'center' },
  infoBox: { backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 14, padding: 12 },
  descText: { color: LP.TEXT, fontSize: 13, textAlign: 'right', lineHeight: 20 },

  headerNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, padding: 10, borderRadius: 12, marginBottom: 10 },
  headerNoteText: { color: LP.TEXT, fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  userRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, padding: 10, borderRadius: 12, marginBottom: 6 },
  userAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: LP.GOLD, alignItems: 'center', justifyContent: 'center' },
  userName: { color: LP.TEXT, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  userMeta: { color: LP.MUTED, fontSize: 10, textAlign: 'right', marginTop: 2 },
  callBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: LP.INFO, alignItems: 'center', justifyContent: 'center' },
  callBtnGold: { width: 34, height: 34, borderRadius: 17, backgroundColor: LP.GOLD, alignItems: 'center', justifyContent: 'center' },

  winnerCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: LP.GOLD + '55', marginBottom: 8, gap: 12 },
  winnerRankBig: { width: 48, height: 48, borderRadius: 24, backgroundColor: LP.GOLD, alignItems: 'center', justifyContent: 'center' },
  winnerName: { color: LP.TEXT, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  winnerMeta: { color: LP.MUTED, fontSize: 11, textAlign: 'right', marginTop: 2 },
  winnerPrize: { color: LP.GOLD, fontSize: 12, fontWeight: '800', textAlign: 'right', marginTop: 4 },

  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: LP.BORDER_SOFT },
  ruleBullet: { width: 22, height: 22, borderRadius: 11, backgroundColor: LP.GOLD, alignItems: 'center', justifyContent: 'center' },
  ruleText: { color: LP.TEXT, fontSize: 12, flex: 1, textAlign: 'right', lineHeight: 18 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  timelineText: { color: LP.TEXT, fontSize: 12, flex: 1, textAlign: 'right' },
});
