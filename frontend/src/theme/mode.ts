// Lightweight theme-mode store using AsyncStorage.
// Merchant panel stays dark-gold always. Customer side reads this to toggle
// day (white) vs night (black+gold). Keeps footprint tiny — no context re-render
// storm needed since screens read this on mount.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useCallback } from 'react';

const KEY = '@zitex_theme_mode';
export type ThemeMode = 'light' | 'dark';

let cached: ThemeMode | null = null;
const listeners = new Set<(m: ThemeMode) => void>();

export async function getThemeMode(): Promise<ThemeMode> {
  if (cached) return cached;
  try {
    const v = (await AsyncStorage.getItem(KEY)) as ThemeMode | null;
    cached = v === 'dark' ? 'dark' : 'light';
  } catch {
    cached = 'light';
  }
  return cached;
}

export async function setThemeMode(m: ThemeMode) {
  cached = m;
  try { await AsyncStorage.setItem(KEY, m); } catch {}
  listeners.forEach(fn => fn(m));
}

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(cached || 'light');
  useEffect(() => {
    let active = true;
    getThemeMode().then(m => { if (active) setMode(m); });
    const fn = (m: ThemeMode) => setMode(m);
    listeners.add(fn);
    return () => { active = false; listeners.delete(fn); };
  }, []);
  const toggle = useCallback(async () => {
    const next: ThemeMode = mode === 'light' ? 'dark' : 'light';
    await setThemeMode(next);
  }, [mode]);
  return { mode, setMode: setThemeMode, toggle };
}

// Customer-side palette that swaps based on mode
export function palette(mode: ThemeMode) {
  const isDark = mode === 'dark';
  return {
    bg: isDark ? '#0A0A0A' : '#FFFFFF',
    surface: isDark ? '#151515' : '#F9FAFB',
    text: isDark ? '#FFFFFF' : '#0A0A0A',
    textSecondary: isDark ? '#A3A6B0' : '#6B7280',
    border: isDark ? '#2A2A2A' : '#E5E7EB',
    accent: '#D4AF37',            // gold — same in both modes
    accentInk: isDark ? '#0A0A0A' : '#0A0A0A',
    accentSoft: isDark ? 'rgba(212,175,55,0.15)' : '#FFF7DA',
  };
}
