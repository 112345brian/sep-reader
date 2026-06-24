import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'download-progress';
const NOTIF_ID = 'nous-download-progress';

// Throttle: update at most once per 4 seconds OR every 25 articles.
const UPDATE_INTERVAL_MS = 4000;
const UPDATE_INTERVAL_ARTICLES = 25;

let state = { lastUpdateTime: 0, lastUpdateDone: -1, permissionGranted: false };

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
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
    state = { lastUpdateTime: 0, lastUpdateDone: -1, permissionGranted: status === 'granted' };
    if (!state.permissionGranted) return;

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

async function isNotificationPresent(): Promise<boolean> {
  const presented = await Notifications.getPresentedNotificationsAsync();
  return presented.some(n => n.request.identifier === NOTIF_ID);
}

export async function updateDownloadNotification(done: number, total: number): Promise<void> {
  if (!state.permissionGranted) return;
  const now = Date.now();
  const articlesDelta = done - state.lastUpdateDone;
  if (articlesDelta < UPDATE_INTERVAL_ARTICLES && now - state.lastUpdateTime < UPDATE_INTERVAL_MS) return;
  state.lastUpdateDone = done;
  state.lastUpdateTime = now;
  try {
    // Don't re-show if the user dismissed it.
    if (!await isNotificationPresent()) return;
    // Dismiss first — on iOS same-identifier trigger:null notifications stack
    // rather than update in place, so we must remove the old one first.
    await Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {});
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
  if (!state.permissionGranted) return;
  try {
    // Same dismiss-then-repost pattern as updateDownloadNotification: on iOS,
    // trigger:null notifications with the same identifier stack rather than replace.
    await Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {});
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
