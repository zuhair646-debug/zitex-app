import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Linking, Alert as RNAlert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import { LP } from './theme';

const SEVERITY_COLORS: any = {
  info: LP.INFO,
  success: LP.SUCCESS,
  warning: LP.WARN,
  error: LP.DANGER,
};

const timeAgo = (iso?: string) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `${Math.floor(diff / 60)}د`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}س`;
  return `${Math.floor(diff / 86400)}ي`;
};

/* ══════════════════════ ALERTS BELL ══════════════════════ */
export function AlertsBell({ apiCall }: any) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/api/merchant/live-preview/alerts');
      setAlerts(d.alerts || []);
      setUnread(d.unread_count || 0);
    } catch (e) {}
  }, [apiCall]);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const openSheet = async () => {
    setOpen(true);
    setLoading(true);
    await load();
    setLoading(false);
  };

  const ackOne = async (id: string) => {
    try {
      await apiCall(`/api/merchant/live-preview/alerts/${id}/ack`, { method: 'POST' });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, ack: true } : a));
      setUnread(prev => Math.max(0, prev - 1));
    } catch (e: any) { RNAlert.alert('خطأ', e.message); }
  };

  const ackAll = async () => {
    try {
      await apiCall('/api/merchant/live-preview/alerts/ack-all', { method: 'POST' });
      setAlerts(prev => prev.map(a => ({ ...a, ack: true })));
      setUnread(0);
    } catch (e: any) { RNAlert.alert('خطأ', e.message); }
  };

  return (
    <>
      <TouchableOpacity style={s.bellBtn} onPress={openSheet} activeOpacity={0.8}>
        <Ionicons name="notifications" size={20} color={LP.GOLD} />
        {unread > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.sheetHead}>
              <TouchableOpacity onPress={() => setOpen(false)}><Ionicons name="close" size={22} color={LP.TEXT} /></TouchableOpacity>
              <Text style={s.sheetTitle}>التنبيهات ({unread} جديد)</Text>
              <TouchableOpacity onPress={ackAll} style={s.ackAllBtn}>
                <Ionicons name="checkmark-done" size={12} color={LP.BG} />
                <Text style={{ color: LP.BG, fontSize: 10, fontWeight: '900' }}>قراءة الكل</Text>
              </TouchableOpacity>
            </View>

            {loading ? <ActivityIndicator color={LP.GOLD} style={{ margin: 30 }} /> : (
              <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
                {alerts.length === 0 && (
                  <View style={{ alignItems: 'center', padding: 40 }}>
                    <Ionicons name="notifications-off" size={40} color={LP.MUTED} />
                    <Text style={{ color: LP.MUTED, marginTop: 8 }}>لا توجد تنبيهات</Text>
                  </View>
                )}
                {alerts.map((a: any) => {
                  const color = SEVERITY_COLORS[a.severity] || LP.INFO;
                  return (
                    <TouchableOpacity key={a.id} style={[s.alertRow, !a.ack && { backgroundColor: color + '10' }]} onPress={() => !a.ack && ackOne(a.id)} activeOpacity={0.7}>
                      <View style={[s.iconWrap, { backgroundColor: color + '25', borderColor: color + '55' }]}>
                        <Ionicons name={a.icon || 'alert-circle'} size={16} color={color} />
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={s.alertTitle} numberOfLines={1}>{a.title}</Text>
                          {!a.ack && <View style={[s.newDot, { backgroundColor: color }]} />}
                        </View>
                        <Text style={s.alertMsg} numberOfLines={2}>{a.message}</Text>
                        <Text style={s.alertTime}>{timeAgo(a.created_at)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ══════════════════════ PDF EXPORT BUTTON ══════════════════════ */
export function ExportButton({ kind, entityId, apiCall, small }: any) {
  const onPress = async () => {
    try {
      // Get JWT token
      let token = '';
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        token = (await AsyncStorage.getItem('token')) || '';
      } catch {}
      const baseUrl = (Constants.expoConfig?.extra?.EXPO_BACKEND_URL as string) || process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const url = `${baseUrl}/api/merchant/live-preview/export/${kind}/${entityId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      // Open in browser to print
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        const supported = await Linking.canOpenURL(url);
        if (supported) await Linking.openURL(url);
        else RNAlert.alert('تعذّر فتح التقرير', 'تأكد من اتصالك بالإنترنت');
      }
    } catch (e: any) { RNAlert.alert('خطأ', e.message); }
  };
  return (
    <TouchableOpacity onPress={onPress} style={[s.exportBtn, small && { paddingHorizontal: 10, paddingVertical: 6 }]} activeOpacity={0.7}>
      <Ionicons name="download" size={small ? 12 : 14} color={LP.BG} />
      <Text style={[s.exportText, small && { fontSize: 10 }]}>تصدير PDF</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: LP.DANGER, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: LP.BG,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: LP.BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', borderTopWidth: 1, borderColor: LP.BORDER },
  handle: { width: 46, height: 4, borderRadius: 2, backgroundColor: '#3A3D48', alignSelf: 'center', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: LP.BORDER, gap: 10 },
  sheetTitle: { flex: 1, color: LP.GOLD, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  ackAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: LP.GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  alertRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: LP.CARD_2, borderWidth: 1, borderColor: LP.BORDER_SOFT,
    padding: 12, borderRadius: 14, marginBottom: 6,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  alertTitle: { color: LP.TEXT, fontSize: 13, fontWeight: '900', flex: 1, textAlign: 'right' },
  newDot: { width: 8, height: 8, borderRadius: 4, marginStart: 6 },
  alertMsg: { color: LP.MUTED, fontSize: 11, marginTop: 3, textAlign: 'right', lineHeight: 16 },
  alertTime: { color: LP.MUTED, fontSize: 10, marginTop: 4, textAlign: 'right' },

  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: LP.GOLD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  exportText: { color: LP.BG, fontSize: 11, fontWeight: '900' },
});
