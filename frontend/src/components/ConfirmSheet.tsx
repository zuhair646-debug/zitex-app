/** Clear confirmation sheet (works on web + native, unlike Alert with buttons on web). */
import { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  points?: string[];
  confirmText: string;
  cancelText: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
};

export default function ConfirmSheet({ visible, title, message, points = [], confirmText, cancelText, danger, onConfirm, onCancel, testID }: Props) {
  const { themeKey } = useTheme();
  const st = useMemo(() => makeStyles(), [themeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- colors are mutable
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={st.bg}>
        <View style={st.card} testID={testID}>
          <View style={[st.icon, { backgroundColor: (danger ? colors.error : colors.warning) + '22' }]}>
            <Ionicons name="alert-circle" size={30} color={danger ? colors.error : colors.warning} />
          </View>
          <Text style={st.title}>{title}</Text>
          <Text style={st.msg}>{message}</Text>
          {points.map((p, i) => (
            <View key={i} style={st.point}><Ionicons name="lock-closed" size={14} color={colors.onSurfaceSecondary} /><Text style={st.pointTxt}>{p}</Text></View>
          ))}
          <View style={st.row}>
            <TouchableOpacity testID={testID ? `${testID}-cancel` : undefined} style={st.cancel} onPress={onCancel}><Text style={st.cancelTxt}>{cancelText}</Text></TouchableOpacity>
            <TouchableOpacity testID={testID ? `${testID}-ok` : undefined} style={[st.ok, danger && { backgroundColor: colors.error }]} onPress={onConfirm}>
              <Text style={[st.okTxt, danger && { color: '#FFFFFF' }]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = () => StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 22, gap: 10, alignItems: 'stretch' },
  icon: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  msg: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 10, padding: 10 },
  pointTxt: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancel: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelTxt: { color: colors.onSurface, fontWeight: '800' },
  ok: { flex: 1.4, minHeight: 48, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  okTxt: { color: colors.onBrandPrimary, fontWeight: '900', textAlign: 'center' },
});
