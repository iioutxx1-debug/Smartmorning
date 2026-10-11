import { Capacitor, registerPlugin } from '@capacitor/core';
import { ImportedSongItem } from '../types';

const SONGS_META_STORAGE_KEY = 'miqat_imported_songs_meta_v1';
const IDB_NAME = 'miqat_songs_indexeddb_v1';
const IDB_STORE = 'audio_blobs';

interface SmartMorningNativeAudioPlugin {
  pickAudioFileFromDevice(): Promise<{
    cancelled: boolean;
    id?: string;
    name?: string;
    fileName?: string;
    uri?: string;
    originalContentUri?: string;
    mimeType?: string;
    sizeBytes?: number;
    durationSeconds?: number;
  }>;
  deleteImportedAudioFile(options: { uri: string }): Promise<{ deleted: boolean }>;
  verifyToneUri(options: { uri: string }): Promise<{ valid: boolean }>;
}

const SmartMorningNativeAudio = registerPlugin<SmartMorningNativeAudioPlugin>('SmartMorningNative');

function openSongsIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير مدعوم في هذه البيئة'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('فشل فتح قاعدة بيانات الأغاني المحلية'));
  });
}

async function saveBlobToIndexedDB(id: string, blob: Blob): Promise<void> {
  const db = await openSongsIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(blob, id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('تعذر حفظ الملف الصوتي في التخزين المحلي'));
    };
  });
}

export async function getBlobFromIndexedDB(id: string): Promise<Blob | null> {
  try {
    const db = await openSongsIndexedDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as Blob) || null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

async function deleteBlobFromIndexedDB(id: string): Promise<void> {
  try {
    const db = await openSongsIndexedDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {}
}

export function getImportedSongs(): ImportedSongItem[] {
  try {
    const raw = localStorage.getItem(SONGS_META_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.uri === 'string'
    );
  } catch {
    return [];
  }
}

export function saveImportedSongsMeta(songs: ImportedSongItem[]): void {
  try {
    localStorage.setItem(SONGS_META_STORAGE_KEY, JSON.stringify(songs));
  } catch {}
}

export function formatBytesArabic(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'حجم غير معروف';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
}

export function formatSecondsMMSS(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '--:--';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const SUPPORTED_EXTENSIONS = /\.(mp3|m4a|wav|aac|ogg|mp4|flac|webm)$/i;
const SUPPORTED_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/aac',
  'audio/aacp',
  'audio/ogg',
  'application/ogg',
  'audio/webm',
  'audio/flac',
];

function probeAudioFileDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(0);
    }, 5000);

    audio.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      const dur = Number.isFinite(audio.duration) ? Math.max(1, Math.round(audio.duration)) : 0;
      cleanup();
      resolve(dur);
    };

    audio.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('الملف المختار غير مدعوم أو تالف ولا يمكن تشغيله.'));
    };

    audio.src = url;
  });
}

/**
 * Opens the real device audio file picker:
 * - On Android APK: uses ACTION_OPEN_DOCUMENT and copies to app-private files/imported_songs/
 * - On Web / HTML5: opens real system file picker and persists binary audio in IndexedDB
 */
export async function importSongFromDevice(): Promise<{
  cancelled: boolean;
  song?: ImportedSongItem;
  error?: string;
}> {
  const isNativeAndroid =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  if (isNativeAndroid) {
    try {
      const res = await SmartMorningNativeAudio.pickAudioFileFromDevice();
      if (res.cancelled || !res.uri || !res.id) {
        return { cancelled: true };
      }

      const newSong: ImportedSongItem = {
        id: res.id,
        name: res.name || 'أغنية مخصصة',
        fileName: res.fileName || res.name || 'song.mp3',
        uri: res.uri,
        originalContentUri: res.originalContentUri,
        mimeType: res.mimeType || 'audio/mpeg',
        sizeBytes: res.sizeBytes || 0,
        durationSeconds: res.durationSeconds || 0,
        createdAtMs: Date.now(),
      };

      const existing = getImportedSongs();
      saveImportedSongsMeta([newSong, ...existing]);
      return { cancelled: false, song: newSong };
    } catch (err: any) {
      return {
        cancelled: false,
        error: err?.message || 'تعذر استيراد الملف الصوتي من جهاز أندرويد.',
      };
    }
  }

  // Real System File Picker via HTML5 <input type="file"> + IndexedDB persistence
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.m4a,.wav,.aac,.ogg,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,audio/ogg,audio/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (result: { cancelled: boolean; song?: ImportedSongItem; error?: string }) => {
      if (settled) return;
      settled = true;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      resolve(result);
    };

    input.addEventListener('cancel', () => {
      finish({ cancelled: true });
    });

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ cancelled: true });
        return;
      }

      const extOk = SUPPORTED_EXTENSIONS.test(file.name);
      const mimeOk =
        !file.type ||
        file.type.startsWith('audio/') ||
        SUPPORTED_MIMES.includes(file.type.toLowerCase());

      if (!extOk && !mimeOk) {
        finish({
          cancelled: false,
          error: 'صيغة الملف غير مدعومة. يرجى اختيار ملف صوتي بصيغة MP3 أو M4A أو WAV أو AAC أو OGG.',
        });
        return;
      }

      try {
        const durationSeconds = await probeAudioFileDuration(file);
        const songId = `song_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await saveBlobToIndexedDB(songId, file);

        const dotIdx = file.name.lastIndexOf('.');
        const cleanName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;

        const newSong: ImportedSongItem = {
          id: songId,
          name: cleanName,
          fileName: file.name,
          uri: `idb://${songId}`,
          mimeType: file.type || 'audio/mpeg',
          sizeBytes: file.size,
          durationSeconds,
          createdAtMs: Date.now(),
        };

        const existing = getImportedSongs();
        saveImportedSongsMeta([newSong, ...existing]);
        finish({ cancelled: false, song: newSong });
      } catch (err: any) {
        finish({
          cancelled: false,
          error: err?.message || 'تعذر قراءة أو حفظ الملف الصوتي المختار.',
        });
      }
    };

    input.click();
  });
}

export async function deleteImportedSongFromLibrary(songId: string): Promise<void> {
  const existing = getImportedSongs();
  const target = existing.find((s) => s.id === songId);
  const updated = existing.filter((s) => s.id !== songId);
  saveImportedSongsMeta(updated);

  if (target) {
    if (target.uri.startsWith('idb://')) {
      await deleteBlobFromIndexedDB(target.id);
    } else if (
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'android'
    ) {
      try {
        await SmartMorningNativeAudio.deleteImportedAudioFile({ uri: target.uri });
      } catch {}
    }
  }
}

export async function verifyImportedSongAccessible(song: ImportedSongItem): Promise<boolean> {
  if (!song || !song.uri) return false;
  if (song.uri.startsWith('idb://')) {
    const blob = await getBlobFromIndexedDB(song.id);
    return blob !== null && blob.size > 0;
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const res = await SmartMorningNativeAudio.verifyToneUri({ uri: song.uri });
      return Boolean(res.valid);
    } catch {
      return false;
    }
  }
  return false;
}
