import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';

const NOTIF_TYPES = [
  { type: 'product', icon: 'cube', color: '#8833FF', bg: '#EFE6FF', title: 'Product notification example' },
  { type: 'service', icon: 'construct', color: '#F59E0B', bg: '#FEF3C7', title: 'Service notification example' },
  { type: 'competition', icon: 'trophy', color: '#3B82F6', bg: '#DBEAFE', title: 'Competition notification example' },
  { type: 'points', icon: 'diamond', color: '#8833FF', bg: '#EFE6FF', title: 'Points notification example' },
  { type: 'social', icon: 'megaphone', color: '#EC4899', bg: '#FCE7F3', title: 'Social media notification example' },
  { type: 'support', icon: 'headset', color: '#6B7280', bg: '#F3F4F6', title: 'Support notification example' },
];

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState(NOTIF_TYPES.map((n, i) => ({ ...n, id: String(i), time: '4m ago', desc: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.' })));

  const clearAll = () => setNotifications([]);
  const markAllRead = () => {};
  const removeNotif = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Notifications</Text>
          <TouchableOpacity testID="notif-settings-btn" style={s.settingsBtn}>
            <Ionicons name="settings-outline" size={20} color="#52525B" />
          </TouchableOpacity>
        </View>

        <View style={s.actions}>
          <TouchableOpacity testID="clear-all-btn" style={s.actionBtn} onPress={clearAll}>
            <Ionicons name="trash-outline" size={16} color="#52525B" />
            <Text style={s.actionText}>Clear all</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="mark-read-btn" style={s.actionBtn} onPress={markAllRead}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#52525B" />
            <Text style={s.actionText}>Mark all as read</Text>
          </TouchableOpacity>
        </View>

        {notifications.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={48} color="#A1A1AA" />
            <Text style={s.emptyTitle}>No notifications</Text>
            <Text style={s.emptyDesc}>You're all caught up!</Text>
          </View>
        ) : (
          notifications.map((n) => (
            <View key={n.id} style={s.notifCard}>
              <View style={[s.notifIcon, { backgroundColor: n.bg }]}>
                <Ionicons name={n.icon as any} size={24} color={n.color} />
              </View>
              <View style={s.notifContent}>
                <Text style={s.notifTitle}>{n.title}</Text>
                <Text style={s.notifDesc} numberOfLines={2}>{n.desc}</Text>
                <Text style={s.notifTime}>{n.time}</Text>
              </View>
              <TouchableOpacity testID={`view-notif-${n.id}`} style={s.viewBtn}>
                <Ionicons name="eye-outline" size={16} color="#FFF" />
                <Text style={s.viewText}>View</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A0A0A' },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9F9FB', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F9F9FB', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E4E4E7' },
  actionText: { fontSize: 12, color: '#52525B', fontWeight: '500' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0A0A0A' },
  emptyDesc: { fontSize: 14, color: '#52525B' },
  notifCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 12, padding: 14, backgroundColor: '#F9F9FB', borderRadius: 16 },
  notifIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  notifContent: { flex: 1, marginEnd: 10 },
  notifTitle: { fontSize: 13, fontWeight: '600', color: '#0A0A0A', marginBottom: 3 },
  notifDesc: { fontSize: 11, color: '#52525B', lineHeight: 16, marginBottom: 3 },
  notifTime: { fontSize: 10, color: '#A1A1AA' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#8833FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  viewText: { fontSize: 11, color: '#FFF', fontWeight: '600' },
});
