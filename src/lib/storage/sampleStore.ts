/**
 * IndexedDB-backed store for raw audio bytes (imported/recorded samples).
 * Kept separate from project JSON (localStorage) because audio blobs are
 * large and don't belong in Postgres either — see ARCHITECTURE.md.
 */

const DB_NAME = "personal-daw";
const DB_VERSION = 1;
const STORE = "samples";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredSample {
  id: string;
  name: string;
  blob: Blob;
  createdAt: string;
}

export async function putSample(id: string, name: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, name, blob, createdAt: new Date().toISOString() } satisfies StoredSample);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getSample(id: string): Promise<StoredSample | undefined> {
  const db = await openDb();
  const result = await new Promise<StoredSample | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredSample | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function listSamples(): Promise<StoredSample[]> {
  const db = await openDb();
  const result = await new Promise<StoredSample[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredSample[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function deleteSample(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
