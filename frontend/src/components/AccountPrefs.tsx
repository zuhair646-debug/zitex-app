/**
 * Account preferences block — the exact pattern of the merchant panel (app/merchant/more.tsx):
 * Appearance page, Dark/Light switch, Language bottom sheet. Same i18n keys, same behaviour.
 */
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useT, LANGUAGES } from '../i18n';
import { colors, spacing, radius, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { useThemeMode } from '../theme/mode';

export default function AccountPrefs({ testPrefix = 'prefs' }: { testPrefix?: string }) {
  const s = useStyles();
  const { lang, setLang, t, isRTL } = useT();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { toggle: toggleThemeLegacy } = useThemeMode();
  const syncedToggleTheme = async () => { await toggleTheme(); await toggleThemeLegacy(); };
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const chevron = isRTL ? 'chevron-back' : 'chevron-forward';

  return (
    <>
      <View style={s.groupCard}>
        <TouchableOpacity testID={`${testPrefix}-appearance`} style={s.prefRow} onPress={() => router.push('/appearance' as any)} activeOpacity={0.7}>
          <View style={s.prefLeft}>
            <View style={[s.prefIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="color-palette" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.prefTitle} numberOfLines={1}>{t('mo.appearance.title')}</Text>
              <Text style={s.prefSub} numberOfLines={2}>{t('mo.appearance.sub')}</Text>
            </View>
          </View>
          <Ionicons name={chevron} size={18} color={colors.onSurfaceSecondary} />
        </TouchableOpacity>

        <View style={s.divider} />

        <TouchableOpacity testID={`${testPrefix}-theme-toggle`} style={s.prefRow} onPress={syncedToggleTheme} activeOpacity={0.7}>
          <View style={s.prefLeft}>
            <View style={[s.prefIcon, { backgroundColor: (isDark ? '#F5B547' : '#6EA8FF') + '25' }]}>
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? '#F5B547' : '#6EA8FF'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.prefTitle} numberOfLines={1}>{isDark ? t('mo.themeDark') : t('mo.themeLight')}</Text>
              <Text style={s.prefSub} numberOfLines={2}>{t('mo.themeToggleHint')}</Text>
            </View>
          </View>
          <View style={[s.switchTrack, isDark && s.switchTrackOn]}>
            <View style={[s.switchThumb, isDark && s.switchThumbOn]} />
          </View>
        </TouchableOpacity>

        <View style={s.divider} />

        <TouchableOpacity testID={`${testPrefix}-language`} style={s.prefRow} onPress={() => setLangOpen(true)} activeOpacity={0.7}>
          <View style={s.prefLeft}>
            <View style={[s.prefIcon, { backgroundColor: '#A895FF25' }]}>
              <Ionicons name="language" size={20} color="#A895FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.prefTitle} numberOfLines={1}>{t('settings.language')}</Text>
              <Text style={s.prefSub} numberOfLines={1}>{currentLang.flag}  {currentLang.nativeName}</Text>
            </View>
          </View>
          <Ionicons name={chevron} size={18} color={colors.onSurfaceSecondary} />
        </TouchableOpacity>
      </View>

      <Modal transparent animationType="slide" visible={langOpen} onRequestClose={() => setLangOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setLangOpen(false)}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{t('settings.changeLanguage')}</Text>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map(L => (
                <TouchableOpacity key={L.code} testID={`${testPrefix}-lang-${L.code}`} style={s.langRow}
                  onPress={async () => { await setLang(L.code); setLangOpen(false); }}>
                  <Text style={{ fontSize: 22 }}>{L.flag}</Text>
                  <View style={{ flex: 1 }}><Text style={s.langNative}>{L.nativeName}</Text></View>
                  {L.code === lang && <Ionicons name="checkmark-circle" size={22} color={colors.brand} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    groupCard: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    prefRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
    prefLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    prefIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    prefTitle: { ...typography.body, color: colors.onSurface, fontWeight: '700' as any },
    prefSub: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
    switchTrack: { width: 44, height: 24, borderRadius: 12, backgroundColor: colors.border, padding: 2, justifyContent: 'center' },
    switchTrackOn: { backgroundColor: colors.brand },
    switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
    switchThumbOn: { alignSelf: 'flex-end' },
    divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
    modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 32, maxHeight: '85%' },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
    modalTitle: { ...typography.titleMedium, color: colors.onSurface, textAlign: 'center', marginBottom: spacing.md },
    langRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    langNative: { ...typography.body, color: colors.onSurface, fontWeight: '700' as any },
  }), [themeKey]);
}
