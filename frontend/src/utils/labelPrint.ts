import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Opens the printable barcode label (50mm sticker) for a product. */
export async function openLabelPrint(productId: string, copies = 1) {
  const token = (await AsyncStorage.getItem('token')) || '';
  const base = process.env.EXPO_PUBLIC_BACKEND_URL || '';
  await WebBrowser.openBrowserAsync(`${base}/api/merchant/products/${productId}/label?copies=${copies}&token=${encodeURIComponent(token)}`);
}
