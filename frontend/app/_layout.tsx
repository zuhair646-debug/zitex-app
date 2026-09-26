import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useState, createContext, useContext } from 'react';
import { Text, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { I18nProvider } from '../src/i18n';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type User = {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  role?: string;
  points: number;
  wallet_balance: number;
} | null;

type AuthContextType = {
  user: User;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<any>;
  register: (phone: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  apiCall: (path: string, options?: RequestInit) => Promise<any>;
};

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export default function RootLayout() {
  const [user, setUser] = useState<User>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  const apiCall = async (path: string, options: RequestInit = {}) => {
    const headers: any = { 'Content-Type': 'application/json', ...options.headers };
    const storedToken = await AsyncStorage.getItem('token');
    if (storedToken) headers['Authorization'] = `Bearer ${storedToken}`;
    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'خطأ في الاتصال' }));
      throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail));
    }
    return res.json();
  };

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem('token');
        if (storedToken) {
          setToken(storedToken);
          const data = await apiCall('/api/auth/me');
          setUser(data.user);
        }
      } catch {
        await AsyncStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (phone: string, password: string) => {
    const data = await apiCall('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ phone, password })
    });
    await AsyncStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (phone: string, password: string, name: string) => {
    const data = await apiCall('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ phone, password, name })
    });
    await AsyncStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const data = await apiCall('/api/auth/me');
      setUser(data.user);
    } catch {}
  };

  // ── Role-based auto-redirect ──
  // Ensures merchant/driver/chamber never land in the customer (tabs) area
  useEffect(() => {
    if (loading || !user || !user.role) return;
    const inTabs = segments[0] === '(tabs)';
    const role = user.role;
    if (role === 'merchant' && segments[0] !== 'merchant') {
      // Allow merchant to navigate to customer-facing screens explicitly (like product, search, cart)
      // BUT redirect from (tabs) home which means landing page
      if (inTabs) router.replace('/merchant');
    } else if (role === 'employee' && segments[0] !== 'merchant') {
      // Employees use same merchant panel but with restricted perms
      if (inTabs) router.replace('/merchant');
    } else if (role === 'driver' && segments[0] !== 'driver') {
      if (inTabs) router.replace('/driver');
    } else if (role === 'chamber' && segments[0] !== 'chamber') {
      if (inTabs) router.replace('/chamber');
    }
  }, [user, segments, loading]);

  return (
    <ThemeProvider>
    <I18nProvider>
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser, apiCall }}>
      <StatusBarAdaptive />
      <RemountOnThemeOrLang>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
        <Stack.Screen name="product/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="competition/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="cart" options={{ presentation: 'card' }} />
        <Stack.Screen name="search" options={{ presentation: 'card' }} />
        <Stack.Screen name="orders" options={{ presentation: 'card' }} />
        <Stack.Screen name="wallet" options={{ presentation: 'card' }} />
        <Stack.Screen name="addresses" options={{ presentation: 'card' }} />
        <Stack.Screen name="about-store" options={{ presentation: 'card' }} />
        <Stack.Screen name="service/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="favorites" options={{ presentation: 'card' }} />
        <Stack.Screen name="warranties" options={{ presentation: 'card' }} />
        <Stack.Screen name="invoices" options={{ presentation: 'card' }} />
        <Stack.Screen name="support" options={{ presentation: 'card' }} />
        <Stack.Screen name="checkout" options={{ presentation: 'card' }} />
        <Stack.Screen name="chamber" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="merchant" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="driver" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="draw" options={{ headerShown: false }} />
        <Stack.Screen name="group-buys" options={{ presentation: 'card' }} />
        <Stack.Screen name="points" options={{ presentation: 'card' }} />
        <Stack.Screen name="appearance" options={{ presentation: 'card' }} />
      </Stack>
      </RemountOnThemeOrLang>
    </AuthContext.Provider>
    </I18nProvider>
    </ThemeProvider>
  );
}

function StatusBarAdaptive() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

// Force full remount of the Stack (and every screen) when theme or language changes.
// This causes each screen's StyleSheet.create() to re-run so mode-mutated tokens apply.
function RemountOnThemeOrLang({ children }: { children: React.ReactNode }) {
  const { themeKey, mode, fontOption } = useTheme();
  // Apply global font family to all <Text> and <TextInput> components.
  // CRITICAL: rebuild from scratch each time — never append to previous style
  // (previous impl caused unbounded array growth on every remount).
  useEffect(() => {
    const anyText: any = Text;
    const anyTI: any = TextInput;
    anyText.defaultProps = anyText.defaultProps || {};
    anyTI.defaultProps = anyTI.defaultProps || {};
    if (fontOption.regular) {
      const style = { fontFamily: fontOption.regular };
      anyText.defaultProps.style = style;
      anyTI.defaultProps.style = style;
    } else {
      // System font — clear any previously set default
      delete anyText.defaultProps.style;
      delete anyTI.defaultProps.style;
    }
  }, [fontOption.regular]);
  // Read language from I18n context — but avoid circular; we use a lightweight approach
  const [langBump, setLangBump] = useState(0);
  useEffect(() => {
    const listener = () => setLangBump(x => x + 1);
    // Attach listener via a global emitter — set by I18nProvider
    (global as any).__zenrex_lang_listeners = (global as any).__zenrex_lang_listeners || [];
    (global as any).__zenrex_lang_listeners.push(listener);
    return () => {
      const arr = (global as any).__zenrex_lang_listeners || [];
      const i = arr.indexOf(listener);
      if (i >= 0) arr.splice(i, 1);
    };
  }, []);
  return <React.Fragment key={`${mode}-${themeKey}-${langBump}`}>{children}</React.Fragment>;
}
