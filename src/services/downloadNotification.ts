import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'download-progress';
const NOTIF_ID = 'nous-download-progress';

// Throttle: update at most once per 4 seconds OR every 25 articles.
const UPDATE_INTERVAL_MS = 4000;
const UPDATE_INTERVAL_ARTICLES = 25;

let lastUpdateTime = 0;
let lastUpdateDone = -1;
let permissionGranted = false;

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Download progress',
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    showBadge: false,
  });
}

export async function startDownloadNotification(): Promise<void> {
  try {
    await ensureChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    permissionGranted = status === 'granted';
    if (!permissionGranted) return;

    lastUpdateTime = 0;
    lastUpdateDone = -1;

    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: 'Nous — Downloading library',
        body: 'Starting…',
        ...(Platform.OS === 'android' && {
          color: '#7ba4ff',
          priority: Notifications.AndroidNotificationPriority.LOW,
          sticky: false,
        }),
      },
      trigger: null,
    });
  } catch {}
}

export async function updateDownloadNotification(done: number, total: number): Promise<void> {
  if (!permissionGranted) return;
  const now = Date.now();
  const articlesDelta = done - lastUpdateDone;
  if (articlesDelta < UPDATE_INTERVAL_ARTICLES && now - lastUpdateTime < UPDATE_INTERVAL_MS) return;
  lastUpdateDone = done;
  lastUpdateTime = now;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: 'Nous — Downloading library',
        body: `${done} / ${total} articles`,
        ...(Platform.OS === 'android' && {
          color: '#7ba4ff',
          priority: Notifications.AndroidNotificationPriority.LOW,
          sticky: false,
        }),
      },
      trigger: null,
    });
  } catch {}
}

export async function finishDownloadNotification(total: number): Promise<void> {
  if (!permissionGranted) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: 'Nous',
        body: `Library ready — ${total} articles downloaded`,
        ...(Platform.OS === 'android' && { color: '#7ba4ff' }),
      },
      trigger: null,
    });
    // Auto-dismiss after 8 seconds.
    setTimeout(() => Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {}), 8000);
  } catch {}
}
