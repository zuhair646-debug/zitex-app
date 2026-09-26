/**
 * useThemedStyles — safe StyleSheet factory that:
 * - Re-runs when theme (mode/custom/font) changes via `themeKey`
 * - Prevents recursion bug (compare to old pattern where useSStyles called itself)
 * - Zero visual impact — screens keep same look, only re-compute styles on theme change
 *
 * Usage:
 *   const styles = useThemedStyles(() => StyleSheet.create({
 *     card: { backgroundColor: colors.surface }
 *   }));
 */
import { useMemo } from 'react';
import { useTheme } from './ThemeContext';

export function useThemedStyles<T extends object>(factory: () => T): T {
  const { themeKey } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [themeKey]);
}
