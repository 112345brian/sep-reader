import * as FileSystem from 'expo-file-system';
import { documentDirectory, cacheDirectory } from 'expo-file-system/legacy';

export type SeedPhase =
  | { phase: 'downloading'; bytesWritten: number; bytesTotal: number }
  | { phase: 'validating' }
  | { phase: 'installing' };

const DB_PATH = `${documentDirectory}SQLite/sep.db`;
const TMP_PATH = `${cacheDirectory}seed_import.db`;

export async function importSeedFromUrl(
  url: string,
  onProgress: (p: SeedPhase) => void,
): Promise<void> {
  // Clean up any previous failed attempt
  await FileSystem.deleteAsync(TMP_PATH, { idempotent: true });

  const download = FileSystem.createDownloadResumable(
    url,
    TMP_PATH,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      onProgress({ phase: 'downloading', bytesWritten: totalBytesWritten, bytesTotal: totalBytesExpectedToWrite });
    },
  );

  const result = await download.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(TMP_PATH, { idempotent: true });
    throw new Error(`Download failed: HTTP ${result?.status ?? 'unknown'}`);
  }

  onProgress({ phase: 'validating' });

  const info = await FileSystem.getInfoAsync(TMP_PATH);
  if (!info.exists || (info as any).size < 50_000) {
    await FileSystem.deleteAsync(TMP_PATH, { idempotent: true });
    throw new Error('Downloaded file is too small — probably not a valid database');
  }

  onProgress({ phase: 'installing' });

  // Ensure SQLite directory exists
  await FileSystem.makeDirectoryAsync(`${documentDirectory}SQLite/`, { intermediates: true });

  // Close the existing DB connection before replacing the file
  const { closeDb } = await import('./db');
  await closeDb();

  await FileSystem.deleteAsync(DB_PATH, { idempotent: true });
  await FileSystem.moveAsync({ from: TMP_PATH, to: DB_PATH });
}
