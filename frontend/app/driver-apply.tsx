/** Independent driver application (public). */
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';
import { TX, tSync } from '../src/useAutoT';
import { useT } from '../src/i18n';
import { PrimaryButton, ScreenHeader } from '../src/components/ui';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function DriverApply() {
  const s = useStyles();
  const { lang } = useT();
  const router = useRouter();
  const [f, setF] = useState<any>({ name: '', phone: '', password: '', city: '', type: '', model: '', plate: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = (k: string) => (t: string) => setF({ ...f, [k]: t });

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await fetch(`${BASE}/api/driver/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, phone: f.phone, password: f.password, city: f.city, vehicle: { type: f.type, model: f.model, plate: f.plate } }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || 'Error');
      setDone(true);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScreenHeader title={tSync('انضم كسائق', lang)} onBack={() => router.back()} />
      {done ? (
        <View style={s.done}>
          <Ionicons name="checkmark-circle" size={72} color={colors.brand} />
          <TX style={s.h1}>تم استلام طلبك</TX>
          <TX style={s.sub}>سجّل دخولك برقم جوالك، وارفع مستنداتك من صفحة حسابي. سيتم إشعارك فور الموافقة.</TX>
          <PrimaryButton label={tSync('تسجيل الدخول', lang)} onPress={() => router.replace('/login')} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <TX style={s.sub}>اربح من كل توصيل، واختر أوقاتك بنفسك.</TX>
            {[['name', 'الاسم الكامل'], ['phone', 'رقم الجوال'], ['password', 'كلمة المرور'], ['city', 'المدينة'], ['type', 'نوع المركبة (سيارة / دباب)'], ['model', 'موديل المركبة'], ['plate', 'رقم اللوحة']].map(([k, l]) => (
              <TextInput key={k} testID={`apply-${k}`} style={s.input} value={f[k]} onChangeText={set(k)} placeholder={tSync(l, lang)}
                placeholderTextColor={colors.onSurfaceTertiary} secureTextEntry={k === 'password'} keyboardType={k === 'phone' ? 'phone-pad' : 'default'} />
            ))}
            {err ? <Text style={s.err}>{err}</Text> : null}
            <PrimaryButton testID="apply-submit" label={tSync('إرسال الطلب', lang)} icon="send" onPress={submit} loading={busy} size="lg" />
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
    h1: { color: colors.onSurface, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    sub: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: 'center' },
    input: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, padding: 14, fontSize: 15 },
    err: { color: colors.error, textAlign: 'center' },
    done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  }), [themeKey]);
}
