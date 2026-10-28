import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Opens the printable ZATCA invoice (thermal 80mm or A4). From there: print or save as PDF / share. */
export async function openInvoicePrint(invoiceId: string, fmt: 'thermal' | 'a4' = 'thermal') {
  const token = (await AsyncStorage.getItem('token')) || '';
  const base = process.env.EXPO_PUBLIC_BACKEND_URL || '';
  await WebBrowser.openBrowserAsync(`${base}/api/invoices/${invoiceId}/print?fmt=${fmt}&token=${encodeURIComponent(token)}`);
}
