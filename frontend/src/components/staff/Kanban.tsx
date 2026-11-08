import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';

export type KanbanColumn = { key: string; label: string; color: string };

const COL_W = Math.min(300, Dimensions.get('window').width * 0.78);

/** Horizontal swipeable board: one column per status, cards rendered by caller. */
export function KanbanBoard<T extends { id: string; status: string }>({ columns, items, renderCard, emptyLabel }: {
  columns: KanbanColumn[]; items: T[]; renderCard: (it: T) => React.ReactNode; emptyLabel: string;
}) {
  const s = useS();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.board} snapToInterval={COL_W + 12} decelerationRate="fast">
      {columns.map(c => {
        const list = items.filter(i => i.status === c.key);
        return (
          <View key={c.key} style={s.col} testID={`kanban-col-${c.key}`}>
            <View style={s.colHead}>
              <View style={[s.dot, { backgroundColor: c.color }]} />
              <Text style={s.colTitle} numberOfLines={1}>{c.label}</Text>
              <View style={s.count}><Text style={s.countTxt}>{list.length}</Text></View>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 140 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {list.length === 0 ? <Text style={s.empty}>{emptyLabel}</Text> : list.map(renderCard)}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

export const PRIORITY_COLOR: Record<string, string> = { low: '#94A3B8', normal: '#3B82F6', high: '#F59E0B', urgent: '#EF4444' };

function useS() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    board: { paddingHorizontal: 16, gap: 12, paddingTop: 4 },
    col: { width: COL_W, flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 18, padding: 10, borderWidth: 1, borderColor: colors.border },
    colHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    colTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: colors.onSurface },
    count: { minWidth: 26, height: 22, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    countTxt: { fontSize: 12, fontWeight: '800', color: colors.onSurfaceSecondary },
    empty: { textAlign: 'center', color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 24 },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
