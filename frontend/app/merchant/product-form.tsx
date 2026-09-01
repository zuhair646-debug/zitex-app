import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Switch,
  Alert, ActivityIndicator, Platform, StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../_layout';
import { uploadMedia, mediaUrlSync } from '../../src/utils/upload';
import { colors, spacing, radius } from '../../src/theme/tokens';

type Variant = { name: string; value: string };
type BranchStock = { branch_id: string; branch_name: string; quantity: number };

export default function ProductForm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { apiCall } = useAuth();
  const [cats, setCats] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<any>({
    name_ar: '', name_en: '', description_ar: '', description_en: '',
    category_id: '', brand_id: '', price: '', discount_price: '',
    condition: 'new', images: [], video: '',
    in_stock: true, featured: false, published: true,
    variants: [] as Variant[],
    branch_stock: [] as BranchStock[],
    sku: '', tags: '',
    colors: [] as { name: string; hex: string }[],
    warranty_type: 'none',
    shop_warranty_days: '', shop_warranty_terms: '',
    manufacturer_name: '', manufacturer_days: '',
    manufacturer_url: '', manufacturer_phone: '', manufacturer_terms: '',
  });
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');

  useEffect(() => {
    (async () => {
      try {
        const [c, b, br] = await Promise.all([
          apiCall('/api/categories'),
          apiCall('/api/brands'),
          apiCall('/api/merchant/branches').catch(() => []),
        ]);
        setCats(c); setBrands(b);
        setBranches(Array.isArray(br) ? br : []);
        if (id) {
          const p = await apiCall(`/api/products/${id}`);
          setData({
            ...p,
            price: String(p.price),
            discount_price: p.discount_price ? String(p.discount_price) : '',
            images: p.images?.length ? p.images : [],
            video: p.video || '',
            variants: p.variants || [],
            branch_stock: p.branch_stock || [],
            sku: p.sku || '',
            tags: (p.tags || []).join(', '),
            colors: p.colors || [],
            warranty_type: p.warranty_type || 'none',
            shop_warranty_days: p.shop_warranty_days ? String(p.shop_warranty_days) : '',
            shop_warranty_terms: p.shop_warranty_terms || '',
            manufacturer_name: p.manufacturer_name || '',
            manufacturer_days: p.manufacturer_days ? String(p.manufacturer_days) : '',
            manufacturer_url: p.manufacturer_url || '',
            manufacturer_phone: p.manufacturer_phone || '',
            manufacturer_terms: p.manufacturer_terms || '',
          });
        }
      } catch (e: any) { Alert.alert('خطأ', e.message); }
    })();
  }, []);

  const pickImages = async () => {
    if (data.images.length >= 8) { Alert.alert('الحد الأقصى', 'يمكن رفع 8 صور فقط'); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('صلاحية مطلوبة', 'يرجى منح إذن الوصول إلى الصور');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsMultipleSelection: true,
      selectionLimit: Math.min(8 - data.images.length, 8),
      quality: 0.85,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const a of res.assets) {
        const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
        uploaded.push(up.path);
      }
      setData((d: any) => ({ ...d, images: [...d.images, ...uploaded] }));
    } catch (e: any) { Alert.alert('خطأ في الرفع', e.message); }
    finally { setUploading(false); }
  };

  const takePhoto = async () => {
    if (data.images.length >= 8) { Alert.alert('الحد الأقصى', 'يمكن رفع 8 صور فقط'); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية مطلوبة', 'يرجى منح إذن الكاميرا'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85, mediaTypes: ['images'] as any });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      setData((d: any) => ({ ...d, images: [...d.images, up.path] }));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('صلاحية مطلوبة', 'يرجى منح إذن المكتبة'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'] as any, quality: 0.85, videoMaxDuration: 30,
    });
    if (res.canceled) return;
    setUploading(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      setData((d: any) => ({ ...d, video: up.path }));
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setUploading(false); }
  };

  const removeImage = (i: number) => {
    setData((d: any) => ({ ...d, images: d.images.filter((_: any, ix: number) => ix !== i) }));
  };

  const addVariant = () => setData((d: any) => ({ ...d, variants: [...d.variants, { name: '', value: '' }] }));
  const updateVariant = (i: number, key: 'name' | 'value', v: string) =>
    setData((d: any) => ({ ...d, variants: d.variants.map((x: Variant, ix: number) => ix === i ? { ...x, [key]: v } : x) }));
  const removeVariant = (i: number) =>
    setData((d: any) => ({ ...d, variants: d.variants.filter((_: any, ix: number) => ix !== i) }));

  const setBranchStock = (bid: string, bname: string, qty: string) => {
    const q = parseInt(qty || '0', 10) || 0;
    setData((d: any) => {
      const exists = d.branch_stock.find((x: BranchStock) => x.branch_id === bid);
      const next = exists
        ? d.branch_stock.map((x: BranchStock) => x.branch_id === bid ? { ...x, quantity: q } : x)
        : [...d.branch_stock, { branch_id: bid, branch_name: bname, quantity: q }];
      return { ...d, branch_stock: next };
    });
  };
  const getBranchQty = (bid: string) =>
    data.branch_stock.find((x: BranchStock) => x.branch_id === bid)?.quantity ?? '';

  const submit = async () => {
    if (!data.name_ar || !data.price) {
      Alert.alert('حقول مطلوبة', 'الاسم بالعربية والسعر مطلوبان');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...data,
        price: parseFloat(data.price),
        discount_price: data.discount_price ? parseFloat(data.discount_price) : null,
        images: data.images.filter((x: string) => x && x.trim()),
        tags: typeof data.tags === 'string'
          ? data.tags.split(',').map((s: string) => s.trim()).filter(Boolean)
          : data.tags,
        variants: data.variants.filter((v: Variant) => v.name.trim() && v.value.trim()),
        colors: (data.colors || []).filter((c: any) => c.name && c.hex),
        shop_warranty_days: parseInt(data.shop_warranty_days || '0', 10) || 0,
        manufacturer_days: parseInt(data.manufacturer_days || '0', 10) || 0,
      };
      if (id) await apiCall(`/api/merchant/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiCall('/api/merchant/products', { method: 'POST', body: JSON.stringify(body) });
      Alert.alert('✅ تم', id ? 'تم تحديث المنتج بنجاح' : 'تم إنشاء المنتج بنجاح',
        [{ text: 'موافق', onPress: () => router.back() }]);
    } catch (e: any) { Alert.alert('خطأ', e.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.brand} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{id ? 'تعديل المنتج' : 'منتج جديد'}</Text>
          <View style={s.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
          {/* Card: Basic Info */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="pricetag" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>المعلومات الأساسية</Text>
            </View>
            <Text style={s.label}>الاسم بالعربية *</Text>
            <TextInput style={s.input} value={data.name_ar} placeholderTextColor={colors.onSurfaceTertiary}
              onChangeText={t => setData({ ...data, name_ar: t })} placeholder="مثال: آيفون 15 برو ماكس" />
            <Text style={s.label}>الاسم بالإنجليزية</Text>
            <TextInput style={s.input} value={data.name_en} placeholderTextColor={colors.onSurfaceTertiary}
              onChangeText={t => setData({ ...data, name_en: t })} placeholder="iPhone 15 Pro Max" />
            <Text style={s.label}>الوصف بالعربية</Text>
            <TextInput style={[s.input, { height: 96 }]} multiline value={data.description_ar}
              placeholderTextColor={colors.onSurfaceTertiary}
              onChangeText={t => setData({ ...data, description_ar: t })}
              placeholder="اكتب وصفاً شاملاً للمنتج، مميزاته، والفوائد..." />
            <Text style={s.label}>الوصف بالإنجليزية (اختياري)</Text>
            <TextInput style={[s.input, { height: 72 }]} multiline value={data.description_en}
              placeholderTextColor={colors.onSurfaceTertiary}
              onChangeText={t => setData({ ...data, description_en: t })} placeholder="English description..." />
          </View>

          {/* Card: Media */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="images" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>الوسائط</Text>
              <Text style={s.cardHelper}>{data.images.length}/8 صور</Text>
            </View>

            <View style={s.mediaGrid}>
              {data.images.map((img: string, i: number) => (
                <View key={i} style={s.mediaSlot}>
                  <Image source={{ uri: mediaUrlSync(img) }} style={s.mediaImage} contentFit="cover" />
                  <TouchableOpacity style={s.mediaRemove} onPress={() => removeImage(i)}>
                    <Ionicons name="close" size={14} color="white" />
                  </TouchableOpacity>
                </View>
              ))}
              {data.images.length < 8 && (
                <TouchableOpacity style={s.mediaAdd} onPress={pickImages} disabled={uploading}>
                  <Ionicons name="add" size={26} color={colors.brand} />
                  <Text style={s.mediaAddText}>معرض</Text>
                </TouchableOpacity>
              )}
              {data.images.length < 8 && (
                <TouchableOpacity style={s.mediaAdd} onPress={takePhoto} disabled={uploading}>
                  <Ionicons name="camera" size={22} color={colors.brand} />
                  <Text style={s.mediaAddText}>كاميرا</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ height: spacing.md }} />
            <Text style={s.label}>فيديو المنتج (اختياري، حتى 30 ثانية)</Text>
            {data.video ? (
              <View style={s.videoRow}>
                <Ionicons name="videocam" size={20} color={colors.brand} />
                <Text style={s.videoText} numberOfLines={1}>تم رفع الفيديو ✓</Text>
                <TouchableOpacity onPress={() => setData({ ...data, video: '' })}>
                  <Ionicons name="close-circle" size={22} color={colors.error} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.videoBtn} onPress={pickVideo} disabled={uploading}>
                <Ionicons name="videocam-outline" size={20} color={colors.brand} />
                <Text style={s.videoBtnText}>اختر فيديو من المعرض</Text>
              </TouchableOpacity>
            )}
            {uploading && (
              <View style={s.uploadingRow}>
                <ActivityIndicator color={colors.brand} />
                <Text style={s.uploadingText}>جارٍ الرفع...</Text>
              </View>
            )}
          </View>

          {/* Card: Pricing */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="cash" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>التسعير</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>السعر (ر.س) *</Text>
                <TextInput style={s.input} keyboardType="numeric" value={data.price}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  onChangeText={t => setData({ ...data, price: t })} placeholder="999" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>سعر التخفيض</Text>
                <TextInput style={s.input} keyboardType="numeric" value={data.discount_price}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  onChangeText={t => setData({ ...data, discount_price: t })} placeholder="799" />
              </View>
            </View>
            <Text style={s.label}>SKU / رمز المنتج</Text>
            <TextInput style={s.input} value={data.sku} placeholderTextColor={colors.onSurfaceTertiary}
              onChangeText={t => setData({ ...data, sku: t })} placeholder="TECH-IP15PM-256" autoCapitalize="characters" />
          </View>

          {/* Card: Category / Brand / Condition */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="grid" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>التصنيف والعلامة</Text>
            </View>
            <Text style={s.label}>الفئة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {cats.map(c => {
                const active = data.category_id === c.id;
                return (
                  <TouchableOpacity key={c.id} onPress={() => setData({ ...data, category_id: c.id })} style={[s.chip, active && s.chipActive]}>
                    <Text style={[s.chipText, active && s.chipTextActive]}>{c.name_ar || c.name_en}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={s.label}>الماركة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {brands.map(b => {
                const active = data.brand_id === b.id;
                return (
                  <TouchableOpacity key={b.id} onPress={() => setData({ ...data, brand_id: b.id })} style={[s.chip, active && s.chipActive]}>
                    <Text style={[s.chipText, active && s.chipTextActive]}>{b.name_ar || b.name_en}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={s.label}>الحالة</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {[
                { k: 'new', l: '🆕 جديد' },
                { k: 'used', l: '♻️ مستعمل' },
                { k: 'refurbished', l: '🔧 مجدَّد' },
              ].map(opt => {
                const active = data.condition === opt.k;
                return (
                  <TouchableOpacity key={opt.k} onPress={() => setData({ ...data, condition: opt.k })} style={[s.condPill, active && s.condPillActive]}>
                    <Text style={[s.condPillText, active && s.condPillTextActive]}>{opt.l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Card: Variants */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="options" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>المتغيرات (لون / حجم / تخزين)</Text>
            </View>
            {data.variants.map((v: Variant, i: number) => (
              <View key={i} style={s.variantRow}>
                <TextInput style={[s.input, { flex: 1 }]} value={v.name}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  onChangeText={t => updateVariant(i, 'name', t)} placeholder="النوع (مثال: لون)" />
                <TextInput style={[s.input, { flex: 1 }]} value={v.value}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  onChangeText={t => updateVariant(i, 'value', t)} placeholder="القيمة (أسود، أزرق...)" />
                <TouchableOpacity onPress={() => removeVariant(i)} style={s.variantRemove}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.addRow} onPress={addVariant}>
              <Ionicons name="add-circle" size={18} color={colors.brand} />
              <Text style={s.addRowText}>إضافة متغير</Text>
            </TouchableOpacity>
          </View>

          {/* Card: Color Circles */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="color-palette" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>الألوان المتوفرة</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.onSurfaceSecondary, marginBottom: 8 }}>
              اضغط على الدائرة لتغيير اللون، ثم اكتب اسمه واضغط ➕
            </Text>
            {data.colors.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {data.colors.map((c: any, i: number) => (
                  <View key={i} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ position: 'relative' }}>
                      <View style={[s.colorDot, { backgroundColor: c.hex }]} />
                      <TouchableOpacity
                        style={s.colorDotRm}
                        onPress={() => setData((d: any) => ({ ...d, colors: d.colors.filter((_: any, ix: number) => ix !== i) }))}>
                        <Ionicons name="close" size={12} color="white" />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 10, color: colors.onSurface, maxWidth: 60 }} numberOfLines={1}>{c.name}</Text>
                  </View>
                ))}
              </View>
            )}
            {/* Presets */}
            <Text style={{ fontSize: 11, color: colors.onSurfaceSecondary, marginBottom: 6 }}>ألوان جاهزة (اضغط لإضافة):</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[
                { name: 'أسود', hex: '#1A1A1A' }, { name: 'أبيض', hex: '#F9F9F9' },
                { name: 'ذهبي', hex: '#D4A017' }, { name: 'فضي', hex: '#C0C0C0' },
                { name: 'أزرق', hex: '#007AFF' }, { name: 'أحمر', hex: '#EF4444' },
                { name: 'أخضر', hex: '#10B981' }, { name: 'وردي', hex: '#EC4899' },
                { name: 'بنفسجي', hex: '#8833FF' }, { name: 'تيتانيوم', hex: '#A0A0A0' },
              ].map(p => (
                <TouchableOpacity key={p.hex} onPress={() => {
                  if (data.colors.find((c: any) => c.hex === p.hex)) return;
                  setData((d: any) => ({ ...d, colors: [...d.colors, p] }));
                }}>
                  <View style={[s.colorPresetDot, { backgroundColor: p.hex }]} />
                </TouchableOpacity>
              ))}
            </View>
            {/* Custom color add */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => {
                const hexes = ['#000','#F00','#0F0','#00F','#FF0','#F0F','#0FF','#F80','#80F','#08F','#F08','#888'];
                setNewColorHex(hexes[Math.floor(Math.random()*hexes.length)]);
              }}>
                <View style={[s.colorDot, { backgroundColor: newColorHex, borderWidth: 2, borderColor: colors.brand }]} />
              </TouchableOpacity>
              <TextInput style={[s.input, { flex: 1 }]} value={newColorName} placeholderTextColor={colors.onSurfaceTertiary}
                onChangeText={setNewColorName} placeholder="اسم اللون (مثال: أزرق سماوي)" />
              <TouchableOpacity onPress={() => {
                if (!newColorName.trim()) { Alert.alert('اسم اللون مطلوب'); return; }
                setData((d: any) => ({ ...d, colors: [...d.colors, { name: newColorName.trim(), hex: newColorHex }] }));
                setNewColorName(''); setNewColorHex('#000000');
              }} style={{ padding: 8 }}>
                <Ionicons name="add-circle" size={30} color={colors.brand} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Card: Warranty (Dual) */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="shield-checkmark" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>الضمان</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[
                { id: 'none', label: 'بدون ضمان', icon: 'close-circle' },
                { id: 'shop', label: 'ضمان المحل', icon: 'storefront' },
                { id: 'manufacturer', label: 'ضمان الشركة', icon: 'business' },
                { id: 'both', label: 'الاثنين معاً', icon: 'shield' },
              ].map(t => (
                <TouchableOpacity key={t.id} onPress={() => setData({ ...data, warranty_type: t.id })}
                  style={[s.warrTypeBtn, data.warranty_type === t.id && s.warrTypeBtnActive]}>
                  <Ionicons name={t.icon as any} size={14} color={data.warranty_type === t.id ? 'white' : colors.brand} />
                  <Text style={[s.warrTypeText, data.warranty_type === t.id && { color: 'white' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(data.warranty_type === 'shop' || data.warranty_type === 'both') && (
              <View style={s.warrSection}>
                <Text style={s.warrSectionTitle}>🏪 ضمان المحل</Text>
                <TextInput style={s.input} keyboardType="numeric" value={data.shop_warranty_days}
                  onChangeText={t => setData({ ...data, shop_warranty_days: t })}
                  placeholder="عدد الأيام (مثال: 90)" placeholderTextColor={colors.onSurfaceTertiary} />
                <TextInput style={[s.input, { height: 60, marginTop: 8 }]} multiline value={data.shop_warranty_terms}
                  onChangeText={t => setData({ ...data, shop_warranty_terms: t })}
                  placeholder="شروط ضمان المحل (اختياري)" placeholderTextColor={colors.onSurfaceTertiary} />
              </View>
            )}

            {(data.warranty_type === 'manufacturer' || data.warranty_type === 'both') && (
              <View style={s.warrSection}>
                <Text style={s.warrSectionTitle}>🏢 ضمان الشركة</Text>
                <TextInput style={s.input} value={data.manufacturer_name}
                  onChangeText={t => setData({ ...data, manufacturer_name: t })}
                  placeholder="اسم الشركة (Apple، Samsung...)" placeholderTextColor={colors.onSurfaceTertiary} />
                <TextInput style={[s.input, { marginTop: 8 }]} keyboardType="numeric" value={data.manufacturer_days}
                  onChangeText={t => setData({ ...data, manufacturer_days: t })}
                  placeholder="عدد الأيام (365)" placeholderTextColor={colors.onSurfaceTertiary} />
                <TextInput style={[s.input, { marginTop: 8 }]} autoCapitalize="none" value={data.manufacturer_url}
                  onChangeText={t => setData({ ...data, manufacturer_url: t })}
                  placeholder="رابط الدعم الرسمي (https://...)" placeholderTextColor={colors.onSurfaceTertiary} />
                <TextInput style={[s.input, { marginTop: 8 }]} keyboardType="phone-pad" value={data.manufacturer_phone}
                  onChangeText={t => setData({ ...data, manufacturer_phone: t })}
                  placeholder="هاتف التواصل مع الشركة" placeholderTextColor={colors.onSurfaceTertiary} />
                <TextInput style={[s.input, { height: 60, marginTop: 8 }]} multiline value={data.manufacturer_terms}
                  onChangeText={t => setData({ ...data, manufacturer_terms: t })}
                  placeholder="شروط ضمان الشركة (اختياري)" placeholderTextColor={colors.onSurfaceTertiary} />
              </View>
            )}
          </View>

          {/* Card: Multi-Branch Stock */}
          {branches.length > 0 && (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.iconBadge}><Ionicons name="business" size={16} color={colors.brand} /></View>
                <Text style={s.cardTitle}>المخزون في الفروع</Text>
              </View>
              {branches.map(b => (
                <View key={b.id} style={s.branchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.branchName}>{b.name}</Text>
                    <Text style={s.branchCode}>{b.branch_code || b.city}</Text>
                  </View>
                  <TextInput
                    style={s.branchQtyInput}
                    keyboardType="numeric"
                    value={String(getBranchQty(b.id))}
                    placeholderTextColor={colors.onSurfaceTertiary}
                    onChangeText={t => setBranchStock(b.id, b.name, t)}
                    placeholder="0"
                  />
                </View>
              ))}
            </View>
          )}

          {/* Card: Tags */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.iconBadge}><Ionicons name="pricetags" size={16} color={colors.brand} /></View>
              <Text style={s.cardTitle}>الكلمات المفتاحية</Text>
            </View>
            <TextInput style={s.input} value={data.tags} placeholderTextColor={colors.onSurfaceTertiary}
              onChangeText={t => setData({ ...data, tags: t })}
              placeholder="آيفون، هواتف، سامسونج (افصل بفاصلة)" />
          </View>

          {/* Card: Publish */}
          <View style={s.card}>
            <View style={s.toggle}><Text style={s.toggleLabel}>متوفر في المخزون</Text>
              <Switch value={data.in_stock} onValueChange={v => setData({ ...data, in_stock: v })}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }} thumbColor="white" /></View>
            <View style={s.toggle}><Text style={s.toggleLabel}>⭐ منتج مميز</Text>
              <Switch value={data.featured} onValueChange={v => setData({ ...data, featured: v })}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }} thumbColor="white" /></View>
            <View style={s.toggle}><Text style={s.toggleLabel}>منشور للعملاء</Text>
              <Switch value={data.published} onValueChange={v => setData({ ...data, published: v })}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }} thumbColor="white" /></View>
          </View>
        </ScrollView>

        {/* Sticky bottom CTA */}
        <View style={s.stickyBar}>
          <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={saving || uploading}>
            <LinearGradient colors={['#F5C518', '#D4AF37']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.submitInner}>
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <>
                  <Ionicons name={id ? 'save' : 'checkmark-circle'} size={18} color={colors.onBrandPrimary} />
                  <Text style={s.submitText}>{id ? 'حفظ التعديلات' : 'نشر المنتج'}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.onSurface },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm },
  iconBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.onSurface },
  cardHelper: { fontSize: 12, color: colors.onSurfaceSecondary },
  label: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, color: colors.onSurface, textAlign: 'right' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mediaSlot: { width: 88, height: 88, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary, position: 'relative' },
  mediaImage: { width: '100%', height: '100%' },
  mediaRemove: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.error, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  mediaAdd: { width: 88, height: 88, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandTertiary },
  mediaAddText: { fontSize: 11, color: colors.brand, marginTop: 4, fontWeight: '600' },
  videoBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  videoBtnText: { color: colors.brand, fontWeight: '600', fontSize: 13 },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md },
  videoText: { flex: 1, color: colors.brand, fontWeight: '600', fontSize: 13 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.brandTertiary, padding: spacing.sm, borderRadius: radius.md },
  uploadingText: { color: colors.brand, fontSize: 12, fontWeight: '600' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.onBrandPrimary, fontWeight: '700' },
  condPill: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  condPillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  condPillText: { fontSize: 13, color: colors.onSurfaceSecondary, fontWeight: '600' },
  condPillTextActive: { color: colors.onBrandPrimary, fontWeight: '700' },
  variantRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  variantRemove: { padding: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, alignSelf: 'flex-start' },
  addRowText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  branchName: { color: colors.onSurface, fontSize: 14, fontWeight: '600' },
  branchCode: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  branchQtyInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: 80, textAlign: 'center', color: colors.onSurface, fontWeight: '700', borderWidth: 1, borderColor: colors.border },
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  stickyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.lg, paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg },
  submitBtn: { borderRadius: radius.lg, overflow: 'hidden' },
  submitInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  submitText: { color: colors.onBrandPrimary, fontWeight: '800', fontSize: 16 },
  colorDot: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.border },
  colorPresetDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.border },
  colorDotRm: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.error, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  warrTypeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  warrTypeBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  warrTypeText: { fontSize: 12, color: colors.onSurface, fontWeight: '700' },
  warrSection: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border },
  warrSectionTitle: { fontSize: 13, fontWeight: '800', color: colors.brand, marginBottom: spacing.sm, textAlign: 'right' },
});
