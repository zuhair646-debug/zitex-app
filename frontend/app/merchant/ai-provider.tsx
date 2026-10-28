import { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { useT } from '../../src/i18n';
import { tSync, TX } from '../../src/useAutoT';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';

type Cfg = { provider: 'emergent' | 'custom'; base_url: string; model: string; api_key: string; has_key?: boolean; fallback: boolean };

export default function AiProvider() {
  const s = useStyles();
  const router = useRouter();
  const { apiCall } = useAuth();
  const { lang, t, isRTL } = useT();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiCall('/api/admin/translation-provider').then(setCfg).catch((e: any) => Alert.alert(tSync('خطأ', lang), e.message));
  }, []);

  if (!cfg) return <View style={s.center}><ActivityIndicator size="large" color={colors.brand} /></View>;
  const set = (p: Partial<Cfg>) => { setCfg({ ...cfg, ...p }); setResult(null); };

  const save = async () => {
    setSaving(true);
    try {
      setCfg(await apiCall('/api/admin/translation-provider', { method: 'PUT', body: JSON.stringify(cfg) }));
      Alert.alert(tSync('تم الحفظ', lang), tSync('تم تحديث مزوّد الترجمة', lang));
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await apiCall('/api/admin/translation-provider/test', { method: 'POST', body: JSON.stringify(cfg) });
      setResult({ ok: r.ok, text: r.ok ? r.sample : r.error });
    } catch (e: any) { setResult({ ok: false, text: e.message }); }
    finally { setTesting(false); }
  };

  const Option = ({ value, title, sub, icon }: { value: Cfg['provider']; title: string; sub: string; icon: any }) => {
    const on = cfg.provider === value;
    return (
      <TouchableOpacity testID={`provider-${value}`} style={[s.option, on && s.optionOn]} onPress={() => set({ provider: value })} activeOpacity={0.8}>
        <Ionicons name={icon} size={22} color={on ? colors.brand : colors.onSurfaceSecondary} />
        <View style={{ flex: 1 }}>
          <TX style={s.optTitle}>{title}</TX>
          <TX style={s.optSub}>{sub}</TX>
        </View>
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.brand : colors.border} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.iconBtn}>
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{t('mo.aiProvider.title')}</Text>
        <View style={s.iconBtn} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <TX style={s.note}>كل الترجمات تمر من هنا. الترجمات المحفوظة مسبقاً تبقى كما هي ولا تُعاد.</TX>
          <Option value="emergent" icon="sparkles" title="الذكاء المدمج في التطبيق (الحالي)" sub="بدون إعداد، الدفع من رصيد المفتاح الموحّد" />
          <Option value="custom" icon="server" title="منصتي الخاصة" sub="أي خدمة ذكاء اصطناعي متوافقة، والتكلفة على حسابك" />

          {cfg.provider === 'custom' && (
            <View style={s.card}>
              <TX style={s.label}>رابط الخدمة (API)</TX>
              <TextInput testID="base-url-input" style={s.input} value={cfg.base_url} onChangeText={v => set({ base_url: v })}
                placeholder="https://api.example.com/v1" placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <TX style={s.label}>اسم نموذج الذكاء الاصطناعي</TX>
              <TextInput testID="model-input" style={s.input} value={cfg.model} onChangeText={v => set({ model: v })}
                placeholder="gpt-4o-mini" placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" autoCorrect={false} />
              <TX style={s.label}>مفتاح API</TX>
              <TextInput testID="api-key-input" style={s.input} value={cfg.api_key} onChangeText={v => set({ api_key: v })}
                placeholder="sk-..." placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <TX style={s.optTitle}>ترجمة احتياطية تلقائية</TX>
                  <TX style={s.optSub}>إذا توقفت منصتك تكمل الترجمة تلقائياً</TX>
                </View>
                <Switch testID="fallback-switch" value={cfg.fallback} onValueChange={v => set({ fallback: v })} trackColor={{ true: colors.brand, false: colors.border }} />
              </View>
            </View>
          )}

          <TouchableOpacity testID="test-btn" style={s.outlineBtn} onPress={test} disabled={testing}>
            {testing ? <ActivityIndicator color={colors.brand} /> : <TX style={s.outlineText}>اختبار الاتصال</TX>}
          </TouchableOpacity>
          {result && (
            <View testID="test-result" style={[s.result, { borderColor: result.ok ? colors.success : colors.error }]}>
              <Ionicons name={result.ok ? 'checkmark-circle' : 'close-circle'} size={20} color={result.ok ? colors.success : colors.error} />
              <Text style={s.resultText}>{result.text}</Text>
            </View>
          )}
          <TouchableOpacity testID="save-btn" style={s.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <TX style={s.saveText}>حفظ</TX>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.titleMedium, color: colors.onSurface, flex: 1, textAlign: 'center' },
    body: { padding: spacing.lg, gap: spacing.md, paddingBottom: 140 },
    note: { ...typography.caption, color: colors.onSurfaceSecondary },
    option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, minHeight: 64 },
    optionOn: { borderColor: colors.brand },
    optTitle: { ...typography.body, color: colors.onSurface, fontWeight: '700' as any },
    optSub: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
    card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
    label: { ...typography.caption, color: colors.onSurfaceSecondary, fontWeight: '700' as any, marginTop: spacing.xs },
    input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.onSurface, textAlign: 'left' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
    outlineBtn: { minHeight: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
    outlineText: { ...typography.body, color: colors.brand, fontWeight: '700' as any },
    result: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
    resultText: { ...typography.body, color: colors.onSurface, flex: 1 },
    saveBtn: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
    saveText: { ...typography.body, color: colors.onBrandPrimary, fontWeight: '800' as any },
  }), [themeKey]);
}
