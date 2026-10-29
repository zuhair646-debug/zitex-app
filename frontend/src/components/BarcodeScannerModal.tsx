import { useMemo, useRef, useState, useEffect } from 'react';
import { View, Modal, StyleSheet, TouchableOpacity, TextInput, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, radius, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';
import { TX, tSync } from '../useAutoT';
import { useT } from '../i18n';
import { PrimaryButton } from './ui';

type Props = { visible: boolean; onClose: () => void; onScanned: (code: string) => void };

/** Full-screen phone-camera barcode scanner with manual-entry fallback. */
export default function BarcodeScannerModal({ visible, onClose, onScanned }: Props) {
  const { lang } = useT();
  const s = useStyles();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const lock = useRef(false);

  useEffect(() => { if (visible) { lock.current = false; setManual(''); } }, [visible]);

  const emit = (code: string) => {
    const c = code.trim();
    if (!c || lock.current) return;
    lock.current = true;
    onScanned(c);
  };

  const renderBody = () => {
    if (!permission) return <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />;
    if (!permission.granted) {
      return (
        <View style={s.permBox} testID="scanner-permission">
          <Ionicons name="barcode-outline" size={56} color={colors.brand} />
          <TX style={s.permTitle}>امسح الباركود بكاميرا جوالك</TX>
          <TX style={s.permText}>نحتاج الكاميرا لقراءة باركود المنتجات وإضافتها للسلة مباشرة، بدون أي جهاز إضافي.</TX>
          {permission.canAskAgain ? (
            <PrimaryButton label={tSync('السماح بالكاميرا', lang)} icon="camera" onPress={requestPermission} />
          ) : (
            <PrimaryButton label={tSync('فتح الإعدادات', lang)} icon="settings" onPress={() => Linking.openSettings()} />
          )}
        </View>
      );
    }
    return (
      <View style={s.camWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'qr'] }}
          onBarcodeScanned={({ data }) => emit(data)}
        />
        <View style={s.frame} pointerEvents="none" />
        <TX style={s.hint}>وجّه الكاميرا نحو الباركود</TX>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={s.header}>
            <TX style={s.title}>مسح الباركود</TX>
            <TouchableOpacity testID="scanner-close" onPress={onClose} style={s.close}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>{renderBody()}</View>
          <View style={s.manualRow}>
            <TextInput
              testID="scanner-manual-input"
              style={s.input}
              value={manual}
              onChangeText={setManual}
              placeholder={tSync('أو اكتب رقم الباركود', lang)}
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="default"
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={() => emit(manual)}
            />
            <TouchableOpacity testID="scanner-manual-submit" style={s.go} onPress={() => emit(manual)}>
              <Ionicons name="arrow-forward" size={22} color={colors.onBrandPrimary} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function useStyles() {
  const { themeKey } = useTheme();
  return useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    title: { ...typography.titleLarge, color: colors.onSurface },
    close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
    camWrap: { flex: 1, marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
    frame: { width: '80%', height: 160, borderWidth: 3, borderColor: colors.brand, borderRadius: radius.md },
    hint: { position: 'absolute', bottom: spacing.lg, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md, overflow: 'hidden', fontSize: 13 },
    permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
    permTitle: { ...typography.titleLarge, color: colors.onSurface, textAlign: 'center' },
    permText: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: spacing.md },
    manualRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg },
    input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, color: colors.onSurface, fontSize: 15 },
    go: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  }), [themeKey]);
}
