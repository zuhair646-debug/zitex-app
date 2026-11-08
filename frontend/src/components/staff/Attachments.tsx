import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Modal } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { uploadMedia, mediaUrl } from '../../utils/upload';
import { tSync } from '../../useAutoT';
import { curLang } from '../../i18n';
import { notify } from '../../utils/notify';

/** Gallery picker with a pre-permission explanation and an "Open Settings" fallback. */
export function AttachmentPicker({ onAdd, disabled, testID }: { onAdd: (path: string) => void; disabled?: boolean; testID?: string }) {
  const s = useS();
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState<'ask' | 'blocked' | null>(null);

  const launch = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 });
    if (res.canceled) return;
    setBusy(true);
    try {
      const a = res.assets[0];
      const up = await uploadMedia(a.uri, a.fileName || undefined, a.mimeType || undefined);
      onAdd(up.path);
    } catch (e: any) { notify(tSync('فشل الرفع', curLang()), e.message); } finally { setBusy(false); }
  };

  const start = async () => {
    const p = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (p.granted) return launch();
    setExplain(p.canAskAgain === false ? 'blocked' : 'ask');
  };

  const allow = async () => {
    setExplain(null);
    const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (r.granted) return launch();
    if (!r.canAskAgain) setExplain('blocked');
  };

  return (
    <>
      <TouchableOpacity testID={testID} style={s.pickBtn} onPress={start} disabled={disabled || busy} activeOpacity={0.8}>
        {busy ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="attach" size={20} color={colors.brand} />}
      </TouchableOpacity>
      <Modal visible={!!explain} transparent animationType="fade" onRequestClose={() => setExplain(null)}>
        <View style={s.bg}>
          <View style={s.card}>
            <Ionicons name="images" size={32} color={colors.brand} />
            <Text style={s.title}>{tSync('إرفاق صورة', curLang())}</Text>
            <Text style={s.msg}>{explain === 'blocked'
              ? tSync('الوصول للصور مرفوض. افتح الإعدادات للسماح بإرفاق صور المشكلة.', curLang())
              : tSync('نحتاج الوصول لصورك لترفق صورة توضح المشكلة لفريق الدعم.', curLang())}</Text>
            <TouchableOpacity style={s.primary} onPress={explain === 'blocked' ? () => { setExplain(null); Linking.openSettings(); } : allow}>
              <Text style={s.primaryTxt}>{explain === 'blocked' ? tSync('فتح الإعدادات', curLang()) : tSync('متابعة', curLang())}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghost} onPress={() => setExplain(null)}><Text style={s.ghostTxt}>{tSync('ليس الآن', curLang())}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Thumb({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const s = useS();
  const [src, setSrc] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const uri = await mediaUrl(path);
      const token = await AsyncStorage.getItem('token');
      setSrc(uri.startsWith('http') && token && !uri.includes('token=') && !path.startsWith('http') ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri });
    })();
  }, [path]);
  return (
    <View style={s.thumb}>
      {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" /> : <ActivityIndicator color={colors.brand} />}
      {onRemove && (
        <TouchableOpacity style={s.remove} onPress={onRemove} hitSlop={8}><Ionicons name="close" size={14} color="#FFFFFF" /></TouchableOpacity>
      )}
    </View>
  );
}

export function AttachmentThumbs({ paths, onRemove }: { paths?: string[]; onRemove?: (i: number) => void }) {
  const s = useS();
  if (!paths?.length) return null;
  return (
    <View style={s.row}>
      {paths.map((p, i) => <Thumb key={p + i} path={p} onRemove={onRemove ? () => onRemove(i) : undefined} />)}
    </View>
  );
}

function useS() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    pickBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    thumb: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 20, padding: 20, alignItems: 'center', gap: 10 },
    title: { fontSize: 17, fontWeight: '900', color: colors.onSurface },
    msg: { fontSize: 13, color: colors.onSurfaceSecondary, textAlign: 'center', lineHeight: 20 },
    primary: { alignSelf: 'stretch', minHeight: 48, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    primaryTxt: { color: colors.onBrandPrimary, fontWeight: '900' },
    ghost: { alignSelf: 'stretch', minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    ghostTxt: { color: colors.onSurfaceSecondary, fontWeight: '700' },
  }), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
