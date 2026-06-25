import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'download-progress';
const NOTIF_ID = 'nous-download-progress';

// Update at most once per 3 seconds or every 30 articles, whichever comes first.
const UPDATE_INTERVAL_MS = 3000;
const UPDATE_INTERVAL_ARTICLES = 30;

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
        title: 'Nous',
        body: 'Downloading library…',
        ...(Platform.OS === 'android' && {
          color: '#7ba4ff',
          priority: Notifications.AndroidNotificationPriority.LOW,
          // sticky = non-dismissable while active, like a Firefox download.
          sticky: true,
        }),
      },
      trigger: null,
    });
  } catch {}
}

export async function updateDownloadNotification(done: number, total: number): Promise<void> {
  if (!state.permissionGranted) return;
  const now = Date.now();
  const articlesDelta = done - state.lastUpdateDone;
  if (articlesDelta < UPDATE_INTERVAL_ARTICLES && now - state.lastUpdateTime < UPDATE_INTERVAL_MS) return;
  state.lastUpdateDone = done;
  state.lastUpdateTime = now;
  try {
    if (Platform.OS === 'android') {
      // Android updates in-place when you post with the same identifier — no dismiss needed.
      await Notifications.scheduleNotificationAsync({
        identifier: NOTIF_ID,
        content: {
          title: 'Nous',
          body: `${done} / ${total} articles downloaded`,
          color: '#7ba4ff',
          priority: Notifications.AndroidNotificationPriority.LOW,
          sticky: true,
        },
        trigger: null,
      });
    }
    // iOS: skip intermediate updates — trigger:null notifications stack rather
    // than update in place, so we only show start and finish.
  } catch {}
}

export async function finishDownloadNotification(total: number): Promise<void> {
  if (!state.permissionGranted) return;
  try {
    // Remove the sticky in-progress notification, then post a normal dismissable one.
    await Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: 'Nous',
        body: `Library ready — ${total} articles`,
        ...(Platform.OS === 'android' && { color: '#7ba4ff' }),
      },
      trigger: null,
    });
    setTimeout(() => Notifications.dismissNotificationAsync(NOTIF_ID).catch(() => {}), 8000);
  } catch {}
}
