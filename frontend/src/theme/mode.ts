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
    bg: isDark ? '#0A0A0A' : '#F4F4F6',                 // pearl gray light bg
    surface: isDark ? '#17151A' : '#FFFFFF',            // pure card white
    text: isDark ? '#EFECE7' : '#1C1B20',
    textSecondary: isDark ? '#9A8F80' : '#6E6B75',
    border: isDark ? '#2E2A32' : '#DAD8DE',
    accent: isDark ? '#C9A85C' : '#B8924A',             // luxe gold
    accentInk: '#FFFFFF',
    accentSoft: isDark ? 'rgba(201,168,92,0.15)' : 'rgba(184,146,74,0.10)',
  };
}
