import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './_layout';

export default function RegisterScreen() {
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
    if (!name || !phone || !password) { setError('يرجى ملء جميع الحقول'); return; }
    if (password !== confirmPass) { setError('كلمات المرور غير متطابقة'); return; }
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    setLoading(true); setError('');
    try {
      await register(phone, password, name);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message || 'خطأ في إنشاء الحساب');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="back-button" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0A0A0A" />
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons name="person-add-outline" size={36} color="#8833FF" />
            </View>
            <Text style={styles.title}>إنشاء حساب جديد</Text>
            <Text style={styles.subtitle}>أدخل بياناتك للتسجيل</Text>
          </View>

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={20} color="#A1A1AA" style={styles.inputIcon} />
            <TextInput testID="register-name-input" style={styles.input} placeholder="الاسم الكامل" placeholderTextColor="#A1A1AA" value={name} onChangeText={setName} textAlign="right" />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="call-outline" size={20} color="#A1A1AA" style={styles.inputIcon} />
            <TextInput testID="register-phone-input" style={styles.input} placeholder="رقم الهاتف" placeholderTextColor="#A1A1AA" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textAlign="right" />
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color="#A1A1AA" style={styles.inputIcon} />
            <TextInput testID="register-password-input" style={styles.input} placeholder="كلمة المرور" placeholderTextColor="#A1A1AA" value={password} onChangeText={setPassword} secureTextEntry={!showPass} textAlign="right" />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color="#A1A1AA" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color="#A1A1AA" style={styles.inputIcon} />
            <TextInput testID="register-confirm-input" style={styles.input} placeholder="تأكيد كلمة المرور" placeholderTextColor="#A1A1AA" value={confirmPass} onChangeText={setConfirmPass} secureTextEntry={!showPass} textAlign="right" />
          </View>

          <TouchableOpacity testID="register-submit-button" style={styles.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>إنشاء حساب</Text>}
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <Text style={styles.bottomText}>لديك حساب بالفعل؟</Text>
            <TouchableOpacity testID="go-to-login-btn" onPress={() => router.push('/login')}>
              <Text style={styles.linkText}>تسجيل الدخول</Text>
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
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EFE6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A0A0A', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#52525B' },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: '#EF4444', textAlign: 'center', fontSize: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9F9FB', borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 16, marginBottom: 14, height: 52 },
  inputIcon: { marginEnd: 12 },
  input: { flex: 1, fontSize: 16, color: '#0A0A0A' },
  eyeBtn: { padding: 4 },
  btn: { backgroundColor: '#8833FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, shadowColor: '#8833FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 3 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24, gap: 6, marginBottom: 32 },
  bottomText: { fontSize: 14, color: '#52525B' },
  linkText: { fontSize: 14, color: '#8833FF', fontWeight: '600' },
});
