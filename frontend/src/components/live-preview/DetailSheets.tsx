import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Alert, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LP, K, KM, PLATFORM_COLORS, PLATFORM_LABEL, PLATFORM_ICON } from './theme';
import { KpiCard, Sparkline, BarChart, HBar, RatingBreakdown, EntityPill, Section } from './atoms';

/* ═════════════════════════ SHEET SHELL ═════════════════════════ */
function SheetShell({ visible, onClose, title, subtitle, avatar, icon, accent = LP.GOLD, statusPill, children }: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.sheet}>
          <View style={st.handle} />
          {/* Glass Header */}
          <BlurView intensity={40} tint="dark" style={st.headerGlass}>
            <TouchableOpacity onPress={onClose} style={st.closeBtn}>
              <Ionicons name="close" size={22} color={LP.TEXT} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {statusPill}
          </BlurView>
          {/* Hero */}
          <LinearGradient
            colors={[accent + '25', LP.BG]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={st.hero}
          >
            <View style={{ alignItems: 'center' }}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={[st.heroAvatar, { borderColor: accent }]} contentFit="cover" />
              ) : (
                <View style={[st.heroAvatar, { borderColor: accent, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name={icon || 'person'} size={48} color={accent} />
                </View>
              )}
              <Text style={st.heroTitle}>{title}</Text>
              {!!subtitle && <Text style={st.heroSub}>{subtitle}</Text>}
            </View>
          </LinearGradient>
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ═════════════════════════ DRIVER SHEET ═════════════════════════ */
export function DriverDetailSheet({ driverId, apiCall, onClose, onOpenBranch }: any) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stats' | 'reviews' | 'earnings'>('stats');

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const data = await apiCall(`/api/merchant/live-preview/driver/${driverId}`); if (alive) setD(data); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [driverId]);

  if (loading || !d) return (
    <SheetShell visible onClose={onClose} title="جاري التحميل..." icon="car">
      <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator color={LP.GOLD} /></View>
    </SheetShell>
  );

  const statusPill = (
    <View style={[st.statusPill, { backgroundColor: d.online ? '#065F4680' : '#3F3F4680' }]}>
      <View style={[st.dot, { backgroundColor: d.online ? LP.SUCCESS : LP.MUTED }]} />
      <Text style={[st.statusText, { color: d.online ? LP.SUCCESS : LP.MUTED }]}>{d.online ? 'متصل الآن' : 'غير متصل'}</Text>
    </View>
  );

  return (
    <SheetShell visible onClose={onClose} title={d.name} subtitle={`${d.vehicle}${d.vehicle_plate ? ` · ${d.vehicle_plate}` : ''}`}
      avatar={d.avatar} icon="car" statusPill={statusPill}>
      {/* Live rating chip */}
      <View style={st.centerRow}>
        <View style={st.ratingChip}>
          <Ionicons name="star" size={14} color={LP.GOLD} />
          <Text style={{ color: LP.TEXT, fontSize: 13, fontWeight: '900' }}>{d.rating.avg.toFixed(1)}</Text>
          <Text style={{ color: LP.MUTED, fontSize: 10 }}>({d.rating.count} تقييم)</Text>
        </View>
        <View style={st.ratingChip}>
          <Ionicons name="wallet" size={14} color={LP.SUCCESS} />
          <Text style={{ color: LP.TEXT, fontSize: 13, fontWeight: '900' }}>{K(d.wallet_balance)} ر.س</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={st.tabRow}>
        {[{ k: 'stats', l: 'الأداء', i: 'stats-chart' }, { k: 'reviews', l: 'التقييمات', i: 'chatbubbles' }, { k: 'earnings', l: 'المدخولات', i: 'cash' }].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setTab(t.k as any)}
            style={[st.tab, tab === t.k && st.tabActive]}>
            <Ionicons name={t.i as any} size={12} color={tab === t.k ? LP.BG : LP.MUTED} />
            <Text style={[st.tabText, tab === t.k && { color: LP.BG, fontWeight: '900' }]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'stats' && (
        <>
          <Section icon="rocket" title="عدد التوصيلات" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <KpiCard icon="today" label="اليوم" value={K(d.kpis.today)} color={LP.GOLD} sub="توصيلة" />
            <KpiCard icon="calendar" label="هذا الأسبوع" value={K(d.kpis.week)} color={LP.INFO} sub="توصيلة" />
            <KpiCard icon="calendar-outline" label="الشهر" value={K(d.kpis.month)} color={LP.SUCCESS} sub="توصيلة" />
            <KpiCard icon="trending-up" label="السنة" value={K(d.kpis.year)} color={LP.MAGENTA} sub="توصيلة" />
          </View>

          <Section icon="pulse" title="نبض التوصيلات (7 أيام)" />
          <View style={st.chartBox}>
            <Sparkline data={d.week_series} color={LP.GOLD} height={70} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              {['سبت', 'أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع'].map(l => <Text key={l} style={{ color: LP.MUTED, fontSize: 9 }}>{l}</Text>)}
            </View>
          </View>

          <Section icon="briefcase" title="الدوام وتفاصيل التوظيف" />
          <View style={st.infoBox}>
            <Row label="الدوام اليومي" value={`${d.shift_start} - ${d.shift_end} (${d.shift_hours} ساعة)`} />
            <Row label="تاريخ التوظيف" value={d.hire_date || '—'} />
            <Row label="نظام الأجر" value={
              d.salary_type === 'monthly' ? `راتب شهري: ${K(d.salary_monthly)} ر.س`
              : d.salary_type === 'hourly' ? `بالساعة: ${K(d.hourly_rate)} ر.س`
              : `عمولة (${d.commission_type})`
            } />
            <Row label="رقم اللوحة" value={d.vehicle_plate || '—'} />
            <Row label="الجوال" value={d.phone} onPress={() => Linking.openURL(`tel:${d.phone}`)} icon="call" />
          </View>

          {d.assigned_branches?.length > 0 && (
            <>
              <Section icon="business" title="الفروع المرتبطة" />
              {d.assigned_branches.map((b: any) => (
                <EntityPill key={b.id} image={b.image} name={b.name} subtitle={b.city} icon="business"
                  onPress={() => onOpenBranch && onOpenBranch(b.id)} />
              ))}
            </>
          )}
        </>
      )}

      {tab === 'reviews' && (
        <>
          <Section icon="star" title="تقييم العملاء" />
          <View style={st.infoBox}>
            <RatingBreakdown distribution={d.rating.distribution} total={d.rating.count} avg={d.rating.avg} />
          </View>

          {d.positive_reviews?.length > 0 && (
            <>
              <Section icon="thumbs-up" title={`تعليقات إيجابية (${d.positive_reviews.length})`} />
              {d.positive_reviews.map((r: any, i: number) => (
                <View key={i} style={[st.reviewCard, { borderLeftColor: LP.SUCCESS }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: LP.SUCCESS, fontSize: 12, fontWeight: '900' }}>{r.user_name}</Text>
                    <View style={{ flexDirection: 'row' }}>
                      {[1,2,3,4,5].map(s => <Ionicons key={s} name="star" size={10} color={s <= (r.rating || 0) ? LP.GOLD : LP.BORDER} />)}
                    </View>
                  </View>
                  <Text style={st.reviewText}>{r.comment}</Text>
                </View>
              ))}
            </>
          )}

          {d.negative_reviews?.length > 0 && (
            <>
              <Section icon="thumbs-down" title={`تعليقات سلبية (${d.negative_reviews.length})`} />
              {d.negative_reviews.map((r: any, i: number) => (
                <View key={i} style={[st.reviewCard, { borderLeftColor: LP.DANGER }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: LP.DANGER, fontSize: 12, fontWeight: '900' }}>{r.user_name}</Text>
                    <View style={{ flexDirection: 'row' }}>
                      {[1,2,3,4,5].map(s => <Ionicons key={s} name="star" size={10} color={s <= (r.rating || 0) ? LP.GOLD : LP.BORDER} />)}
                    </View>
                  </View>
                  <Text style={st.reviewText}>{r.comment}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}

      {tab === 'earnings' && (
        <>
          <Section icon="cash" title="المدخولات" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <KpiCard icon="today" label="اليوم" value={`${K(d.kpis.today_earnings)} ر.س`} color={LP.GOLD} />
            <KpiCard icon="calendar" label="الأسبوع" value={`${K(d.kpis.week_earnings)} ر.س`} color={LP.INFO} />
            <KpiCard icon="calendar-outline" label="الشهر" value={`${K(d.kpis.month_earnings)} ر.س`} color={LP.SUCCESS} />
            <KpiCard icon="trending-up" label="السنة" value={`${K(d.kpis.year_earnings)} ر.س`} color={LP.MAGENTA} />
          </View>

          <Section icon="bar-chart" title="توزيع المدخول الشهري" />
          <View style={st.chartBox}>
            <Sparkline data={d.month_series} color={LP.SUCCESS} height={80} />
          </View>
        </>
      )}
    </SheetShell>
  );
}

/* ═════════════════════════ BRANCH SHEET ═════════════════════════ */
export function BranchDetailSheet({ branchId, apiCall, onClose, onOpenEmployee }: any) {
  const [b, setB] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stats' | 'staff' | 'reviews'>('stats');

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const data = await apiCall(`/api/merchant/live-preview/branch/${branchId}`); if (alive) setB(data); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [branchId]);

  if (loading || !b) return (
    <SheetShell visible onClose={onClose} title="جاري التحميل..." icon="business">
      <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator color={LP.GOLD} /></View>
    </SheetShell>
  );

  const statusPill = (
    <View style={[st.statusPill, { backgroundColor: b.active ? '#065F4680' : '#3F3F4680' }]}>
      <View style={[st.dot, { backgroundColor: b.active ? LP.SUCCESS : LP.MUTED }]} />
      <Text style={[st.statusText, { color: b.active ? LP.SUCCESS : LP.MUTED }]}>{b.active ? 'نشط' : 'متوقف'}</Text>
    </View>
  );

  return (
    <SheetShell visible onClose={onClose} title={b.name} subtitle={`${b.city}${b.district ? ' · ' + b.district : ''}`}
      avatar={b.image} icon="business" statusPill={statusPill}>
      {/* Chips row */}
      <View style={st.centerRow}>
        {b.is_main && (
          <View style={[st.ratingChip, { backgroundColor: LP.GOLD + '20', borderColor: LP.GOLD }]}>
            <Ionicons name="ribbon" size={12} color={LP.GOLD} />
            <Text style={{ color: LP.GOLD, fontSize: 11, fontWeight: '800' }}>الفرع الرئيسي</Text>
          </View>
        )}
        <View style={st.ratingChip}>
          <Ionicons name="star" size={12} color={LP.GOLD} />
          <Text style={{ color: LP.TEXT, fontSize: 12, fontWeight: '900' }}>{b.rating.avg.toFixed(1)} ({b.rating.count})</Text>
        </View>
        <View style={st.ratingChip}>
          <Ionicons name="time" size={12} color={LP.INFO} />
          <Text style={{ color: LP.TEXT, fontSize: 11 }}>{b.open_hours}</Text>
        </View>
      </View>

      <View style={st.tabRow}>
        {[{ k: 'stats', l: 'الأداء', i: 'stats-chart' }, { k: 'staff', l: 'الموظفون', i: 'people' }, { k: 'reviews', l: 'التقييمات', i: 'star' }].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setTab(t.k as any)} style={[st.tab, tab === t.k && st.tabActive]}>
            <Ionicons name={t.i as any} size={12} color={tab === t.k ? LP.BG : LP.MUTED} />
            <Text style={[st.tabText, tab === t.k && { color: LP.BG, fontWeight: '900' }]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'stats' && (
        <>
          <Section icon="receipt" title="عدد الطلبات" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <KpiCard icon="today" label="اليوم" value={K(b.orders.today)} color={LP.GOLD} sub="طلب" />
            <KpiCard icon="calendar" label="الأمس" value={K(b.orders.yesterday)} color={LP.INFO} sub="طلب" />
            <KpiCard icon="calendar-outline" label="آخر يومين" value={K(b.orders.two_days)} color={LP.MAGENTA} sub="طلب" />
            <KpiCard icon="calendar-clear" label="الأسبوع" value={K(b.orders.week)} color={LP.WARN} sub="طلب" />
            <KpiCard icon="stats-chart" label="الشهر" value={K(b.orders.month)} color={LP.SUCCESS} sub="طلب" />
            <KpiCard icon="trending-up" label="السنة" value={KM(b.orders.year)} color={LP.DANGER} sub="طلب" />
          </View>

          <Section icon="cash" title="المدخولات" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <KpiCard icon="today" label="اليوم" value={`${KM(b.revenue.today)} ر.س`} color={LP.GOLD} />
            <KpiCard icon="cart" label="داخل الفرع" value={`${KM(b.revenue.in_store)} ر.س`} color={LP.INFO} />
            <KpiCard icon="phone-portrait" label="من التطبيق" value={`${KM(b.revenue.app)} ر.س`} color={LP.SUCCESS} />
            <KpiCard icon="calculator" label="إجمالي الشهر" value={`${KM(b.revenue.total_month)} ر.س`} color={LP.MAGENTA} />
          </View>

          {b.revenue.monthly_target > 0 && (
            <View style={[st.infoBox, { marginTop: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="flag" size={14} color={LP.GOLD} />
                <Text style={{ color: LP.GOLD, fontSize: 12, fontWeight: '900', marginStart: 6, flex: 1, textAlign: 'right' }}>الهدف الشهري</Text>
                <Text style={{ color: b.revenue.target_pct >= 100 ? LP.SUCCESS : LP.WARN, fontSize: 14, fontWeight: '900' }}>{b.revenue.target_pct}%</Text>
              </View>
              <View style={{ height: 10, backgroundColor: LP.BORDER_SOFT, borderRadius: 5, overflow: 'hidden' }}>
                <LinearGradient colors={[LP.GOLD, LP.GOLD_DIM]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ width: `${Math.min(100, b.revenue.target_pct)}%`, height: '100%', borderRadius: 5 }} />
              </View>
              <Text style={{ color: LP.MUTED, fontSize: 10, marginTop: 4, textAlign: 'right' }}>
                {KM(b.revenue.total_month)} من {KM(b.revenue.monthly_target)} ر.س
              </Text>
            </View>
          )}

          <Section icon="pulse" title="نبض المبيعات (30 يوم)" />
          <View style={st.chartBox}>
            <Sparkline data={b.revenue_series} color={LP.SUCCESS} height={80} />
          </View>

          <Section icon="location" title="معلومات الفرع" />
          <View style={st.infoBox}>
            <Row label="العنوان" value={b.address || '—'} />
            <Row label="الحي" value={b.district || '—'} />
            <Row label="ساعات العمل" value={b.open_hours} />
            <Row label="أيام العمل" value={(b.working_days || []).join(', ') || '—'} />
            <Row label="الجوال" value={b.phone} onPress={() => b.phone && Linking.openURL(`tel:${b.phone}`)} icon="call" />
            <Row label="البريد" value={b.email || '—'} onPress={() => b.email && Linking.openURL(`mailto:${b.email}`)} icon="mail" />
          </View>
        </>
      )}

      {tab === 'staff' && (
        <>
          <Section icon="people" title={`طاقم الفرع (${b.staff.length})`} />
          {b.staff.length === 0 ? (
            <Text style={{ color: LP.MUTED, textAlign: 'center', padding: 30 }}>لا يوجد موظفون مرتبطون بهذا الفرع</Text>
          ) : (
            b.staff.map((s: any) => (
              <EntityPill key={s.id} image={s.avatar} name={s.name} subtitle={`${s.job_title} · ${s.shift}`} icon="person"
                onPress={() => onOpenEmployee && onOpenEmployee(s.id)} />
            ))
          )}
        </>
      )}

      {tab === 'reviews' && (
        <>
          <Section icon="star" title="تقييمات العملاء" />
          <View style={st.infoBox}>
            <RatingBreakdown distribution={b.rating.distribution} total={b.rating.count} avg={b.rating.avg} />
          </View>
          {b.reviews.map((r: any, i: number) => (
            <View key={i} style={[st.reviewCard, { borderLeftColor: (r.rating || 0) >= 4 ? LP.SUCCESS : (r.rating || 0) === 3 ? LP.WARN : LP.DANGER }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: LP.TEXT, fontSize: 12, fontWeight: '900' }}>{r.user_name}</Text>
                <View style={{ flexDirection: 'row' }}>
                  {[1,2,3,4,5].map(s => <Ionicons key={s} name="star" size={10} color={s <= (r.rating || 0) ? LP.GOLD : LP.BORDER} />)}
                </View>
              </View>
              <Text style={st.reviewText}>{r.comment}</Text>
            </View>
          ))}
        </>
      )}
    </SheetShell>
  );
}

/* ═════════════════════════ MARKETER SHEET ═════════════════════════ */
export function MarketerDetailSheet({ marketerId, apiCall, onClose }: any) {
  const [m, setM] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const data = await apiCall(`/api/merchant/live-preview/marketer/${marketerId}`); if (alive) setM(data); }
      catch (e: any) { Alert.alert('خطأ', e.message); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [marketerId]);

  if (loading || !m) return (
    <SheetShell visible onClose={onClose} title="جاري التحميل..." icon="megaphone">
      <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator color={LP.GOLD} /></View>
    </SheetShell>
  );

  const platforms = Object.entries(m.platform_breakdown || {}).sort((a: any, b: any) => (b[1].revenue || 0) - (a[1].revenue || 0));
  const maxRev = Math.max(1, ...platforms.map((p: any) => p[1].revenue || 0));

  return (
    <SheetShell visible onClose={onClose} title={m.name} subtitle={`رمز: ${m.referral_code}`}
      avatar={m.avatar} icon="megaphone" accent={LP.WARN}>
      <View style={st.centerRow}>
        <View style={[st.ratingChip, { backgroundColor: PLATFORM_COLORS[m.top_platform] + '25', borderColor: PLATFORM_COLORS[m.top_platform] }]}>
          <Ionicons name={PLATFORM_ICON[m.top_platform] as any} size={12} color={PLATFORM_COLORS[m.top_platform]} />
          <Text style={{ color: PLATFORM_COLORS[m.top_platform], fontSize: 11, fontWeight: '900' }}>الأفضل: {PLATFORM_LABEL[m.top_platform]}</Text>
        </View>
        <View style={st.ratingChip}>
          <Ionicons name="trending-up" size={12} color={LP.SUCCESS} />
          <Text style={{ color: LP.TEXT, fontSize: 12, fontWeight: '900' }}>{m.kpis.conversion_rate}% تحويل</Text>
        </View>
      </View>

      <Section icon="cash" title="المدخولات" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <KpiCard icon="today" label="اليوم" value={`${K(m.kpis.today_earnings)} ر.س`} color={LP.GOLD} />
        <KpiCard icon="calendar" label="الأسبوع" value={`${K(m.kpis.week_earnings)} ر.س`} color={LP.INFO} />
        <KpiCard icon="calendar-outline" label="الشهر" value={`${K(m.kpis.month_earnings)} ر.س`} color={LP.SUCCESS} />
        <KpiCard icon="trending-up" label="السنة" value={`${KM(m.kpis.year_earnings)} ر.س`} color={LP.MAGENTA} />
      </View>

      <Section icon="analytics" title="أرقام أساسية" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <KpiCard icon="link" label="نقرات" value={KM(m.kpis.clicks)} color={LP.INFO} />
        <KpiCard icon="person" label="نقرات فريدة" value={KM(m.kpis.unique_clicks)} color={LP.MAGENTA} />
        <KpiCard icon="checkmark-circle" label="تحويلات" value={K(m.kpis.conversions)} color={LP.SUCCESS} />
        <KpiCard icon="cart" label="إجمالي المبيعات" value={`${KM(m.kpis.sales_total)} ر.س`} color={LP.GOLD} />
      </View>

      <Section icon="wallet" title="حالة العمولات" />
      <View style={st.infoBox}>
        <Row label="المكتسبة" value={`${K(m.kpis.commission_earned)} ر.س`} valueColor={LP.SUCCESS} />
        <Row label="قيد التسوية" value={`${K(m.kpis.commission_pending)} ر.س`} valueColor={LP.WARN} />
        <Row label="تم دفعها" value={`${K(m.kpis.commission_paid)} ر.س`} valueColor={LP.INFO} />
        <Row label="نسبة العمولة" value={`${m.commission_rate}%`} />
      </View>

      <Section icon="pie-chart" title="أفضل قنوات النشر" />
      {platforms.map(([plat, stats]: any) => (
        <HBar key={plat} label={`${PLATFORM_LABEL[plat] || plat}`}
          value={stats.revenue || 0} max={maxRev} color={PLATFORM_COLORS[plat] || LP.GOLD}
          secondary={`${K(stats.clicks || 0)} نقرة · ${K(stats.conversions || 0)} تحويل`} />
      ))}

      <Section icon="megaphone" title="أفضل المنشورات" />
      {(m.top_posts || []).map((p: any, i: number) => (
        <View key={i} style={st.postCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[st.platformIcon, { backgroundColor: PLATFORM_COLORS[p.platform] + '25' }]}>
              <Ionicons name={PLATFORM_ICON[p.platform] as any} size={14} color={PLATFORM_COLORS[p.platform] || LP.GOLD} />
            </View>
            <Text style={{ color: LP.TEXT, fontSize: 12, fontWeight: '800', flex: 1, textAlign: 'right' }}>{PLATFORM_LABEL[p.platform] || p.platform}</Text>
          </View>
          <Text style={{ color: LP.MUTED, fontSize: 11, marginTop: 6, textAlign: 'right' }} numberOfLines={2}>{p.preview}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Text style={{ color: LP.INFO, fontSize: 11, fontWeight: '800' }}>👁 {KM(p.clicks)} نقرة</Text>
            <Text style={{ color: LP.SUCCESS, fontSize: 11, fontWeight: '800' }}>💰 {KM(p.revenue)} ر.س</Text>
          </View>
        </View>
      ))}

      <Section icon="pulse" title="نبض العمولات (30 يوم)" />
      <View style={st.chartBox}>
        <Sparkline data={m.revenue_series} color={LP.WARN} height={80} />
      </View>

      <Section icon="person" title="بيانات المسوّق" />
      <View style={st.infoBox}>
        <Row label="الجوال" value={m.phone} onPress={() => m.phone && Linking.openURL(`tel:${m.phone}`)} icon="call" />
        <Row label="رمز الإحالة" value={m.referral_code} valueColor={LP.GOLD} />
        <Row label="عدد المشاركات" value={`${K(m.kpis.posts_shared)} منشور`} />
        <Row label="تاريخ الانضمام" value={(m.joined_at || '').slice(0, 10)} />
      </View>
    </SheetShell>
  );
}

/* ═════════════════════════ EMPLOYEE SHEET ═════════════════════════ */
export function EmployeeDetailSheet({ employeeId, apiCall, onClose, onOpenBranch }: any) {
  const [e, setE] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stats' | 'attendance' | 'notes'>('stats');
  const [addingNote, setAddingNote] = useState(false);
  const [noteRating, setNoteRating] = useState(5);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'positive' | 'improvement' | 'warning'>('positive');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { const data = await apiCall(`/api/merchant/live-preview/employee/${employeeId}`); setE(data); }
    catch (err: any) { Alert.alert('خطأ', err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [employeeId]);

  const submitNote = async () => {
    if (!noteText.trim()) { Alert.alert('تنبيه', 'اكتب الملاحظة أولاً'); return; }
    setSaving(true);
    try {
      await apiCall(`/api/merchant/live-preview/employee/${employeeId}/note`, {
        method: 'POST',
        body: JSON.stringify({ rating: noteRating, note: noteText.trim(), type: noteType }),
      });
      setNoteText(''); setAddingNote(false); setNoteRating(5); setNoteType('positive');
      await load();
      Alert.alert('تم', 'تم حفظ تقييم المشرف ✨');
    } catch (err: any) { Alert.alert('خطأ', err.message); }
    finally { setSaving(false); }
  };

  if (loading || !e) return (
    <SheetShell visible onClose={onClose} title="جاري التحميل..." icon="person">
      <View style={{ alignItems: 'center', padding: 40 }}><ActivityIndicator color={LP.GOLD} /></View>
    </SheetShell>
  );

  const statusPill = (
    <View style={[st.statusPill, { backgroundColor: e.active ? '#065F4680' : '#3F3F4680' }]}>
      <View style={[st.dot, { backgroundColor: e.active ? LP.SUCCESS : LP.MUTED }]} />
      <Text style={[st.statusText, { color: e.active ? LP.SUCCESS : LP.MUTED }]}>{e.active ? 'نشط' : 'موقوف'}</Text>
    </View>
  );

  return (
    <SheetShell visible onClose={onClose} title={e.name} subtitle={`${e.job_title}${e.department ? ' · ' + e.department : ''}`}
      avatar={e.avatar} icon="person" accent={LP.MAGENTA} statusPill={statusPill}>
      <View style={st.centerRow}>
        <View style={st.ratingChip}>
          <Ionicons name="star" size={12} color={LP.GOLD} />
          <Text style={{ color: LP.TEXT, fontSize: 12, fontWeight: '900' }}>تقييم المشرف: {e.supervisor_rating_avg.toFixed(1)}</Text>
        </View>
        <View style={st.ratingChip}>
          <Ionicons name="time" size={12} color={LP.INFO} />
          <Text style={{ color: LP.TEXT, fontSize: 11 }}>{e.shift_start}-{e.shift_end}</Text>
        </View>
      </View>

      <View style={st.tabRow}>
        {[{ k: 'stats', l: 'الأداء', i: 'stats-chart' }, { k: 'attendance', l: 'الحضور', i: 'calendar' }, { k: 'notes', l: 'ملاحظات المشرف', i: 'clipboard' }].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setTab(t.k as any)} style={[st.tab, tab === t.k && st.tabActive]}>
            <Ionicons name={t.i as any} size={12} color={tab === t.k ? LP.BG : LP.MUTED} />
            <Text style={[st.tabText, tab === t.k && { color: LP.BG, fontWeight: '900' }]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'stats' && (
        <>
          <Section icon="receipt" title="أداء الفواتير والطلبات" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <KpiCard icon="today" label="فواتير اليوم" value={K(e.kpis.today_invoices)} color={LP.GOLD} />
            <KpiCard icon="calendar" label="الأسبوع" value={K(e.kpis.week_invoices)} color={LP.INFO} />
            <KpiCard icon="calendar-outline" label="الشهر" value={K(e.kpis.month_invoices)} color={LP.SUCCESS} />
            <KpiCard icon="calculator" label="إجمالي" value={K(e.kpis.invoices_count)} color={LP.MAGENTA} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <KpiCard icon="cart" label="طلبات مُنجزة" value={K(e.kpis.orders_handled)} color={LP.INFO} />
            <KpiCard icon="cash" label="مبيعات إجمالية" value={`${KM(e.kpis.invoices_total)} ر.س`} color={LP.GOLD} />
            <KpiCard icon="people" label="عملاء" value={K(e.kpis.customers_served)} color={LP.SUCCESS} />
            <KpiCard icon="stats-chart" label="متوسط الفاتورة" value={`${K(e.kpis.avg_ticket)} ر.س`} color={LP.MAGENTA} />
          </View>

          <Section icon="wallet" title="الأجر" />
          <View style={st.infoBox}>
            <Row label="النظام" value={e.salary_type === 'monthly' ? 'راتب شهري' : 'بالساعة'} />
            {e.salary_type === 'monthly' ? (
              <Row label="الراتب الشهري" value={`${K(e.salary_monthly)} ر.س`} valueColor={LP.GOLD} />
            ) : (
              <Row label="أجر الساعة" value={`${K(e.hourly_rate)} ر.س`} valueColor={LP.GOLD} />
            )}
            <Row label="ساعات الدوام يومياً" value={`${e.shift_hours} ساعة`} />
            <Row label="الدوام" value={`${e.shift_start} - ${e.shift_end}`} />
            <Row label="تاريخ التوظيف" value={e.hire_date || '—'} />
          </View>

          {(e.bonuses?.length > 0 || e.deductions?.length > 0) && (
            <>
              <Section icon="calculator" title="المكافآت والخصومات" />
              <View style={st.infoBox}>
                {e.bonuses.map((b: any, i: number) => (
                  <View key={`bonus-${i}`} style={st.dedRow}>
                    <View style={[st.dedIcon, { backgroundColor: LP.SUCCESS + '30' }]}>
                      <Ionicons name="add" size={12} color={LP.SUCCESS} />
                    </View>
                    <Text style={{ color: LP.TEXT, fontSize: 11, flex: 1, textAlign: 'right' }}>{b.reason}</Text>
                    <Text style={{ color: LP.SUCCESS, fontSize: 12, fontWeight: '900' }}>+{K(b.amount)}</Text>
                  </View>
                ))}
                {e.deductions.map((d: any, i: number) => (
                  <View key={`ded-${i}`} style={st.dedRow}>
                    <View style={[st.dedIcon, { backgroundColor: LP.DANGER + '30' }]}>
                      <Ionicons name="remove" size={12} color={LP.DANGER} />
                    </View>
                    <Text style={{ color: LP.TEXT, fontSize: 11, flex: 1, textAlign: 'right' }}>{d.reason}</Text>
                    <Text style={{ color: LP.DANGER, fontSize: 12, fontWeight: '900' }}>−{K(d.amount)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {e.branches?.length > 0 && (
            <>
              <Section icon="business" title="الفروع" />
              {e.branches.map((b: any) => (
                <EntityPill key={b.id} image={b.image} name={b.name} subtitle={b.city} icon="business"
                  onPress={() => onOpenBranch && onOpenBranch(b.id)} />
              ))}
            </>
          )}
        </>
      )}

      {tab === 'attendance' && (
        <>
          <Section icon="calendar" title="سجل الحضور (الشهر)" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <KpiCard icon="checkmark-circle" label="أيام حضور" value={K(e.attendance.present_days)} color={LP.SUCCESS} />
            <KpiCard icon="close-circle" label="غياب" value={K(e.attendance.absent_days)} color={LP.DANGER} />
            <KpiCard icon="alarm" label="تأخير" value={K(e.attendance.late_days)} color={LP.WARN} />
            <KpiCard icon="airplane" label="إجازة" value={K(e.attendance.leave_days)} color={LP.INFO} />
          </View>
          <Section icon="key" title="الصلاحيات" />
          <View style={st.infoBox}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(e.permissions || []).map((p: string) => (
                <View key={p} style={st.permChip}>
                  <Ionicons name="shield-checkmark" size={11} color={LP.SUCCESS} />
                  <Text style={{ color: LP.TEXT, fontSize: 10, fontWeight: '700' }}>{p}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {tab === 'notes' && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
            <Text style={{ color: LP.GOLD, fontSize: 13, fontWeight: '900', flex: 1, textAlign: 'right' }}>ملاحظات المشرف</Text>
            <TouchableOpacity onPress={() => setAddingNote(true)} style={st.fabAdd}>
              <Ionicons name="add" size={16} color={LP.BG} />
              <Text style={{ color: LP.BG, fontSize: 11, fontWeight: '900' }}>إضافة تقييم</Text>
            </TouchableOpacity>
          </View>

          {e.supervisor_notes?.length === 0 && (
            <Text style={{ color: LP.MUTED, textAlign: 'center', padding: 40 }}>لا توجد ملاحظات بعد</Text>
          )}
          {e.supervisor_notes.map((n: any, i: number) => {
            const color = n.type === 'positive' ? LP.SUCCESS : n.type === 'warning' ? LP.DANGER : n.type === 'improvement' ? LP.WARN : LP.INFO;
            const label = n.type === 'positive' ? '👍 إيجابي' : n.type === 'warning' ? '⚠️ تحذير' : n.type === 'improvement' ? '📈 يحتاج تحسين' : '💬 عام';
            return (
              <View key={i} style={[st.noteCard, { borderLeftColor: color }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color, fontSize: 11, fontWeight: '900' }}>{label}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={{ flexDirection: 'row' }}>
                    {[1,2,3,4,5].map(s => <Ionicons key={s} name="star" size={10} color={s <= (n.rating || 0) ? LP.GOLD : LP.BORDER} />)}
                  </View>
                </View>
                <Text style={{ color: LP.TEXT, fontSize: 12, marginTop: 6, textAlign: 'right' }}>{n.note}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <Ionicons name="person-circle" size={12} color={LP.MUTED} />
                  <Text style={{ color: LP.MUTED, fontSize: 10, marginStart: 4 }}>{n.supervisor_name}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ color: LP.MUTED, fontSize: 10 }}>{(n.created_at || '').slice(0, 10)}</Text>
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Add-note Modal */}
      <Modal visible={addingNote} animationType="slide" transparent onRequestClose={() => setAddingNote(false)}>
        <View style={st.overlay}>
          <View style={[st.sheet, { maxHeight: '80%' }]}>
            <View style={st.handle} />
            <View style={{ padding: 18 }}>
              <Text style={{ color: LP.GOLD, fontSize: 16, fontWeight: '900', textAlign: 'right' }}>إضافة تقييم للمشرف</Text>
              <Text style={{ color: LP.MUTED, fontSize: 11, textAlign: 'right', marginTop: 2 }}>يظهر هذا التقييم في ملف الموظف</Text>

              <Text style={st.formLbl}>النوع</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { k: 'positive',    l: '👍 إيجابي',      c: LP.SUCCESS },
                  { k: 'improvement', l: '📈 تحسين',       c: LP.WARN },
                  { k: 'warning',     l: '⚠️ تحذير',       c: LP.DANGER },
                ].map((t: any) => (
                  <TouchableOpacity key={t.k} onPress={() => setNoteType(t.k)}
                    style={[st.typeChip, noteType === t.k && { backgroundColor: t.c + '30', borderColor: t.c }]}>
                    <Text style={{ color: noteType === t.k ? t.c : LP.MUTED, fontSize: 11, fontWeight: '900' }}>{t.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.formLbl}>التقييم</Text>
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
                {[1,2,3,4,5].map(s => (
                  <TouchableOpacity key={s} onPress={() => setNoteRating(s)}>
                    <Ionicons name="star" size={30} color={s <= noteRating ? LP.GOLD : LP.BORDER} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.formLbl}>الملاحظة</Text>
              <TextInput
                value={noteText} onChangeText={setNoteText}
                multiline placeholder="اكتب ملاحظتك للموظف..." placeholderTextColor={LP.MUTED}
                style={{
                  backgroundColor: LP.CARD, borderWidth: 1, borderColor: LP.BORDER,
                  color: LP.TEXT, borderRadius: 12, padding: 12, textAlign: 'right', minHeight: 100
                }}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <TouchableOpacity style={st.btnGhost} onPress={() => setAddingNote(false)}>
                  <Text style={{ color: LP.MUTED, fontWeight: '800' }}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.btnPrimary} onPress={submitNote} disabled={saving}>
                  {saving ? <ActivityIndicator color={LP.BG} /> :
                    <><Ionicons name="save" size={16} color={LP.BG} /><Text style={{ color: LP.BG, fontWeight: '900' }}>حفظ</Text></>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SheetShell>
  );
}

/* ─────── ROW HELPER ─────── */
function Row({ label, value, icon, valueColor, onPress }: any) {
  const Wrap: any = onPress ? TouchableOpacity : View;
  return (
    <Wrap onPress={onPress} activeOpacity={0.7} style={st.row}>
      <Text style={{ color: LP.MUTED, fontSize: 12, flex: 1, textAlign: 'right' }}>{label}</Text>
      <Text style={{ color: valueColor || LP.TEXT, fontSize: 12, fontWeight: '800', textAlign: 'left', maxWidth: '60%' }} numberOfLines={2}>{value}</Text>
      {icon && <Ionicons name={icon} size={14} color={LP.GOLD} style={{ marginStart: 6 }} />}
    </Wrap>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: LP.BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', borderTopWidth: 1, borderColor: LP.BORDER },
  handle: { width: 46, height: 4, borderRadius: 2, backgroundColor: '#3A3D48', alignSelf: 'center', marginTop: 8 },
  headerGlass: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: LP.BORDER, overflow: 'hidden' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', padding: 20 },
  heroAvatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3 },
  heroTitle: { color: LP.TEXT, fontSize: 18, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  heroSub: { color: LP.MUTED, fontSize: 12, marginTop: 3, textAlign: 'center' },
  centerRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 },
  ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '900' },
  tabRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, paddingVertical: 9, borderRadius: 999 },
  tabActive: { backgroundColor: LP.GOLD, borderColor: LP.GOLD },
  tabText: { color: LP.MUTED, fontSize: 11, fontWeight: '700' },
  chartBox: { backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 14, padding: 10, alignItems: 'center' },
  infoBox: { backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 14, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: LP.BORDER_SOFT },
  reviewCard: { backgroundColor: LP.CARD_2, borderRadius: 12, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: LP.BORDER_SOFT },
  reviewText: { color: LP.TEXT, fontSize: 12, marginTop: 6, textAlign: 'right', lineHeight: 18 },
  postCard: { backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT, borderRadius: 12, padding: 10, marginBottom: 8 },
  platformIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: LP.BORDER_SOFT },
  dedIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  permChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LP.SUCCESS + '15', borderWidth: 1, borderColor: LP.SUCCESS + '55', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  noteCard: { backgroundColor: LP.CARD_2, borderRadius: 12, padding: 10, marginBottom: 6, borderLeftWidth: 3, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: 1, borderColor: LP.BORDER_SOFT },
  fabAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LP.GOLD, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  formLbl: { color: LP.GOLD, fontSize: 12, fontWeight: '900', marginTop: 14, marginBottom: 8, textAlign: 'right' },
  typeChip: { backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  btnGhost: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: LP.CARD, borderWidth: 1, borderColor: LP.BORDER },
  btnPrimary: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: LP.GOLD },
});
