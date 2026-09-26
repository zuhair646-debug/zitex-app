/**
 * Global Theme Context — v1.14.0
 * Provides Luxe Dark ↔ Luxe Light palettes across the entire app.
 * All screens should consume `useTheme()` and use returned tokens instead of hardcoded hex values.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setColorsMode } from './tokens';

const KEY = '@zenrex_theme_mode';
export type ThemeMode = 'light' | 'dark';

// Luxe Dark — same as merchant Live Preview
const DARK = {
  bg: '#0A0A0A',
  surface: '#17151A',
  surfaceElevated: '#20232B',
  card: '#17151A',
  border: '#2E2A32',
  borderStrong: '#3D414D',
  divider: '#2E2A32',
  text: '#EFECE7',
  textSecondary: '#9A8F80',
  textDisabled: '#6C6F78',
  gold: '#C9A85C',
  goldSoft: 'rgba(201, 168, 92, 0.15)',
  blue: '#6EA8FF',
  purple: '#A895FF',
  ok: '#4CD69C',
  okSoft: 'rgba(76, 214, 156, 0.15)',
  red: '#FF6B6B',
  redSoft: 'rgba(255, 107, 107, 0.15)',
  amber: '#F5B547',
  amberSoft: 'rgba(245, 181, 71, 0.15)',
  rose: '#EC4899',
  overlay: 'rgba(0, 0, 0, 0.7)',
  tabBar: 'rgba(15, 17, 24, 0.94)',
  header: '#0A0A0A',
  statusBar: 'light' as const,
};

// Luxe Light — mirrors Luxe Dark aesthetic
const LIGHT = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceElevated: '#F3F3F5',
  card: '#FFFFFF',
  border: '#E2E0E5',
  borderStrong: '#C8C5CE',
  divider: '#E2E0E5',
  text: '#1A181D',
  textSecondary: '#766C60',
  textDisabled: '#A9A29A',
  gold: '#B48F3B',
  goldSoft: 'rgba(180, 143, 59, 0.10)',
  blue: '#2A75E6',
  purple: '#7B5EF0',
  ok: '#2DAB76',
  okSoft: 'rgba(45, 171, 118, 0.10)',
  red: '#E5484D',
  redSoft: 'rgba(229, 72, 77, 0.10)',
  amber: '#D98F22',
  amberSoft: 'rgba(217, 143, 34, 0.10)',
  rose: '#DB2777',
  overlay: 'rgba(0, 0, 0, 0.4)',
  tabBar: 'rgba(255, 255, 255, 0.96)',
  header: '#FFFFFF',
  statusBar: 'dark' as const,
};

export type ThemeColors = typeof DARK;

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  themeKey: number;   // increments on every toggle for full remount
  setMode: (m: ThemeMode) => Promise<void>;
  toggle: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: DARK,
  isDark: true,
  themeKey: 0,
  setMode: async () => {},
  toggle: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const v = (await AsyncStorage.getItem(KEY)) as ThemeMode | null;
        if (v === 'light' || v === 'dark') {
          setModeState(v);
          setColorsMode(v);
        }
      } catch {}
    })();
  }, []);

  const setMode = useCallback(async (m: ThemeMode) => {
    setColorsMode(m);       // mutate tokens.colors
    setModeState(m);
    setThemeKey(k => k + 1); // bump key → force remount of subtree
    try { await AsyncStorage.setItem(KEY, m); } catch {}
  }, []);

  const toggle = useCallback(async () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    await setMode(next);
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    colors: mode === 'dark' ? DARK : LIGHT,
    isDark: mode === 'dark',
    themeKey,
    setMode,
    toggle,
  }), [mode, themeKey, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Static exports for legacy hardcoded imports
export const DarkColors = DARK;
export const LightColors = LIGHT;
