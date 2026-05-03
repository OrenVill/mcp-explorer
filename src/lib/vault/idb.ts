import { IDB_NAME, IDB_RECORD_KEY, IDB_STORE } from './constants';
import type { VaultEnvelope } from './types';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function getVaultEnvelope(): Promise<VaultEnvelope | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const g = store.get(IDB_RECORD_KEY);
    g.onerror = () => {
      db.close();
      reject(g.error);
    };
    g.onsuccess = () => resolve((g.result as VaultEnvelope | undefined) ?? null);
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function putVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(envelope, IDB_RECORD_KEY);
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteVaultRecord(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_RECORD_KEY);
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}
