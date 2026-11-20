import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';
import { colors, themed } from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeContext';

export default function RegisterScreen() {
  useTheme(); // re-render when the app theme changes
  const { t, isRTL } = useT();
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !phone || !password) { setError(t('reg.err.fill')); return; }
    if (password !== confirmPass) { setError(t('reg.err.mismatch')); return; }
    if (password.length < 6) { setError(t('reg.err.short')); return; }
    setLoading(true); setError('');
    try {
      await register(phone, password, name);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || t('reg.err.generic'));
    } finally { setLoading(false); }
  };

  const align = isRTL ? 'right' : 'left';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.onSurface} />
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons name="person-add-outline" size={36} color={colors.brand} />
            </View>
            <Text style={styles.title}>{t('reg.title')}</Text>
            <Text style={styles.subtitle}>{t('reg.subtitle')}</Text>
          </View>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={20} color={colors.onSurfaceTertiary} style={styles.inputIcon} />
            <TextInput testID="register-name-input" style={styles.input} placeholder={t('reg.fullName')} placeholderTextColor={colors.onSurfaceTertiary} value={name} onChangeText={setName} textAlign={align} />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="call-outline" size={20} color={colors.onSurfaceTertiary} style={styles.inputIcon} />
            <TextInput testID="register-phone-input" style={styles.input} placeholder={t('reg.phone')} placeholderTextColor={colors.onSurfaceTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" textAlign={align} />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.onSurfaceTertiary} style={styles.inputIcon} />
            <TextInput testID="register-password-input" style={styles.input} placeholder={t('reg.password')} placeholderTextColor={colors.onSurfaceTertiary} value={password} onChangeText={setPassword} secureTextEntry={!showPass} textAlign={align} />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.onSurfaceTertiary} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.onSurfaceTertiary} style={styles.inputIcon} />
            <TextInput testID="register-confirm-input" style={styles.input} placeholder={t('reg.confirmPass')} placeholderTextColor={colors.onSurfaceTertiary} value={confirmPass} onChangeText={setConfirmPass} secureTextEntry={!showPass} textAlign={align} />
          </View>

          <TouchableOpacity testID="register-submit-button" style={styles.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>{t('reg.submit')}</Text>}
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>{t('reg.haveAccount')}</Text>
            <TouchableOpacity testID="go-to-login-btn" onPress={() => router.push('/login')}>
              <Text style={styles.linkText}>{t('auth.signin')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.onSurface, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.onSurfaceSecondary, textAlign: 'center' },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: colors.error, textAlign: 'center', fontSize: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, marginBottom: 14, height: 52 },
  inputIcon: { marginEnd: 12 },
  input: { flex: 1, fontSize: 16, color: colors.onSurface },
  eyeBtn: { padding: 4 },
  btn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, shadowColor: '#F5C518', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 3 },
  btnText: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6, marginBottom: 32, flexWrap: 'wrap' },
  bottomText: { fontSize: 14, color: colors.onSurfaceSecondary },
  linkText: { fontSize: 14, color: colors.brand, fontWeight: '600' },
}));
