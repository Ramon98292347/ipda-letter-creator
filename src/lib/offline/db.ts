export const OFFLINE_DB_NAME = "ipda_offline_v1";
export const OFFLINE_DB_VERSION = 1;

export type OfflineStoreName =
  | "members_cache"
  | "churches_cache"
  | "letters_cache"
  | "sync_queue"
  | "sync_meta";

export type SyncQueueItem = {
  id?: number;
  entity: string;
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  church_totvs_id?: string | null;
  client_request_id: string;
  status: "PENDING" | "SYNCED" | "ERROR";
  retries: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("indexeddb_tx_failed"));
    tx.onabort = () => reject(tx.error || new Error("indexeddb_tx_aborted"));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("members_cache")) {
        const store = db.createObjectStore("members_cache", { keyPath: "cache_key" });
        store.createIndex("church_totvs_id", "church_totvs_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("churches_cache")) {
        const store = db.createObjectStore("churches_cache", { keyPath: "cache_key" });
        store.createIndex("church_totvs_id", "church_totvs_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("letters_cache")) {
        const store = db.createObjectStore("letters_cache", { keyPath: "cache_key" });
        store.createIndex("church_totvs_id", "church_totvs_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("sync_queue")) {
        const store = db.createObjectStore("sync_queue", { keyPath: "id", autoIncrement: true });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains("sync_meta")) {
        db.createObjectStore("sync_meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexeddb_open_failed"));
  });
  return dbPromise;
}

export async function upsertMany(storeName: OfflineStoreName, rows: Record<string, unknown>[]) {
  const db = await getOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const row of rows) store.put(row);
  await transactionDone(tx);
}

export async function addSyncQueue(item: Omit<SyncQueueItem, "id" | "created_at" | "updated_at" | "retries" | "status">) {
  const now = new Date().toISOString();
  const row: SyncQueueItem = {
    ...item,
    status: "PENDING",
    retries: 0,
    created_at: now,
    updated_at: now,
  };
  const db = await getOfflineDb();
  const tx = db.transaction("sync_queue", "readwrite");
  const store = tx.objectStore("sync_queue");
  const id = await requestToPromise(store.add(row));
  await transactionDone(tx);
  return Number(id);
}

export async function listSyncQueueByStatus(status: SyncQueueItem["status"]) {
  const db = await getOfflineDb();
  const tx = db.transaction("sync_queue", "readonly");
  const store = tx.objectStore("sync_queue");
  const index = store.index("status");
  const rows = await requestToPromise(index.getAll(status));
  await transactionDone(tx);
  return (rows as SyncQueueItem[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function updateSyncQueueItem(id: number, patch: Partial<SyncQueueItem>) {
  const db = await getOfflineDb();
  const tx = db.transaction("sync_queue", "readwrite");
  const store = tx.objectStore("sync_queue");
  const row = (await requestToPromise(store.get(id))) as SyncQueueItem | undefined;
  if (!row) {
    await transactionDone(tx);
    return false;
  }
  store.put({ ...row, ...patch, updated_at: new Date().toISOString() });
  await transactionDone(tx);
  return true;
}

export async function getAllFromStore<T = Record<string, unknown>>(storeName: OfflineStoreName): Promise<T[]> {
  const db = await getOfflineDb();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const rows = await requestToPromise(store.getAll());
  await transactionDone(tx);
  return rows as T[];
}

export async function clearStore(storeName: OfflineStoreName): Promise<void> {
  const db = await getOfflineDb();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.clear();
  await transactionDone(tx);
}
