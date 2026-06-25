import { NativeModules, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Android: native module with setProgress() fill bar + setOngoing(true).
// iOS: expo-notifications (no progress bar support, just start/finish text).
const Native = NativeModules.DownloadNotification as {
  start: () => void;
  update: (done: number, total: number) => void;
  finish: (total: number) => void;
  dismiss: () => void;
} | undefined;

const NOTIF_ID = 'nous-download-progress';

// Update at most once per 3 seconds or every 30 articles, whichever comes first.
const UPDATE_INTERVAL_MS = 3000;
const UPDATE_INTERVAL_ARTICLES = 30;

let state = { lastUpdateTime: 0, lastUpdateDone: -1, iosPermissionGranted: false };

export async function startDownloadNotification(): Promise<void> {
  state = { lastUpdateTime: 0, lastUpdateDone: -1, iosPermissionGranted: false };

  if (Platform.OS === 'android') {
    // Permission is handled by expo-notifications (POST_NOTIFICATIONS on API 33+).
    // Request it here so the native module can notify immediately.
    await Notifications.requestPermissionsAsync().catch(() => {});
    Native?.start();
    return;
  }

  // iOS fallback: plain text notification, start only.
  try {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
    state.iosPermissionGranted = status === 'granted';
    if (!state.iosPermissionGranted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: { title: 'Nous', body: 'Downloading library…' },
      trigger: null,
    });
  } catch {}
}

export async function updateDownloadNotification(done: number, total: number): Promise<void> {
  const now = Date.now();
  const articlesDelta = done - state.lastUpdateDone;
  if (articlesDelta < UPDATE_INTERVAL_ARTICLES && now - state.lastUpdateTime < UPDATE_INTERVAL_MS) return;
  state.lastUpdateDone = done;
  state.lastUpdateTime = now;

  if (Platform.OS === 'android') {
    Native?.update(done, total);
    return;
  }
  // iOS: skip intermediate updates — trigger:null notifications stack.
}

export async function finishDownloadNotification(total: number): Promise<void> {
  if (Platform.OS === 'android') {
    Native?.finish(total);
    setTimeout(() => Native?.dismiss(), 8000);
    return;
  }

  if (!state.iosPermissionGranted) return;
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: { title: 'Nous', body: `Library ready — ${total} articles` },
      trigger: null,
    });
    setTimeout(() => Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {}), 8000);
  } catch {}
}
