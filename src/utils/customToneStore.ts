import { CustomToneMeta } from '../types/battery';

const DB_NAME = 'chargeguard_tones_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_tones';

interface StoredToneRecord extends CustomToneMeta {
  blob: Blob;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open tone database'));
  });
}

export async function saveCustomTone(file: File): Promise<CustomToneMeta> {
  const db = await openDB();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanName = file.name.replace(/\.[^/.]+$/, '') || 'Custom Tone';

  const record: StoredToneRecord = {
    id,
    name: cleanName.slice(0, 48),
    mimeType: file.type || 'audio/mpeg',
    sizeBytes: file.size,
    addedAt: new Date().toISOString(),
    blob: file,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      const { blob: _ignored, ...meta } = record;
      void _ignored;
      resolve(meta);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to save custom tone'));
    };
  });
}

export async function listCustomTones(): Promise<CustomToneMeta[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        const records = (req.result as StoredToneRecord[]) ?? [];
        resolve(
          records
            .map(({ blob: _ignored, ...meta }) => {
              void _ignored;
              return meta;
            })
            .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        );
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('Failed to list tones'));
      };
    });
  } catch {
    return [];
  }
}

export async function getCustomToneBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        db.close();
        const record = req.result as StoredToneRecord | undefined;
        resolve(record?.blob ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('Failed to load tone'));
      };
    });
  } catch {
    return null;
  }
}

export async function deleteCustomTone(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to delete tone'));
      };
    });
  } catch {
    // Ignore delete failures
  }
}
