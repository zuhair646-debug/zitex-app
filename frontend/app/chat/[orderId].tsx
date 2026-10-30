/** Order chat between customer and driver (realtime over the live socket). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../_layout';
import { colors, spacing, radius } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';
import { tSync } from '../../src/useAutoT';
import { useT } from '../../src/i18n';
import { ScreenHeader } from '../../src/components/ui';
import { useLive } from '../../src/utils/live';

const QUICK_DRIVER = ['أنا في الطريق إليك', 'وصلت، أنا عند الباب', 'ممكن ترسل لي موقعك بدقة؟', 'تأخرت قليلاً بسبب الزحمة'];
const QUICK_CUSTOMER = ['تمام، بانتظارك', 'اترك الطلب عند الباب', 'اتصل علي لما توصل'];

export default function OrderChat() {
  const s = useStyles();
  const { lang } = useT();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { apiCall, user } = useAuth();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const fresh: any[] = await apiCall(`/api/orders/${orderId}/messages`);
      setMsgs((p) => { const ids = new Set(fresh.map((m) => m.id)); return [...fresh, ...p.filter((m) => !ids.has(m.id))]; });
    } catch {}
  }, [orderId]);
  useEffect(() => { load(); }, [load]);
  useLive((m) => {
    if (m.t === 'chat' && m.message.order_id === orderId)
      setMsgs((p) => p.some((x) => x.id === m.message.id) ? p : [...p, { ...m.message, mine: m.message.sender_id === user?.id }]);
    if (m.t === 'connected') load();
  }, { orderId });

  const send = async (t = text) => {
    const v = t.trim(); if (!v) return;
    setText('');
    try { const m = await apiCall(`/api/orders/${orderId}/messages`, { method: 'POST', body: JSON.stringify({ text: v }) });
      setMsgs((p) => p.some((x) => x.id === m.id) ? p : [...p, { ...m, mine: true }]); } catch {}
  };
  const quick = (user as any)?.role === 'driver' ? QUICK_DRIVER : QUICK_CUSTOMER;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <ScreenHeader title={tSync('المحادثة', lang)} onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item: m }) => (
            <View style={[s.bubble, m.mine ? s.mine : s.theirs]}>
              {!m.mine ? <Text style={s.sender}>{m.sender_name}</Text> : null}
              <Text style={[s.msg, m.mine && { color: colors.onBrandPrimary }]}>{m.text}</Text>
              <Text style={[s.time, m.mine && { color: colors.onBrandPrimary }]}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          )} />
        <FlatList horizontal data={quick} keyExtractor={(q) => q} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.quick} onPress={() => send(tSync(item, lang))}><Text style={s.quickTxt}>{tSync(item, lang)}</Text></TouchableOpacity>
          )} />
        <View style={s.bar}>
          <TextInput testID="chat-input" style={s.input} value={text} onChangeText={setText} placeholder={tSync('اكتب رسالة…', lang)}
            placeholderTextColor={colors.onSurfaceTertiary} multiline />
          <TouchableOpacity testID="chat-send" style={s.send} onPress={() => send()}><Ionicons name="send" size={20} color={colors.onBrandPrimary} /></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    bubble: { maxWidth: '80%', borderRadius: radius.lg, padding: spacing.md },
    mine: { alignSelf: 'flex-end', backgroundColor: colors.brand },
    theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    sender: { color: colors.brand, fontSize: 11, fontWeight: '700', marginBottom: 2 },
    msg: { color: colors.onSurface, fontSize: 15 },
    time: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 2, alignSelf: 'flex-end' },
    quick: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 8 },
    quickTxt: { color: colors.brand, fontSize: 13, fontWeight: '600' },
    bar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
    input: { flex: 1, maxHeight: 110, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 15 },
    send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  }), [themeKey]);
}
