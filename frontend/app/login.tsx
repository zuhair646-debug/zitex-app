import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';
import { useT } from '../src/i18n';

export default function LoginScreen() {
  const { t } = useT();
  const router = useRouter();
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const p = phone.trim();
    const pw = password.trim();
    if (!p || !pw) { setError(t('auth.fillAllFields')); return; }
    setLoading(true); setError('');
    try {
      const userData = await login(p, pw);
      const role = userData?.role;
      if (role === 'chamber') {
        router.replace('/chamber');
      } else if (role === 'merchant') {
        router.replace('/merchant');
      } else if (role === 'driver') {
        router.replace('/driver');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.includes('credential') || msg.includes('Invalid')) setError(t('auth.invalidCredentials'));
      else if (msg.includes('Network')) setError(t('auth.networkError'));
      else setError(msg || t('auth.invalidCredentials'));
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Image source={require('../assets/images/icon.png')} style={styles.logoImg} />
            </View>
            <Text style={styles.title}>{t('auth.welcome')}</Text>
            <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          </View>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.inputWrap}>
            <TextInput
              testID="login-phone-input"
              style={styles.input}
              placeholder={t('auth.phone')}
              placeholderTextColor="#A1A1AA"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              placeholder={t('auth.password')}
              placeholderTextColor="#A1A1AA"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity testID="toggle-password-btn" onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotLink}>
            <Text style={styles.forgotText}>{t('auth.forgot')}</Text>
          </TouchableOpacity>

          <TouchableOpacity testID="login-submit-button" style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>{t('auth.signin')}</Text>}
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>{t('auth.noAccount')}</Text>
            <TouchableOpacity testID="go-to-register-btn" onPress={() => router.push('/register')}>
              <Text style={styles.linkText}>{t('auth.signup')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logoCircle: { width: 110, height: 110, borderRadius: 28, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden', shadowColor: '#FFD700', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  logoImg: { width: 110, height: 110, resizeMode: 'cover' },
  title: { fontSize: 26, fontWeight: '800', color: '#0A0A0A', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#52525B', textAlign: 'center' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: '#EF4444', textAlign: 'center', fontSize: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9FB', borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 16, marginBottom: 16, height: 52 },
  input: { flex: 1, fontSize: 16, color: '#0A0A0A' },
  eyeBtn: { padding: 4 },
  forgotLink: { alignSelf: 'flex-start', marginBottom: 8 },
  forgotText: { fontSize: 13, color: '#52525B', textDecorationLine: 'underline' },
  btn: { backgroundColor: '#F5C518', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, shadowColor: '#F5C518', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 3 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6, flexWrap: 'wrap' },
  bottomText: { fontSize: 14, color: '#52525B' },
  linkText: { fontSize: 14, color: '#F5C518', fontWeight: '600' },
});
