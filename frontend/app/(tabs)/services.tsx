import { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { colors } from '../../src/theme/tokens';
import { useAuth } from '../_layout';
import { useT } from '../../src/i18n';
import TranslatableName from '../../src/components/TranslatableName';
import { mediaUrlSync } from '../../src/utils/upload';

// Real default photos per service icon — the merchant replaces them from Dashboard › Services (images)
const SVC_PHOTOS: Record<string, string> = {
  construct: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=900',
  'phone-portrait': 'https://images.unsplash.com/photo-1621330396173-e41b1cafd17f?w=900',
  flash: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=900',
  camera: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=900',
  'cloud-download': 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=900',
  'volume-high': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=900',
  'hardware-chip': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=900',
  home: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=900',
  'battery-charging': 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=900',
  water: 'https://images.unsplash.com/photo-1512054502232-10a0a035d672?w=900',
  'code-slash': 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=900',
  'shield-checkmark': 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=900',
  search: 'https://images.unsplash.com/photo-1588508065123-287b28e013da?w=900',
};

export default function ServicesScreen() {
  const { lang } = useT();
  const s = useSStyles();
  const router = useRouter();
  const { apiCall } = useAuth();
  const { t } = useT();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const currency = t('common.currency');

  useEffect(() => {
    (async () => {
      try { const d = await apiCall('/api/services'); setServices(d); }
      catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}><ActivityIndicator size="large" color={colors.brand} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>{t('cs.title')}</Text>
          <TouchableOpacity testID="service-search-btn" style={s.searchBtn} onPress={() => router.push('/search' as any)}>
            <Ionicons name="search-outline" size={20} color={colors.onSurfaceSecondary} />
          </TouchableOpacity>
        </View>

        <View style={s.promoCard}>
          <View style={s.promoContent}>
            <Text style={s.promoTag}>{t('cs.promoTag')}</Text>
            <Text style={s.promoTitle}>{t('cs.promoTitle')}</Text>
            <Text style={s.promoDesc}>{t('cs.promoDesc')}</Text>
            <TouchableOpacity testID="book-service-btn" style={s.promoBtn} onPress={() => services[0] && router.push({ pathname: '/service/[id]', params: { id: services[0].id } })}>
              <Text style={s.promoBtnText}>{t('cs.promoBtn')}</Text>
            </TouchableOpacity>
          </View>
          <Image source={{ uri: SVC_PHOTOS.construct }} style={s.promoPhoto} />
        </View>

        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t('cs.allServices')}</Text>
            <Text style={s.sectionCount}>{t('cs.serviceCount', { n: services.length })}</Text>
          </View>
          {services.map((svc: any) => (
            <TouchableOpacity testID={`service-${svc.id}`} key={svc.id} style={s.serviceCard}
              onPress={() => router.push({ pathname: '/service/[id]', params: { id: svc.id } })}>
              <View style={s.servicePhotoWrap}>
                <Image source={{ uri: svc.images?.[0] ? mediaUrlSync(svc.images[0]) : (SVC_PHOTOS[svc.icon] || SVC_PHOTOS.construct) }} style={s.servicePhoto} />
                <View style={[s.serviceIcon, { backgroundColor: svc.color || colors.brand }]}>
                  <Ionicons name={(svc.icon || 'construct') as any} size={18} color="#FFFFFF" />
                </View>
              </View>
              <View style={s.serviceInfo}>
                <TranslatableName
                  text={(lang === 'ar' ? (svc.name_ar || svc.name) : (svc.name || svc.name_ar))}
                  style={s.serviceName}
                  numberOfLines={1}
                  iconSize={12}
                />
                {!!svc.desc && (
                  <TranslatableName
                    text={svc.desc}
                    style={s.serviceDesc}
                    numberOfLines={1}
                    iconSize={11}
                  />
                )}
                <View style={s.serviceBottom}>
                  <Text style={s.serviceRequests}>{svc.total_requests} {t('cs.requests')}</Text>
                  <Text style={s.servicePrice}>{t('cs.priceFrom', { price: svc.price, c: currency })}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function useSStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.onSurface },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  promoCard: { marginHorizontal: 20, borderRadius: 20, backgroundColor: colors.brand, flexDirection: 'row', padding: 20, marginBottom: 24, overflow: 'hidden' },
  promoContent: { flex: 1 },
  promoTag: { fontSize: 11, fontWeight: '700', color: colors.onBrandPrimary, opacity: 0.85, marginBottom: 6 },
  promoTitle: { fontSize: 22, fontWeight: '800', color: colors.onBrandPrimary, lineHeight: 30, marginBottom: 6 },
  promoDesc: { fontSize: 12, color: colors.onBrandPrimary, opacity: 0.85, marginBottom: 14 },
  promoBtn: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  promoBtnText: { fontSize: 13, fontWeight: '700', color: '#1A1405' },
  promoImgWrap: { width: 100, alignItems: 'center', justifyContent: 'center', opacity: 0.3 },
  section: { paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  sectionCount: { fontSize: 13, color: colors.onSurfaceTertiary },
  serviceCard: { backgroundColor: colors.surface, borderRadius: 20, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  servicePhotoWrap: { width: '100%', height: 150 },
  servicePhoto: { width: '100%', height: '100%' },
  promoPhoto: { width: 110, height: 120, borderRadius: 14 },
  serviceIcon: { position: 'absolute', bottom: 10, start: 10, width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  serviceInfo: { padding: 14 },
  serviceName: { fontSize: 15, fontWeight: '600', color: colors.onSurface, marginBottom: 3 },
  serviceDesc: { fontSize: 12, color: colors.onSurfaceSecondary, marginBottom: 6 },
  serviceBottom: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  serviceRequests: { fontSize: 11, color: colors.onSurfaceTertiary, fontWeight: '500' },
  servicePrice: { fontSize: 12, color: colors.brand, fontWeight: '700' },
}), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable
}
