/**
 * Global Theme Context — v2.0.0
 * Provides 3 modes: Luxe Dark ↔ Pearl Light ↔ Custom (user-defined).
 * Custom mode lets users pick background/surface/text/brand colors + font family.
 * All screens should consume `useTheme()` and use returned tokens instead of hardcoded hex values.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setColorsMode, type CustomOverrides } from './tokens';

const KEY_MODE = '@zenrex_theme_mode_v2';
const KEY_CUSTOM = '@zenrex_theme_custom_v2';
const KEY_FONT = '@zenrex_theme_font_v2';
export type ThemeMode = 'light' | 'dark' | 'custom';

// ── Luxe Dark ─────────────────────────────────────────────
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
  statusBar: 'light' as 'light' | 'dark',
};

// ── Pearl Light (Palette B) ──────────────────────────────
const LIGHT = {
  bg: '#F4F4F6',
  surface: '#FFFFFF',
  surfaceElevated: '#EBEAEE',
  card: '#FFFFFF',
  border: '#DAD8DE',
  borderStrong: '#B8B5BE',
  divider: '#E8E7EB',
  text: '#1C1B20',
  textSecondary: '#6E6B75',
  textDisabled: '#A9A5B0',
  gold: '#B8924A',
  goldSoft: 'rgba(184, 146, 74, 0.10)',
  blue: '#2A75E6',
  purple: '#7B5EF0',
  ok: '#2DAB76',
  okSoft: 'rgba(45, 171, 118, 0.10)',
  red: '#E5484D',
  redSoft: 'rgba(229, 72, 77, 0.10)',
  amber: '#D98F22',
  amberSoft: 'rgba(217, 143, 34, 0.10)',
  rose: '#DB2777',
  overlay: 'rgba(28, 27, 32, 0.4)',
  tabBar: 'rgba(255, 255, 255, 0.96)',
  header: '#FFFFFF',
  statusBar: 'dark' as 'light' | 'dark',
};

export type ThemeColors = typeof DARK;

// ── Custom appearance definition ──────────────────────────
export interface CustomAppearance {
  base: 'dark' | 'light';   // starting palette (for anything not overridden)
  bg: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  gold: string;
  border: string;
}

export const DEFAULT_CUSTOM: CustomAppearance = {
  base: 'dark',
  bg: '#0A0A0A',
  surface: '#17151A',
  surfaceElevated: '#20232B',
  text: '#EFECE7',
  textSecondary: '#9A8F80',
  gold: '#C9A85C',
  border: '#2E2A32',
};

// ── Font families ─────────────────────────────────────────
export type FontFamilyId = 'system' | 'rounded' | 'serif' | 'mono';

export interface FontOption {
  id: FontFamilyId;
  label: string;
  labelAr: string;
  regular: string | undefined;
  medium: string | undefined;
  bold: string | undefined;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'system',
    label: 'System (Default)',
    labelAr: 'النظام الافتراضي',
    regular: undefined,
    medium: undefined,
    bold: undefined,
  },
  {
    id: 'rounded',
    label: 'Rounded Soft',
    labelAr: 'ناعم مستدير',
    regular: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'System' }),
    medium: Platform.select({ ios: 'Avenir Next', android: 'sans-serif-medium', default: 'System' }),
    bold: Platform.select({ ios: 'Avenir Next Bold', android: 'sans-serif', default: 'System' }),
  },
  {
    id: 'serif',
    label: 'Elegant Serif',
    labelAr: 'أنيق كلاسيكي',
    regular: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    medium: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    bold: Platform.select({ ios: 'Georgia-Bold', android: 'serif', default: 'Georgia' }),
  },
  {
    id: 'mono',
    label: 'Modern Mono',
    labelAr: 'حديث تقني',
    regular: 'SpaceMono',
    medium: 'SpaceMono',
    bold: 'SpaceMono',
  },
];

// ── Preset custom palettes ────────────────────────────────
export const CUSTOM_PRESETS: { id: string; labelAr: string; label: string; appearance: CustomAppearance }[] = [
  {
    id: 'midnight_blue',
    labelAr: 'أزرق منتصف الليل',
    label: 'Midnight Blue',
    appearance: {
      base: 'dark',
      bg: '#0B1220',
      surface: '#141C2E',
      surfaceElevated: '#1E2842',
      text: '#E8EEFA',
      textSecondary: '#8DA0C4',
      gold: '#6EA8FF',
      border: '#243050',
    },
  },
  {
    id: 'royal_gold',
    labelAr: 'ذهبي ملكي',
    label: 'Royal Gold',
    appearance: {
      base: 'dark',
      bg: '#1A1206',
      surface: '#25190A',
      surfaceElevated: '#33240E',
      text: '#F5EBD5',
      textSecondary: '#B99E6A',
      gold: '#F5B547',
      border: '#3F2E15',
    },
  },
  {
    id: 'forest_green',
    labelAr: 'أخضر الغابة',
    label: 'Forest Green',
    appearance: {
      base: 'dark',
      bg: '#0A1410',
      surface: '#132119',
      surfaceElevated: '#1D2F24',
      text: '#E6F0EA',
      textSecondary: '#8FA898',
      gold: '#4CD69C',
      border: '#243A2E',
    },
  },
  {
    id: 'rose_luxe',
    labelAr: 'وردي فاخر',
    label: 'Rose Luxe',
    appearance: {
      base: 'dark',
      bg: '#1A0F14',
      surface: '#251821',
      surfaceElevated: '#33202D',
      text: '#FBEAF0',
      textSecondary: '#C89AA8',
      gold: '#EC4899',
      border: '#3F2735',
    },
  },
  {
    id: 'sand_sage',
    labelAr: 'رملي أخضر',
    label: 'Sand Sage',
    appearance: {
      base: 'light',
      bg: '#F5F2EC',
      surface: '#FFFFFF',
      surfaceElevated: '#EBE7DE',
      text: '#2A2820',
      textSecondary: '#6E6A5F',
      gold: '#8A9A5B',
      border: '#DDD8CC',
    },
  },
  {
    id: 'ocean_breeze',
    labelAr: 'نسيم المحيط',
    label: 'Ocean Breeze',
    appearance: {
      base: 'light',
      bg: '#EEF4F7',
      surface: '#FFFFFF',
      surfaceElevated: '#DEE9EF',
      text: '#0F2A3A',
      textSecondary: '#4E7189',
      gold: '#2A9DBF',
      border: '#C7D9E2',
    },
  },
];

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  fontFamily: FontFamilyId;
  fontOption: FontOption;
  themeKey: number;
  custom: CustomAppearance;
  setMode: (m: ThemeMode) => Promise<void>;
  toggle: () => Promise<void>;
  setCustom: (c: CustomAppearance) => Promise<void>;
  setFontFamily: (f: FontFamilyId) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: DARK,
  isDark: true,
  fontFamily: 'system',
  fontOption: FONT_OPTIONS[0],
  themeKey: 0,
  custom: DEFAULT_CUSTOM,
  setMode: async () => {},
  toggle: async () => {},
  setCustom: async () => {},
  setFontFamily: async () => {},
});

function buildCustomColors(c: CustomAppearance): ThemeColors {
  const base = c.base === 'light' ? LIGHT : DARK;
  return {
    ...base,
    bg: c.bg,
    surface: c.surface,
    surfaceElevated: c.surfaceElevated,
    card: c.surface,
    text: c.text,
    textSecondary: c.textSecondary,
    gold: c.gold,
    goldSoft: hexToRgba(c.gold, 0.15),
    border: c.border,
    divider: c.border,
    header: c.bg,
    statusBar: c.base === 'light' ? 'dark' : 'light',
    tabBar: c.base === 'light' ? 'rgba(255,255,255,0.96)' : 'rgba(15,17,24,0.94)',
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function customToOverrides(c: CustomAppearance): CustomOverrides {
  return {
    base: c.base,
    background: c.bg,
    surface: c.surface,
    surfaceSecondary: c.surfaceElevated,
    onSurface: c.text,
    onSurfaceSecondary: c.textSecondary,
    brand: c.gold,
    border: c.border,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [themeKey, setThemeKey] = useState(0);
  const [custom, setCustomState] = useState<CustomAppearance>(DEFAULT_CUSTOM);
  const [fontFamily, setFontFamilyState] = useState<FontFamilyId>('system');

  useEffect(() => {
    (async () => {
      try {
        const savedMode = (await AsyncStorage.getItem(KEY_MODE)) as ThemeMode | null;
        const savedCustom = await AsyncStorage.getItem(KEY_CUSTOM);
        const savedFont = (await AsyncStorage.getItem(KEY_FONT)) as FontFamilyId | null;
        let cus = DEFAULT_CUSTOM;
        if (savedCustom) {
          try { cus = { ...DEFAULT_CUSTOM, ...JSON.parse(savedCustom) }; } catch {}
          setCustomState(cus);
        }
        if (savedFont) setFontFamilyState(savedFont);
        const m = savedMode === 'light' || savedMode === 'dark' || savedMode === 'custom' ? savedMode : 'dark';
        setModeState(m);
        setColorsMode(m, m === 'custom' ? customToOverrides(cus) : undefined);
      } catch {}
    })();
  }, []);

  const setMode = useCallback(async (m: ThemeMode) => {
    setColorsMode(m, m === 'custom' ? customToOverrides(custom) : undefined);
    setModeState(m);
    setThemeKey(k => k + 1);
    try { await AsyncStorage.setItem(KEY_MODE, m); } catch {}
  }, [custom]);

  const toggle = useCallback(async () => {
    // toggle cycles dark → light → custom → dark
    const next: ThemeMode = mode === 'dark' ? 'light' : mode === 'light' ? 'custom' : 'dark';
    await setMode(next);
  }, [mode, setMode]);

  const setCustom = useCallback(async (c: CustomAppearance) => {
    setCustomState(c);
    try { await AsyncStorage.setItem(KEY_CUSTOM, JSON.stringify(c)); } catch {}
    if (mode === 'custom') {
      setColorsMode('custom', customToOverrides(c));
      setThemeKey(k => k + 1);
    }
  }, [mode]);

  const setFontFamily = useCallback(async (f: FontFamilyId) => {
    setFontFamilyState(f);
    try { await AsyncStorage.setItem(KEY_FONT, f); } catch {}
    setThemeKey(k => k + 1);
  }, []);

  const colorsForMode: ThemeColors = useMemo(() => {
    if (mode === 'custom') return buildCustomColors(custom);
    return mode === 'dark' ? DARK : LIGHT;
  }, [mode, custom]);

  const fontOption = useMemo(
    () => FONT_OPTIONS.find(f => f.id === fontFamily) || FONT_OPTIONS[0],
    [fontFamily]
  );

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    colors: colorsForMode,
    isDark: mode === 'custom' ? custom.base === 'dark' : mode === 'dark',
    fontFamily,
    fontOption,
    themeKey,
    custom,
    setMode,
    toggle,
    setCustom,
    setFontFamily,
  }), [mode, colorsForMode, custom, fontFamily, fontOption, themeKey, setMode, toggle, setCustom, setFontFamily]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Static exports for legacy hardcoded imports
export const DarkColors = DARK;
export const LightColors = LIGHT;
