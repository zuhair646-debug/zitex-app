import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Share, Alert, StatusBar, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from './_layout';

const APP_LINK_BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || 'https://zitex.app').replace(/\/api\/?$/, '');

export default function MyAffiliate() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await apiCall('/api/affiliate/dashboard');
      setAccounts(a);
      if (a.length && selected >= a.length) setSelected(0);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selected]);
  useEffect(() => { load(); }, []);

  const cur = accounts[selected];
  const refLink = cur ? `${APP_LINK_BASE}/r/${cur.referral_code}` : '';

  const copy = async () => {
    if (!refLink) return;
    await Clipboard.setStringAsync(refLink);
    Alert.alert('✅ تم النسخ', 'رابط الإحالة في الحافظة');
  };
  const shareLink = async () => {
    if (!refLink) return;
    try { await Share.share({ message: `اطلب من Zitex عبر رابطي وادعمني 🎁\n${refLink}` }); } catch {}
  };
  const shareWhatsApp = () => {
    if (!refLink) return;
    const url = `https://wa.me/?text=${encodeURIComponent(`اطلب من Zitex عبر رابطي 🎁\n${refLink}`)}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
  };

  if (loading) return (
    <View style={s.root}><ActivityIndicator color="#F5C518" style={{ marginTop: 100 }} /></View>
  );
  if (!accounts.length) return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#F5C518" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>لوحة المسوّق</Text>
          <View style={s.iconBtn} />
        </View>
        <View style={s.emptyBox}>
          <Ionicons name="megaphone-outline" size={80} color="#4A4A4A" />
          <Text style={s.emptyTitle}>لا يوجد حساب مسوّق نشط</Text>
          <Text style={s.emptyDesc}>افتح تبويب "السوشال" وقدّم على أحد برامج التسويق بالعمولة</Text>
        </View>
      </SafeAreaView>
    </View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={22} color="#F5C518" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>لوحة المسوّق</Text>
          <View style={s.iconBtn} />
        </View>

        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#F5C518" />}>
          {accounts.length > 1 && (
            <ScrollView horizontal contentContainerStyle={s.tabRow} showsHorizontalScrollIndicator={false}>
              {accounts.map((a: any, i: number) => (
                <TouchableOpacity key={a.id} onPress={() => setSelected(i)} style={[s.merchTab, selected === i && s.merchTabActive]}>
                  <Text style={[s.merchTabText, selected === i && s.merchTabTextActive]}>{a.merchant_name || `تاجر #${i + 1}`}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Hero commission card */}
          <LinearGradient colors={['#F5C518', '#D4A017']} style={s.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={s.heroLabel}>عمولتك من كل عملية شراء</Text>
            <Text style={s.heroValue}>{cur.commission_percent}%</Text>
            <Text style={s.heroSub}>تاجر: {cur.merchant_name || 'Zitex Store'}</Text>
          </LinearGradient>

          {/* Referral link */}
          <View style={s.card}>
            <Text style={s.cardTitle}>🔗 رابط الإحالة الخاص بك</Text>
            <View style={s.linkBox}>
              <Text style={s.linkText} numberOfLines={1}>{refLink}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity onPress={copy} style={s.actionBtn}>
                <Ionicons name="copy" size={16} color="#0A0A0A" />
                <Text style={s.actionText}>نسخ</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareLink} style={s.actionBtn}>
                <Ionicons name="share-social" size={16} color="#0A0A0A" />
                <Text style={s.actionText}>مشاركة</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareWhatsApp} style={[s.actionBtn, { backgroundColor: '#25D366' }]}>
                <Ionicons name="logo-whatsapp" size={16} color="white" />
                <Text style={[s.actionText, { color: 'white' }]}>واتساب</Text>
              </TouchableOpacity>
            </View>
            <View style={s.codeChip}>
              <Text style={s.codeChipLabel}>كود الإحالة:</Text>
              <Text style={s.codeChipCode}>{cur.referral_code}</Text>
            </View>
          </View>

          {/* Analytics grid */}
          <View style={s.gridRow}>
            <View style={s.gridCell}>
              <Text style={s.gridNum}>{cur.total_clicks || 0}</Text>
              <Text style={s.gridLbl}>نقرة</Text>
            </View>
            <View style={s.gridCell}>
              <Text style={s.gridNum}>{cur.unique_visitors || 0}</Text>
              <Text style={s.gridLbl}>زائر فريد</Text>
            </View>
            <View style={s.gridCell}>
              <Text style={s.gridNum}>{cur.total_conversions || 0}</Text>
              <Text style={s.gridLbl}>تحويل</Text>
            </View>
          </View>

          <View style={s.gridRow}>
            <View style={[s.gridCell, s.gridCellGold]}>
              <Text style={s.gridNumGold}>{(cur.this_month_earnings || 0).toFixed(0)} ر.س</Text>
              <Text style={s.gridLbl}>هذا الشهر</Text>
            </View>
            <View style={[s.gridCell, s.gridCellGold]}>
              <Text style={s.gridNumGold}>{(cur.total_earnings || 0).toFixed(0)} ر.س</Text>
              <Text style={s.gridLbl}>مجموع الأرباح</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>💰 محفظتك</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={s.walletValue}>{(cur.wallet_balance || 0).toFixed(2)} ر.س</Text>
              <TouchableOpacity style={s.withdrawBtn}
                onPress={() => {
                  if ((cur.wallet_balance || 0) < 50) Alert.alert('الحد الأدنى', 'يتم السحب من 50 ر.س');
                  else Alert.alert('طلب السحب', 'سيتم التواصل معك خلال 3 أيام عمل');
                }}>
                <Text style={s.withdrawText}>سحب</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!!cur.incentives && (
            <View style={s.incentivesBox}>
              <Text style={s.incentivesTitle}>🎁 الحوافز</Text>
              <Text style={s.incentivesText}>{cur.incentives}</Text>
            </View>
          )}

          <View style={s.card}>
            <Text style={s.cardTitle}>📋 أحدث التحويلات</Text>
            {(!cur.recent_conversions || cur.recent_conversions.length === 0) ? (
              <Text style={s.emptyHist}>لم يتم أي تحويل عبر رابطك بعد. شارك الرابط للمتابعين.</Text>
            ) : (
              cur.recent_conversions.map((c: any) => (
                <View key={c.id} style={s.histRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.histOrder}>طلب #{c.order_id?.slice(-6) || '—'}</Text>
                    <Text style={s.histDate}>{new Date(c.created_at).toLocaleDateString('ar')}</Text>
                  </View>
                  <Text style={s.histAmount}>+{(c.commission_amount || 0).toFixed(2)} ر.س</Text>
                </View>
              ))
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: 'white' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: 'white', fontSize: 16, fontWeight: '800', marginTop: 16 },
  emptyDesc: { color: '#9CA3AF', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  tabRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  merchTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#1F1F1F', borderWidth: 1, borderColor: '#2A2A2A' },
  merchTabActive: { backgroundColor: '#F5C518', borderColor: '#F5C518' },
  merchTabText: { color: '#9CA3AF', fontWeight: '700', fontSize: 12 },
  merchTabTextActive: { color: '#0A0A0A', fontWeight: '800' },
  hero: { margin: 16, padding: 22, borderRadius: 16, alignItems: 'center' },
  heroLabel: { color: '#0A0A0A', fontSize: 12, fontWeight: '700' },
  heroValue: { color: '#0A0A0A', fontSize: 48, fontWeight: '900', marginVertical: 6 },
  heroSub: { color: '#0A0A0A', fontSize: 13 },
  card: { backgroundColor: '#151515', margin: 16, marginTop: 8, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#2A2A2A' },
  cardTitle: { color: '#F5C518', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  linkBox: { backgroundColor: '#0A0A0A', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2E2404' },
  linkText: { color: 'white', fontFamily: 'monospace', fontSize: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F5C518', paddingVertical: 10, borderRadius: 8 },
  actionText: { color: '#0A0A0A', fontWeight: '800', fontSize: 12 },
  codeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start', backgroundColor: '#2E2404', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  codeChipLabel: { color: '#9CA3AF', fontSize: 11 },
  codeChipCode: { color: '#F5C518', fontFamily: 'monospace', fontWeight: '900' },
  gridRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  gridCell: { flex: 1, backgroundColor: '#151515', padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A', marginBottom: 8 },
  gridCellGold: { borderColor: '#F5C518' },
  gridNum: { color: 'white', fontSize: 20, fontWeight: '900' },
  gridNumGold: { color: '#F5C518', fontSize: 20, fontWeight: '900' },
  gridLbl: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  walletValue: { flex: 1, color: '#F5C518', fontSize: 22, fontWeight: '900' },
  withdrawBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: '#F5C518' },
  withdrawText: { color: '#0A0A0A', fontWeight: '800' },
  incentivesBox: { backgroundColor: '#2E2404', margin: 16, marginTop: 0, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#F5C518' },
  incentivesTitle: { color: '#F5C518', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  incentivesText: { color: 'white', fontSize: 13, lineHeight: 20 },
  emptyHist: { color: '#6B7280', fontSize: 12, textAlign: 'center', padding: 20 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  histOrder: { color: 'white', fontSize: 13, fontWeight: '700' },
  histDate: { color: '#6B7280', fontSize: 11 },
  histAmount: { color: '#10B981', fontSize: 14, fontWeight: '900' },
});
