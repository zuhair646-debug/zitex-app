/**
 * Driver GPS beacon: foreground watch every ~1s over the live socket (REST fallback),
 * plus background updates (screen locked) via expo-task-manager — background works
 * only in store/dev builds, not Expo Go.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { live } from './live';

export const BG_TASK = 'zenrex-driver-location';
const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

async function restPost(lat: number, lng: number, heading = 0, speed = 0) {
  const token = await AsyncStorage.getItem('token');
  if (!token) return;
  await fetch(`${BASE}/api/driver/location`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, heading, speed }),
  }).catch(() => {});
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask(BG_TASK, async ({ data, error }: any) => {
    if (error || !data?.locations?.length) return;
    const l = data.locations[data.locations.length - 1];
    await restPost(l.coords.latitude, l.coords.longitude, l.coords.heading || 0, l.coords.speed || 0);
  });
}

let watcher: Location.LocationSubscription | null = null;

export function sendLocation(lat: number, lng: number, heading = 0, speed = 0) {
  if (!live.raw({ t: 'loc', lat, lng, heading, speed })) restPost(lat, lng, heading, speed);
}

export async function startBeacon(onLoc?: (c: Location.LocationObjectCoords) => void) {
  stopForeground();
  live.connect();
  watcher = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
    (p) => { sendLocation(p.coords.latitude, p.coords.longitude, p.coords.heading || 0, p.coords.speed || 0); onLoc?.(p.coords); },
  );
  if (Platform.OS === 'web') return;
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.granted && !(await Location.hasStartedLocationUpdatesAsync(BG_TASK))) {
      await Location.startLocationUpdatesAsync(BG_TASK, {
        accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5, pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true, activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: { notificationTitle: 'Zenrex — أنت متصل', notificationBody: 'يتم مشاركة موقعك مع العملاء أثناء التوصيل', notificationColor: '#C9A85C' },
      });
    }
  } catch {}
}

function stopForeground() { watcher?.remove(); watcher = null; }

export async function stopBeacon() {
  stopForeground();
  if (Platform.OS === 'web') return;
  try { if (await Location.hasStartedLocationUpdatesAsync(BG_TASK)) await Location.stopLocationUpdatesAsync(BG_TASK); } catch {}
}
