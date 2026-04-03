import {
  addSyncQueue,
  clearStore,
  getAllFromStore,
  listSyncQueueByStatus,
  updateSyncQueueItem,
  upsertMany,
  type SyncQueueItem,
} from "@/lib/offline/db";

function buildCacheKey(prefix: string, id: string | number) {
  return `${prefix}:${id}`;
}

export async function saveMembersCache(churchTotvsId: string, members: Record<string, unknown>[]) {
  const rows = members.map((member) => ({
    ...member,
    church_totvs_id: churchTotvsId,
    cache_key: buildCacheKey(churchTotvsId, String(member.id || "")),
    cached_at: new Date().toISOString(),
  }));
  await upsertMany("members_cache", rows);
}

export async function getMembersCache(churchTotvsId?: string) {
  const rows = await getAllFromStore<Record<string, unknown>>("members_cache");
  if (!churchTotvsId) return rows;
  return rows.filter((row) => String(row.church_totvs_id || "") === churchTotvsId);
}

export async function saveChurchesCache(churches: Record<string, unknown>[]) {
  const rows = churches.map((church) => {
    const totvs = String(church.totvs_id || "");
    return {
      ...church,
      church_totvs_id: totvs,
      cache_key: buildCacheKey("church", totvs),
      cached_at: new Date().toISOString(),
    };
  });
  await upsertMany("churches_cache", rows);
}

export async function getChurchesCache() {
  return getAllFromStore<Record<string, unknown>>("churches_cache");
}

export async function saveLettersCache(churchTotvsId: string, letters: Record<string, unknown>[]) {
  const rows = letters.map((letter) => ({
    ...letter,
    church_totvs_id: churchTotvsId,
    cache_key: buildCacheKey(churchTotvsId, String(letter.id || "")),
    cached_at: new Date().toISOString(),
  }));
  await upsertMany("letters_cache", rows);
}

export async function getLettersCache(churchTotvsId?: string) {
  const rows = await getAllFromStore<Record<string, unknown>>("letters_cache");
  if (!churchTotvsId) return rows;
  return rows.filter((row) => String(row.church_totvs_id || "") === churchTotvsId);
}

export async function clearEntityCaches() {
  await Promise.all([
    clearStore("letters_cache"),
    clearStore("members_cache"),
    clearStore("churches_cache"),
  ]);
}

export async function enqueueOfflineOperation(
  entity: string,
  operation: SyncQueueItem["operation"],
  payload: Record<string, unknown>,
  churchTotvsId?: string,
) {
  const clientRequestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return addSyncQueue({
    entity,
    operation,
    payload,
    church_totvs_id: churchTotvsId || null,
    client_request_id: clientRequestId,
  });
}

export async function listPendingOperations() {
  return listSyncQueueByStatus("PENDING");
}

export async function markOperationSynced(id: number) {
  return updateSyncQueueItem(id, { status: "SYNCED", last_error: null });
}

export async function markOperationError(id: number, errorMessage: string) {
  const pending = await listSyncQueueByStatus("PENDING");
  const current = pending.find((item) => Number(item.id) === id);
  const nextRetries = Number(current?.retries || 0) + 1;
  return updateSyncQueueItem(id, {
    status: "ERROR",
    retries: nextRetries,
    last_error: errorMessage,
  });
}
