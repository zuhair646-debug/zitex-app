/** Realtime socket to /api/ws/live with auto-reconnect + heartbeat. */
import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Handler = (msg: any) => void;
const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/^http/, 'ws');

class LiveSocket {
  ws: WebSocket | null = null;
  handlers = new Set<Handler>();
  subs = new Set<string>();
  fleet = false;
  retry = 0;
  timer: any = null;
  closed = false;
  connected = false;

  async connect() {
    this.closed = false;
    const token = await AsyncStorage.getItem('token');
    if (!token || this.ws) return;
    const ws = new WebSocket(`${BASE}/api/ws/live?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true; this.retry = 0;
      this.subs.forEach((id) => this.raw({ t: 'sub', order_id: id }));
      if (this.fleet) this.raw({ t: 'sub_fleet' });
      clearInterval(this.timer);
      this.timer = setInterval(() => this.raw({ t: 'ping' }), 20000);
      this.emit({ t: 'connected' });
    };
    ws.onmessage = (e) => { try { this.emit(JSON.parse(String(e.data))); } catch {} };
    ws.onclose = () => {
      this.connected = false; this.ws = null; clearInterval(this.timer);
      this.emit({ t: 'disconnected' });
      if (!this.closed) setTimeout(() => this.connect(), Math.min(10000, 500 * 2 ** this.retry++));
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  close() { this.closed = true; try { this.ws?.close(); } catch {} this.ws = null; }
  emit(m: any) { this.handlers.forEach((h) => h(m)); }
  raw(m: any) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(m)); return true; } return false; }
  sub(orderId: string) { this.subs.add(orderId); this.raw({ t: 'sub', order_id: orderId }); }
  subFleet() { this.fleet = true; this.raw({ t: 'sub_fleet' }); }
}

export const live = new LiveSocket();

/** Subscribe a component to live messages (connects lazily). */
export function useLive(handler: Handler, opts: { orderId?: string; fleet?: boolean } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h: Handler = (m) => ref.current(m);
    live.handlers.add(h);
    live.connect();
    if (opts.orderId) live.sub(opts.orderId);
    if (opts.fleet) live.subFleet();
    return () => { live.handlers.delete(h); if (opts.orderId) live.subs.delete(opts.orderId); };
  }, [opts.orderId, opts.fleet]);
}
