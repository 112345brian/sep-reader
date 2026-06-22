import { File, Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { getSyncFolder } from './db';

const DB_FILENAME = 'sep.db';

export function getDbFile(): File {
  return new File(Paths.document, 'SQLite', DB_FILENAME);
}

function syncFile(folder: string): File | null {
  let path = folder.trim();
  if (!path) return null;

  // Expand ~ on macOS/iOS
  if (path.startsWith('~') && (Platform.OS === 'macos' || Platform.OS === 'ios')) {
    const home = (process.env as Record<string, string | undefined>).HOME ?? '';
    path = home + path.slice(1);
  }

  // Normalize to file:// URI
  if (!path.startsWith('file://')) path = 'file://' + path;
  if (!path.endsWith('/')) path += '/';

  return new File(path + DB_FILENAME);
}

export async function exportToSyncFolder(): Promise<'ok' | 'no_folder' | 'error'> {
  const folder = await getSyncFolder();
  const dest = syncFile(folder);
  if (!dest) return 'no_folder';

  try {
    const dbFile = getDbFile();
    if (!dbFile.exists) return 'error';

    // Ensure destination directory exists
    const dirPath = dest.uri.slice(0, dest.uri.lastIndexOf('/') + 1);
    const dir = new Directory(dirPath);
    if (!dir.exists) dir.create();

    dbFile.copy(dest);
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function importFromSyncFolder(): Promise<'ok' | 'no_folder' | 'not_found' | 'error'> {
  const folder = await getSyncFolder();
  const src = syncFile(folder);
  if (!src) return 'no_folder';

  try {
    if (!src.exists) return 'not_found';
    const dbFile = getDbFile();
    src.copy(dbFile);
    return 'ok';
  } catch {
    return 'error';
  }
}

// no-op kept for App.tsx import compatibility — sync is manual-only
export async function syncOnLaunch(): Promise<void> {}

export async function exportToZotero(
  apiKey: string,
  userId: string,
  item: {
    slug: string;
    title: string;
    author: string | null;
    pub_date: string | null;
  }
): Promise<'ok' | 'auth_error' | 'error'> {
  const url = `https://api.zotero.org/users/${userId}/items`;
  const creators = parseCreators(item.author);
  const accessDate = new Date().toISOString().slice(0, 10);

  const body = JSON.stringify([{
    itemType: 'encyclopediaArticle',
    title: item.title,
    encyclopediaTitle: 'Stanford Encyclopedia of Philosophy',
    creators: [
      ...creators,
      { creatorType: 'editor', lastName: 'Zalta', firstName: 'Edward N.' },
      { creatorType: 'editor', lastName: 'Nodelman', firstName: 'Uri' },
    ],
    url: `https://plato.stanford.edu/entries/${item.slug}/`,
    accessDate,
    date: item.pub_date?.replace(/\//g, '-') ?? '',
    language: 'en',
  }]);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Zotero-API-Key': apiKey,
        'Zotero-API-Version': '3',
        'Content-Type': 'application/json',
      },
      body,
    });
    if (res.status === 403 || res.status === 401) return 'auth_error';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

function parseCreators(author: string | null) {
  if (!author) return [];
  const parts = author.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    return [{ creatorType: 'author', lastName: parts[0], firstName: parts[1] }];
  }
  return [{ creatorType: 'author', name: author }];
}
