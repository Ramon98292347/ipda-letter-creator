import { post } from "@/lib/api";

type JsonBody = Record<string, unknown>;

export const api = {
  login: (body: { cpf: string; password: string }) => post("auth-api", { action: "login", ...body }, { skipAuth: true }),
  selectChurch: (body: { cpf: string; totvs_id: string }) => post("auth-api", { action: "select-church", ...body }, { skipAuth: true }),
  forgotPasswordRequest: (body: { cpf?: string; email?: string }) => post("auth-api", { action: "forgot-password", ...body }, { skipAuth: true }),
  resetPasswordConfirm: (body: { token: string; new_password: string }) => post("auth-api", { action: "reset-password", ...body }, { skipAuth: true }),
  publicRegisterMember: (body: {
    cpf: string;
    full_name: string;
    minister_role: string;
    profession?: string | null;
    baptism_date?: string | null;
    ordination_date?: string | null;
    phone?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    cep?: string | null;
    address_street?: string | null;
    address_number?: string | null;
    address_complement?: string | null;
    address_neighborhood?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    password: string;
    totvs_id: string;
  }) => post("auth-api", { action: "public-register", ...body }, { skipAuth: true }),
  getMyRegistrationStatus: () => post("auth-api", { action: "get-registration-status" }),

  dashboardStats: (body: JsonBody = {}) => post("dashboard-stats", body),
  listChurchesInScope: (body: { page?: number; page_size?: number; root_totvs_id?: string } = {}) =>
    post("churches-api", { action: "list-in-scope", ...body }),
  createChurch: (body: {
    totvs_id: string;
    parent_totvs_id?: string | null;
    church_name: string;
    class: string;
    image_url?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    cep?: string | null;
    address_street?: string | null;
    address_number?: string | null;
    address_complement?: string | null;
    address_neighborhood?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_country?: string | null;
    is_active?: boolean;
  }) => post("churches-api", { action: "create", ...body }),
  deleteChurch: (body: { church_totvs_id: string }) => post("churches-api", { action: "delete", ...body }),
  listLetters: (body: JsonBody) => post("letters-api", { action: "list", ...body }),
  setLetterStatus: (body: { letter_id: string; status: string }) => post("letters-api", { action: "set-status", ...body }),
  getLetterPdfUrl: (body: { letter_id: string }) => post("letters-api", { action: "get-pdf-url", ...body }),

  createLetter: (body: JsonBody) => post("letters-api", { action: "create", ...body }),
  createUser: (body: JsonBody) => post("create-user", body),
  resetPassword: (body: { cpf?: string; user_id?: string; new_password: string }) => post("auth-api", { action: "admin-reset-password", ...body }),
  updateMyProfile: (body: JsonBody) => post("members-api", { action: "save-profile", ...body }),
  getMyProfile: (body: JsonBody = {}) => post("members-api", { action: "get-profile", ...body }),
  listWorkers: (body: { search?: string; minister_role?: string; is_active?: boolean; include_pastor?: boolean; page?: number; page_size?: number }) =>
    post("members-api", { action: "list-workers", ...body }),
  listMembers: (body: {
    search?: string;
    minister_role?: string;
    is_active?: boolean;
    roles?: Array<"pastor" | "obreiro" | "secretario" | "financeiro">;
    church_totvs_id?: string;
    page?: number;
    page_size?: number;
  }) => post("members-api", { action: "list-members", ...body }),
  listPastors: (body: JsonBody) => post("churches-api", { action: "list-pastors", ...body }),
  setChurchPastor: (body: { church_totvs_id: string; pastor_user_id: string }) =>
    post("churches-api", { action: "set-pastor", ...body }),
  toggleWorkerActive: (body: { worker_id: string; is_active: boolean }) => post("toggle-worker-active", body),
  setWorkerDirectRelease: (body: { worker_id: string; can_create_released_letter: boolean }) =>
    post("set-worker-direct-release", body),
  setUserRegistrationStatus: (body: { user_id: string; registration_status: "APROVADO" | "PENDENTE" }) =>
    post("set-user-registration-status", body),
  setUserPaymentStatus: (body: {
    user_id: string;
    payment_status: "ATIVO" | "BLOQUEADO_PAGAMENTO";
    reason?: string | null;
    amount?: number | null;
    due_date?: string | null;
  }) => post("set-user-payment-status", body),
  createMinisterialMeeting: (body: {
    church_totvs_id?: string | null;
    title?: string | null;
    meeting_date: string;
    expires_at?: string | null;
    notes?: string | null;
  }) => post("meetings-api", { action: "create", ...body }),
  listMinisterialMeetings: (body: { church_totvs_id?: string | null } = {}) =>
    post("meetings-api", { action: "list", ...body }),
  manageMinisterialMeeting: (body: {
    meeting_id: string;
    action: "close" | "reopen" | "delete";
    church_totvs_id?: string | null;
    expires_at?: string | null;
  }) => post("meetings-api", { action: "manage", manage_action: body.action, meeting_id: body.meeting_id, church_totvs_id: body.church_totvs_id, expires_at: body.expires_at }),
  saveMinisterialAttendance: (body: {
    user_id: string;
    meeting_date: string;
    church_totvs_id: string;
    status: "PRESENTE" | "FALTA" | "FALTA_JUSTIFICADA";
    justification_text?: string | null;
  }) => post("meetings-api", { action: "save-attendance", ...body }),
  deleteUser: (body: { user_id: string }) => post("delete-user", body),

  workerDashboard: (body: JsonBody) => post("worker-dashboard", body),
  requestRelease: (body: { letter_id: string; message?: string | null }) => post("request-release", body),

  listReleaseRequests: (body: JsonBody) => post("list-release-requests", body),
  approveRelease: (body: { request_id: string }) => post("letters-api", { action: "approve-release", ...body }),
  denyRelease: (body: { request_id: string }) => post("deny-release", body),
  listNotifications: (body: { page?: number; page_size?: number; unread_only?: boolean; church_totvs_id?: string } = {}) => post("notifications-api", { action: "list", ...body }),
  markNotificationRead: (body: { id: string; church_totvs_id?: string }) => post("notifications-api", { action: "mark-read", ...body }),
  markAllNotificationsRead: (body: { church_totvs_id?: string } = {}) => post("notifications-api", { action: "mark-all-read", ...body }),

  listAnnouncements: (body: JsonBody = { limit: 10, church_totvs_id: undefined }) => post("announcements-api", { action: "list", ...body }),
  listAnnouncementsPublic: (body: JsonBody = {}) => post("announcements-api", { action: "list-public", ...body }, { skipAuth: true }),
  listAnnouncementsAdmin: (body: JsonBody = {}) => post("announcements-api", { action: "list-admin", ...body }),
  getPastorContact: (body: { totvs_id: string }) => post("auth-api", { action: "get-pastor-contact", ...body }),
  // Busca divulgacoes pelo CPF sem precisar de JWT (usado na tela de login)
  listAnnouncementsByCpf: (body: { cpf: string; limit?: number }) => post("announcements-api", { action: "list", ...body }, { skipAuth: true }),
  // Atualiza avatar apos cadastro publico (usa user_id + cpf para verificacao)
  updateMemberAvatar: (body: { user_id: string; cpf: string; avatar_url: string }) =>
    post("members-api", { action: "update-avatar", ...body }, { skipAuth: true }),
  birthdaysToday: (body: { limit?: number; notify?: boolean } = {}) => post("birthdays-today", body),
  birthdaysTodayByCpf: (body: { cpf: string; limit?: number }) => post("birthdays-today", body, { skipAuth: true }),
  getPublicMinisterialMeeting: (body: { token: string }) =>
    post("meetings-api", { action: "get-public", ...body }, { skipAuth: true }),
  savePublicMinisterialAttendance: (body: {
    token: string;
    user_id: string;
    status: "PRESENTE" | "FALTA" | "FALTA_JUSTIFICADA";
    justification_text?: string | null;
  }) => post("meetings-api", { action: "save-public-attendance", ...body }, { skipAuth: true }),
  upsertAnnouncement: (body: JsonBody) => post("announcements-api", { action: "upsert", ...body }),
  deleteAnnouncement: (body: { id: string }) => post("announcements-api", { action: "delete", ...body }),
  listEvents: (body: JsonBody = {}) => post("announcements-api", { action: "list-events", ...body }),
  upsertEvent: (body: JsonBody) => post("announcements-api", { action: "upsert-event", ...body }),
  deleteEvent: (body: { id: string }) => post("announcements-api", { action: "delete-event", ...body }),
  listEventsPublic: (body: JsonBody = {}) => post("announcements-api", { action: "list-events-public", ...body }, { skipAuth: true }),
  listBanners: (body: JsonBody = {}) => post("announcements-api", { action: "list-banners", ...body }),
  upsertBanner: (body: JsonBody) => post("announcements-api", { action: "upsert-banner", ...body }),
  deleteBanner: (body: { id: string }) => post("announcements-api", { action: "delete-banner", ...body }),
  listBannersPublic: (body: JsonBody = {}) => post("announcements-api", { action: "list-banners-public", ...body }, { skipAuth: true }),
  upsertStamps: (body: { signature_url?: string | null; stamp_pastor_url?: string | null; stamp_church_url?: string | null }) =>
    post("members-api", { action: "upsert-stamps", ...body }),

  // Comentario: modulo Igrejas > Remanejamento/Contrato.
  getChurchRemanejamentoForm: (body: { church_totvs_id: string }) => post("church-docs-api", { action: "get-remanejamento-form", ...body }),
  upsertChurchRemanejamento: (body: JsonBody) => post("church-docs-api", { action: "upsert-remanejamento", ...body }),
  generateChurchRemanejamentoPdf: (body: { church_totvs_id: string; remanejamento_id?: string }) =>
    post("church-docs-api", { action: "generate-remanejamento-pdf", ...body }),
  getChurchContratoForm: (body: { church_totvs_id: string }) => post("church-docs-api", { action: "get-contrato-form", ...body }),
  upsertChurchContrato: (body: JsonBody) => post("church-docs-api", { action: "upsert-contrato", ...body }),
  upsertChurchLaudo: (body: JsonBody) => post("church-docs-api", { action: "upsert-laudo", ...body }),
  generateChurchContratoPdf: (body: { church_totvs_id: string; contrato_id?: string }) =>
    post("church-docs-api", { action: "generate-contrato-pdf", ...body }),

  // Comentario: gera ficha/carteirinha de membro via webhook n8n.
  generateMemberDocs: (body: JsonBody) => post("member-docs-api", { action: "generate", ...body }),
  getMemberDocsStatus: (body: { member_id?: string; church_totvs_id?: string } = {}) =>
    post("member-docs-api", { action: "status", ...body }),
  // Comentario: lista carteirinhas prontas para impressao em lote
  listReadyCarteirinhas: (body: { church_totvs_id: string }) =>
    post("member-docs-api", { action: "list-ready", ...body }),
  // Comentario: marca carteirinhas como impressas (atualiza printed_at)
  markCarteirinhasPrinted: (body: { ids: string[] }) =>
    post("member-docs-api", { action: "mark-printed", ...body }),
  // Comentario: gera documento unico em lote para impressao de carteirinhas
  generatePrintBatchCarteirinhas: (body: { church_totvs_id: string; ids: string[] }) =>
    post("member-docs-api", { action: "generate-print-batch", ...body }),
  listPrintBatchCarteirinhas: (body: { church_totvs_id: string }) =>
    post("member-docs-api", { action: "list-print-batches", ...body }),
};
