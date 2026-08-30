/**
 * Zitex Merchant — Core Component Library
 * Import from '@/components/ui' or 'src/components/ui'
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, radius, typography, shadows, gradients } from '../../theme/tokens';

// ─── PrimaryButton (Gold) ──────────────────────────────────────
export function PrimaryButton({
  label, onPress, icon, disabled, loading, style, size = 'md', fullWidth = true,
}: {
  label: string; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg'; fullWidth?: boolean;
}) {
  const h = size === 'sm' ? 40 : size === 'lg' ? 56 : 48;
  const handle = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    onPress?.();
  };
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handle} disabled={disabled || loading} style={[{ opacity: disabled ? 0.4 : 1 }, style]}>
      <LinearGradient
        colors={gradients.brandGold}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.pbtn, { height: h, alignSelf: fullWidth ? 'stretch' : 'flex-start' }]}
      >
        {loading ? <ActivityIndicator color={colors.onBrandPrimary} />
          : (<>
              {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={colors.onBrandPrimary} />}
              <Text style={[styles.pbtnText, { fontSize: size === 'sm' ? 13 : 15 }]}>{label}</Text>
            </>)}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── SecondaryButton (Outlined Gold) ────────────────────────────
export function SecondaryButton({
  label, onPress, icon, disabled, style, size = 'md', fullWidth = true,
}: {
  label: string; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean; style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg'; fullWidth?: boolean;
}) {
  const h = size === 'sm' ? 40 : size === 'lg' ? 56 : 48;
  const handle = () => { if (disabled) return; Haptics.selectionAsync().catch(()=>{}); onPress?.(); };
  return (
    <TouchableOpacity
      activeOpacity={0.7} onPress={handle} disabled={disabled}
      style={[styles.sbtn, { height: h, alignSelf: fullWidth ? 'stretch' : 'flex-start', opacity: disabled ? 0.4 : 1 }, style]}
    >
      {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={colors.brand} />}
      <Text style={[styles.sbtnText, { fontSize: size === 'sm' ? 13 : 15 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── GhostButton (transparent) ────────────────────────────────
export function GhostButton({ label, onPress, icon, style }: {
  label: string; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} style={[styles.ghost, style]}>
      {icon && <Ionicons name={icon} size={18} color={colors.onSurfaceSecondary} />}
      <Text style={styles.ghostText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── StatCard ─────────────────────────────────────────────────
export function StatCard({
  icon, label, value, trend, trendDir, tone = 'default', onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number;
  trend?: string; trendDir?: 'up' | 'down' | 'flat';
  tone?: 'default' | 'gold' | 'success' | 'warning' | 'error'; onPress?: () => void;
}) {
  const toneColor = tone === 'gold' ? colors.brand
    : tone === 'success' ? colors.success
    : tone === 'warning' ? colors.warning
    : tone === 'error' ? colors.error
    : colors.onSurface;
  const toneBg = tone === 'gold' ? colors.brandTertiary
    : tone === 'success' ? colors.successSoft
    : tone === 'warning' ? colors.warningSoft
    : tone === 'error' ? colors.errorSoft
    : colors.surfaceTertiary;
  const trendColor = trendDir === 'up' ? colors.success : trendDir === 'down' ? colors.error : colors.onSurfaceSecondary;
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.85 : 1} onPress={onPress} style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: toneBg }]}>
        <Ionicons name={icon} size={20} color={toneColor} />
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      {trend && (
        <View style={styles.trendRow}>
          <Ionicons
            name={trendDir === 'up' ? 'arrow-up' : trendDir === 'down' ? 'arrow-down' : 'remove'}
            size={12} color={trendColor}
          />
          <Text style={[styles.trendText, { color: trendColor }]}>{trend}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── ActionCard (Quick actions) ───────────────────────────────
export function ActionCard({ icon, label, onPress, tone = 'gold' }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; tone?: 'gold' | 'default';
}) {
  const handle = () => { Haptics.selectionAsync().catch(()=>{}); onPress?.(); };
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={handle} style={styles.actionCard}>
      <View style={[styles.actionIconWrap, tone === 'gold' && { backgroundColor: colors.brandTertiary }]}>
        <Ionicons name={icon} size={22} color={tone === 'gold' ? colors.brand : colors.onSurface} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── SectionHeader ─────────────────────────────────────────────
export function SectionHeader({ title, subtitle, action, actionLabel }: {
  title: string; subtitle?: string; action?: () => void; actionLabel?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {action && actionLabel && (
        <TouchableOpacity onPress={action} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>{actionLabel} ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── SegmentedControl ─────────────────────────────────────────
export function SegmentedControl<T extends string>({ options, value, onChange, labels }: {
  options: T[]; value: T; onChange: (v: T) => void; labels: Record<T, string>;
}) {
  return (
    <View style={styles.segWrap}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt} activeOpacity={0.85}
            onPress={() => { Haptics.selectionAsync().catch(()=>{}); onChange(opt); }}
            style={[styles.segItem, active && styles.segItemActive]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{labels[opt]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── ChipRow ──────────────────────────────────────────────────
export function Chip({ label, active, onPress, icon }: {
  label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {icon && <Ionicons name={icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurfaceSecondary} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── EmptyState (no cartoons) ─────────────────────────────────
export function EmptyState({ icon = 'sparkles-outline', title, description, actionLabel, onAction }: {
  icon?: keyof typeof Ionicons.glyphMap; title: string; description?: string;
  actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.emptyWrap}>
      <LinearGradient
        colors={gradients.cardGoldSubtle}
        style={styles.emptyIconWrap}
      >
        <Ionicons name={icon} size={40} color={colors.brand} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description && <Text style={styles.emptyDesc}>{description}</Text>}
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.lg, alignSelf: 'stretch', paddingHorizontal: spacing['2xl'] }}>
          <PrimaryButton label={actionLabel} onPress={onAction} icon="add-circle" />
        </View>
      )}
    </View>
  );
}

// ─── SkeletonBox (loading placeholder) ────────────────────────
export function SkeletonBox({ width, height, style }: { width?: number|string; height: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: (width ?? '100%') as any, height, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, opacity: 0.6 }, style]} />;
}

// ─── Badge ────────────────────────────────────────────────────
export function Badge({ label, tone = 'default', style }: {
  label: string; tone?: 'default' | 'gold' | 'success' | 'warning' | 'error' | 'info';
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'gold' ? colors.brandTertiary
    : tone === 'success' ? colors.successSoft
    : tone === 'warning' ? colors.warningSoft
    : tone === 'error' ? colors.errorSoft
    : tone === 'info' ? colors.infoSoft
    : colors.surfaceTertiary;
  const fg = tone === 'gold' ? colors.brand
    : tone === 'success' ? colors.success
    : tone === 'warning' ? colors.warning
    : tone === 'error' ? colors.error
    : tone === 'info' ? colors.info
    : colors.onSurfaceSecondary;
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ─── ListItem (for More menu) ─────────────────────────────────
export function ListItem({ icon, title, subtitle, onPress, badge, tone = 'gold' }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string;
  onPress?: () => void; badge?: string; tone?: 'gold' | 'default';
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.listItem}>
      <View style={[styles.listIconWrap, tone === 'gold' && { backgroundColor: colors.brandTertiary }]}>
        <Ionicons name={icon} size={20} color={tone === 'gold' ? colors.brand : colors.onSurface} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle && <Text style={styles.listSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {badge && <Badge label={badge} tone="gold" />}
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </TouchableOpacity>
  );
}

// ─── Divider ──────────────────────────────────────────────────
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.divider }, style]} />;
}

// ─── ScreenHeader ─────────────────────────────────────────────
export function ScreenHeader({ title, onBack, rightIcon, onRight, subtitle }: {
  title: string; onBack?: () => void; rightIcon?: keyof typeof Ionicons.glyphMap;
  onRight?: () => void; subtitle?: string;
}) {
  return (
    <View style={styles.screenHeader}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.hBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
      ) : <View style={styles.hBtn} />}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.hTitle} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={styles.hSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {rightIcon && onRight ? (
        <TouchableOpacity onPress={onRight} style={styles.hBtn} activeOpacity={0.6}>
          <Ionicons name={rightIcon} size={22} color={colors.brand} />
        </TouchableOpacity>
      ) : <View style={styles.hBtn} />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  pbtn: {
    borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg, ...shadows.cardGold,
  },
  pbtnText: { fontWeight: '800', color: colors.onBrandPrimary },

  sbtn: {
    borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg, borderWidth: 1.5, borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  sbtnText: { fontWeight: '700', color: colors.brand },

  ghost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  ghostText: { fontSize: 14, fontWeight: '600', color: colors.onSurfaceSecondary },

  statCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  statIconWrap: {
    width: 36, height: 36, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  statLabel: { ...typography.labelSmall, color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  statValue: { ...typography.titleLarge, color: colors.onSurface },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: spacing.xs },
  trendText: { fontSize: 11, fontWeight: '700' },

  actionCard: {
    width: 96, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceTertiary,
  },
  actionLabel: { ...typography.labelSmall, color: colors.onSurface, textAlign: 'center' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.titleMedium, color: colors.onSurface },
  sectionSubtitle: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  sectionAction: { ...typography.labelMedium, color: colors.brand },

  segWrap: {
    flexDirection: 'row', backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, padding: 4, marginHorizontal: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  segItem: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
  segItemActive: { backgroundColor: colors.brand },
  segText: { ...typography.labelMedium, color: colors.onSurfaceSecondary },
  segTextActive: { color: colors.onBrandPrimary, fontWeight: '800' },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.labelMedium, color: colors.onSurfaceSecondary },
  chipTextActive: { color: colors.onBrandPrimary },

  emptyWrap: { alignItems: 'center', paddingVertical: spacing['3xl'], paddingHorizontal: spacing.xl },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.brandTertiary,
  },
  emptyTitle: { ...typography.titleMedium, color: colors.onSurface, textAlign: 'center', marginBottom: spacing.xs },
  emptyDesc: { ...typography.bodyMedium, color: colors.onSurfaceSecondary, textAlign: 'center', lineHeight: 20 },

  badge: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.sm, alignSelf: 'flex-start',
  },
  badgeText: { ...typography.labelSmall },

  listItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  listIconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceTertiary,
  },
  listTitle: { ...typography.bodyLarge, color: colors.onSurface, fontWeight: '600' },
  listSubtitle: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },

  screenHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  hBtn: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  hTitle: { ...typography.titleMedium, color: colors.onSurface },
  hSubtitle: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
});
