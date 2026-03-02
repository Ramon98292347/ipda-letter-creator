import { post } from "@/lib/api";

type JsonBody = Record<string, unknown>;

export const api = {
  login: (body: { cpf: string; password: string }) => post("login", body, { skipAuth: true }),
  selectChurch: (body: { cpf: string; totvs_id: string }) => post("select-church", body, { skipAuth: true }),

  dashboardStats: (body: JsonBody = {}) => post("dashboard-stats", body),
  listChurchesInScope: (body: { page?: number; page_size?: number } = {}) => post("list-churches-in-scope", body),
  createChurch: (body: { totvs_id: string; parent_totvs_id?: string | null; church_name: string; class: string }) => post("create-church", body),
  deleteChurch: (body: { church_totvs_id: string }) => post("delete-church", body),
  listLetters: (body: JsonBody) => post("list-letters", body),
  setLetterStatus: (body: { letter_id: string; status: string }) => post("set-letter-status", body),
  getLetterPdfUrl: (body: { letter_id: string }) => post("get-letter-pdf-url", body),

  createLetter: (body: JsonBody) => post("create-letter", body),
  createUser: (body: JsonBody) => post("create-user", body),
  resetPassword: (body: { cpf?: string; user_id?: string; new_password: string }) => post("reset-password", body),
  updateMyProfile: (body: { phone?: string; email?: string; address_city?: string; avatar_url?: string }) => post("update-my-profile", body),
  listWorkers: (body: { search?: string; minister_role?: string; is_active?: boolean; include_pastor?: boolean; page?: number; page_size?: number }) =>
    post("list-workers", body),
  listMembers: (body: {
    search?: string;
    minister_role?: string;
    is_active?: boolean;
    roles?: Array<"pastor" | "obreiro">;
    page?: number;
    page_size?: number;
  }) => post("list-members", body),
  listPastors: (body: JsonBody) => post("list-pastors", body),
  setChurchPastor: (body: { church_totvs_id: string; pastor_user_id: string }) => post("set-church-pastor", body),
  toggleWorkerActive: (body: { worker_id: string; is_active: boolean }) => post("toggle-worker-active", body),

  workerDashboard: (body: JsonBody) => post("worker-dashboard", body),
  requestRelease: (body: { letter_id: string; message?: string | null }) => post("request-release", body),

  listReleaseRequests: (body: JsonBody) => post("list-release-requests", body),
  approveRelease: (body: { request_id: string }) => post("approve-release", body),
  denyRelease: (body: { request_id: string }) => post("deny-release", body),
  listNotifications: (body: { page?: number; page_size?: number; unread_only?: boolean; church_totvs_id?: string } = {}) => post("list-notifications", body),
  markNotificationRead: (body: { id: string; church_totvs_id?: string }) => post("mark-notification-read", body),
  markAllNotificationsRead: (body: { church_totvs_id?: string } = {}) => post("mark-all-notifications-read", body),

  listAnnouncements: (body: JsonBody = { limit: 10 }) => post("list-announcements", body),
  birthdaysToday: () => post("birthdays-today", {}),
  upsertAnnouncement: (body: JsonBody) => post("upsert-announcement", body),
  deleteAnnouncement: (body: { id: string }) => post("delete-announcement", body),
  upsertStamps: (body: { signature_url?: string | null; stamp_pastor_url?: string | null; stamp_church_url?: string | null }) =>
    post("upsert-stamps", body),
};
