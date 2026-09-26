/**
 * Zenrex Design Tokens — MODE-AWARE (Dark ↔ Light)
 *
 * Strategy: A mutable `colors` object whose keys are re-assigned when
 * `setMode()` is called by ThemeContext. Combined with a key-based remount
 * of the root Stack, this flips every screen's StyleSheet on next render.
 */

// ── Palette definitions ──────────────────────────────────────────
const DARK = {
  background: '#0B0C10',
  onBackground: '#FFFFFF',
  surface: '#0B0C10',
  surfaceSecondary: '#15171E',
  surfaceTertiary: '#20232B',
  surfaceInverse: '#FFFFFF',

  onSurface: '#FFFFFF',
  onSurfaceSecondary: '#A3A6B0',
  onSurfaceTertiary: '#6C6F78',
  onSurfaceInverse: '#0B0C10',

  brand: '#D4AF37',
  brandPrimary: '#D4AF37',
  onBrandPrimary: '#000000',
  brandSecondary: '#B59124',
  brandTertiary: 'rgba(212, 175, 55, 0.12)',
  brandTertiaryStrong: 'rgba(212, 175, 55, 0.25)',
  onBrandTertiary: '#D4AF37',

  success: '#34C759',
  onSuccess: '#000000',
  successSoft: 'rgba(52, 199, 89, 0.15)',
  warning: '#FF9F0A',
  onWarning: '#000000',
  warningSoft: 'rgba(255, 159, 10, 0.15)',
  error: '#FF453A',
  onError: '#FFFFFF',
  errorSoft: 'rgba(255, 69, 58, 0.15)',
  info: '#5AC8FA',
  infoSoft: 'rgba(90, 200, 250, 0.15)',

  border: '#2A2D37',
  borderStrong: '#3D414D',
  borderSubtle: '#1F222B',
  divider: '#1F222B',

  overlay: 'rgba(0, 0, 0, 0.6)',
  scrim: 'rgba(11, 12, 16, 0.85)',
} as const;

const LIGHT = {
  background: '#FAFAFA',
  onBackground: '#1A181D',
  surface: '#FFFFFF',
  surfaceSecondary: '#F3F3F5',
  surfaceTertiary: '#E9E9EC',
  surfaceInverse: '#0B0C10',

  onSurface: '#1A181D',
  onSurfaceSecondary: '#5A5860',
  onSurfaceTertiary: '#8F8D95',
  onSurfaceInverse: '#FFFFFF',

  brand: '#B48F3B',
  brandPrimary: '#B48F3B',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#8F6C1F',
  brandTertiary: 'rgba(180, 143, 59, 0.10)',
  brandTertiaryStrong: 'rgba(180, 143, 59, 0.20)',
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

  border: '#E2E0E5',
  borderStrong: '#C8C5CE',
  borderSubtle: '#EFEEF1',
  divider: '#E2E0E5',

  overlay: 'rgba(0, 0, 0, 0.4)',
  scrim: 'rgba(250, 250, 250, 0.85)',
} as const;

// Palette exports for direct import when writing NEW themed screens
export const PALETTES = { dark: DARK, light: LIGHT };

// Current active mode — starts dark, mutated by setColorsMode()
let CURRENT_MODE: 'dark' | 'light' = 'dark';

// Live-mutable colors object. All screens import { colors } from here.
// Reassign every key on setMode so subsequent StyleSheet.create()s pick up new values.
export const colors: any = { ...DARK };

export function setColorsMode(mode: 'dark' | 'light'): void {
  CURRENT_MODE = mode;
  const palette = mode === 'light' ? LIGHT : DARK;
  // Delete removed keys then assign new ones
  for (const k of Object.keys(colors)) delete colors[k];
  Object.assign(colors, palette);
  // Update gradients that depend on mode
  updateGradients(mode);
}

export function getMode(): 'dark' | 'light' { return CURRENT_MODE; }

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48,
} as const;

export const radius = {
  sm: 6, md: 12, lg: 20, xl: 28, pill: 999,
} as const;

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
  cardGold: { shadowColor: '#D4AF37', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 6 },
  header: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
} as const;

export const gradients: any = {
  brandGold: ['#D4AF37', '#B59124', '#8C6E1B'],
  brandGoldSoft: ['rgba(212, 175, 55, 0.35)', 'rgba(212, 175, 55, 0)'],
  scrimDark: ['transparent', 'rgba(11, 12, 16, 0.4)', 'rgba(11, 12, 16, 0.95)'],
  cardElevated: ['#20232B', '#15171E'],
  cardGoldSubtle: ['rgba(212, 175, 55, 0.08)', 'rgba(212, 175, 55, 0.02)'],
};

function updateGradients(mode: 'dark' | 'light') {
  if (mode === 'light') {
    gradients.brandGold = ['#B48F3B', '#8F6C1F', '#6D5518'];
    gradients.brandGoldSoft = ['rgba(180, 143, 59, 0.25)', 'rgba(180, 143, 59, 0)'];
    gradients.scrimDark = ['transparent', 'rgba(250, 250, 250, 0.4)', 'rgba(250, 250, 250, 0.95)'];
    gradients.cardElevated = ['#FFFFFF', '#F3F3F5'];
    gradients.cardGoldSubtle = ['rgba(180, 143, 59, 0.08)', 'rgba(180, 143, 59, 0.02)'];
  } else {
    gradients.brandGold = ['#D4AF37', '#B59124', '#8C6E1B'];
    gradients.brandGoldSoft = ['rgba(212, 175, 55, 0.35)', 'rgba(212, 175, 55, 0)'];
    gradients.scrimDark = ['transparent', 'rgba(11, 12, 16, 0.4)', 'rgba(11, 12, 16, 0.95)'];
    gradients.cardElevated = ['#20232B', '#15171E'];
    gradients.cardGoldSubtle = ['rgba(212, 175, 55, 0.08)', 'rgba(212, 175, 55, 0.02)'];
  }
}

export const theme = { colors, spacing, radius, typography, shadows, gradients };
export default theme;
