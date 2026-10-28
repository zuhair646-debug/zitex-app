import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography } from '../../src/theme/tokens';
import { ScreenHeader, PrimaryButton } from '../../src/components/ui';
import { useTheme } from '../../src/theme/ThemeContext';
import { TX, tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';

const FIELDS: { key: string; label: string; ph?: string; kb?: 'number-pad' | 'phone-pad' | 'email-address' }[] = [
  { key: 'seller_name_ar', label: 'اسم المنشأة (عربي)' },
  { key: 'seller_name_en', label: 'اسم المنشأة (إنجليزي)' },
  { key: 'vat_number', label: 'الرقم الضريبي (15 رقم)', ph: '3XXXXXXXXXXXXX3', kb: 'number-pad' },
  { key: 'cr_number', label: 'رقم السجل التجاري', kb: 'number-pad' },
  { key: 'building_no', label: 'رقم المبنى', kb: 'number-pad' },
  { key: 'street', label: 'الشارع' },
  { key: 'district', label: 'الحي' },
  { key: 'city', label: 'المدينة' },
  { key: 'postal_code', label: 'الرمز البريدي', kb: 'number-pad' },
  { key: 'phone', label: 'الهاتف', kb: 'phone-pad' },
  { key: 'email', label: 'البريد الإلكتروني', kb: 'email-address' },
];

export default function BusinessProfile() {
  const s = useStyles();
  const router = useRouter();
  const { lang } = useT();
  const { apiCall, user } = useAuth();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const owner = user?.role === 'merchant';

  useEffect(() => { apiCall('/api/merchant/business-profile').then(setForm).catch((e: any) => Alert.alert(tSync('خطأ', lang), e.message)); }, []);

  const save = async () => {
    setSaving(true);
    try {
      setForm(await apiCall('/api/merchant/business-profile', { method: 'PUT', body: JSON.stringify(form) }));
      Alert.alert(tSync('تم الحفظ', lang), tSync('ستظهر البيانات على كل الفواتير الجديدة', lang));
    } catch (e: any) { Alert.alert(tSync('خطأ', lang), e.message); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView edges={['top']} style={s.root}>
      <ScreenHeader title={tSync('بيانات المنشأة للفواتير', lang)} onBack={() => router.back()} />
      {!form ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <TX style={s.note}>هذه البيانات مطلوبة من هيئة الزكاة والضريبة والجمارك وتظهر على كل فاتورة مع رمز QR.</TX>
            {FIELDS.map(f => (
              <View key={f.key}>
                <TX style={s.label}>{f.label}</TX>
                <TextInput testID={`bp-${f.key}`} style={s.input} value={form[f.key] || ''} editable={owner}
                  onChangeText={v => setForm({ ...form, [f.key]: v })} placeholder={f.ph} placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType={f.kb || 'default'} autoCapitalize="none" />
              </View>
            ))}
            {owner && <PrimaryButton label={tSync('حفظ', lang)} icon="checkmark" loading={saving} onPress={save} />}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 140 },
    note: { ...typography.caption, color: colors.onSurfaceSecondary, marginBottom: spacing.sm },
    label: { ...typography.caption, color: colors.onSurfaceSecondary, fontWeight: '700', marginBottom: 4 },
    input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  }), [themeKey]);
}
