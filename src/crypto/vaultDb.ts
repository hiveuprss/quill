/** Worker-only IndexedDB for credential envelope. Never opened from main thread. */

export type CredentialEnvelope = {
  v: 1;
  username: string;
  postingPubkey: string;
  salt: string;
  iv: string;
  ciphertext: string;
  kdf: { name: 'pbkdf2'; hash: 'SHA-256'; iterations: number };
  createdAt: number;
};

const DB_NAME = 'hivequill_vault';
const STORE = 'envelope';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadEnvelope(): Promise<CredentialEnvelope | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('primary');
    req.onsuccess = () => {
      const row = req.result as (CredentialEnvelope & { id: string }) | undefined;
      if (!row) {
        resolve(null);
        return;
      }
      const { id: _id, ...envelope } = row;
      resolve(envelope);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveEnvelope(envelope: CredentialEnvelope): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: 'primary', ...envelope });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function wipeEnvelope(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('primary');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
