import { api } from "@/lib/endpoints";
import { registerSyncHandler } from "@/lib/offline/syncEngine";

let handlersRegistered = false;

function toOptionalString(value: unknown): string | undefined {
  const safe = String(value || "").trim();
  return safe || undefined;
}

export function registerDefaultOfflineHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  registerSyncHandler("letters", "create", async (item) => {
    await api.createLetter(item.payload);
  });

  registerSyncHandler("ministerial_attendance", "create", async (item) => {
    await api.saveMinisterialAttendance({
      user_id: String(item.payload?.user_id || ""),
      meeting_date: String(item.payload?.meeting_date || ""),
      church_totvs_id: String(item.payload?.church_totvs_id || ""),
      status: String(item.payload?.status || "") as "PRESENTE" | "FALTA" | "FALTA_JUSTIFICADA",
      justification_text: toOptionalString(item.payload?.justification_text) || null,
    });
  });

  registerSyncHandler("member_docs", "create", async (item) => {
    await api.generateMemberDocs(item.payload);
  });

  registerSyncHandler("notifications", "update", async (item) => {
    const mode = String(item.payload?.mode || "").trim();
    const churchTotvsId = toOptionalString(item.payload?.church_totvs_id);

    if (mode === "mark-read") {
      const id = toOptionalString(item.payload?.id);
      if (!id) throw new Error("missing_notification_id");
      await api.markNotificationRead({ id, church_totvs_id: churchTotvsId });
      return;
    }

    if (mode === "mark-all-read") {
      await api.markAllNotificationsRead({ church_totvs_id: churchTotvsId });
      return;
    }

    throw new Error(`unknown_notifications_mode:${mode}`);
  });
}
