import { File, Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  getSyncFolder, exportUserData, importUserData,
  type UserDataExport, type BookmarkRow,
} from './db';
import type { Annotation } from '../types';

const USER_DATA_FILENAME = 'sep_user.json';

// ── Path resolution ───────────────────────────────────────────────────────────

function syncFile(folder: string): File | null {
  let path = folder.trim();
  if (!path) return null;
  if (path.startsWith('~') && (Platform.OS === 'macos' || Platform.OS === 'ios')) {
    const home = (process.env as Record<string, string | undefined>).HOME ?? '';
    path = home + path.slice(1);
  }
  if (!path.startsWith('file://')) path = 'file://' + path;
  if (!path.endsWith('/')) path += '/';
  return new File(path + USER_DATA_FILENAME);
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportToSyncFolder(): Promise<'ok' | 'no_folder' | 'error'> {
  const folder = await getSyncFolder() as string;
  const dest = syncFile(folder);
  if (!dest) return 'no_folder';

  try {
    const data = await exportUserData();
    const json = JSON.stringify(data, null, 2);

    const dirPath = dest.uri.slice(0, dest.uri.lastIndexOf('/') + 1);
    const dir = new Directory(dirPath);
    if (!dir.exists) dir.create();

    // Write via a temp file in cache then move
    const tmp = new File(Paths.cache, 'sep_user_tmp.json');
    tmp.write(json);
    tmp.copy(dest);
    if (tmp.exists) tmp.delete();

    return 'ok';
  } catch {
    return 'error';
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importFromSyncFolder(): Promise<'ok' | 'no_folder' | 'not_found' | 'error'> {
  const folder = await getSyncFolder() as string;
  const src = syncFile(folder);
  if (!src) return 'no_folder';

  try {
    if (!src.exists) return 'not_found';
    const json = await src.text();
    const data: UserDataExport = JSON.parse(json);
    if (!data || data.version !== 1) return 'error';
    await importUserData(data);
    return 'ok';
  } catch {
    return 'error';
  }
}

// Legacy no-op kept for App.tsx compatibility
export async function syncOnLaunch(): Promise<void> {}

// ── Zotero ────────────────────────────────────────────────────────────────────

export async function exportToZotero(
  apiKey: string,
  userId: string,
  item: Pick<BookmarkRow, 'slug' | 'title' | 'author' | 'pub_date'>,
  annotations: Annotation[] = []
): Promise<'ok' | 'auth_error' | 'error'> {
  const baseUrl = `https://api.zotero.org/users/${userId}`;
  const headers = {
    'Zotero-API-Key': apiKey,
    'Zotero-API-Version': '3',
    'Content-Type': 'application/json',
  };

  // 1. Create the encyclopediaArticle item
  const creators = parseCreators(item.author);
  const entryItem = {
    itemType: 'encyclopediaArticle',
    title: item.title,
    encyclopediaTitle: 'Stanford Encyclopedia of Philosophy',
    creators: [
      ...creators,
      { creatorType: 'editor', lastName: 'Zalta', firstName: 'Edward N.' },
      { creatorType: 'editor', lastName: 'Nodelman', firstName: 'Uri' },
    ],
    url: `https://plato.stanford.edu/entries/${item.slug}/`,
    accessDate: new Date().toISOString().slice(0, 10),
    date: item.pub_date?.replace(/\//g, '-') ?? '',
    language: 'en',
  };

  try {
    const res = await fetch(`${baseUrl}/items`, {
      method: 'POST', headers, body: JSON.stringify([entryItem]),
    });
    if (res.status === 401 || res.status === 403) return 'auth_error';
    if (!res.ok) return 'error';

    // 2. If there are annotations, create a child note
    if (annotations.length > 0) {
      const payload = await res.json();
      const parentKey = payload?.successful?.['0']?.key;
      if (parentKey) {
        const noteHtml = buildAnnotationNote(item.title, annotations);
        await fetch(`${baseUrl}/items`, {
          method: 'POST', headers,
          body: JSON.stringify([{
            itemType: 'note',
            parentItem: parentKey,
            note: noteHtml,
          }]),
        });
      }
    }

    return 'ok';
  } catch {
    return 'error';
  }
}

function buildAnnotationNote(title: string, annotations: Annotation[]): string {
  const items = annotations.map(a => {
    const swatch = `background:${a.color}44;border-left:3px solid ${a.color};padding:2px 6px;border-radius:2px;`;
    const note = a.note ? `<br/><em style="color:#888;font-size:0.9em">${escHtml(a.note)}</em>` : '';
    return `<li style="${swatch} margin:6px 0;">"${escHtml(a.selected_text)}"${note}</li>`;
  }).join('\n');
  return `<h3>Highlights: ${escHtml(title)}</h3><ul style="list-style:none;padding:0;">${items}</ul>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseCreators(author: string | null) {
  if (!author) return [];
  const parts = author.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    return [{ creatorType: 'author', lastName: parts[0], firstName: parts[1] }];
  }
  return [{ creatorType: 'author', name: author }];
}
