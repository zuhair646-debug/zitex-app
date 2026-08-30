import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Alert, RefreshControl, TextInput, Switch, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../_layout';
import { colors, spacing, radius, typography, shadows } from '../../src/theme/tokens';
import { Chip, EmptyState, SkeletonBox, Badge, PrimaryButton } from '../../src/components/ui';

export default function MerchantProducts() {
  const router = useRouter();
  const { apiCall } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'in_stock' | 'out' | 'featured' | 'low'>('all');

  const load = useCallback(async () => {
    try { const d = await apiCall('/api/merchant/products'); setProducts(Array.isArray(d) ? d : []); }
    catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStock = async (p: any) => {
    // Optimistic
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, in_stock: !x.in_stock } : x));
    try {
      await apiCall(`/api/merchant/products/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...p, in_stock: !p.in_stock }),
      });
    } catch (e: any) {
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, in_stock: p.in_stock } : x));
      Alert.alert('خطأ', 'تعذّر تحديث حالة المخزون');
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('حذف منتج', `هل أنت متأكد من حذف "${name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        try { await apiCall(`/api/merchant/products/${id}`, { method: 'DELETE' }); load(); }
        catch (e: any) { Alert.alert('خطأ', e.message); }
      }}
    ]);
  };

  const filtered = useMemo(() => {
    let arr = products;
    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter(p => (p.name_ar || p.name_en || '').toLowerCase().includes(q));
    if (filter === 'in_stock') arr = arr.filter(p => p.in_stock);
    else if (filter === 'out') arr = arr.filter(p => !p.in_stock);
    else if (filter === 'featured') arr = arr.filter(p => p.featured);
    else if (filter === 'low') arr = arr.filter(p => (p.stock_quantity ?? 999) < 5);
    return arr;
  }, [products, query, filter]);

  const total = products.length;
  const outCount = products.filter(p => !p.in_stock).length;
  const lowCount = products.filter(p => (p.stock_quantity ?? 999) < 5).length;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>المنتجات</Text>
            <Text style={s.subtitle}>{total} منتج • {outCount} نفدت • {lowCount} منخفض</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/merchant/product-form')} style={s.addBtn} activeOpacity={0.85}>
            <Ionicons name="add" size={24} color={colors.onBrandPrimary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
          <TextInput
            value={query} onChangeText={setQuery} placeholder="ابحث عن منتج..."
            placeholderTextColor={colors.onSurfaceTertiary} style={s.searchInput}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0, maxHeight: 44 }}>
          <Chip label={`الكل (${total})`} active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="متوفر" icon="checkmark-circle" active={filter === 'in_stock'} onPress={() => setFilter('in_stock')} />
          <Chip label={`منخفض (${lowCount})`} icon="warning" active={filter === 'low'} onPress={() => setFilter('low')} />
          <Chip label={`نفد (${outCount})`} icon="close-circle" active={filter === 'out'} onPress={() => setFilter('out')} />
          <Chip label="مميز" icon="star" active={filter === 'featured'} onPress={() => setFilter('featured')} />
        </ScrollView>

        {/* List */}
        {loading ? (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <SkeletonBox height={110} /><SkeletonBox height={110} /><SkeletonBox height={110} />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title={products.length === 0 ? 'لا توجد منتجات بعد' : 'لا نتائج مطابقة'}
            description={products.length === 0 ? 'ابدأ ببناء متجرك بإضافة أول منتج' : 'جرّب فلتراً مختلفاً أو مسح البحث'}
            actionLabel={products.length === 0 ? 'إضافة منتج' : undefined}
            onAction={products.length === 0 ? () => router.push('/merchant/product-form') : undefined}
          />
        ) : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            {filtered.map(p => (
              <View key={p.id} style={s.card}>
                <View style={s.cardRow}>
                  <Image
                    source={{ uri: p.images?.[0] || 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=200' }}
                    style={s.img}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.pname} numberOfLines={2}>{p.name_ar || p.name_en}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                      {p.discount_price ? (
                        <>
                          <Text style={s.pprice}>{p.discount_price}</Text>
                          <Text style={s.pOldPrice}>{p.price}</Text>
                          <Text style={s.pCurrency}>ر.س</Text>
                        </>
                      ) : (
                        <><Text style={s.pprice}>{p.price}</Text><Text style={s.pCurrency}>ر.س</Text></>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: 4, flexWrap: 'wrap' }}>
                      {p.featured && <Badge label="⭐ مميز" tone="gold" />}
                      {(p.stock_quantity ?? 999) < 5 && p.in_stock && <Badge label={`متبقي ${p.stock_quantity}`} tone="warning" />}
                      {!!p.category && <Badge label={p.category} tone="info" />}
                    </View>
                  </View>
                </View>
                <View style={s.cardActions}>
                  <View style={s.stockRow}>
                    <Ionicons
                      name={p.in_stock ? 'checkmark-circle' : 'close-circle'}
                      size={16}
                      color={p.in_stock ? colors.success : colors.error}
                    />
                    <Text style={[s.stockLabel, { color: p.in_stock ? colors.success : colors.error }]}>
                      {p.in_stock ? 'متوفر' : 'غير متوفر'}
                    </Text>
                    <Switch
                      value={p.in_stock}
                      onValueChange={() => toggleStock(p)}
                      trackColor={{ false: colors.surfaceTertiary, true: colors.brand }}
                      thumbColor={colors.onBrandPrimary}
                    />
                  </View>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/merchant/product-form', params: { id: p.id } })}
                    style={s.editBtn} activeOpacity={0.7}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.brand} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(p.id, p.name_ar || p.name_en)}
                    style={s.delBtn} activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
  },
  title: { ...typography.displaySmall, color: colors.onSurface },
  subtitle: { ...typography.caption, color: colors.onSurfaceSecondary, marginTop: 2 },
  addBtn: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    ...shadows.cardGold,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, padding: 0 },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },

  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  img: { width: 78, height: 78, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  pname: { ...typography.bodyLarge, color: colors.onSurface, fontWeight: '700' },
  pprice: { ...typography.titleMedium, color: colors.brand },
  pOldPrice: { fontSize: 12, color: colors.onSurfaceTertiary, textDecorationLine: 'line-through' },
  pCurrency: { fontSize: 11, color: colors.onSurfaceSecondary },
  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stockLabel: { ...typography.labelSmall, fontWeight: '700' },
  editBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  delBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.errorSoft, alignItems: 'center', justifyContent: 'center' },
});
