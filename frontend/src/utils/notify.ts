import { Alert, Platform } from 'react-native';

/** Simple message that also shows on web (Alert.alert is a no-op there). */
export function notify(title: string, message = '', onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n${message}` : title);
    onOk?.();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
}
