import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function LoginScreen() {
  const router = useRouter();
  const { login, apiCall } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) { setError('Please fill all fields'); return; }
    setLoading(true); setError('');
    try {
      await login(phone, password);
      // Check user role after login
      const userData = await apiCall('/api/auth/me');
      if (userData?.user?.role === 'chamber') {
        router.replace('/chamber');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      setError(e.message || 'Login error');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons name="phone-portrait-outline" size={40} color="#8833FF" />
            </View>
            <Text style={styles.title}>Sign in</Text>
          </View>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.inputWrap}>
            <TextInput testID="login-phone-input" style={styles.input} placeholder="Phone number" placeholderTextColor="#A1A1AA" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </View>

          <View style={styles.inputWrap}>
            <TextInput testID="login-password-input" style={styles.input} placeholder="Password" placeholderTextColor="#A1A1AA" value={password} onChangeText={setPassword} secureTextEntry={!showPass} />
            <TouchableOpacity testID="toggle-password-btn" onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.forgotLink}><Text style={styles.forgotText}>Forget password!</Text></TouchableOpacity>

          <TouchableOpacity testID="login-submit-button" style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Sign in</Text>}
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>You don't have account?</Text>
            <TouchableOpacity testID="go-to-register-btn" onPress={() => router.push('/register')}>
              <Text style={styles.linkText}>Sign Up</Text>
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
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#0A0A0A', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#52525B' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: '#EF4444', textAlign: 'center', fontSize: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9FB', borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 16, marginBottom: 16, height: 52 },
  inputIcon: { marginEnd: 12 },
  input: { flex: 1, fontSize: 16, color: '#0A0A0A' },
  eyeBtn: { padding: 4 },
  forgotLink: { alignSelf: 'flex-start', marginBottom: 8 },
  forgotText: { fontSize: 13, color: '#52525B', textDecorationLine: 'underline' },
  btn: { backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, shadowColor: '#8833FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 3 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6 },
  bottomText: { fontSize: 14, color: '#52525B' },
  linkText: { fontSize: 14, color: '#8833FF', fontWeight: '600' },
});
