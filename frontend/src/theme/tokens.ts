/**
 * Zenrex Design Tokens — v2.0.0
 * MODE-AWARE: Luxe Dark ↔ Pearl Light ↔ Custom (user-defined)
 *
 * Strategy: A mutable `colors` object whose keys are re-assigned when
 * `setColorsMode()` is called by ThemeContext. Combined with a key-based remount
 * of the root Stack, this flips every screen's StyleSheet on next render.
 */

// ── Luxe Dark ────────────────────────────────────────────────
const DARK = {
  background: '#0A0A0A',
  onBackground: '#EFECE7',
  surface: '#17151A',
  surfaceSecondary: '#20232B',
  surfaceTertiary: '#2A2732',
  surfaceInverse: '#FFFFFF',

  onSurface: '#EFECE7',
  onSurfaceSecondary: '#9A8F80',
  onSurfaceTertiary: '#6C6F78',
  onSurfaceInverse: '#0B0C10',

  brand: '#C9A85C',
  brandPrimary: '#C9A85C',
  onBrandPrimary: '#0A0A0A',
  brandSecondary: '#B59124',
  brandTertiary: 'rgba(201, 168, 92, 0.15)',
  brandTertiaryStrong: 'rgba(201, 168, 92, 0.28)',
  onBrandTertiary: '#C9A85C',

  success: '#4CD69C',
  onSuccess: '#000000',
  successSoft: 'rgba(76, 214, 156, 0.15)',
  warning: '#F5B547',
  onWarning: '#000000',
  warningSoft: 'rgba(245, 181, 71, 0.15)',
  error: '#FF6B6B',
  onError: '#FFFFFF',
  errorSoft: 'rgba(255, 107, 107, 0.15)',
  info: '#6EA8FF',
  infoSoft: 'rgba(110, 168, 255, 0.15)',

  border: '#2E2A32',
  borderStrong: '#3D414D',
  borderSubtle: '#1F1D22',
  divider: '#2E2A32',

  overlay: 'rgba(0, 0, 0, 0.7)',
  scrim: 'rgba(11, 12, 16, 0.85)',
} as const;

// ── Pearl Light (Palette B — LUXE PEARL) ────────────────────────
// Refined pearl gray palette with soft warm undertones. Chosen by user.
const LIGHT = {
  background: '#F4F4F6',        // soft pearl base
  onBackground: '#1C1B20',
  surface: '#FFFFFF',           // pure card white
  surfaceSecondary: '#EBEAEE',  // subtle elevated pearl
  surfaceTertiary: '#DEDCE1',   // deeper pearl
  surfaceInverse: '#17151A',

  onSurface: '#1C1B20',         // rich near-black
  onSurfaceSecondary: '#6E6B75', // elegant mid gray
  onSurfaceTertiary: '#A9A5B0', // whisper gray
  onSurfaceInverse: '#EFECE7',

  brand: '#B8924A',             // deeper luxe gold — pops on pearl
  brandPrimary: '#B8924A',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#8F6C1F',
  brandTertiary: 'rgba(184, 146, 74, 0.10)',
  brandTertiaryStrong: 'rgba(184, 146, 74, 0.20)',
  onBrandTertiary: '#8F6C1F',

  success: '#2DAB76',
  onSuccess: '#FFFFFF',
  successSoft: 'rgba(45, 171, 118, 0.10)',
  warning: '#D98F22',
  onWarning: '#FFFFFF',
  warningSoft: 'rgba(217, 143, 34, 0.10)',
  error: '#E5484D',
  onError: '#FFFFFF',
  errorSoft: 'rgba(229, 72, 77, 0.10)',
  info: '#2A75E6',
  infoSoft: 'rgba(42, 117, 230, 0.10)',

  border: '#DAD8DE',            // pearl border
  borderStrong: '#B8B5BE',
  borderSubtle: '#E8E7EB',
  divider: '#E8E7EB',

  overlay: 'rgba(28, 27, 32, 0.4)',
  scrim: 'rgba(244, 244, 246, 0.85)',
} as const;

// Palette exports for direct import
export const PALETTES = { dark: DARK, light: LIGHT };

// Current active mode
export type Mode = 'dark' | 'light' | 'custom';
let CURRENT_MODE: Mode = 'dark';

// Live-mutable colors object. All screens import { colors } from here.
export const colors: any = { ...DARK };

/** Custom overrides supplied by ThemeContext when mode === 'custom'. */
export interface CustomOverrides {
  base?: 'dark' | 'light';       // starting palette
  background?: string;
  surface?: string;
  surfaceSecondary?: string;
  onSurface?: string;            // primary text
  onSurfaceSecondary?: string;   // secondary text
  brand?: string;
  border?: string;
}

