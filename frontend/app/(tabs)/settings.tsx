import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { useRouter } from 'expo-router';
import { useT, LANGUAGES } from '../../src/i18n';
import { useThemeMode } from '../../src/theme/mode';
import { useTheme } from '../../src/theme/ThemeContext';

export default function SettingsScreen() {
  const { colors, mode } = useTheme();
  const styles = useStylesStyles(colors);
  const { user, logout } = useAuth();
  const router = useRouter();
  const { t, lang, setLang, isRTL } = useT();
  const { toggle: toggleThemeLegacy } = useThemeMode();
  const { toggle: toggleTheme } = useTheme();
  const syncedToggle = async () => { await toggleTheme(); await toggleThemeLegacy(); };
  const [langModal, setLangModal] = useState(false);
  const [langSearch, setLangSearch] = useState('');

  const currentLang = LANGUAGES.find(l => l.code === lang);
  const chevronForward = isRTL ? 'chevron-back' : 'chevron-forward';

  const modeLabel = mode === 'dark' ? t('pf.modeDark') : mode === 'light' ? t('pf.modeLight') : t('pf.modeCustom');

  const handleLogout = () => {
    Alert.alert(t('auth.logout'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const filteredLangs = LANGUAGES.filter(l => {
    if (!langSearch) return true;
    const q = langSearch.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q) || l.code.includes(q);
  });

  const pickLang = async (code: any) => {
    await setLang(code);
    setLangModal(false);
    setLangSearch('');
  };

  const MenuItem = ({ icon, label, onPress, color, badge }: { icon: string; label: string; onPress?: () => void; color?: string; badge?: string }) => (
    <TouchableOpacity testID={`settings-${icon}`} style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconWrap, { backgroundColor: (color || colors.gold) + '25' }]}>
        <Ionicons name={icon as any} size={22} color={color || colors.gold} />
      </View>
      <Text style={styles.menuLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.menuRight}>
        {badge ? <View style={styles.badge}><Text style={styles.badgeText} numberOfLines={1}>{badge}</Text></View> : null}
        <Ionicons name={chevronForward} size={18} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>{t('common.profile')}</Text>

        {/* Profile Card */}
        <TouchableOpacity testID="profile-card" style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Ionicons name="person" size={32} color={colors.gold} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{user?.name}</Text>
            <Text style={styles.profilePhone}>{user?.phone}</Text>
          </View>
          <Ionicons name={chevronForward} size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Wallet + Points */}
        <TouchableOpacity style={styles.walletCard} onPress={() => router.push('/points' as any)}>
          <View style={styles.walletItem}>
            <Text style={styles.walletValue}>{user?.points || 0}</Text>
            <Text style={styles.walletLabel}>{t('points.title')}</Text>
          </View>
          <View style={styles.walletDivider} />
          <View style={styles.walletItem}>
            <Text style={styles.walletValue}>{user?.wallet_balance || 0} {t('common.currency')}</Text>
            <Text style={styles.walletLabel}>{t('pf.walletTotal')}</Text>
          </View>
        </TouchableOpacity>

        {/* Quick actions */}
        <View style={styles.menuSection}>
          <MenuItem icon="cart"              label={t('orders.title')}   onPress={() => router.push('/orders')} />
          <MenuItem icon="return-up-back"    label={t('pf.returns')}     color="#EF4444" onPress={() => router.push('/my-returns' as any)} />
          <MenuItem icon="construct"         label={t('pf.myServices')}  color="#F5C518" onPress={() => router.push('/my-services')} />
          <MenuItem icon="people"            label={t('gb.title')}       color="#EC4899" onPress={() => router.push('/group-buys' as any)} />
          <MenuItem icon="medal"             label={t('points.title')}   color="#F59E0B" onPress={() => router.push('/points' as any)} />
          <MenuItem icon="notifications"     label={t('notif.title')}    color="#3B82F6" onPress={() => router.push('/notifications' as any)} />
          <MenuItem icon="heart"             label={t('pf.favorites')}   onPress={() => router.push('/favorites')} />
          <MenuItem icon="shield-checkmark"  label={t('product.warranty')} onPress={() => router.push('/warranties')} />
          <MenuItem icon="location"          label={t('pf.addresses')}   onPress={() => router.push('/addresses')} />
          <MenuItem icon="receipt"           label={t('pf.invoices')}    onPress={() => router.push('/invoices')} />
          <MenuItem icon="wallet"            label={t('pf.wallet')}      onPress={() => router.push('/wallet')} />
        </View>

        <View style={styles.menuSection}>
          <MenuItem icon="storefront" label={t('pf.aboutStore')} color="#3366FF" onPress={() => router.push('/about-store')} />
          <MenuItem icon="headset"    label={t('pf.support')}    color="#10B981" onPress={() => router.push('/support')} />
          <MenuItem
            icon="language"
            label={t('settings.language')}
            color="#9333EA"
            badge={`${currentLang?.flag || ''} ${currentLang?.nativeName || ''}`}
            onPress={() => setLangModal(true)}
          />
          <MenuItem
            icon="color-palette"
            label={t('pf.appearance')}
            color={colors.gold}
            badge={modeLabel}
            onPress={() => router.push('/appearance' as any)}
          />
          <MenuItem
            icon={mode === 'dark' ? 'moon' : mode === 'light' ? 'sunny' : 'color-wand'}
            label={t('pf.quickMode')}
            color="#D4AF37"
            badge={modeLabel}
            onPress={syncedToggle}
          />
        </View>

        <View style={styles.menuSection}>
          <MenuItem icon="document-text"    label={t('pf.returnPolicy')} color="#52525B" />
          <MenuItem icon="shield-checkmark" label={t('pf.terms')}        color="#52525B" />
        </View>

        <TouchableOpacity testID="logout-button" style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          <Text style={styles.logoutText}>{t('auth.logout')}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Language Picker Modal */}
      <Modal visible={langModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLangModal(false)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.langHeader}>
            <TouchableOpacity onPress={() => setLangModal(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            <Text style={styles.langTitle}>🌐 {t('settings.changeLanguage')}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={langSearch}
              onChangeText={setLangSearch}
              placeholder={t('pf.searchLangPh')}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {filteredLangs.map(l => (
              <TouchableOpacity key={l.code} style={[styles.langRow, lang === l.code && styles.langRowActive]} onPress={() => pickLang(l.code)}>
                <Text style={styles.langFlag}>{l.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.langNative}>{l.nativeName}</Text>
                  <Text style={styles.langEng}>{l.name}</Text>
                </View>
                {lang === l.code && <Ionicons name="checkmark-circle" size={22} color={colors.gold} />}
              </TouchableOpacity>
            ))}
            {filteredLangs.length === 0 && <Text style={styles.noResult}>{t('pf.noResults')}</Text>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function useStylesStyles(c: any) {
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  pageTitle: { fontSize: 24, fontWeight: '800', color: c.text, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  profileCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, padding: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, marginBottom: 16 },
  avatarWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.goldSoft, alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 2 },
  profilePhone: { fontSize: 14, color: c.textSecondary },
  walletCard: { flexDirection: 'row', marginHorizontal: 20, padding: 20, backgroundColor: c.gold, borderRadius: 16, marginBottom: 20 },
  walletItem: { flex: 1, alignItems: 'center' },
  walletValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  walletLabel: { fontSize: 13, color: '#FFFFFF', opacity: 0.85 },
  walletDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  menuSection: { marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.divider },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  badge: { backgroundColor: c.goldSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 140 },
  badgeText: { fontSize: 11, color: c.gold, fontWeight: '600' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, paddingVertical: 16, borderRadius: 14, backgroundColor: c.redSoft, gap: 8 },
  logoutText: { fontSize: 16, fontWeight: '600', color: c.red },
  langHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.surface },
  langTitle: { fontSize: 17, fontWeight: '800', color: c.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surfaceElevated, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 14, color: c.text, padding: 0 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.surface },
  langRowActive: { backgroundColor: c.goldSoft },
  langFlag: { fontSize: 28 },
  langNative: { fontSize: 16, fontWeight: '700', color: c.text },
  langEng: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
  noResult: { textAlign: 'center', color: c.textDisabled, marginTop: 40, fontSize: 14 },
}), [c]);
}
