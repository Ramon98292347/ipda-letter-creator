import { listPendingOperations, markOperationError, markOperationSynced } from "@/lib/offline/repository";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

type QueueItem = {
  id?: number;
  entity: string;
  operation: "create" | "update" | "delete";
  payload: Record<string, unknown>;
};

type SyncHandler = (item: QueueItem) => Promise<void>;

const handlers = new Map<string, SyncHandler>();
let running = false;
let timer: number | null = null;

function isRetryableSyncError(error: unknown) {
  const msg = String(error || "").toLowerCase();
  return msg.includes("network_error") || msg.includes("request_timeout") || msg.includes("sem conexão") || msg.includes("failed to fetch");
}

function keyOf(entity: string, operation: string) {
  return `${entity}:${operation}`;
}

async function isOnlineNow() {
  if (Capacitor.isNativePlatform()) {
    const status = await Network.getStatus();
    return Boolean(status.connected);
  }
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function registerSyncHandler(entity: string, operation: "create" | "update" | "delete", handler: SyncHandler) {
  handlers.set(keyOf(entity, operation), handler);
}

async function processQueue() {
  if (running) return;
  if (!(await isOnlineNow())) return;
  running = true;
  try {
    const pending = await listPendingOperations();
    for (const item of pending) {
      const id = Number(item.id || 0);
      if (!id) continue;
      const handler = handlers.get(keyOf(item.entity, item.operation));
      if (!handler) {
        await markOperationError(id, `handler_not_found:${item.entity}:${item.operation}`);
        continue;
      }
      try {
        await handler(item);
        await markOperationSynced(id);
      } catch (err) {
        if (isRetryableSyncError(err)) {
          // Mantem pendente para nova tentativa automatica no proximo ciclo.
          continue;
        }
        await markOperationError(id, String(err));
      }
    }
  } finally {
    running = false;
  }
}

export function startOfflineSyncLoop() {
  const onOnline = () => {
    void processQueue();
  };
  window.addEventListener("online", onOnline);
  timer = window.setInterval(() => {
    void processQueue();
  }, 30000);

  void processQueue();

  return () => {
    window.removeEventListener("online", onOnline);
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}
