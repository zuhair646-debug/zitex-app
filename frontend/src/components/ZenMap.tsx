/**
 * ZenMap — Zenrex's own branded map (self-hosted OpenStreetMap + Overture buildings,
 * MapLibre GL). Native: WebView, Web: iframe. No Google, no API keys.
 * Imperative API via ref: send({type:'markers'|'driver'|'route'|'fit'|'center'|'follow'|'pick'|'heat'|'pitch', ...})
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, createElement } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { curLang } from '../i18n';

export type ZenMapMsg = { type: string; [k: string]: any };
export type ZenMapHandle = { send: (m: ZenMapMsg) => void };
type Props = { onEvent?: (e: any) => void; style?: any; testID?: string; brand?: boolean };

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const ZenMap = forwardRef<ZenMapHandle, Props>(({ onEvent, style, testID, brand = true }, ref) => {
  const { isDark } = useTheme();
  const web = useRef<any>(null);
  const frame = useRef<any>(null);
  const queue = useRef<ZenMapMsg[]>([]);
  const [ready, setReady] = useState(false);
  const url = `${BASE}/api/map/view?theme=${isDark ? 'dark' : 'light'}&lang=${curLang() === 'ar' ? 'ar' : 'en'}&brand=${brand ? 1 : 0}`;

  const deliver = useCallback((m: ZenMapMsg) => {
    if (Platform.OS === 'web') frame.current?.contentWindow?.postMessage(JSON.stringify({ __zmap: 1, msg: m }), '*');
    else web.current?.injectJavaScript(`window.ZMap&&window.ZMap.handle(${JSON.stringify(JSON.stringify(m))});true;`);
  }, []);

  useImperativeHandle(ref, () => ({
    send: (m) => { if (ready) deliver(m); else queue.current.push(m); },
  }), [ready, deliver]);

  const handle = useCallback((raw: string) => {
    let e: any; try { e = JSON.parse(raw); } catch { return; }
    if (e.type === 'ready') {
      setReady(true);
      queue.current.forEach(deliver); queue.current = [];
    }
    onEvent?.(e);
  }, [onEvent, deliver]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const fn = (ev: MessageEvent) => { if (ev.source === frame.current?.contentWindow && typeof ev.data === 'string') handle(ev.data); };
    window.addEventListener('message', fn);
    return () => window.removeEventListener('message', fn);
  }, [handle]);

  useEffect(() => { setReady(false); }, [url]);

  return (
    <View style={[st.wrap, style]} testID={testID}>
      {Platform.OS === 'web'
        ? createElement('iframe', { ref: frame, src: url, style: { border: 0, width: '100%', height: '100%' }, title: 'map' })
        : <WebView ref={web} source={{ uri: url }} style={st.fill} originWhitelist={['*']} javaScriptEnabled domStorageEnabled
            onMessage={(e) => handle(e.nativeEvent.data)} androidLayerType="hardware" setSupportMultipleWindows={false}
            overScrollMode="never" bounces={false} scrollEnabled={false} />}
      {!ready && <View style={st.loading} pointerEvents="none"><ActivityIndicator color={colors.brand} size="large" /></View>}
    </View>
  );
});
ZenMap.displayName = 'ZenMap';
export default ZenMap;

const st = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: '#17151A' },
  fill: { flex: 1, backgroundColor: 'transparent' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
