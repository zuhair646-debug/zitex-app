/**
 * Appearance Settings Screen — v2.0.0
 * Global screen for: theme mode (Dark / Light / Custom) + custom colors + font family.
 * Accessible from Customer Settings, Merchant More, Driver, Chamber, Marketer, Admin sections.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useTheme,
  ThemeMode,
  CustomAppearance,
  CUSTOM_PRESETS,
  FONT_OPTIONS,
  FontFamilyId,
  DEFAULT_CUSTOM,
} from '../src/theme/ThemeContext';
import { useT } from '../src/i18n';

// Curated color swatches for the picker (16 harmonized options)
const COLOR_SWATCHES = [
  '#0A0A0A', '#17151A', '#20232B', '#2E2A32',
  '#FFFFFF', '#F4F4F6', '#EBEAEE', '#DAD8DE',
  '#C9A85C', '#B8924A', '#F5B547', '#D98F22',
  '#6EA8FF', '#2A75E6', '#4CD69C', '#2DAB76',
  '#FF6B6B', '#E5484D', '#EC4899', '#7B5EF0',
  '#0B1220', '#1A1206', '#0A1410', '#1A0F14',
];

const TEXT_SWATCHES = [
  '#FFFFFF', '#EFECE7', '#F5EBD5', '#E8EEFA',
  '#1C1B20', '#2A2820', '#0F2A3A', '#000000',
  '#C9A85C', '#B8924A', '#6EA8FF', '#4CD69C',
];

export default function AppearanceScreen() {
  const router = useRouter();
  const { lang } = useT();
  const { mode, colors, custom, fontFamily, setMode, setCustom, setFontFamily } = useTheme();
  const isAr = lang === 'ar';

  const [showColorPicker, setShowColorPicker] = useState<null | keyof CustomAppearance>(null);
  const [draftCustom, setDraftCustom] = useState<CustomAppearance>(custom);

  const S = createStyles(colors, fontFamily);

  const handlePickMode = useCallback(async (m: ThemeMode) => {
    await setMode(m);
  }, [setMode]);

  const handlePickPreset = useCallback(async (preset: CustomAppearance) => {
    setDraftCustom(preset);
    await setCustom(preset);
    if (mode !== 'custom') await setMode('custom');
  }, [setCustom, setMode, mode]);

  const handleUpdateCustom = useCallback(async (key: keyof CustomAppearance, value: string) => {
    const next = { ...draftCustom, [key]: value };
    setDraftCustom(next);
    await setCustom(next);
    if (mode !== 'custom') await setMode('custom');
  }, [draftCustom, setCustom, setMode, mode]);

  const handleReset = useCallback(async () => {
    Alert.alert(
      isAr ? 'إعادة التعيين' : 'Reset',
      isAr ? 'هل تريد إعادة تعيين المظهر إلى الافتراضي؟' : 'Reset appearance to default?',
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: isAr ? 'إعادة' : 'Reset',
          style: 'destructive',
          onPress: async () => {
            setDraftCustom(DEFAULT_CUSTOM);
            await setCustom(DEFAULT_CUSTOM);
            await setMode('dark');
            await setFontFamily('system');
          },
        },
      ]
    );
  }, [isAr, setCustom, setMode, setFontFamily]);

  const openColorPicker = (key: keyof CustomAppearance) => {
    setShowColorPicker(key);
  };

  const pickColor = (color: string) => {
    if (showColorPicker) {
      handleUpdateCustom(showColorPicker, color);
    }
    setShowColorPicker(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={colors.statusBar} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.header }}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <Ionicons name={isAr ? 'chevron-forward' : 'chevron-back'} size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={S.headerTitle}>{isAr ? 'المظهر والخطوط' : 'Appearance & Fonts'}</Text>
          <TouchableOpacity onPress={handleReset} style={S.resetBtn}>
            <Ionicons name="refresh" size={20} color={colors.gold} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* ── Mode selector ── */}
        <Text style={S.sectionTitle}>{isAr ? 'وضع العرض' : 'Display Mode'}</Text>
        <View style={S.modeRow}>
          <ModeCard
            icon="moon"
            label={isAr ? 'ليلي' : 'Dark'}
            selected={mode === 'dark'}
            onPress={() => handlePickMode('dark')}
            colors={colors}
            fontFamily={fontFamily}
          />
          <ModeCard
            icon="sunny"
            label={isAr ? 'نهاري' : 'Light'}
            selected={mode === 'light'}
            onPress={() => handlePickMode('light')}
            colors={colors}
            fontFamily={fontFamily}
          />
          <ModeCard
            icon="color-palette"
            label={isAr ? 'مخصص' : 'Custom'}
            selected={mode === 'custom'}
            onPress={() => handlePickMode('custom')}
            colors={colors}
            fontFamily={fontFamily}
          />
        </View>

        {/* ── Font family selector ── */}
        <Text style={S.sectionTitle}>{isAr ? 'الخط' : 'Font Family'}</Text>
        <View style={S.fontList}>
          {FONT_OPTIONS.map(opt => {
            const selected = fontFamily === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[S.fontRow, selected && S.fontRowSelected]}
                onPress={() => setFontFamily(opt.id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[
                    S.fontLabel,
                    { fontFamily: opt.regular },
                  ]}>
                    {isAr ? opt.labelAr : opt.label}
                  </Text>
                  <Text style={[
                    S.fontSample,
                    { fontFamily: opt.regular },
                  ]}>
                    {isAr ? 'مرحبا بك في زنركس • Zenrex Store' : 'The quick brown fox • أهلا زنركس'}
                  </Text>
                </View>
                <View style={[S.radio, selected && S.radioSelected]}>
                  {selected && <View style={S.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Custom mode section ── */}
        {mode === 'custom' && (
          <>
            {/* Presets */}
            <Text style={S.sectionTitle}>{isAr ? 'قوالب جاهزة' : 'Ready Presets'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {CUSTOM_PRESETS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={S.presetCard}
                  onPress={() => handlePickPreset(p.appearance)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[p.appearance.bg, p.appearance.surfaceElevated] as any}
                    style={S.presetGradient}
                  >
                    <View style={[S.presetSample, { backgroundColor: p.appearance.surface, borderColor: p.appearance.border }]}>
                      <Text style={[S.presetSampleText, { color: p.appearance.text, fontFamily: FONT_OPTIONS.find(f => f.id === fontFamily)?.regular }]}>
                        Aa
                      </Text>
                      <View style={[S.presetSampleDot, { backgroundColor: p.appearance.gold }]} />
                    </View>
                  </LinearGradient>
                  <Text style={S.presetLabel}>{isAr ? p.labelAr : p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Base picker */}
            <Text style={S.sectionTitle}>{isAr ? 'الأساس' : 'Base Palette'}</Text>
            <View style={S.baseRow}>
              <TouchableOpacity
                style={[S.baseChip, custom.base === 'dark' && S.baseChipActive]}
                onPress={() => handleUpdateCustom('base', 'dark' as any)}
              >
                <Ionicons name="moon" size={16} color={custom.base === 'dark' ? colors.gold : colors.textSecondary} />
                <Text style={[S.baseChipText, custom.base === 'dark' && { color: colors.gold }]}>
                  {isAr ? 'داكن' : 'Dark'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.baseChip, custom.base === 'light' && S.baseChipActive]}
                onPress={() => handleUpdateCustom('base', 'light' as any)}
              >
                <Ionicons name="sunny" size={16} color={custom.base === 'light' ? colors.gold : colors.textSecondary} />
                <Text style={[S.baseChipText, custom.base === 'light' && { color: colors.gold }]}>
                  {isAr ? 'فاتح' : 'Light'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Individual color pickers */}
            <Text style={S.sectionTitle}>{isAr ? 'الألوان' : 'Colors'}</Text>
            <View style={S.colorList}>
              <ColorRow
                labelAr="لون الخلفية" label="Background" value={custom.bg}
                onPress={() => openColorPicker('bg')}
                colors={colors} fontFamily={fontFamily}
              />
              <ColorRow
                labelAr="لون البطاقات" label="Cards / Surface" value={custom.surface}
                onPress={() => openColorPicker('surface')}
                colors={colors} fontFamily={fontFamily}
              />
              <ColorRow
                labelAr="مربعات مرتفعة" label="Elevated Surface" value={custom.surfaceElevated}
                onPress={() => openColorPicker('surfaceElevated')}
                colors={colors} fontFamily={fontFamily}
              />
              <ColorRow
                labelAr="لون الكتابة الأساسية" label="Primary Text" value={custom.text}
                onPress={() => openColorPicker('text')}
                colors={colors} fontFamily={fontFamily}
              />
              <ColorRow
                labelAr="لون الكتابة الثانوية" label="Secondary Text" value={custom.textSecondary}
                onPress={() => openColorPicker('textSecondary')}
                colors={colors} fontFamily={fontFamily}
              />
              <ColorRow
                labelAr="لون التمييز (ذهبي)" label="Accent (Gold)" value={custom.gold}
                onPress={() => openColorPicker('gold')}
                colors={colors} fontFamily={fontFamily}
              />
              <ColorRow
                labelAr="لون الحدود" label="Borders" value={custom.border}
                onPress={() => openColorPicker('border')}
                colors={colors} fontFamily={fontFamily}
              />
            </View>
          </>
        )}

        {/* Live Preview Card */}
        <Text style={S.sectionTitle}>{isAr ? 'المعاينة المباشرة' : 'Live Preview'}</Text>
        <View style={S.previewCard}>
          <View style={S.previewHeaderBar}>
            <View style={[S.previewDot, { backgroundColor: colors.gold }]} />
            <Text style={S.previewTitle}>{isAr ? 'زنركس ستور' : 'Zenrex Store'}</Text>
          </View>
          <Text style={S.previewBody}>
            {isAr
              ? 'هذا نص تجريبي يوضح كيف ستبدو الكتابة والألوان في التطبيق. مرحباً بك في تجربتك الفاخرة.'
              : 'This is a sample preview showing how text and colors will appear across the app. Welcome to your luxe experience.'}
          </Text>
          <View style={S.previewRow}>
            <View style={S.previewChip}>
              <Text style={S.previewChipText}>{isAr ? 'منتج' : 'Product'}</Text>
            </View>
            <View style={[S.previewChip, { backgroundColor: colors.goldSoft }]}>
              <Text style={[S.previewChipText, { color: colors.gold }]}>
                {isAr ? 'خصم 20%' : '20% off'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={S.previewButton}>
            <Text style={S.previewButtonText}>{isAr ? 'زر التمييز' : 'Accent Button'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Color picker modal */}
      <Modal visible={!!showColorPicker} transparent animationType="slide" onRequestClose={() => setShowColorPicker(null)}>
        <Pressable style={S.modalBackdrop} onPress={() => setShowColorPicker(null)}>
          <Pressable style={S.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>{isAr ? 'اختر لون' : 'Pick a color'}</Text>
            <View style={S.swatchGrid}>
              {(showColorPicker === 'text' || showColorPicker === 'textSecondary' ? TEXT_SWATCHES : COLOR_SWATCHES).map(sw => (
                <TouchableOpacity
                  key={sw}
                  style={[S.swatch, { backgroundColor: sw }]}
                  onPress={() => pickColor(sw)}
                >
                  {showColorPicker && draftCustom[showColorPicker] === sw && (
                    <Ionicons name="checkmark" size={20} color={isLightColor(sw) ? '#000' : '#FFF'} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={S.modalHint}>{isAr ? 'أو أدخل كود HEX' : 'Or enter HEX code'}</Text>
            <HexInput
              initial={showColorPicker ? draftCustom[showColorPicker] as string : '#000000'}
              onSubmit={(hex) => pickColor(hex)}
              colors={colors}
              fontFamily={fontFamily}
              isAr={isAr}
            />

            <TouchableOpacity style={S.modalClose} onPress={() => setShowColorPicker(null)}>
              <Text style={S.modalCloseText}>{isAr ? 'إغلاق' : 'Close'}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────
function ModeCard({ icon, label, selected, onPress, colors, fontFamily }: any) {
  const S = createStyles(colors, fontFamily);
  return (
    <TouchableOpacity style={[S.modeCard, selected && S.modeCardSelected]} onPress={onPress} activeOpacity={0.85}>
      <View style={[S.modeIcon, selected && { backgroundColor: colors.goldSoft }]}>
        <Ionicons name={icon} size={24} color={selected ? colors.gold : colors.textSecondary} />
      </View>
      <Text style={[S.modeLabel, selected && { color: colors.gold }]}>{label}</Text>
      {selected && (
        <View style={S.modeCheck}>
          <Ionicons name="checkmark-circle" size={20} color={colors.gold} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function ColorRow({ labelAr, label, value, onPress, colors, fontFamily }: any) {
  const S = createStyles(colors, fontFamily);
  return (
    <TouchableOpacity style={S.colorRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[S.colorSwatch, { backgroundColor: value, borderColor: colors.border }]} />
      <View style={{ flex: 1 }}>
        <Text style={S.colorRowLabel}>{labelAr}</Text>
        <Text style={S.colorRowHex}>{value.toUpperCase()}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

function HexInput({ initial, onSubmit, colors, fontFamily, isAr }: any) {
  const [text, setText] = useState(initial);
  const valid = /^#([0-9A-Fa-f]{6})$/.test(text);
  const S = createStyles(colors, fontFamily);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <TextInput
        style={[S.hexInput, !valid && { borderColor: colors.red }]}
        value={text}
        onChangeText={setText}
        autoCapitalize="characters"
        maxLength={7}
        placeholder="#000000"
        placeholderTextColor={colors.textDisabled}
      />
      <TouchableOpacity
        style={[S.hexApply, !valid && { opacity: 0.4 }]}
        disabled={!valid}
        onPress={() => onSubmit(text)}
      >
        <Text style={S.hexApplyText}>{isAr ? 'تطبيق' : 'Apply'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 155;
}

// ── Styles ───────────────────────────────────────────────
function createStyles(c: any, fontFamily: FontFamilyId) {
  const ff = FONT_OPTIONS.find(f => f.id === fontFamily) || FONT_OPTIONS[0];
  const F = { regular: ff.regular, medium: ff.medium, bold: ff.bold };
  return StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
      backgroundColor: c.header,
    },
    backBtn: { padding: 6, width: 40 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: c.text, fontFamily: F.bold },
    resetBtn: { padding: 6, width: 40, alignItems: 'flex-end' },

    sectionTitle: {
      fontSize: 13, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginTop: 20, marginBottom: 10, fontFamily: F.bold,
    },

    modeRow: { flexDirection: 'row', gap: 10 },
    modeCard: {
      flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: 16, paddingVertical: 18, alignItems: 'center', position: 'relative',
    },
    modeCardSelected: { borderColor: c.gold, backgroundColor: c.surfaceElevated },
    modeIcon: {
      width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
      marginBottom: 8, backgroundColor: c.surfaceElevated,
    },
    modeLabel: { fontSize: 13, fontWeight: '700', color: c.text, fontFamily: F.bold },
    modeCheck: { position: 'absolute', top: 8, right: 8 },

    fontList: { gap: 8 },
    fontRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: 14, padding: 14,
    },
    fontRowSelected: { borderColor: c.gold, backgroundColor: c.surfaceElevated },
    fontLabel: { fontSize: 15, fontWeight: '700', color: c.text },
    fontSample: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
    radio: {
      width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    radioSelected: { borderColor: c.gold },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.gold },

    presetCard: { width: 120, alignItems: 'center' },
    presetGradient: {
      width: 120, height: 90, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.border,
    },
    presetSample: {
      width: 80, height: 60, borderRadius: 10, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    },
    presetSampleText: { fontSize: 20, fontWeight: '700', fontFamily: F.bold },
    presetSampleDot: { width: 10, height: 10, borderRadius: 5 },
    presetLabel: { fontSize: 12, fontWeight: '600', color: c.text, marginTop: 8, fontFamily: F.medium, textAlign: 'center' },

    baseRow: { flexDirection: 'row', gap: 10 },
    baseChip: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: 12,
    },
    baseChipActive: { borderColor: c.gold, backgroundColor: c.goldSoft },
    baseChipText: { fontSize: 14, fontWeight: '700', color: c.text, fontFamily: F.bold },

    colorList: { gap: 8 },
    colorRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: 12, padding: 12,
    },
    colorSwatch: {
      width: 44, height: 44, borderRadius: 10, borderWidth: 1,
    },
    colorRowLabel: { fontSize: 14, fontWeight: '700', color: c.text, fontFamily: F.bold },
    colorRowHex: { fontSize: 12, color: c.textSecondary, marginTop: 2, fontFamily: F.regular },

    previewCard: {
      backgroundColor: c.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: c.border,
    },
    previewHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    previewDot: { width: 8, height: 8, borderRadius: 4 },
    previewTitle: { fontSize: 16, fontWeight: '800', color: c.text, fontFamily: F.bold },
    previewBody: { fontSize: 14, color: c.textSecondary, lineHeight: 22, fontFamily: F.regular, marginBottom: 12 },
    previewRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    previewChip: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
      backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.border,
    },
    previewChipText: { fontSize: 12, fontWeight: '700', color: c.text, fontFamily: F.bold },
    previewButton: {
      backgroundColor: c.gold, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    },
    previewButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14, fontFamily: F.bold },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingHorizontal: 20, paddingTop: 8, paddingBottom: 30,
      borderWidth: 1, borderColor: c.border, borderBottomWidth: 0,
    },
    modalHandle: {
      width: 40, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: 'center', marginBottom: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.text, textAlign: 'center', marginBottom: 12, fontFamily: F.bold },
    swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
    swatch: {
      width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    modalHint: { fontSize: 12, color: c.textSecondary, marginTop: 16, fontFamily: F.regular },
    hexInput: {
      flex: 1, backgroundColor: c.bg, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8, color: c.text, fontFamily: F.medium,
    },
    hexApply: { backgroundColor: c.gold, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
    hexApplyText: { color: '#FFF', fontWeight: '700', fontFamily: F.bold },
    modalClose: {
      marginTop: 16, paddingVertical: 12, backgroundColor: c.surfaceElevated, borderRadius: 10, alignItems: 'center',
    },
    modalCloseText: { fontWeight: '700', color: c.text, fontFamily: F.bold },
  });
}
