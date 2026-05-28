import { Stack } from 'expo-router';
import { useEffect, useState, createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

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
  login: (phone: string, password: string) => Promise<void>;
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
  };

  const register = async (phone: string, password: string, name: string) => {
    const data = await apiCall('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ phone, password, name })
    });
    await AsyncStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
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

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshUser, apiCall }}>
      <StatusBar style="dark" />
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
        <Stack.Screen name="draw" options={{ headerShown: false }} />
      </Stack>
    </AuthContext.Provider>
  );
}
