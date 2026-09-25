import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LP } from './theme';

const SEVERITY_COLORS: any = {
  info: LP.INFO,
  success: LP.SUCCESS,
  warning: LP.WARN,
  error: LP.DANGER,
};

/**
 * Live toast notifications for merchant.
 * Polls unread alerts every 15s and animates in a top-anchored toast when new alerts arrive.
 * Tap to dismiss + mark as read.
 */
export default function LiveToastNotifications({ apiCall, insetTop = 0 }: any) {
  const seenIds = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<any[]>([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const anim = useRef(new Animated.Value(-140)).current;
  const active = queue[0];

  const poll = useCallback(async () => {
    try {
      const d = await apiCall('/api/merchant/live-preview/alerts?unread_only=true');
      const alerts = d.alerts || [];
      if (firstLoad) {
        // On first load, mark all existing unreads as seen — we only want NEW pops
        alerts.forEach((a: any) => seenIds.current.add(a.id));
        setFirstLoad(false);
        return;
      }
      const fresh = alerts.filter((a: any) => !seenIds.current.has(a.id));
      fresh.forEach((a: any) => seenIds.current.add(a.id));
      if (fresh.length > 0) {
        setQueue(prev => [...prev, ...fresh]);
      }
    } catch (e) {}
  }, [apiCall, firstLoad]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [poll]);

  // Animate in/out
  useEffect(() => {
    if (!active) return;
    Animated.spring(anim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
    // Auto-dismiss after 6s
    const timer = setTimeout(() => dismiss(), 6000);
    return () => clearTimeout(timer);
  }, [active?.id]);

  const dismiss = useCallback(async () => {
    if (!active) return;
    Animated.timing(anim, { toValue: -140, duration: 250, useNativeDriver: true }).start(() => {
      setQueue(prev => prev.slice(1));
    });
    // Ack alert on server so it doesn't show in bell as unread
    try { await apiCall(`/api/merchant/live-preview/alerts/${active.id}/ack`, { method: 'POST' }); } catch {}
  }, [active, apiCall]);

  if (!active) return null;
  const color = SEVERITY_COLORS[active.severity] || LP.INFO;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[st.container, { top: insetTop + 8, transform: [{ translateY: anim }] }]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={dismiss} style={{ width: '100%' }}>
        <BlurView intensity={80} tint="dark" style={[st.toast, { borderColor: color }]}>
          <View style={[st.icon, { backgroundColor: color + '25', borderColor: color + '55' }]}>
            <Ionicons name={active.icon || 'notifications'} size={20} color={color} />
          </View>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[st.pulseDot, { backgroundColor: color }]} />
              <Text style={[st.title, { color }]} numberOfLines={1}>{active.title}</Text>
              <View style={{ flex: 1 }} />
              <Text style={st.newBadge}>جديد</Text>
            </View>
            <Text style={st.message} numberOfLines={2}>{active.message}</Text>
          </View>
          <Ionicons name="close" size={16} color={LP.MUTED} />
        </BlurView>
      </TouchableOpacity>
      {queue.length > 1 && (
        <View style={st.stack}>
          <Text style={st.stackText}>+{queue.length - 1}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 99999,
    alignItems: 'stretch',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16 },
      android: { elevation: 16 },
    }),
  },
  toast: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'rgba(11,12,16,0.92)',
    overflow: 'hidden',
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pulseDot: { width: 6, height: 6, borderRadius: 3 },
  title: { fontSize: 13, fontWeight: '900' },
  newBadge: {
    color: LP.BG, backgroundColor: LP.GOLD,
    fontSize: 9, fontWeight: '900',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  message: { color: LP.TEXT, fontSize: 11, marginTop: 3, textAlign: 'right', lineHeight: 15 },
  stack: {
    position: 'absolute', top: -6, right: -6,
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: LP.DANGER, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: LP.BG,
    paddingHorizontal: 4,
  },
  stackText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
