/**
 * Zitex Merchant Design Tokens — "Tech Cyber Gold"
 * Dark-first utility + Glass Luxe finishes
 */

export const colors = {
  // Surfaces
  surface: '#0B0C10',            // Main obsidian background
  surfaceSecondary: '#15171E',   // Cards
  surfaceTertiary: '#20232B',    // Elevated / hover
  surfaceInverse: '#FFFFFF',

  // Text
  onSurface: '#FFFFFF',
  onSurfaceSecondary: '#A3A6B0',
  onSurfaceTertiary: '#6C6F78',
  onSurfaceInverse: '#0B0C10',

  // Brand — Gold
  brand: '#D4AF37',
  brandPrimary: '#D4AF37',
  onBrandPrimary: '#000000',
  brandSecondary: '#B59124',
  brandTertiary: 'rgba(212, 175, 55, 0.12)', // tinted gold for icon bgs
  brandTertiaryStrong: 'rgba(212, 175, 55, 0.25)',
  onBrandTertiary: '#D4AF37',

  // Semantic
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

  // Structure
  border: '#2A2D37',
  borderStrong: '#3D414D',
  borderSubtle: '#1F222B',
  divider: '#1F222B',

  // Transparent
  overlay: 'rgba(0, 0, 0, 0.6)',
  scrim: 'rgba(11, 12, 16, 0.85)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
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
  labelLarge: { fontSize: 14, fontWeight: '600' as const },
  labelMedium: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.3 },
  labelSmall: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
  caption: { fontSize: 12, fontWeight: '500' as const },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
} as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  cardGold: {
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  header: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const gradients = {
  brandGold: ['#D4AF37', '#B59124', '#8C6E1B'] as [string, string, string],
  brandGoldSoft: ['rgba(212, 175, 55, 0.35)', 'rgba(212, 175, 55, 0)'] as [string, string],
  scrimDark: ['transparent', 'rgba(11, 12, 16, 0.4)', 'rgba(11, 12, 16, 0.95)'] as [string, string, string],
  cardElevated: ['#20232B', '#15171E'] as [string, string],
  cardGoldSubtle: ['rgba(212, 175, 55, 0.08)', 'rgba(212, 175, 55, 0.02)'] as [string, string],
} as const;

export const theme = { colors, spacing, radius, typography, shadows, gradients };
export default theme;
