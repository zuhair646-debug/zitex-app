/** Delivery proof: customer 4-digit code OR photo, plus cash-collected confirmation for COD. */
import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeContext';
import { TX, tSync } from '../../useAutoT';
import { useT } from '../../i18n';
import { PrimaryButton, SecondaryButton } from '../ui';
import { uploadMedia } from '../../utils/upload';

type Props = { visible: boolean; order: any; onClose: () => void; onSubmit: (p: { otp?: string; photo_url?: string; cash_collected?: number }) => Promise<void> };

export default function ProofModal({ visible, order, onClose, onSubmit }: Props) {
  const s = useStyles();
  const { lang } = useT();
  const [otp, setOtp] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; url?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [blocked, setBlocked] = useState(false);

  const takePhoto = async () => {
    setErr('');
    let perm = await ImagePicker.getCameraPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setBlocked(!perm.canAskAgain); setErr(tSync('نحتاج الكاميرا لتصوير إثبات التسليم', lang)); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (r.canceled || !r.assets?.[0]) return;
    setPhoto({ uri: r.assets[0].uri });
  };

  const submit = async () => {
    setErr('');
    if (otp.length !== 4 && !photo) { setErr(tSync('أدخل رمز العميل أو صوّر إثبات التسليم', lang)); return; }
    setBusy(true);
    try {
      let photo_url: string | undefined;
      if (photo && otp.length !== 4) photo_url = (await uploadMedia(photo.uri, 'proof.jpg', 'image/jpeg')).url;
      await onSubmit({ otp: otp.length === 4 ? otp : undefined, photo_url, cash_collected: order?.cod ? order.cash_to_collect : 0 });
      setOtp(''); setPhoto(null);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View style={s.sheet} testID="proof-modal">
          <View style={s.row}>
            <TX style={s.title}>تأكيد التسليم</TX>
            <TouchableOpacity onPress={onClose} style={s.close}><Ionicons name="close" size={22} color={colors.onSurface} /></TouchableOpacity>
          </View>
          {order?.cod ? (
            <View style={s.cash}>
              <Ionicons name="cash" size={22} color={colors.onBrandPrimary} />
              <Text style={s.cashTxt}>{tSync('استلم من العميل', lang)} {Number(order.cash_to_collect).toFixed(2)} {tSync('ر.س', lang)}</Text>
            </View>
          ) : null}
          <TX style={s.label}>رمز التسليم من العميل (4 أرقام)</TX>
          <TextInput testID="proof-otp" style={s.otp} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad" maxLength={4} placeholder="• • • •" placeholderTextColor={colors.onSurfaceTertiary} />
          <TX style={s.or}>أو</TX>
          <TouchableOpacity testID="proof-photo" style={s.photoBtn} onPress={takePhoto}>
            {photo ? <Image source={{ uri: photo.uri }} style={s.photo} /> : (<><Ionicons name="camera" size={22} color={colors.brand} /><TX style={s.photoTxt}>صوّر الطلب عند باب العميل</TX></>)}
          </TouchableOpacity>
          {blocked ? <SecondaryButton label={tSync('فتح الإعدادات', lang)} icon="settings" onPress={() => Linking.openSettings()} /> : null}
          {err ? <Text style={s.err}>{err}</Text> : null}
          <PrimaryButton testID="proof-submit" label={tSync('تم التسليم', lang)} icon="checkmark-done" onPress={submit} loading={busy} size="lg" />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    cash: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.brand, padding: spacing.md, borderRadius: radius.md },
    cashTxt: { color: colors.onBrandPrimary, fontWeight: '900', fontSize: 16 },
    label: { color: colors.onSurfaceSecondary, fontSize: 13 },
    otp: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 2, borderColor: colors.brand, color: colors.onSurface, fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 16, paddingVertical: 10 },
    or: { textAlign: 'center', color: colors.onSurfaceTertiary },
    photoBtn: { height: 110, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
    photo: { width: '100%', height: '100%' },
    photoTxt: { color: colors.brand, fontWeight: '700' },
    err: { color: colors.error, textAlign: 'center' },
  }), [themeKey]);
}
