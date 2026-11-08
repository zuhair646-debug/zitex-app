/** Live countdown "2ي 03:14:09" to an ISO time; calls onDone once when it reaches zero. */
import { useEffect, useRef, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

export function remaining(to?: string) {
  const ms = to ? new Date(to).getTime() - Date.now() : 0;
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

export function fmt(ms: number, dayLabel = 'ي') {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d ? `${d}${dayLabel} ` : ''}${p(h)}:${p(m)}:${p(x)}`;
}

export default function Countdown({ to, style, dayLabel, onDone, testID }: { to?: string; style?: StyleProp<TextStyle>; dayLabel?: string; onDone?: () => void; testID?: string }) {
  const [ms, setMs] = useState(remaining(to));
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    const t = setInterval(() => {
      const r = remaining(to);
      setMs(r);
      if (r === 0 && !fired.current) { fired.current = true; onDone?.(); }
    }, 1000);
    return () => clearInterval(t);
  }, [to]); // eslint-disable-line react-hooks/exhaustive-deps -- onDone may be inline
  return <Text testID={testID} style={[{ fontVariant: ['tabular-nums'] }, style]}>{'\u2066' + fmt(ms, dayLabel) + '\u2069'}</Text>;
}
