import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GOLD = '#F5C518';
const BG = '#0B0C10';
const CARD = '#151721';
const BORDER = '#2A2D38';
const TEXT = '#F5F5F7';
const MUTED = '#9CA3AF';

/**
 * ShippingOptionsPicker — customer-facing widget shown in checkout.
 * Fetches available shipping carriers for the customer's destination
 * (city/lat/lng/branch) and lets them pick one. Emits (carrierCode, price) on select.
 */
export default function ShippingOptionsPicker({
  apiCall,
  branchId,
  lat,
  lng,
  cityCode,
  postalCode,
  weightKg = 1,
  cod = false,
  selectedCarrier,
  onSelect,
}: {
  apiCall: (path: string, options?: any) => Promise<any>;
  branchId?: string;
  lat?: number;
  lng?: number;
  cityCode?: string;
  postalCode?: string;
  weightKg?: number;
  cod?: boolean;
  selectedCarrier?: string;
  onSelect: (carrierCode: string, price: number, etaDays: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<any[]>([]);
  const [destination, setDestination] = useState<any>(null);

  useEffect(() => {
    if (!lat && !lng && !cityCode) { setLoading(false); return; }
    setLoading(true);
    apiCall('/api/checkout/shipping-options', {
      method: 'POST',
      body: JSON.stringify({
        branch_id: branchId || null,
        lat, lng, city_code: cityCode,
        postal_code: postalCode,
        weight_kg: weightKg, cod,
      }),
    })
      .then((d) => {
        setOptions(d.options || []);
        setDestination(d.destination);
        // Auto-select cheapest / highest priority
        if (!selectedCarrier && d.options?.length > 0) {
          onSelect(d.options[0].carrier_code, d.options[0].price_sar, d.options[0].eta_days);
        }
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [lat, lng, cityCode, branchId, weightKg, cod]);

  if (loading) {
    return (
      <View style={s.box}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (options.length === 0) {
    return (
      <View style={s.box}>
        <Ionicons name="airplane" size={14} color={MUTED} />
        <Text style={s.emptyText}>
          {destination?.city_code
            ? 'لا توجد شركة شحن متاحة لموقعك حالياً'
            : 'حدد موقع التوصيل لعرض خيارات الشحن الخارجي'}
        </Text>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Ionicons name="airplane" size={13} color={GOLD} />
        <Text style={s.title}>خيارات الشحن الخارجي</Text>
        {destination?.city_name_ar && (
          <View style={s.cityPill}>
            <Ionicons name="location" size={10} color={GOLD} />
            <Text style={s.cityText}>{destination.city_name_ar}</Text>
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {options.map((o: any) => {
          const active = selectedCarrier === o.carrier_code;
          return (
            <TouchableOpacity
              key={o.carrier_code}
              onPress={() => onSelect(o.carrier_code, o.price_sar, o.eta_days)}
              style={[s.card, { borderColor: active ? o.brand_color : BORDER, backgroundColor: active ? o.brand_color + '15' : CARD }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 18 }}>{o.logo}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, active && { color: o.brand_color }]}>{o.name_ar}</Text>
                  <Text style={s.eta}>{o.eta_days} أيام</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={14} color={o.brand_color} />}
              </View>
              <Text style={[s.price, active && { color: o.brand_color }]}>{o.price_sar} ر.س</Text>
              {o.cod_supported && (
                <View style={s.codBadge}>
                  <Text style={s.codText}>COD ✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 12 },
  emptyText: { color: MUTED, fontSize: 11, flex: 1, textAlign: 'right' },
  wrap: { marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { color: GOLD, fontSize: 12, fontWeight: '900', flex: 1, textAlign: 'right' },
  cityPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: GOLD + '20', borderColor: GOLD, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  cityText: { color: GOLD, fontSize: 10, fontWeight: '900' },
  card: { borderWidth: 1.5, borderRadius: 12, padding: 10, minWidth: 130, position: 'relative' },
  name: { color: TEXT, fontSize: 11, fontWeight: '900', textAlign: 'right' },
  eta: { color: MUTED, fontSize: 10, textAlign: 'right', marginTop: 1 },
  price: { color: TEXT, fontSize: 15, fontWeight: '900', textAlign: 'right', marginTop: 8 },
  codBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#10B98120', paddingHorizontal: 4, borderRadius: 4 },
  codText: { color: '#10B981', fontSize: 8, fontWeight: '900' },
});