export function setColorsMode(mode: Mode, custom?: CustomOverrides): void {
  CURRENT_MODE = mode;
  let base: any;
  if (mode === 'custom') {
    base = { ...(custom?.base === 'light' ? LIGHT : DARK) };
    if (custom) {
      const isLightBase = custom.base === 'light';
      if (custom.background) {
        base.background = custom.background;
        base.scrim = hexToRgba(custom.background, 0.85);
      }
      if (custom.surface) base.surface = custom.surface;
      if (custom.surfaceSecondary) {
        base.surfaceSecondary = custom.surfaceSecondary;
        // Derive surfaceTertiary as a step further from bg (elevated cards)
        base.surfaceTertiary = shade(custom.surfaceSecondary, isLightBase ? -6 : 8);
      }
      if (custom.onSurface) {
        base.onSurface = custom.onSurface;
        base.onBackground = custom.onSurface;
        // Inverse surface (used for buttons like "Add to cart" contrast card)
        base.surfaceInverse = custom.onSurface;
        base.onSurfaceInverse = custom.surface || (isLightBase ? '#FFFFFF' : '#0A0A0A');
      }
      if (custom.onSurfaceSecondary) {
        base.onSurfaceSecondary = custom.onSurfaceSecondary;
        base.onSurfaceTertiary = shade(custom.onSurfaceSecondary, isLightBase ? 25 : -25);
      }
      if (custom.brand) {
        base.brand = custom.brand;
        base.brandPrimary = custom.brand;
        base.brandSecondary = shade(custom.brand, -15);
        base.brandTertiary = hexToRgba(custom.brand, 0.12);
        base.brandTertiaryStrong = hexToRgba(custom.brand, 0.24);
        base.onBrandTertiary = custom.brand;
        // Choose readable ink for brand buttons based on brand luminance
        base.onBrandPrimary = isLightColor(custom.brand) ? '#000000' : '#FFFFFF';
      }
      if (custom.border) {
        base.border = custom.border;
        base.divider = custom.border;
        base.borderStrong = shade(custom.border, isLightBase ? -20 : 20);
        base.borderSubtle = shade(custom.border, isLightBase ? 10 : -8);
      }
    }
  } else {
    base = mode === 'light' ? LIGHT : DARK;
  }
  for (const k of Object.keys(colors)) delete colors[k];
  Object.assign(colors, base);
  updateGradients(mode, custom);
}

function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 155;
}

export function getMode(): Mode { return CURRENT_MODE; }

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48,
} as const;

export const radius = {
  sm: 6, md: 12, lg: 20, xl: 28, pill: 999,
} as const;

// ── Typography (font family is applied dynamically via ThemeContext) ──
export const typography = {
  displayLarge: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  displayMedium: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.3 },
  displaySmall: { fontSize: 24, fontWeight: '700' as const },
  titleLarge: { fontSize: 20, fontWeight: '700' as const },
  titleMedium: { fontSize: 17, fontWeight: '700' as const },
  titleSmall: { fontSize: 15, fontWeight: '700' as const },
  bodyLarge: { fontSize: 16, fontWeight: '500' as const },
  bodyMedium: { fontSize: 14, fontWeight: '500' as const },
  bodySmall: { fontSize: 13, fontWeight: '500' as const },
  body: { fontSize: 14, fontWeight: '500' as const },
  labelLarge: { fontSize: 14, fontWeight: '600' as const },
  labelMedium: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.3 },
  labelSmall: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  caption: { fontSize: 12, fontWeight: '500' as const },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
} as const;

export const shadows = {
  card: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 4 },
  cardGold: { shadowColor: '#C9A85C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 },
  header: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
} as const;

export const gradients: any = {
  brandGold: ['#C9A85C', '#B59124', '#8C6E1B'],
  brandGoldSoft: ['rgba(201, 168, 92, 0.35)', 'rgba(201, 168, 92, 0)'],
  scrimDark: ['transparent', 'rgba(11, 12, 16, 0.4)', 'rgba(11, 12, 16, 0.95)'],
  cardElevated: ['#20232B', '#17151A'],
  cardGoldSubtle: ['rgba(201, 168, 92, 0.08)', 'rgba(201, 168, 92, 0.02)'],
};

function updateGradients(mode: Mode, custom?: CustomOverrides) {
  const base = mode === 'custom' ? (custom?.base === 'light' ? 'light' : 'dark') : mode;
  const gold = mode === 'custom' && custom?.brand ? custom.brand : (base === 'light' ? '#B8924A' : '#C9A85C');
  if (base === 'light') {
    gradients.brandGold = [gold, shade(gold, -15), shade(gold, -30)];
    gradients.brandGoldSoft = [hexToRgba(gold, 0.25), hexToRgba(gold, 0)];
    gradients.scrimDark = ['transparent', 'rgba(244, 244, 246, 0.4)', 'rgba(244, 244, 246, 0.95)'];
    gradients.cardElevated = ['#FFFFFF', '#EBEAEE'];
    gradients.cardGoldSubtle = [hexToRgba(gold, 0.08), hexToRgba(gold, 0.02)];
  } else {
    gradients.brandGold = [gold, shade(gold, -15), shade(gold, -30)];
    gradients.brandGoldSoft = [hexToRgba(gold, 0.35), hexToRgba(gold, 0)];
    gradients.scrimDark = ['transparent', 'rgba(11, 12, 16, 0.4)', 'rgba(11, 12, 16, 0.95)'];
    gradients.cardElevated = ['#20232B', '#17151A'];
    gradients.cardGoldSubtle = [hexToRgba(gold, 0.08), hexToRgba(gold, 0.02)];
  }
}

function shade(hex: string, percent: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export const theme = { colors, spacing, radius, typography, shadows, gradients };
export default theme;
