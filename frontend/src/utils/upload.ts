/**
 * Media upload helper — talks to backend /api/upload.
 * Handles Web/Native runtime differences.
 * Returns a relative path like `zitex/uploads/.../abc.jpg` — save this on the parent doc.
 * Displays back via `${API_URL}/api/files/${path}?token=${jwt}` (web) or with Authorization header (native).
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export type UploadResult = { path: string; size: number; content_type: string; url: string };

export async function uploadMedia(uri: string, filename?: string, contentType?: string): Promise<UploadResult> {
  const token = await AsyncStorage.getItem('token');
  if (!token) throw new Error('يجب تسجيل الدخول');

  const guessedName = filename || uri.split('/').pop() || 'file.jpg';
  let type = contentType;
  if (!type) {
    const lower = guessedName.toLowerCase();
    if (lower.endsWith('.png')) type = 'image/png';
    else if (lower.endsWith('.webp')) type = 'image/webp';
    else if (lower.endsWith('.gif')) type = 'image/gif';
    else if (lower.endsWith('.mp4')) type = 'video/mp4';
    else if (lower.endsWith('.mov')) type = 'video/quicktime';
    else if (lower.endsWith('.webm')) type = 'video/webm';
    else type = 'image/jpeg';
  }

  const form = new FormData();
  if (Platform.OS === 'web') {
    // On web the picker returns a blob: URI; convert to a real Blob.
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, guessedName);
  } else {
    form.append('file', { uri, name: guessedName, type } as any);
  }

  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }, // NEVER set Content-Type manually
    body: form,
  });
  if (!res.ok) {
    let msg = 'فشل الرفع';
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') msg = j.detail;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Given a stored path (`zitex/uploads/...`), build a fetchable URL.
 * On web, append the JWT as ?token= because <Image> can't send Authorization.
 */
export async function mediaUrl(pathOrFullUrl?: string): Promise<string> {
  if (!pathOrFullUrl) return '';
  // Accept old absolute URLs (e.g. from seeded data) or full https URLs — return as-is
  if (pathOrFullUrl.startsWith('http://') || pathOrFullUrl.startsWith('https://')) return pathOrFullUrl;
  // Accept /api/files/... already-prefixed paths
  const cleaned = pathOrFullUrl.replace(/^\//, '');
  const isFilesPath = cleaned.startsWith('api/files/');
  const base = `${API_URL}/${isFilesPath ? cleaned : `api/files/${cleaned}`}`;
  if (Platform.OS === 'web') {
    const token = await AsyncStorage.getItem('token');
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }
  return base;
}

/**
 * Synchronous URL builder for React components — does not include token.
 * Use `mediaUrl` when you need the token embedded (web only).
 */
export function mediaUrlSync(pathOrFullUrl?: string): string {
  if (!pathOrFullUrl) return '';
  if (pathOrFullUrl.startsWith('http://') || pathOrFullUrl.startsWith('https://')) return pathOrFullUrl;
  const cleaned = pathOrFullUrl.replace(/^\//, '');
  const isFilesPath = cleaned.startsWith('api/files/');
  return `${API_URL}/${isFilesPath ? cleaned : `api/files/${cleaned}`}`;
}
