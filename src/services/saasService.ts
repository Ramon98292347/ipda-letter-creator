import { ApiError, getRlsToken, getSession, getToken, getUser } from "@/lib/api";
import { api } from "@/lib/endpoints";
import { supabase, supabaseAnon } from "@/lib/supabase";
import { apiFetch } from "@/services/api";
import type { AppSession, PendingChurch } from "@/context/UserContext";
import { isValidCpf } from "@/lib/cpf";
import { enqueueOfflineOperation, getChurchesCache, getLettersCache, getMembersCache, markLetterDeletedInCache, saveChurchesCache, saveLettersCache, saveMembersCache } from "@/lib/offline/repository";

function isRetryableOfflineError(error: unknown) {
  return error instanceof ApiError && (error.code === "network_error" || error.code === "request_timeout" || error.status === 0 || error.status === 408);
}


export type AppRole = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
export type RegistrationStatus = "APROVADO" | "PENDENTE";
export type PaymentStatus = "ATIVO" | "BLOQUEADO_PAGAMENTO";
export type DisciplineStatus = "ATIVO" | "BLOQUEADO_DISCIPLINA";

export type AuthSessionData = {
  id: string;
  full_name: string;
  role: AppRole;
  cpf: string;
  phone?: string | null;
  email?: string | null;
  minister_role?: string | null;
  birth_date?: string | null;
  ordination_date?: string | null;
  avatar_url?: string | null;
  default_totvs_id?: string | null;
  totvs_access?: string[] | null;
  church_name?: string | null;
  church_class?: string | null;
  pastor_name?: string | null;
  can_create_released_letter?: boolean | null;
  registration_status?: RegistrationStatus | null;
  payment_status?: PaymentStatus | null;
  payment_block_reason?: string | null;
  discipline_status?: DisciplineStatus | null;
  discipline_block_reason?: string | null;
};

export type LoginResult =
  | {
      mode: "authenticated";
      token: string;
      rls_token?: string;
      user: AuthSessionData;
      session: AppSession;
    }
  | {
      mode: "select_church";
      cpf: string;
      churches: PendingChurch[];
    };

export type PastorFilters = {
  period: "today" | "7" | "30" | "custom";
  dateStart?: string;
  dateEnd?: string;
  church?: string;
  role?: string;
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  onlyNewSinceCache?: boolean;
};

export type PastorLetter = {
  id: string;
  church_totvs_id?: string | null;
  created_at: string;
  preacher_name: string;
  preach_date: string | null;
  church_origin: string | null;
  church_destination: string | null;
  minister_role: string | null;
  status: string;
  storage_path: string | null;
  url_carta?: string | null;
  url_pronta?: boolean | null;
  phone?: string | null;
  block_reason?: string | null;
  preacher_user_id?: string | null;
  preacher_church_totvs_id?: string | null;
  preacher_church_name?: string | null;
};

export type PastorMetrics = {
  totalCartas: number;
  cartasHoje: number;
  ultimos7Dias: number;
  totalObreiros: number;
  pendentesLiberacao: number;
};

export type UserListItem = {
  id: string;
  full_name: string;
  role?: AppRole | null;
  church_name?: string | null;
  cpf?: string | null;
  rg?: string | null;
  phone?: string | null;
  email?: string | null;
  profession?: string | null;
  minister_role?: string | null;
  birth_date?: string | null;
  baptism_date?: string | null;
  marital_status?: string | null;
  matricula?: string | null;
  ordination_date?: string | null;
  avatar_url?: string | null;
  signature_url?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  default_totvs_id?: string | null;
  totvs_access?: string[] | null;
  is_active?: boolean | null;
  can_create_released_letter?: boolean | null;
  can_manage?: boolean | null;
  registration_status?: RegistrationStatus | null;
  payment_status?: PaymentStatus | null;
  payment_block_reason?: string | null;
  discipline_status?: DisciplineStatus | null;
  discipline_block_reason?: string | null;
  attendance_status?: string | null;
  attendance_meeting_date?: string | null;
  attendance_absences_180_days?: number | null;
};

export type MinisterialAttendanceStatus = "PRESENTE" | "FALTA" | "FALTA_JUSTIFICADA";

export type SaveMinisterialAttendancePayload = {
  user_id: string;
  meeting_date: string;
  church_totvs_id: string;
  status: MinisterialAttendanceStatus;
  justification_text?: string | null;
};

export type MinisterialMeetingItem = {
  id: string;
  church_totvs_id: string;
  title?: string | null;
  meeting_date: string;
  public_token: string;
  expires_at: string;
  is_active: boolean;
  notes?: string | null;
  created_at?: string | null;
  church_name?: string | null;
  church_class?: string | null;
};

export type CreateMinisterialMeetingPayload = {
  church_totvs_id?: string | null;
  title?: string | null;
  meeting_date: string;
  expires_at?: string | null;
  notes?: string | null;
};

export type WorkerListParams = {
  search?: string;
  minister_role?: string;
  is_active?: boolean;
  include_pastor?: boolean;
  page?: number;
  page_size?: number;
};

export type MemberListParams = {
  search?: string;
  minister_role?: string;
  is_active?: boolean;
  roles?: Array<"pastor" | "obreiro" | "secretario" | "financeiro">;
  church_totvs_id?: string;
  exact_church?: boolean;
  updated_after?: string;
  page?: number;
  page_size?: number;
};

export type WorkerListResponse = {
  workers: UserListItem[];
  total: number;
  page: number;
  page_size: number;
  metrics?: {
    total: number;
    pastor: number;
    presbitero: number;
    diacono: number;
    obreiro: number;
    membro: number;
    inativos: number;
  };
};

export type AdminChurchSummary = {
  totvs_id: string;
  church_name: string;
  pastor_name?: string | null;
  church_class?: string | null;
  total_obreiros: number;
  total_cartas: number;
  cartas_liberadas: number;
  pendentes_liberacao: number;
};

export type UserFeedbackStatus = "NOVO" | "EM_ANALISE" | "CONCLUIDO" | "ARQUIVADO";

export type UserFeedbackItem = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  church_totvs_id: string | null;
  usability_rating: number;
  speed_rating: number;
  stability_rating: number;
  overall_rating: number;
  recommend_level: "SIM" | "TALVEZ" | "NAO";
  primary_need: string | null;
  improvement_notes: string | null;
  contact_allowed: boolean;
  status: UserFeedbackStatus;
  admin_notes: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChurchInScopeItem = {
  totvs_id: string;
  church_name: string;
  church_class?: string | null;
  parent_totvs_id?: string | null;
  image_url?: string | null;
  stamp_church_url?: string | null;
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
  workers_count?: number;
  pastor_user_id?: string | null;
  pastor?: {
    id?: string | null;
    full_name?: string | null;
  } | null;
};

export type ChurchHierarchySigner = {
  requires_setorial_signature: boolean;
  signer_role: "estadual" | "setorial";
  signer_user_id?: string | null;
  signer_name?: string | null;
  signer_signature_url?: string | null;
  message?: string | null;
};

export type ChurchRemanejamentoDraft = {
  church_totvs_id: string;
  estadual_pastor_nome?: string;
  estadual_pastor_cpf?: string;
  estadual_endereco?: string;
  estadual_cidade?: string;
  estadual_bairro?: string;
  estadual_uf?: string;
  estadual_ddd?: string;
  estadual_telefone?: string;
  estadual_email?: string;
  estadual_assinatura_url?: string;
  setorial_pastor_nome?: string;
  setorial_pastor_cpf?: string;
  setorial_endereco?: string;
  setorial_cidade?: string;
  setorial_bairro?: string;
  setorial_uf?: string;
  setorial_ddd?: string;
  setorial_telefone?: string;
  setorial_email?: string;
  setorial_assinatura_url?: string;
  igreja_endereco_atual?: string;
  igreja_numero?: string;
  igreja_bairro?: string;
  igreja_cidade?: string;
  igreja_uf?: string;
  porte_igreja?: string;
  sobre_imovel?: string;
  contrato_vence_em?: string;
  valor_aluguel?: string;
  possui_escritura?: "sim" | "nao" | "";
  comodato?: "sim" | "nao" | "";
  entradas_atuais?: string;
  saidas?: string;
  saldo?: string;
  numero_membros?: string;
  motivo_troca?: string;
  dirigente_saida_tipo?: string;
  dirigente_saida_nome?: string;
  dirigente_saida_rg?: string;
  dirigente_saida_cpf?: string;
  dirigente_saida_telefone?: string;
  dirigente_saida_data_assumiu?: string;
  novo_dirigente_tipo?: string;
  novo_dirigente_nome?: string;
  novo_dirigente_rg?: string;
  novo_dirigente_cpf?: string;
  novo_dirigente_telefone?: string;
  novo_dirigente_data_batismo?: string;
  novo_dirigente_distancia_km?: string;
  novo_dirigente_recebe_prebenda?: "sim" | "nao" | "";
  novo_dirigente_prebenda_desde?: string;
  sede_possui_cadastro_termos?: "sim" | "nao" | "";
  sede_tempo_batismo?: string;
  sede_fichas_anexas?: "sim" | "nao" | "";
  sede_matricula_totvs?: "sim" | "nao" | "";
  sede_numero_matricula?: string;
  resolucao_diretoria?: string;
};

export type ChurchContratoDraft = {
  church_totvs_id: string;
  dirigente_nome?: string;
  dirigente_telefone?: string;
  dirigente_igreja?: string;
  igreja_endereco?: string;
  igreja_numero?: string;
  igreja_bairro?: string;
  igreja_cidade?: string;
  igreja_uf?: string;
  igreja_central?: string;
  locador_nome?: string;
  locador_cpf?: string;
  locador_rg?: string;
  locador_estado_civil?: string;
  locador_endereco?: string;
  locador_numero?: string;
  locador_complemento?: string;
  locador_bairro?: string;
  locador_cidade?: string;
  locador_uf?: string;
  locador_cep?: string;
  locador_telefone?: string;
  valor_aluguel?: string;
  valor_extenso?: string;
  dia_pagamento?: string;
  contrato_dia?: string;
  contrato_mes?: string;
  contrato_ano?: string;
};

export type ChurchLaudoDraft = {
  church_totvs_id: string;
  locador_nome?: string;
  fiador_nome?: string;
  endereco_igreja?: string;
  cidade_igreja?: string;
  totvs?: string;
  dia?: string;
  mes?: string;
  ano?: string;
  foto_interna_1_url?: string;
  foto_interna_2_url?: string;
  foto_interna_3_url?: string;
  foto_interna_4_url?: string;
};

export type ReleaseRequest = {
  id: string;
  letter_id: string;
  requester_user_id: string;
  status: "PENDENTE" | "APROVADO" | "NEGADO";
  message?: string | null;
  created_at?: string;
  requester_name?: string | null;
  preacher_name?: string | null;
};

export type AppNotification = {
  id: string;
  title: string;
  message?: string | null;
  is_read: boolean;
  created_at?: string | null;
  type?: string | null;
  // Comentario: campo data contem informacoes extras por tipo.
  // Para type="birthday": { full_name, phone, email, birth_date, date }
  data?: Record<string, unknown> | null;
};

export type WorkerDashboardData = {
  user: AuthSessionData | null;
  church: {
    totvs_id?: string;
    church_name?: string;
    pastor_name?: string;
    pastor_phone?: string;
    pastor_email?: string;
    address_full?: string;
  } | null;
  letters: PastorLetter[];
};

export type AnnouncementItem = {
  id: string;
  title: string;
  type: "text" | "image" | "video";
  body_text?: string | null;
  media_url?: string | null;
  link_url?: string | null;
  position?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
};

export type BirthdayItem = {
  id?: string;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
};

export type PastorContact = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  minister_role?: string | null;
  signature_url?: string | null;
};

type MinisterRoleFront = "Pastor" | "Presbitero" | "Diacono" | "Obreiro" | "Membro";

function roleFromMinisterRole(ministerRole: string): "pastor" | "obreiro" {
  const normalized = String(ministerRole || "").trim().toLowerCase();
  return normalized === "pastor" ? "pastor" : "obreiro";
}

export type UserCreatePayload = {
  cpf: string;
  full_name: string;
  role: AppRole;
  totvs_access: string[];
  default_totvs_id?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  ordination_date?: string;
  minister_role?: string;
  is_active?: boolean;
  password?: string;
};

export type LetterCreatePayload = {
  church_totvs_id: string;
  preacher_name: string;
  minister_role: string;
  preach_date: string;
  preach_period?: "MANHA" | "TARDE" | "NOITE";
  church_origin: string;
  church_destination: string;
  destination_totvs_id?: string;
  manual_destination?: boolean;
  preacher_user_id?: string;
  phone?: string;
  email?: string;
  // Pastor responsável da igreja de origem
  pastor_name?: string;
  pastor_phone?: string;
};

const MOCK_USERS: Array<AuthSessionData & { password: string }> = [
  {
    id: "u-admin",
    full_name: "Administrador Geral",
    role: "admin",
    cpf: "11122233344",
    password: "123456",
    default_totvs_id: "9534",
    totvs_access: ["9534", "9600"],
    church_name: "CENTRAL ANCHIETA",
    pastor_name: "Daniel Paranhos Martineli",
    church_class: "Central",
  },
  {
    id: "u-pastor",
    full_name: "Pastor Daniel",
    role: "pastor",
    cpf: "22233344455",
    password: "123456",
    default_totvs_id: "9534",
    totvs_access: ["9534"],
    church_name: "CENTRAL ANCHIETA",
    pastor_name: "Daniel Paranhos Martineli",
    church_class: "Central",
  },
  {
    id: "u-obreiro",
    full_name: "Julia Mine",
    role: "obreiro",
    cpf: "33344455566",
    password: "123456",
    default_totvs_id: "9534",
    totvs_access: ["9534"],
    church_name: "CENTRAL ANCHIETA",
    pastor_name: "Daniel Paranhos Martineli",
    church_class: "Central",
    minister_role: "Auxiliar",
    phone: "(27) 99999-0000",
    email: "julia@ipda.org.br",
    birth_date: "2001-09-01",
    address_json: {
      cep: "29100000",
      street: "Rua Exemplo",
      number: "100",
      neighborhood: "Centro",
      city: "Vitoria",
      state: "ES",
      country: "BR",
    },
  },
];

const MOCK_LETTERS: PastorLetter[] = [
  {
    id: "l1",
    church_totvs_id: "9534",
    created_at: "2026-02-09T12:00:00.000Z",
    preacher_name: "Julia Mine",
    preach_date: "2026-02-10",
    church_origin: "9534 CENTRAL ANCHIETA",
    church_destination: "PIUMA",
    minister_role: "Auxiliar",
    status: "AUTORIZADO",
    storage_path: null,
    preacher_user_id: "u-obreiro",
  },
  {
    id: "l2",
    church_totvs_id: "9534",
    created_at: "2026-02-09T13:00:00.000Z",
    preacher_name: "Julia Mine",
    preach_date: "2026-02-12",
    church_origin: "9534 CENTRAL ANCHIETA",
    church_destination: "VALE ENCANTADO",
    minister_role: "Auxiliar",
    status: "LIBERADA",
    storage_path: "https://example.com/carta.pdf",
    preacher_user_id: "u-obreiro",
  },
];

const MOCK_RELEASES: ReleaseRequest[] = [
  {
    id: "r1",
    letter_id: "l1",
    requester_user_id: "u-obreiro",
    status: "PENDENTE",
    message: "Favor liberar",
    created_at: "2026-03-01T10:00:00.000Z",
    requester_name: "Julia Mine",
    preacher_name: "Julia Mine",
  },
];

const MOCK_ANNOUNCEMENTS: AnnouncementItem[] = [
  {
    id: "a1",
    title: "Congresso de Jovens",
    type: "text",
    body_text: "Sexta-feira 19:30 no templo central.",
    position: 1,
  },
  {
    id: "a2",
    title: "Campanha de Oracao",
    type: "image",
    media_url: "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=1200&auto=format&fit=crop",
    position: 2,
  },
];

function normalizeCpf(value: string) {
  return (value || "").replace(/\D/g, "").slice(0, 11);
}

function toAnnouncementMediaUrl(input: unknown): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
  if (!base) return raw;

  const normalizedPath = raw.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/announcements/${normalizedPath}`;
}

function mapSessionLike(raw: Record<string, unknown> | null | undefined): AppSession {
  const scope = Array.isArray(raw?.scope_totvs_ids)
    ? raw.scope_totvs_ids.filter(Boolean).map(String)
    : Array.isArray(raw?.totvs_access)
      ? raw.totvs_access.filter(Boolean).map(String)
      : raw?.totvs_id
        ? [String(raw.totvs_id)]
        : [];
  // Comentario: prioriza explicitamente o active_totvs_id vindo do backend.
  const totvsId = String(raw?.active_totvs_id || raw?.totvs_id || raw?.default_totvs_id || scope[0] || "");
  return {
    totvs_id: totvsId,
    root_totvs_id: raw?.root_totvs_id ? String(raw.root_totvs_id) : totvsId || undefined,
    role: (raw?.role || "obreiro") as AppRole,
    church_name: String(raw?.church_name || raw?.nome_igreja || "-"),
    church_class: raw?.church_class || raw?.class || null,
    scope_totvs_ids: scope,
  };
}

function resolveRegistrationStatus(raw: Record<string, unknown> | null | undefined): RegistrationStatus | null {
  const direct = String(raw?.registration_status || "").trim().toUpperCase();
  if (direct === "APROVADO" || direct === "PENDENTE") return direct as RegistrationStatus;

  const access = Array.isArray(raw?.totvs_access) ? raw?.totvs_access : [];
  for (const item of access as Array<Record<string, unknown>>) {
    const status = String(item?.registration_status || "").trim().toUpperCase();
    if (status === "APROVADO" || status === "PENDENTE") return status as RegistrationStatus;
  }

  return null;
}

function resolveRegistrationStatusFromTotvsAccess(totvsAccess: unknown): RegistrationStatus | null {
  if (!Array.isArray(totvsAccess)) return null;
  for (const item of totvsAccess as Array<Record<string, unknown>>) {
    const status = String(item?.registration_status || "").trim().toUpperCase();
    if (status === "APROVADO" || status === "PENDENTE") return status as RegistrationStatus;
  }
  return null;
}

function mapUserLike(raw: Record<string, unknown> | null | undefined): AuthSessionData {
  return {
    id: String(raw?.id || ""),
    full_name: String(raw?.full_name || raw?.nome || "Usuario"),
    role: (raw?.role || "obreiro") as AppRole,
    cpf: String(raw?.cpf || ""),
    phone: raw?.phone || null,
    email: raw?.email || null,
    minister_role: raw?.minister_role || null,
    birth_date: raw?.birth_date || null,
    ordination_date: raw?.ordination_date || null,
    avatar_url: raw?.avatar_url || null,
    default_totvs_id: raw?.default_totvs_id || raw?.totvs_id || null,
    totvs_access: Array.isArray(raw?.totvs_access) ? raw.totvs_access : null,
    church_name: raw?.church_name || null,
    church_class: raw?.church_class || null,
    pastor_name: raw?.pastor_name || null,
    can_create_released_letter: Boolean(raw?.can_create_released_letter),
    registration_status: resolveRegistrationStatus(raw),
    payment_status: String(raw?.payment_status || "").toUpperCase() === "BLOQUEADO_PAGAMENTO" ? "BLOQUEADO_PAGAMENTO" : "ATIVO",
    payment_block_reason: typeof raw?.payment_block_reason === "string" ? raw.payment_block_reason : null,
    discipline_status: String(raw?.discipline_status || "").toUpperCase() === "BLOQUEADO_DISCIPLINA" ? "BLOQUEADO_DISCIPLINA" : "ATIVO",
    discipline_block_reason: typeof raw?.discipline_block_reason === "string" ? raw.discipline_block_reason : null,
  };
}

function mapLetterLike(raw: Record<string, unknown> | null | undefined): PastorLetter {
  return {
    id: String(raw?.id || ""),
    church_totvs_id: raw?.church_totvs_id ? String(raw.church_totvs_id) : null,
    created_at: String(raw?.created_at || new Date().toISOString()),
    preacher_name: String(raw?.preacher_name || raw?.nome || ""),
    preach_date: raw?.preach_date || null,
    church_origin: raw?.church_origin || null,
    church_destination: raw?.church_destination || null,
    minister_role: raw?.minister_role || null,
    status: String(raw?.status || "AUTORIZADO"),
    storage_path: raw?.storage_path || null,
    url_carta: raw?.url_carta ? String(raw.url_carta) : null,
    url_pronta: typeof raw?.url_pronta === "boolean" ? raw.url_pronta : null,
    phone: raw?.phone ? String(raw.phone) : null,
    block_reason: raw?.block_reason || null,
    preacher_user_id: raw?.preacher_user_id || null,
    preacher_church_totvs_id: raw?.preacher_church_totvs_id ? String(raw.preacher_church_totvs_id) : null,
    preacher_church_name: raw?.preacher_church_name ? String(raw.preacher_church_name) : null,
  };
}

function isMockMode() {
  return false;
}

export async function loginWithCpfPassword(cpfInput: string, password: string): Promise<LoginResult> {
  const cpf = normalizeCpf(cpfInput);
  if (!isValidCpf(cpf)) throw new Error("cpf-invalid");

  const data = await api.login({ cpf, password });
  const directToken = data?.token || data?.jwt;
  const directUser = data?.user || data?.usuario;
  const directSession = data?.session;
  if (directToken && directUser && directSession) {
      return {
      mode: "authenticated",
      token: String(directToken),
      rls_token: data?.rls_token ? String(data.rls_token) : undefined,
      user: mapUserLike(directUser),
      session: mapSessionLike(directSession),
      };
  }

  const churchesRaw = data?.churches || data?.available_churches || data?.totvs_options || [];
  if (Array.isArray(churchesRaw) && churchesRaw.length > 0) {
    const churches: PendingChurch[] = churchesRaw.map((item: Record<string, unknown>) => ({
      totvs_id: String(item?.totvs_id || item?.totvs || item?.code || ""),
      church_name: String(item?.church_name || item?.name || item?.nome || "Igreja"),
      church_class: item?.church_class || item?.class || null,
    }));
    return { mode: "select_church", cpf, churches };
  }

  throw new Error("invalid-login-response");
}

export async function selectChurchSession(cpfInput: string, totvsId: string): Promise<{ token: string; rls_token?: string; user: AuthSessionData; session: AppSession }> {
  const cpf = normalizeCpf(cpfInput);
  if (!isValidCpf(cpf)) throw new Error("cpf-invalid");
  if (!totvsId) throw new Error("totvs-required");

  const data = await api.selectChurch({ cpf, totvs_id: totvsId });
  return {
    token: String(data?.token || data?.jwt || ""),
    rls_token: data?.rls_token ? String(data.rls_token) : undefined,
    user: mapUserLike(data?.user || data?.usuario || {}),
    session: mapSessionLike(data?.session || { totvs_id: totvsId }),
  };
}

export async function getPastorMetrics(): Promise<PastorMetrics> {
  // Comentario: RLS direto removido — vai sempre para a Edge Function dashboard-stats.
  // O caminho via RLS causava dupla latencia: tentava 5 queries PostgREST e,
  // quando o rls_token expirava, caia no fallback Edge Function de qualquer forma.
  if (!isMockMode()) {
    const data = await api.dashboardStats();
    const pickNumber = (...values: unknown[]) => {
      for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      return 0;
    };

    return {
      // Comentario: aceita variacoes de nome retornadas pelo backend.
      totalCartas: pickNumber(data?.total_letters, data?.totalLetters, data?.total_cartas),
      cartasHoje: pickNumber(data?.today_letters, data?.todayLetters, data?.cartas_hoje),
      ultimos7Dias: pickNumber(data?.last7_letters, data?.last7Letters, data?.ultimos_7_dias),
      totalObreiros: pickNumber(data?.total_workers, data?.totalWorkers, data?.total_membros),
      pendentesLiberacao: pickNumber(data?.pending_release, data?.pendingRelease, data?.pendentes_liberacao),
    };
  }

  return {
    totalCartas: MOCK_LETTERS.filter((l) => l.status !== "EXCLUIDA").length,
    cartasHoje: MOCK_LETTERS.length,
    ultimos7Dias: MOCK_LETTERS.length,
    totalObreiros: MOCK_USERS.filter((u) => u.role === "obreiro").length,
    pendentesLiberacao: MOCK_RELEASES.filter((r) => r.status === "PENDENTE").length,
  };
}

export async function listPastorLetters(_activeTotvsId: string, filters: PastorFilters): Promise<PastorLetter[]> {
  // Comentario: RLS direto desativado — sempre via Edge Function listLetters
  // para manter fonte unica da verdade (igual a pagina Membros).
  if (false && !isMockMode() && supabase && getRlsToken()) {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 500;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("letters")
      .select(
        "id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, church_origin, church_destination, status, storage_path, url_carta, url_pronta, phone, created_at",
      )
      .neq("status", "EXCLUIDA")
      .order("created_at", { ascending: false });

    if (_activeTotvsId) {
      query = query.eq("church_totvs_id", _activeTotvsId);
    }

    const shouldApplyQuickRange = filters.period === "today" || filters.period === "7" || filters.period === "30";
    const shouldApplyCustomRange = filters.period === "custom" && (Boolean(filters.dateStart) || Boolean(filters.dateEnd));
    if (shouldApplyQuickRange || shouldApplyCustomRange) {
      const now = new Date();
      const start = new Date(now);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      if (filters.period === "today") {
        start.setHours(0, 0, 0, 0);
      }
      if (filters.period === "7") {
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
      }
      if (filters.period === "30") {
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
      }
      if (filters.period === "custom") {
        if (filters.dateStart) start.setTime(new Date(`${filters.dateStart}T00:00:00`).getTime());
        if (filters.dateEnd) end.setTime(new Date(`${filters.dateEnd}T23:59:59`).getTime());
      }

      query = query.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
    }

    if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    if (filters.role && filters.role !== "all") {
      query = query.eq("minister_role", filters.role);
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      query = query.or(
        `preacher_name.ilike.%${q}%,church_origin.ilike.%${q}%,church_destination.ilike.%${q}%`,
      );
    }

    const { data: rowsRaw, error } = await query.range(from, to);
    if (error) {
      console.warn("[listPastorLetters] RLS direto falhou, seguindo com fallback por function:", error.message || error);
    } else {
      const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
      return rows.map((row) => mapLetterLike(row as Record<string, unknown>));
    }
  }

  if (!isMockMode()) {
    const cacheScopeTotvs = String(_activeTotvsId || "").trim();
    const cachedRowsRaw = await getLettersCache(cacheScopeTotvs || undefined);
    const cachedRows = (cachedRowsRaw || []) as Record<string, unknown>[];

    const applyLocalFilters = (rows: Record<string, unknown>[]) => {
      const q = String(filters.q || "").trim().toLowerCase();
      const status = String(filters.status || "").trim();
      const role = String(filters.role || "").trim();
      const start = String(filters.dateStart || "").trim();
      const end = String(filters.dateEnd || "").trim();

      return rows
        .filter((row) => String(row.status || "").toUpperCase() !== "EXCLUIDA")
        .filter((row) => {
          if (cacheScopeTotvs && String(row.church_totvs_id || "") !== cacheScopeTotvs) return false;
          if (status && status !== "all" && String(row.status || "") !== status) return false;
          if (role && role !== "all" && String(row.minister_role || "") !== role) return false;

          const createdAt = String(row.created_at || "");
          const createdDate = createdAt.slice(0, 10);
          if (start && createdDate < start) return false;
          if (end && createdDate > end) return false;

          if (q) {
            const haystack = `${String(row.preacher_name || "")} ${String(row.church_origin || "")} ${String(row.church_destination || "")}`.toLowerCase();
            if (!haystack.includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    };

    const persistRowsByChurch = async (rows: Record<string, unknown>[]) => {
      const byChurch = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        const churchTotvs = String(row.church_totvs_id || "").trim();
        if (!churchTotvs) continue;
        if (!byChurch.has(churchTotvs)) byChurch.set(churchTotvs, []);
        byChurch.get(churchTotvs)!.push(row);
      }
      await Promise.all(
        [...byChurch.entries()].map(([churchTotvs, churchRows]) => saveLettersCache(churchTotvs, churchRows)),
      );
    };

    const payload: Record<string, unknown> = {
      page: filters.page || 1,
      page_size: filters.pageSize || 500,
    };
    if (_activeTotvsId) payload.church_totvs_id = _activeTotvsId;
    if (filters.period === "today") payload.quick = "today";
    if (filters.period === "7") payload.quick = "7d";
    if (filters.period === "30") payload.quick = "30d";
    if (filters.dateStart) payload.date_start = filters.dateStart;
    if (filters.dateEnd) payload.date_end = filters.dateEnd;
    if (filters.status && filters.status !== "all") payload.status = filters.status;
    if (filters.role && filters.role !== "all") payload.minister_role = filters.role;
    if (filters.q) payload.search = filters.q;

    // Comentario: sem merge delta — Edge Function e fonte unica. O merge
    // podia somar registros antigos do cache com novos e inflar totais.
    try {
      const data = await api.listLetters(payload);
      const rows = (Array.isArray(data?.letters) ? data.letters : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []) as Record<string, unknown>[];

      await persistRowsByChurch(rows);
      return rows.map(mapLetterLike);
    } catch (error) {
      if (isRetryableOfflineError(error)) {
        return applyLocalFilters(cachedRows).map(mapLetterLike);
      }
      throw error;
    }
  }

  return MOCK_LETTERS.filter((l) => {
    const byStatus = !filters.status || filters.status === "all" || l.status === filters.status;
    const byRole = !filters.role || filters.role === "all" || l.minister_role === filters.role;
    const byQ = !filters.q || l.preacher_name.toLowerCase().includes(filters.q.toLowerCase());
    return byStatus && byRole && byQ;
  });
}

export async function listObreiros(_scopeTotvsIds: string[]): Promise<UserListItem[]> {
  const res = await listMembers({ page: 1, page_size: 1000, roles: ["pastor", "obreiro"] });
  return res.workers;
}

function normalizeMinisterRoleFilter(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .trim();
}

function mapMinisterRoleVariants(value: string | null | undefined): string[] {
  const normalized = normalizeMinisterRoleFilter(value);
  if (!normalized) return [];

  const variantsByRole: Record<string, string[]> = {
    pastor: ["Pastor", "pastor"],
    presbitero: ["Presbítero", "Presbitero", "presbítero", "presbitero"],
    diacono: ["Diácono", "Diacono", "diácono", "diacono"],
    cooperador: ["Cooperador", "cooperador", "Obreiro", "obreiro", "Obreiro cooperador", "obreiro cooperador"],
    obreiro: ["Cooperador", "cooperador", "Obreiro", "obreiro", "Obreiro cooperador", "obreiro cooperador"],
    membro: ["Membro", "membro"],
  };

  const direct = variantsByRole[normalized];
  if (direct?.length) return direct;
  return [String(value || "").trim()];
}

const CHURCHES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseIsoMillis(value: unknown): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function isCacheFreshByRows(rows: Array<Record<string, unknown>>, ttlMs: number): boolean {
  if (!rows.length) return false;
  let newest = 0;
  for (const row of rows) {
    const ms = parseIsoMillis((row as Record<string, unknown>).cached_at);
    if (ms && ms > newest) newest = ms;
  }
  if (!newest) return false;
  return Date.now() - newest <= ttlMs;
}

export async function listMembers(params: MemberListParams): Promise<WorkerListResponse> {
  // Comentario: caminho unico via Edge Function (members-api). RLS direto foi
  // desativado porque inflava o total quando o JWT nao mapeava 1:1 com o
  // escopo da igreja ativa (ex.: retornava 998 no lugar de 732).
  const shouldUseRlsDirectRead = false;

  if (shouldUseRlsDirectRead) {
    const page = params.page || 1;
    const pageSize = params.page_size || 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("users")
      .select(
        "id, full_name, role, cpf, rg, phone, email, profession, minister_role, birth_date, baptism_date, marital_status, matricula, ordination_date, avatar_url, signature_url, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, default_totvs_id, totvs_access, is_active, can_create_released_letter, payment_status, payment_block_reason",
        { count: "planned" },
      )
      .order("full_name", { ascending: true });

    if (params.search?.trim()) {
      const search = params.search.trim();
      query = query.or(
        `full_name.ilike.%${search}%,cpf.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
      );
    }

    if (params.minister_role?.trim()) {
      const roleVariants = mapMinisterRoleVariants(params.minister_role);
      if (roleVariants.length > 0) {
        query = query.in("minister_role", roleVariants);
      }
    }

    if (typeof params.is_active === "boolean") {
      query = query.eq("is_active", params.is_active);
    }

    if (params.roles?.length) {
      query = query.in("role", params.roles);
    }

    if (role === "admin" && params.church_totvs_id?.trim()) {
      query = query.eq("default_totvs_id", params.church_totvs_id.trim());
    } else if (params.church_totvs_id?.trim()) {
      query = query.eq("default_totvs_id", params.church_totvs_id.trim());
    }

    const { data: rowsRaw, error, count } = await query.range(from, to);
    if (error) {
      console.warn("[listMembers] RLS direto falhou, seguindo com fallback por function:", error.message || error);
    } else {
      const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
      return {
        workers: rows.map((w: Record<string, unknown>) => ({
          id: String(w?.id || ""),
          full_name: String(w?.full_name || ""),
          role: (w?.role || null) as AppRole | null,
          church_name: w?.church_name || null,
          cpf: w?.cpf || null,
          rg: w?.rg || null,
          phone: w?.phone || null,
          email: w?.email || null,
          profession: w?.profession || null,
          minister_role: w?.minister_role || null,
          birth_date: w?.birth_date || null,
          baptism_date: w?.baptism_date || null,
          marital_status: w?.marital_status || null,
          matricula: w?.matricula || null,
          ordination_date: w?.ordination_date || null,
          avatar_url: w?.avatar_url || null,
          signature_url: w?.signature_url || null,
          cep: w?.cep || null,
          address_street: w?.address_street || null,
          address_number: w?.address_number || null,
          address_complement: w?.address_complement || null,
          address_neighborhood: w?.address_neighborhood || null,
          address_city: w?.address_city || null,
          address_state: w?.address_state || null,
          default_totvs_id: w?.default_totvs_id || null,
          totvs_access: w?.totvs_access || null,
          is_active: typeof w?.is_active === "boolean" ? w.is_active : true,
          can_create_released_letter:
            typeof w?.can_create_released_letter === "boolean" ? w.can_create_released_letter : false,
          can_manage: true,
          registration_status:
            String(w?.registration_status || "").toUpperCase() === "PENDENTE"
              ? "PENDENTE"
              : String(w?.registration_status || "").toUpperCase() === "APROVADO"
                ? "APROVADO"
                : resolveRegistrationStatusFromTotvsAccess(w?.totvs_access || null),
          payment_status:
            String(w?.payment_status || "").toUpperCase() === "BLOQUEADO_PAGAMENTO" ? "BLOQUEADO_PAGAMENTO" : "ATIVO",
          payment_block_reason: typeof w?.payment_block_reason === "string" ? w.payment_block_reason : null,
          attendance_status: typeof w?.attendance_status === "string" ? w.attendance_status : null,
          attendance_meeting_date: typeof w?.attendance_meeting_date === "string" ? w.attendance_meeting_date : null,
          attendance_absences_180_days:
            typeof w?.attendance_absences_180_days === "number" ? w.attendance_absences_180_days : 0,
        })),
        total: Number(count || rows.length),
        page,
        page_size: pageSize,
      };
    }
  }

  if (!isMockMode()) {
    const mapMemberRow = (w: Record<string, unknown>) => ({
      id: String(w?.id || ""),
      full_name: String(w?.full_name || ""),
      role: (w?.role || null) as AppRole | null,
      church_name: w?.church_name || null,
      cpf: w?.cpf || null,
      rg: w?.rg || null,
      phone: w?.phone || null,
      email: w?.email || null,
      profession: w?.profession || null,
      minister_role: w?.minister_role || null,
      birth_date: w?.birth_date || null,
      baptism_date: w?.baptism_date || null,
      marital_status: w?.marital_status || null,
      matricula: w?.matricula || null,
      ordination_date: w?.ordination_date || null,
      avatar_url: w?.avatar_url || null,
      signature_url: w?.signature_url || null,
      cep: w?.cep || null,
      address_street: w?.address_street || null,
      address_number: w?.address_number || null,
      address_complement: w?.address_complement || null,
      address_neighborhood: w?.address_neighborhood || null,
      address_city: w?.address_city || null,
      address_state: w?.address_state || null,
      default_totvs_id: w?.default_totvs_id || null,
      totvs_access: w?.totvs_access || null,
      is_active: typeof w?.is_active === "boolean" ? w.is_active : true,
      can_create_released_letter: typeof w?.can_create_released_letter === "boolean" ? w.can_create_released_letter : false,
      can_manage: typeof w?.can_manage === "boolean" ? w.can_manage : true,
      registration_status:
        (String(w?.registration_status || "").toUpperCase() === "PENDENTE"
          ? "PENDENTE"
          : String(w?.registration_status || "").toUpperCase() === "APROVADO"
            ? "APROVADO"
            : resolveRegistrationStatusFromTotvsAccess(w?.totvs_access || null)),
      payment_status: String(w?.payment_status || "").toUpperCase() === "BLOQUEADO_PAGAMENTO" ? "BLOQUEADO_PAGAMENTO" : "ATIVO",
      payment_block_reason: typeof w?.payment_block_reason === "string" ? w.payment_block_reason : null,
      attendance_status: typeof w?.attendance_status === "string" ? w.attendance_status : null,
      attendance_meeting_date: typeof w?.attendance_meeting_date === "string" ? w.attendance_meeting_date : null,
      attendance_absences_180_days:
        typeof w?.attendance_absences_180_days === "number" ? w.attendance_absences_180_days : 0,
    });

    // Comentario: cache IndexedDB por igreja ativa — grava apos resposta OK da
    // Edge Function e usa como fallback offline. SEM merge delta (cada resposta
    // sobrescreve o cache daquela igreja), evitando inflar totais.
    const cacheChurchTotvs = String(params.church_totvs_id || getSession()?.totvs_id || "").trim();
    const cacheOwnerUserId = String(getSession()?.user_id || "").trim();
    const payload: Record<string, unknown> = {
      search: params.search || undefined,
      minister_role: params.minister_role || undefined,
      is_active: typeof params.is_active === "boolean" ? params.is_active : undefined,
      roles: params.roles?.length ? params.roles : undefined,
      church_totvs_id: params.church_totvs_id || undefined,
      exact_church: typeof params.exact_church === "boolean" ? params.exact_church : undefined,
      page: params.page || 1,
      page_size: params.page_size || 20,
    };

    try {
      const data = await api.listMembers({ ...(payload as Record<string, unknown>) });
      const rows = (Array.isArray(data?.members) ? data.members : []) as Record<string, unknown>[];

      if (rows.length > 0 && cacheChurchTotvs) {
        void saveMembersCache(cacheChurchTotvs, rows, cacheOwnerUserId || undefined);
      }

      return {
        workers: rows.map((w: Record<string, unknown>) => mapMemberRow(w)),
        total: Number(data?.total || rows.length),
        page: Number(data?.page || params.page || 1),
        page_size: Number(data?.page_size || params.page_size || 20),
        metrics: data?.metrics
          ? {
              total: Number((data.metrics as Record<string, unknown>)?.total || 0),
              pastor: Number((data.metrics as Record<string, unknown>)?.pastor || 0),
              presbitero: Number((data.metrics as Record<string, unknown>)?.presbitero || 0),
              diacono: Number((data.metrics as Record<string, unknown>)?.diacono || 0),
              obreiro: Number((data.metrics as Record<string, unknown>)?.obreiro || 0),
              membro: Number((data.metrics as Record<string, unknown>)?.membro || 0),
              inativos: Number((data.metrics as Record<string, unknown>)?.inativos || 0),
            }
          : undefined,
      };
    } catch (err) {
      // Comentario: offline / falha de rede — serve do cache local como fallback,
      // aplicando filtros e paginacao em memoria. Metrics fica indefinido para
      // nao exibir total fake.
      const cached = cacheChurchTotvs ? await getMembersCache(cacheChurchTotvs, cacheOwnerUserId || undefined) : [];
      let filtered = (cached || []) as Record<string, unknown>[];

      if (params.roles?.length) {
        filtered = filtered.filter((w) => params.roles?.includes(String(w.role || "") as AppRole));
      }
      if (typeof params.is_active === "boolean") {
        filtered = filtered.filter((w) => Boolean(w.is_active) === params.is_active);
      }
      if (params.minister_role?.trim()) {
        const wanted = normalizeMinisterRoleFilter(params.minister_role);
        filtered = filtered.filter((w) => normalizeMinisterRoleFilter(String(w.minister_role || "")) === wanted);
      }
      if (params.search?.trim()) {
        const q = params.search.trim().toLowerCase();
        filtered = filtered.filter((w) =>
          String(w.full_name || "").toLowerCase().includes(q) ||
          String(w.cpf || "").includes(q) ||
          String(w.phone || "").includes(q) ||
          String(w.email || "").toLowerCase().includes(q),
        );
      }
      filtered.sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));

      const page = Number(params.page || 1);
      const pageSize = Number(params.page_size || 20);
      const start = (page - 1) * pageSize;
      const end = start + pageSize;

      if (filtered.length === 0) throw err;

      return {
        workers: filtered.slice(start, end).map((w) => mapMemberRow(w)),
        total: filtered.length,
        page,
        page_size: pageSize,
      };
    }
  }

  return listWorkers({
    search: params.search,
    minister_role: params.minister_role,
    is_active: params.is_active,
    include_pastor: true,
    page: params.page,
    page_size: params.page_size,
  });
}

export async function listWorkers(params: WorkerListParams): Promise<WorkerListResponse> {
  // Comentario: caminho direto via Supabase desativado — o rls_token causa 401.
  // Leitura direta via RLS
  if (!isMockMode() && supabase && getRlsToken()) {
    return listMembers({
      search: params.search,
      minister_role: params.minister_role,
      is_active: params.is_active,
      roles: params.include_pastor ? ["pastor", "obreiro"] : ["obreiro"],
      page: params.page,
      page_size: params.page_size,
    });
  }

  if (!isMockMode()) {
    const data = await api.listWorkers({
      search: params.search || undefined,
      minister_role: params.minister_role || undefined,
      is_active: typeof params.is_active === "boolean" ? params.is_active : undefined,
      include_pastor: typeof params.include_pastor === "boolean" ? params.include_pastor : undefined,
      page: params.page || 1,
      page_size: params.page_size || 20,
    });
    const rows = Array.isArray(data?.workers) ? data.workers : [];
    return {
      workers: rows.map((w: Record<string, unknown>) => ({
        id: String(w?.id || ""),
        full_name: String(w?.full_name || ""),
        role: (w?.role || null) as AppRole | null,
        cpf: w?.cpf || null,
        rg: w?.rg || null,
        phone: w?.phone || null,
        email: w?.email || null,
        profession: w?.profession || null,
        minister_role: w?.minister_role || null,
        birth_date: w?.birth_date || null,
        baptism_date: w?.baptism_date || null,
        marital_status: w?.marital_status || null,
        matricula: w?.matricula || null,
        ordination_date: w?.ordination_date || null,
        avatar_url: w?.avatar_url || null,
        signature_url: w?.signature_url || null,
        cep: w?.cep || null,
        address_street: w?.address_street || null,
        address_number: w?.address_number || null,
        address_complement: w?.address_complement || null,
        address_neighborhood: w?.address_neighborhood || null,
        address_city: w?.address_city || null,
        address_state: w?.address_state || null,
        default_totvs_id: w?.default_totvs_id || null,
        totvs_access: w?.totvs_access || null,
        is_active: typeof w?.is_active === "boolean" ? w.is_active : true,
        can_create_released_letter: typeof w?.can_create_released_letter === "boolean" ? w.can_create_released_letter : false,
        can_manage: typeof w?.can_manage === "boolean" ? w.can_manage : true,
        registration_status:
          (String(w?.registration_status || "").toUpperCase() === "PENDENTE"
            ? "PENDENTE"
            : String(w?.registration_status || "").toUpperCase() === "APROVADO"
              ? "APROVADO"
              : resolveRegistrationStatusFromTotvsAccess(w?.totvs_access || null)),
        payment_status: String(w?.payment_status || "").toUpperCase() === "BLOQUEADO_PAGAMENTO" ? "BLOQUEADO_PAGAMENTO" : "ATIVO",
        payment_block_reason: typeof w?.payment_block_reason === "string" ? w.payment_block_reason : null,
      })),
      total: Number(data?.total || rows.length),
      page: Number(data?.page || params.page || 1),
      page_size: Number(data?.page_size || params.page_size || 20),
    };
  }

  const page = params.page || 1;
  const pageSize = params.page_size || 20;
  let workers = MOCK_USERS.filter((u) => u.role === "obreiro").map((u) => ({
    id: u.id,
    full_name: u.full_name,
    role: u.role,
    cpf: u.cpf,
    rg: (u as AuthSessionData & { rg?: string }).rg || null,
    phone: u.phone || null,
    email: u.email || null,
    minister_role: u.minister_role || null,
    default_totvs_id: u.default_totvs_id || null,
    totvs_access: u.totvs_access || null,
    birth_date: u.birth_date || null,
    baptism_date: (u as AuthSessionData & { baptism_date?: string | null }).baptism_date || null,
    marital_status: (u as AuthSessionData & { marital_status?: string | null }).marital_status || null,
    matricula: (u as AuthSessionData & { matricula?: string | null }).matricula || null,
    avatar_url: u.avatar_url || null,
    signature_url: (u as AuthSessionData & { signature_url?: string | null }).signature_url || null,
    is_active: (u as AuthSessionData & { is_active?: boolean }).is_active ?? true,
    can_create_released_letter:
      (u as AuthSessionData & { can_create_released_letter?: boolean }).can_create_released_letter ?? false,
    registration_status:
      (u as AuthSessionData).registration_status || "APROVADO",
    payment_status: (u as AuthSessionData).payment_status || "ATIVO",
    payment_block_reason: (u as AuthSessionData).payment_block_reason || null,
  })) as UserListItem[];

  if (params.search) {
    const s = params.search.toLowerCase();
    workers = workers.filter((w) => w.full_name.toLowerCase().includes(s) || String(w.cpf || "").includes(s));
  }
  if (params.minister_role) workers = workers.filter((w) => w.minister_role === params.minister_role);
  if (typeof params.is_active === "boolean") workers = workers.filter((w) => Boolean(w.is_active) === params.is_active);

  const total = workers.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return { workers: workers.slice(start, end), total, page, page_size: pageSize };
}

export async function listAdminChurchSummary(scopeTotvsIds: string[]): Promise<AdminChurchSummary[]> {
  const letters = await listPastorLetters("", { period: "30", pageSize: 400 });
  const groups = new Map<string, AdminChurchSummary>();
  letters.forEach((l) => {
    const totvs = String(l.church_totvs_id || l.church_origin || "SEM_TOTVS");
    if (scopeTotvsIds.length && l.church_totvs_id && !scopeTotvsIds.includes(String(l.church_totvs_id))) return;
    if (!groups.has(totvs)) {
      groups.set(totvs, {
        totvs_id: totvs,
        church_name: l.church_origin || `Igreja ${totvs}`,
        pastor_name: null,
        church_class: null,
        total_obreiros: 0,
        total_cartas: 0,
        cartas_liberadas: 0,
        pendentes_liberacao: 0,
      });
    }
    const row = groups.get(totvs)!;
    row.total_cartas += 1;
    if (l.status === "LIBERADA") row.cartas_liberadas += 1;
    if (l.status === "AGUARDANDO_LIBERACAO") row.pendentes_liberacao += 1;
  });
  const obreiros = await listObreiros(scopeTotvsIds);
  groups.forEach((g) => {
    g.total_obreiros = obreiros.length;
  });
  return Array.from(groups.values()).sort((a, b) => a.church_name.localeCompare(b.church_name));
}

// Busca rapida de igrejas por TOTVS ou nome usando a edge function search-churches-public
export type ChurchSearchResult = { totvs_id: string; church_name: string; class: string };
export type ChurchDetails = {
  totvs_id: string;
  church_name: string;
  nome_pastor: string | null;
  email_pastor: string | null;
  phone_pastor: string | null;
  cidade_estado: string | null;
};

export async function searchChurchesPublic(query: string, limit = 8): Promise<ChurchSearchResult[]> {
  const { post } = await import("@/lib/api");
  try {
    // Comentario: endpoint oficial em producao (Vercel/Supabase).
    const result = await post<{ ok?: boolean; churches?: ChurchSearchResult[] }>(
      "list-churches-public",
      { query, limit },
      { skipAuth: true },
    );
    return result?.churches ?? [];
  } catch {
    // Comentario: fallback legado para ambientes antigos.
    const legacy = await post<{ ok?: boolean; churches?: ChurchSearchResult[] }>(
      "search-churches-public",
      { query, limit },
      { skipAuth: true },
    );
    return legacy?.churches ?? [];
  }
}

export async function getChurchDetails(totvsId: string): Promise<ChurchDetails | null> {
  try {
    if (!totvsId) return null;

    // Usa a function existente do sistema para buscar pastor
    const { post } = await import("@/lib/api");
    const result = await post<{ pastor?: any }>(
      "get-pastor-contact",
      { totvs_id: totvsId },
      { skipAuth: true }
    );

    if (!result?.pastor) return null;

    const pastor = result.pastor;

    return {
      totvs_id: totvsId,
      church_name: "", // Não retorna church_name dessa function
      nome_pastor: pastor.full_name || null,
      email_pastor: pastor.email || null,
      phone_pastor: pastor.phone || null,
      cidade_estado: null,
    };
  } catch (err) {
    console.error("Erro ao buscar dados do pastor:", err);
    return null;
  }
}

export async function listChurchesInScope(page = 1, pageSize = 5000, rootTotvsId?: string): Promise<ChurchInScopeItem[]> {
  const session = getSession();
  const role = String(session?.role || "").toLowerCase();
  const hasRequestedRoot = Boolean(rootTotvsId?.trim());
  // Comentario: leitura hierarquica de igrejas via RLS estava gerando timeout (57014) em producao.
  // Mantemos a function como caminho principal para consultas de escopo.
  const canUseDirectRlsRead = false;

  // Leitura direta via RLS — policies filtram pelo escopo do JWT automaticamente
  if (canUseDirectRlsRead) {
    try {
      const selectCols =
        "totvs_id, parent_totvs_id, church_name, class, image_url, stamp_church_url, contact_email, contact_phone, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_country, is_active, pastor_user_id";
      const chunkSize = 1000;
      let churchesAll: Array<Record<string, unknown>> = [];
      let from = 0;
      while (true) {
        const to = from + chunkSize - 1;
        const { data: churchesRaw, error: cErr } = await supabase
          .from("churches")
          .select(selectCols)
          .order("church_name", { ascending: true })
          .range(from, to);
        if (cErr) throw new Error(cErr.message || "Erro ao listar igrejas.");
        const rows = (Array.isArray(churchesRaw) ? churchesRaw : []) as Array<Record<string, unknown>>;
        if (!rows.length) break;
        churchesAll.push(...rows);
        if (rows.length < chunkSize) break;
        from += chunkSize;
      }

      if (hasRequestedRoot && role === "admin") {
        const root = rootTotvsId.trim();
        const children = new Map<string, string[]>();
        for (const item of churchesAll) {
          const parent = String(item.parent_totvs_id || "");
          const id = String(item.totvs_id || "");
          if (!children.has(parent)) children.set(parent, []);
          children.get(parent)!.push(id);
        }
        const scope = new Set<string>();
        const queue = [root];
        while (queue.length) {
          const cur = queue.shift()!;
          if (scope.has(cur)) continue;
          scope.add(cur);
          for (const k of children.get(cur) || []) queue.push(k);
        }
        churchesAll = churchesAll.filter((c) => scope.has(String(c.totvs_id || "")));
      }

      const totvsIds = churchesAll.map((c) => String(c.totvs_id || "")).filter(Boolean);
      const pastorIds = churchesAll.map((c) => String(c.pastor_user_id || "")).filter(Boolean);

      const countsByTotvs = new Map<string, number>();
      if (totvsIds.length) {
        const { data: usersRaw } = await supabase.from("users").select("default_totvs_id").in("default_totvs_id", totvsIds);
        for (const u of usersRaw || []) {
          const key = String((u as Record<string, unknown>).default_totvs_id || "");
          if (!key) continue;
          countsByTotvs.set(key, (countsByTotvs.get(key) || 0) + 1);
        }
      }

      const pastorById = new Map<string, Record<string, unknown>>();
      if (pastorIds.length) {
        const { data: pastorsRaw } = await supabase.from("users").select("id, full_name").in("id", pastorIds);
        for (const p of pastorsRaw || []) {
          const row = p as Record<string, unknown>;
          pastorById.set(String(row.id || ""), row);
        }
      }

      return churchesAll.map((item) => {
        const pastorId = String(item.pastor_user_id || "");
        const pastor = pastorId ? pastorById.get(pastorId) : null;
        const totvsId = String(item.totvs_id || "");
        return {
          totvs_id: totvsId,
          church_name: String(item.church_name || item.name || "-"),
          church_class: item.class || null,
          parent_totvs_id: item.parent_totvs_id || null,
          image_url: item.image_url || item.photo_url || item.cover_url || null,
          stamp_church_url: item.stamp_church_url || null,
          contact_email: item.contact_email || null,
          contact_phone: item.contact_phone || null,
          cep: item.cep || null,
          address_street: item.address_street || null,
          address_number: item.address_number || null,
          address_complement: item.address_complement || null,
          address_neighborhood: item.address_neighborhood || null,
          address_city: item.address_city || null,
          address_state: item.address_state || null,
          address_country: item.address_country || null,
          is_active: typeof item.is_active === "boolean" ? item.is_active : true,
          workers_count: countsByTotvs.get(totvsId) || 0,
          pastor_user_id: pastorId || null,
          pastor: pastor
            ? {
                id: String(pastor.id || ""),
                full_name: String(pastor.full_name || ""),
              }
            : null,
        } as ChurchInScopeItem;
      });
    } catch (err) {
      // Comentario: fallback para function quando a leitura RLS falhar (ex.: erro 500 de policy).
      console.warn("[listChurchesInScope] RLS read failed; falling back to function API:", err);
    }
  }

  const mapChurch = (item: Record<string, unknown>) => ({
    totvs_id: String(item?.totvs_id || ""),
    church_name: String(item?.church_name || item?.name || "-"),
    church_class: item?.church_class || item?.class || null,
    parent_totvs_id: item?.parent_totvs_id || null,
    image_url: item?.image_url || item?.photo_url || item?.cover_url || null,
    stamp_church_url: item?.stamp_church_url || null,
    contact_email: item?.contact_email || null,
    contact_phone: item?.contact_phone || null,
    cep: item?.cep || null,
    address_street: item?.address_street || null,
    address_number: item?.address_number || null,
    address_complement: item?.address_complement || null,
    address_neighborhood: item?.address_neighborhood || null,
    address_city: item?.address_city || null,
    address_state: item?.address_state || null,
    address_country: item?.address_country || null,
    is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
    workers_count: Number(item?.workers_count || 0),
    pastor_user_id: item?.pastor_user_id || item?.pastor?.id || null,
    pastor: item?.pastor
      ? {
          id: item.pastor?.id || null,
          full_name: item.pastor?.full_name || item.pastor?.name || null,
        }
      : null,
  });

  try {
    const safePage = Math.max(1, Number(page || 1));
    const safePageSize = Math.max(1, Number(pageSize || 20));
    const startIndex = (safePage - 1) * safePageSize;
    const endExclusive = startIndex + safePageSize;
    const apiChunkSize = 1000;

    // Comentario: a edge function limita page_size em 1000.
    // Para requests maiores (ex.: 5000 nas telas de filtro), acumulamos paginas internamente.
    if (safePageSize <= apiChunkSize && safePage === 1) {
      const data = await api.listChurchesInScope({ page: safePage, page_size: safePageSize, root_totvs_id: rootTotvsId });
      const rows = Array.isArray(data?.churches)
        ? data.churches
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
      if (rows.length > 0) {
        await saveChurchesCache(rows as Record<string, unknown>[]);
      }
      return rows.map((item: Record<string, unknown>) => mapChurch(item));
    }

    const acc: Record<string, unknown>[] = [];
    let apiPage = 1;
    let total = Number.POSITIVE_INFINITY;

    while (acc.length < endExclusive && (apiPage - 1) * apiChunkSize < total) {
      const data = await api.listChurchesInScope({ page: apiPage, page_size: apiChunkSize, root_totvs_id: rootTotvsId });
      const rows = Array.isArray(data?.churches)
        ? data.churches
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
      total = Number(data?.total || rows.length || total);
      if (!rows.length) break;
      acc.push(...(rows as Record<string, unknown>[]));
      apiPage += 1;
    }

    if (acc.length > 0) {
      await saveChurchesCache(acc);
    }
    return acc.slice(startIndex, endExclusive).map((item: Record<string, unknown>) => mapChurch(item));
  } catch {
    const cached = await getChurchesCache();
    const cachedChurches = cached.map((item) => mapChurch(item as Record<string, unknown>));
    const start = (Math.max(1, page) - 1) * pageSize;
    const end = start + pageSize;
    if (!rootTotvsId?.trim()) {
      return cachedChurches.slice(start, end);
    }
    const children = new Map<string, string[]>();
    for (const church of cachedChurches) {
      const parent = String(church.parent_totvs_id || "");
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(String(church.totvs_id));
    }
    const scope = new Set<string>();
    const queue = [rootTotvsId];
    while (queue.length) {
      const cur = queue.shift()!;
      if (scope.has(cur)) continue;
      scope.add(cur);
      for (const child of children.get(cur) || []) queue.push(child);
    }
    return cachedChurches.filter((church) => scope.has(String(church.totvs_id))).slice(start, end);
  }
}

// Comentario: tipo minimo para ancestral com info do pastor.
// Inclui church_class para verificar se origem e destino sao irmas (mesma mae).
export type AncestorChainItem = {
  totvs_id: string;
  church_name: string;
  parent_totvs_id?: string | null;
  church_class?: string | null;
  pastor?: { full_name?: string | null; phone?: string | null } | null;
};

// Comentario: busca apenas os ancestrais acima do root_totvs_id (ex.: estadual acima da setorial).
// Usado no campo "Outros" da carta para mostrar a mae mais alta com pastor como origem.
// O ancestor_chain e retornado na ordem: [pai direto, avo, bisavo, ...], entao o ULTIMO com pastor
// e o mais alto.
export async function fetchAncestorChain(rootTotvsId: string): Promise<AncestorChainItem[]> {
  if (!rootTotvsId) return [];
  const data = await api.listChurchesInScope({ page: 1, page_size: 1, root_totvs_id: rootTotvsId });
  const chain = Array.isArray((data as any)?.ancestor_chain) ? (data as any).ancestor_chain : [];
  return chain.map((item: Record<string, unknown>) => ({
    totvs_id: String(item.totvs_id || ""),
    church_name: String(item.church_name || ""),
    parent_totvs_id: item.parent_totvs_id ? String(item.parent_totvs_id) : null,
    // Comentario: mapeia o campo "class" do banco para church_class no frontend.
    // Usado para identificar o nivel hierarquico (Estadual, Setorial, Central, etc.).
    church_class: item.class ? String(item.class) : null,
    pastor: item.pastor
      ? {
          full_name: (item.pastor as any)?.full_name || null,
          phone: (item.pastor as any)?.phone || null,
        }
      : null,
  }));
}

export async function listChurchesInScopePaged(page = 1, pageSize = 20, rootTotvsId?: string, opts?: { church_class?: string; search?: string }): Promise<{ churches: ChurchInScopeItem[]; total: number; page: number; page_size: number }> {
  const canUse24hChurchCache =
    !rootTotvsId?.trim() &&
    !String(opts?.church_class || "").trim() &&
    !String(opts?.search || "").trim();

  if (canUse24hChurchCache) {
    const rawCached = await getChurchesCache();
    const cachedRows = (rawCached || []) as Array<Record<string, unknown>>;
    if (isCacheFreshByRows(cachedRows, CHURCHES_CACHE_TTL_MS)) {
      const mapped = cachedRows.map((item) => ({
        totvs_id: String(item?.totvs_id || ""),
        church_name: String(item?.church_name || item?.name || "-"),
        church_class: item?.church_class || item?.class || null,
        parent_totvs_id: item?.parent_totvs_id || null,
        image_url: item?.image_url || item?.photo_url || item?.cover_url || null,
        stamp_church_url: item?.stamp_church_url || null,
        contact_email: item?.contact_email || null,
        contact_phone: item?.contact_phone || null,
        cep: item?.cep || null,
        address_street: item?.address_street || null,
        address_number: item?.address_number || null,
        address_complement: item?.address_complement || null,
        address_neighborhood: item?.address_neighborhood || null,
        address_city: item?.address_city || null,
        address_state: item?.address_state || null,
        address_country: item?.address_country || null,
        is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
        workers_count: Number(item?.workers_count || 0),
        pastor_user_id: item?.pastor_user_id || item?.pastor?.id || null,
        pastor: item?.pastor
          ? {
              id: item.pastor?.id || null,
              full_name: item.pastor?.full_name || item.pastor?.name || null,
            }
          : null,
      })) as ChurchInScopeItem[];
      const start = (Math.max(1, page) - 1) * pageSize;
      const end = start + pageSize;
      return {
        churches: mapped.slice(start, end),
        total: mapped.length,
        page,
        page_size: pageSize,
      };
    }
  }

  if (supabase && getRlsToken()) {
    // Sem filtro de hierarquia: usa paginação real no banco (range + count).
    // O RLS já garante que só as igrejas do escopo do usuário são retornadas.
    if (!rootTotvsId?.trim()) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("churches")
        .select(
          "totvs_id, parent_totvs_id, church_name, class, image_url, stamp_church_url, contact_email, contact_phone, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_country, is_active, pastor_user_id",
          { count: "planned" },
        );
      if (opts?.church_class) query = query.eq("class", opts.church_class);
      if (opts?.search && opts.search.trim().length >= 2) {
        const q = opts.search.trim();
        query = query.or(`church_name.ilike.%${q}%,totvs_id.ilike.%${q}%`);
      }
      const { data: churchesRaw, count, error: cErr } = await query
        .order("church_name", { ascending: true })
        .range(from, to);

      if (cErr) {
        console.warn("[listChurchesInScopePaged] RLS direto falhou, seguindo com fallback por function:", cErr.message || cErr);
      } else {
      const churches = ((Array.isArray(churchesRaw) ? churchesRaw : []) as Array<Record<string, unknown>>)
        .sort((a, b) => String(a.church_name || "").localeCompare(String(b.church_name || ""), "pt-BR"));
      const total = Number(count ?? churches.length);

      // Busca nomes dos pastores apenas para as igrejas desta página (muito mais leve).
      const pastorIds = churches.map((c) => String(c.pastor_user_id || "")).filter(Boolean);
      const pastorById = new Map<string, Record<string, unknown>>();
      if (pastorIds.length) {
        const { data: pastorsRaw } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", pastorIds);
        for (const p of pastorsRaw || []) {
          const row = p as Record<string, unknown>;
          pastorById.set(String(row.id || ""), row);
        }
      }

      // Busca contagem de obreiros apenas para as igrejas desta página.
      const totvsIds = churches.map((c) => String(c.totvs_id || "")).filter(Boolean);
      const countsByTotvs = new Map<string, number>();
      if (totvsIds.length) {
        const { data: usersRaw } = await supabase
          .from("users")
          .select("default_totvs_id")
          .in("default_totvs_id", totvsIds);
        for (const u of usersRaw || []) {
          const key = String((u as Record<string, unknown>).default_totvs_id || "");
          if (!key) continue;
          countsByTotvs.set(key, (countsByTotvs.get(key) || 0) + 1);
        }
      }

      return {
        churches: churches.map((item) => {
          const pastorId = String(item.pastor_user_id || "");
          const pastor = pastorId ? pastorById.get(pastorId) : null;
          const totvsId = String(item.totvs_id || "");
          return {
            totvs_id: totvsId,
            church_name: String(item.church_name || "-"),
            church_class: item.class || null,
            parent_totvs_id: item.parent_totvs_id || null,
            image_url: item.image_url || item.photo_url || item.cover_url || null,
            stamp_church_url: item.stamp_church_url || null,
            contact_email: item.contact_email || null,
            contact_phone: item.contact_phone || null,
            cep: item.cep || null,
            address_street: item.address_street || null,
            address_number: item.address_number || null,
            address_complement: item.address_complement || null,
            address_neighborhood: item.address_neighborhood || null,
            address_city: item.address_city || null,
            address_state: item.address_state || null,
            address_country: item.address_country || null,
            is_active: typeof item.is_active === "boolean" ? item.is_active : true,
            workers_count: countsByTotvs.get(totvsId) || 0,
            pastor_user_id: pastorId || null,
            pastor: pastor
              ? { id: String(pastor.id || ""), full_name: String(pastor.full_name || "") }
              : null,
          } as ChurchInScopeItem;
        }),
        total,
        page,
        page_size: pageSize,
      };
      }
    }

    // Com rootTotvsId (filtro de hierarquia): calcula a árvore e aplica filtros localmente
    // antes da paginação para manter os contadores/consulta consistentes.
    let all = await listChurchesInScope(1, 5000, rootTotvsId);
    if (opts?.church_class) {
      const cls = String(opts.church_class || "").toLowerCase();
      all = all.filter((c) => String(c.church_class || "").toLowerCase() === cls);
    }
    if (opts?.search && opts.search.trim().length >= 2) {
      const q = opts.search.trim().toLowerCase();
      all = all.filter((c) =>
        String(c.church_name || "").toLowerCase().includes(q) ||
        String(c.totvs_id || "").toLowerCase().includes(q),
      );
    }
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      churches: all.slice(start, end),
      total: all.length,
      page,
      page_size: pageSize,
    };
  }

  try {
    const data = await api.listChurchesInScope({
      page,
      page_size: pageSize,
      root_totvs_id: rootTotvsId,
      church_class: opts?.church_class,
      search: opts?.search,
    });
    const rows = Array.isArray(data?.churches)
      ? data.churches
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];
    const churches = rows.map((item: Record<string, unknown>) => ({
      totvs_id: String(item?.totvs_id || ""),
      church_name: String(item?.church_name || item?.name || "-"),
      church_class: item?.church_class || item?.class || null,
      parent_totvs_id: item?.parent_totvs_id || null,
      image_url: item?.image_url || item?.photo_url || item?.cover_url || null,
      stamp_church_url: item?.stamp_church_url || null,
      contact_email: item?.contact_email || null,
      contact_phone: item?.contact_phone || null,
      cep: item?.cep || null,
      address_street: item?.address_street || null,
      address_number: item?.address_number || null,
      address_complement: item?.address_complement || null,
      address_neighborhood: item?.address_neighborhood || null,
      address_city: item?.address_city || null,
      address_state: item?.address_state || null,
      address_country: item?.address_country || null,
      is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
      workers_count: Number(item?.workers_count || 0),
      pastor_user_id: item?.pastor_user_id || item?.pastor?.id || null,
      pastor: item?.pastor
        ? {
            id: item.pastor?.id || null,
            full_name: item.pastor?.full_name || item.pastor?.name || null,
          }
        : null,
    })) as ChurchInScopeItem[];

    return {
      churches,
      total: Number(data?.total || churches.length),
      page: Number(data?.page || page),
      page_size: Number(data?.page_size || pageSize),
    };
  } catch {
    let all = await listChurchesInScope(1, 5000, rootTotvsId);
    if (opts?.church_class) {
      const cls = String(opts.church_class || "").toLowerCase();
      all = all.filter((c) => String(c.church_class || "").toLowerCase() === cls);
    }
    if (opts?.search && opts.search.trim().length >= 2) {
      const q = opts.search.trim().toLowerCase();
      all = all.filter((c) =>
        String(c.church_name || "").toLowerCase().includes(q) ||
        String(c.totvs_id || "").toLowerCase().includes(q),
      );
    }
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      churches: all.slice(start, end),
      total: all.length,
      page,
      page_size: pageSize,
    };
  }
}

// ─── Painel unificado ─────────────────────────────────────────────────────────
// Busca igrejas e membros em paralelo (Promise.all) para reduzir o tempo de
// carregamento do painel do pastor/admin, que antes fazia 2 useQuery separados
// e aguardava cada um em sequência dependendo do effectiveScopeTotvsIds.
export async function getPastorPanelData(
  activeTotvsId?: string,
): Promise<{ churches: ChurchInScopeItem[]; workers: UserListItem[] }> {
  const [churches, membersResult] = await Promise.all([
    listChurchesInScope(1, 1000, activeTotvsId || undefined),
    listMembers({ page: 1, page_size: 200, roles: ["pastor", "obreiro"], church_totvs_id: activeTotvsId || undefined, exact_church: true }),
  ]);
  return { churches, workers: membersResult.workers };
}

export async function createChurch(payload: {
  totvs_id: string;
  parent_totvs_id?: string;
  church_name: string;
  class: string;
  image_url?: string;
  stamp_church_url?: string;
  contact_email?: string;
  contact_phone?: string;
  cep?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_country?: string;
  is_active?: boolean;
}) {
  if (!payload.totvs_id?.trim()) throw new Error("totvs_id_required");
  if (!payload.church_name?.trim()) throw new Error("church_name_required");
  if (!payload.class?.trim()) throw new Error("class_required");

  await api.createChurch({
    totvs_id: payload.totvs_id.trim(),
    parent_totvs_id: payload.parent_totvs_id?.trim() || null,
    church_name: payload.church_name.trim(),
    class: payload.class.trim(),
    image_url: payload.image_url?.trim() || null,
    stamp_church_url: payload.stamp_church_url?.trim() || null,
    contact_email: payload.contact_email?.trim() || null,
    contact_phone: payload.contact_phone?.trim() || null,
    cep: payload.cep?.trim() || null,
    address_street: payload.address_street?.trim() || null,
    address_number: payload.address_number?.trim() || null,
    address_complement: payload.address_complement?.trim() || null,
    address_neighborhood: payload.address_neighborhood?.trim() || null,
    address_city: payload.address_city?.trim() || null,
    address_state: payload.address_state?.trim() || null,
    address_country: payload.address_country?.trim() || "BR",
    is_active: typeof payload.is_active === "boolean" ? payload.is_active : true,
  });
}

export async function deactivateChurch(church_totvs_id: string) {
  if (!church_totvs_id?.trim()) throw new Error("church_totvs_required");
  await api.deleteChurch({ church_totvs_id: church_totvs_id.trim() });
}

export async function listReleaseRequests(status: "PENDENTE" | "APROVADO" | "NEGADO" = "PENDENTE", page = 1, pageSize = 20): Promise<ReleaseRequest[]> {
  if (!isMockMode()) {
    const data = await api.listReleaseRequests({ status, page, page_size: pageSize });
    const rows = Array.isArray(data?.requests) ? data.requests : Array.isArray(data?.items) ? data.items : [];
    return rows.map((item: Record<string, unknown>) => ({
      id: String(item?.id),
      letter_id: String(item?.letter_id || ""),
      requester_user_id: String(item?.requester_user_id || ""),
      status: (item?.status || "PENDENTE") as "PENDENTE" | "APROVADO" | "NEGADO",
      message: item?.message || null,
      created_at: item?.created_at || undefined,
      requester_name: item?.requester_name || null,
      preacher_name: item?.preacher_name || null,
    }));
  }
  return MOCK_RELEASES.filter((r) => r.status === status);
}

/**
 * listNotifications
 * -----------------
 * O que faz: Busca as notificacoes do usuario logado (do sininho no topo da tela).
 * Para que serve: Mostrar avisos e alertas enviados pela administracao para a
 *   igreja ou para o usuario especifico. Retorna a lista paginada e a contagem
 *   de nao lidas para exibir o badge vermelho no icone de sino.
 * Como funciona: Chama a edge function "list-notifications" via JWT de sessao.
 *   A function consulta notificacoes tanto por church_totvs_id quanto por user_id,
 *   mescla e devolve tudo junto. Usa a API em vez de Supabase direto para evitar
 *   erro 401 causado pelo JWT customizado que o RLS nao reconhece.
 */
export async function listNotifications(page = 1, pageSize = 20, unreadOnly = false): Promise<{ notifications: AppNotification[]; unread_count: number; total: number }> {
  if (!isMockMode()) {
    const currentSession = getSession();
    const churchTotvs = currentSession?.totvs_id;
    const data = await api.listNotifications({
      page,
      page_size: pageSize,
      unread_only: unreadOnly,
      church_totvs_id: churchTotvs || undefined,
    });
    const raw = data as Record<string, unknown>;
    const rows = Array.isArray(raw?.notifications) ? (raw.notifications as Record<string, unknown>[]) : [];
    return {
      notifications: rows.map((item) => ({
        id: String(item?.id || ""),
        title: String(item?.title || "Notificacao"),
        message: item?.message ? String(item.message) : null,
        is_read: Boolean(item?.is_read) || Boolean(item?.read_at),
        created_at: item?.created_at ? String(item.created_at) : null,
        type: item?.type ? String(item.type) : null,
        // Comentario: mapeia o campo data para exibir infos extras (ex: telefone no aniversario)
        data: item?.data && typeof item.data === "object" ? (item.data as Record<string, unknown>) : null,
      })),
      unread_count: Number(raw?.unread_count || 0),
      total: Number(raw?.total || rows.length),
    };
  }
  return { notifications: [], unread_count: 0, total: 0 };
}

/**
 * markNotificationRead
 * --------------------
 * O que faz: Marca uma notificacao especifica como lida.
 * Para que serve: Quando o usuario clica em uma notificacao no sininho,
 *   ela precisa sumir do badge de nao lidas. Esta funcao atualiza o campo
 *   is_read no banco para aquela notificacao especifica.
 * Como funciona: Chama a edge function "mark-notification-read" via JWT de sessao.
 *   Se a function ainda nao estiver configurada com verify_jwt=false no Supabase,
 *   o erro e ignorado silenciosamente para nao quebrar a tela.
 * ATENCAO: Configure a edge function com verify_jwt=false no Supabase para funcionar.
 */
export async function markNotificationRead(id: string) {
  if (!isMockMode()) {
    const currentSession = getSession();
    const churchTotvs = currentSession?.totvs_id;
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueOfflineOperation(
          "notifications",
          "update",
          { mode: "mark-read", id, church_totvs_id: churchTotvs || null },
          churchTotvs || undefined,
        );
        return;
      }
      await api.markNotificationRead({ id, church_totvs_id: churchTotvs || undefined });
    } catch (error) {
      if (isRetryableOfflineError(error)) {
        await enqueueOfflineOperation(
          "notifications",
          "update",
          { mode: "mark-read", id, church_totvs_id: churchTotvs || null },
          churchTotvs || undefined,
        );
        return;
      }
      // Silencioso: marcar como lida e opcional, nao pode quebrar a tela.
      // CORRECAO NECESSARIA: configurar verify_jwt=false na edge function mark-notification-read.
    }
  }
  return;
}

/**
 * markAllNotificationsRead
 * ------------------------
 * O que faz: Marca TODAS as notificacoes do usuario como lidas de uma vez.
 * Para que serve: Quando o usuario clica em "marcar tudo como lido" no sininho,
 *   o badge vermelho com o numero de nao lidas deve desaparecer completamente.
 * Como funciona: Chama a edge function "mark-all-notifications-read" via JWT de sessao.
 *   Se a function ainda nao estiver configurada com verify_jwt=false no Supabase,
 *   o erro e ignorado silenciosamente para nao quebrar a tela.
 * ATENCAO: Configure a edge function com verify_jwt=false no Supabase para funcionar.
 */
export async function markAllNotificationsRead() {
  if (!isMockMode()) {
    const currentSession = getSession();
    const churchTotvs = currentSession?.totvs_id;
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueOfflineOperation(
          "notifications",
          "update",
          { mode: "mark-all-read", church_totvs_id: churchTotvs || null },
          churchTotvs || undefined,
        );
        return;
      }
      await api.markAllNotificationsRead({ church_totvs_id: churchTotvs || undefined });
    } catch (error) {
      if (isRetryableOfflineError(error)) {
        await enqueueOfflineOperation(
          "notifications",
          "update",
          { mode: "mark-all-read", church_totvs_id: churchTotvs || null },
          churchTotvs || undefined,
        );
        return;
      }
      // Silencioso: marcar como lida e opcional, nao pode quebrar a tela.
      // CORRECAO NECESSARIA: configurar verify_jwt=false na edge function mark-all-notifications-read.
    }
  }
  return;
}

export async function submitUserFeedback(payload: {
  usability_rating: number;
  speed_rating: number;
  stability_rating: number;
  overall_rating: number;
  recommend_level: "SIM" | "TALVEZ" | "NAO";
  primary_need?: string;
  improvement_notes?: string;
  contact_allowed?: boolean;
}) {
  const data = await api.submitFeedback({
    usability_rating: payload.usability_rating,
    speed_rating: payload.speed_rating,
    stability_rating: payload.stability_rating,
    overall_rating: payload.overall_rating,
    recommend_level: payload.recommend_level,
    primary_need: payload.primary_need || null,
    improvement_notes: payload.improvement_notes || null,
    contact_allowed: Boolean(payload.contact_allowed),
  });
  return data as { ok: boolean; feedback?: { id: string; created_at: string } };
}

export async function listUserFeedback(params: {
  page?: number;
  page_size?: number;
  status?: UserFeedbackStatus | "ALL";
  search?: string;
} = {}): Promise<{ feedback: UserFeedbackItem[]; total: number; page: number; page_size: number }> {
  const status = params.status && params.status !== "ALL" ? params.status : undefined;
  const data = await api.listFeedback({
    page: params.page || 1,
    page_size: params.page_size || 20,
    status,
    search: params.search || undefined,
  });
  const raw = data as Record<string, unknown>;
  const rows = Array.isArray(raw.feedback) ? (raw.feedback as Record<string, unknown>[]) : [];
  return {
    feedback: rows.map((row) => ({
      id: String(row.id || ""),
      user_id: row.user_id ? String(row.user_id) : null,
      user_name: row.user_name ? String(row.user_name) : null,
      user_role: row.user_role ? String(row.user_role) : null,
      church_totvs_id: row.church_totvs_id ? String(row.church_totvs_id) : null,
      usability_rating: Number(row.usability_rating || 0),
      speed_rating: Number(row.speed_rating || 0),
      stability_rating: Number(row.stability_rating || 0),
      overall_rating: Number(row.overall_rating || 0),
      recommend_level: (String(row.recommend_level || "TALVEZ").toUpperCase() as "SIM" | "TALVEZ" | "NAO"),
      primary_need: row.primary_need ? String(row.primary_need) : null,
      improvement_notes: row.improvement_notes ? String(row.improvement_notes) : null,
      contact_allowed: Boolean(row.contact_allowed),
      status: (String(row.status || "NOVO").toUpperCase() as UserFeedbackStatus),
      admin_notes: row.admin_notes ? String(row.admin_notes) : null,
      reviewed_by_user_id: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : null,
      reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
      created_at: String(row.created_at || ""),
      updated_at: String(row.updated_at || ""),
    })),
    total: Number(raw.total || 0),
    page: Number(raw.page || params.page || 1),
    page_size: Number(raw.page_size || params.page_size || 20),
  };
}

export async function updateUserFeedbackStatus(payload: { id: string; status: UserFeedbackStatus; admin_notes?: string }) {
  const data = await api.updateFeedbackStatus({
    id: payload.id,
    status: payload.status,
    admin_notes: payload.admin_notes || "",
  });
  return data as { ok: boolean };
}

export async function sendAdminCommunication(payload: {
  title: string;
  body: string;
  url?: string;
  user_ids?: string[];
  totvs_ids?: string[];
  data?: Record<string, unknown>;
}) {
  const data = await api.adminNotifyUsers({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
    user_ids: payload.user_ids || [],
    totvs_ids: payload.totvs_ids || [],
    data: payload.data || { source: "admin-feedback-page" },
  });
  return data as {
    ok: boolean;
    sent?: number;
    failed?: number;
    sent_web?: number;
    sent_native?: number;
    failed_web?: number;
    failed_native?: number;
  };
}

export async function listAnnouncements(limit = 10): Promise<AnnouncementItem[]> {
  if (!isMockMode() && supabase && getRlsToken()) {
    const nowIso = new Date().toISOString();
    const safeLimit = Math.max(1, Math.min(100, Number(limit || 10)));
    const { data: rowsRaw, error } = await supabase
      .from("announcements")
      .select("id, title, type, body_text, media_url, link_url, position, starts_at, ends_at, is_active")
      .eq("is_active", true)
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order("position", { ascending: true, nullsFirst: false })
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(safeLimit);

    if (error) {
      console.warn("[listAnnouncements] RLS direto falhou, seguindo com fallback por function:", error.message || error);
    } else {
      const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
      return rows.map((item: Record<string, unknown>) => ({
        id: String(item?.id || ""),
        title: String(item?.title || "Aviso"),
        type: (item?.type || "text") as "text" | "image" | "video",
        body_text: item?.body_text ? String(item.body_text) : "",
        media_url: toAnnouncementMediaUrl(item?.media_url),
        link_url: item?.link_url ? String(item.link_url) : "",
        position: typeof item?.position === "number" ? item.position : null,
        starts_at: item?.starts_at ? String(item.starts_at) : "",
        ends_at: item?.ends_at ? String(item.ends_at) : "",
        is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
      }));
    }
  }

  if (!isMockMode()) {
    const currentSession = getSession();
    const churchTotvsId = String(currentSession?.totvs_id || "").trim() || undefined;
    const data = await api.listAnnouncements({ limit, church_totvs_id: churchTotvsId });
    const rows = Array.isArray(data?.announcements)
      ? data.announcements
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];
    return rows.map((item: Record<string, unknown>) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "Aviso"),
      type: (item?.type || "text") as "text" | "image" | "video",
      body_text: item?.body_text ? String(item.body_text) : "",
      media_url: toAnnouncementMediaUrl(item?.media_url),
      link_url: item?.link_url ? String(item.link_url) : "",
      position: typeof item?.position === "number" ? item.position : null,
      starts_at: item?.starts_at ? String(item.starts_at) : "",
      ends_at: item?.ends_at ? String(item.ends_at) : "",
      is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
    }));
  }
  return [...MOCK_ANNOUNCEMENTS].slice(0, limit);
}

export async function listBirthdaysToday(limit = 10): Promise<BirthdayItem[]> {
  // Comentario: consulta simples ao banco para exibir no dashboard.
  // O envio de parabéns é feito pela edge function birthday-notify via cron
  // (todo dia às 06:00 horário de Brasília) — sem vínculo com o login do usuário.
  if (!isMockMode() && supabaseAnon) {
    const session = getSession();
    const scope = Array.isArray(session?.scope_totvs_ids) ? session.scope_totvs_ids.filter(Boolean) : [];

    let query = supabaseAnon
      .from("users")
      .select("id, full_name, phone, email, birth_date, avatar_url")
      .not("birth_date", "is", null)
      .eq("is_active", true);

    if (scope.length > 0) {
      query = query.in("default_totvs_id", scope);
    }

    const { data: rowsRaw, error } = await query;
    if (error) {
      try {
        const raw = (await api.birthdaysToday({ limit })) as Record<string, unknown>;
        const birthdays = Array.isArray(raw?.birthdays) ? (raw.birthdays as Record<string, unknown>[]) : [];
        return birthdays.map((item) => ({
          id: String(item?.id || ""),
          full_name: String(item?.full_name || ""),
          phone: item?.phone ? String(item.phone) : null,
          email: item?.email ? String(item.email) : null,
          birth_date: item?.birth_date ? String(item.birth_date) : null,
          avatar_url: item?.avatar_url ? String(item.avatar_url) : null,
        }));
      } catch (fallbackErr) {
        throw new Error((fallbackErr as Error)?.message || error.message || "Erro ao listar aniversariantes.");
      }
    }

    const todayMd = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const birthdays = (Array.isArray(rowsRaw) ? rowsRaw : [])
      .map((item: Record<string, unknown>) => ({
        id: String(item?.id || ""),
        full_name: String(item?.full_name || ""),
        phone: item?.phone ? String(item.phone) : null,
        email: item?.email ? String(item.email) : null,
        birth_date: item?.birth_date ? String(item.birth_date) : null,
        avatar_url: item?.avatar_url ? String(item.avatar_url) : null,
      }))
      .filter((item: BirthdayItem) => {
        if (!item.full_name || !item.birth_date) return false;
        const d = new Date(item.birth_date);
        if (Number.isNaN(d.getTime())) return false;
        const md = new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
        return md === todayMd;
      })
      .slice(0, limit);

    return birthdays;
  }

  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();

  return MOCK_USERS.filter((u) => {
    if (!u.birth_date) return false;
    const dt = new Date(u.birth_date);
    return dt.getMonth() + 1 === m && dt.getDate() === d;
  })
    .slice(0, limit)
    .map((u) => ({
      id: String(u.id || ""),
      full_name: u.full_name,
      phone: u.phone || null,
      email: u.email || null,
      birth_date: u.birth_date || null,
      avatar_url: u.avatar_url || null,
    }));
}

/**
 * listAnnouncementsPublicByTotvs
 * ------------------------------
 * O que faz: Busca as divulgacoes publicas de uma igreja pelo ID totvs,
 *   sem precisar de login (usada na tela de login para mostrar o carrossel).
 * Para que serve: Exibir avisos e imagens de divulgacao na tela de login,
 *   mesmo antes do usuario entrar no sistema.
 * Como funciona:
 *   1) Tenta buscar direto no Supabase via cliente anonimo (supabaseAnon).
 *      Funciona quando a tabela "announcements" tem politica RLS anon SELECT.
 *   2) Se falhar (ex: sem politica RLS anon), tenta chamar a edge function
 *      "list-announcements" usando o token de sessao salvo do login anterior.
 *      Isso funciona quando o usuario ja logou uma vez e voltou a tela de login.
 * ATENCAO: Para exibir na tela de login sempre (inclusive 1o acesso), adicione
 *   esta politica RLS na tabela announcements no Supabase:
 *   CREATE POLICY "anon_select_announcements" ON announcements
 *   FOR SELECT TO anon USING (is_active = true);
 */
export async function listAnnouncementsPublicByTotvs(churchTotvsId: string, limit = 10): Promise<AnnouncementItem[]> {
  const totvs = String(churchTotvsId || "").trim();
  if (!totvs) return [];

  const nowIso = new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(30, limit));

  // Busca os ancestrais (mae, avo, etc.) para incluir anuncios deles tambem
  const lineageIds = [totvs];
  if (supabaseAnon) {
    const { data: churchesRaw } = await supabaseAnon
      .from("churches")
      .select("totvs_id, parent_totvs_id");
    if (Array.isArray(churchesRaw)) {
      const parentMap = new Map<string, string>();
      for (const c of churchesRaw as Array<Record<string, unknown>>) {
        const id = String(c.totvs_id || "");
        const parent = String(c.parent_totvs_id || "");
        if (id && parent) parentMap.set(id, parent);
      }
      let cur = totvs;
      for (let i = 0; i < 10; i++) {
        const parent = parentMap.get(cur);
        if (!parent || lineageIds.includes(parent)) break;
        lineageIds.push(parent);
        cur = parent;
      }
    }
  }

  // Consulta anonima direta incluindo ancestrais (requer politica RLS anon SELECT)
  if (supabaseAnon) {
    const { data, error } = await supabaseAnon
      .from("announcements")
      .select("id,title,type,body_text,media_url,link_url,position,starts_at,ends_at,is_active,created_at")
      .in("church_totvs_id", lineageIds)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data
        .filter((item: Record<string, unknown>) => {
          const startsOk = !item?.starts_at || String(item.starts_at) <= nowIso;
          const endsOk = !item?.ends_at || String(item.ends_at) >= nowIso;
          return startsOk && endsOk;
        })
        .map((item: Record<string, unknown>) => ({
          id: String(item?.id || ""),
          title: String(item?.title || "Aviso"),
          type: (item?.type || "text") as "text" | "image" | "video",
          body_text: item?.body_text ? String(item.body_text) : null,
          media_url: toAnnouncementMediaUrl(item?.media_url),
          link_url: item?.link_url ? String(item.link_url) : null,
          position: typeof item?.position === "number" ? item.position : null,
          starts_at: item?.starts_at ? String(item.starts_at) : null,
          ends_at: item?.ends_at ? String(item.ends_at) : null,
          is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
        }));
    }
  }

  // Sem fallback por token aqui: evita vazamento de divulgacao de outra igreja.
  return [];
}

/**
 * listAnnouncementsPublicByScope
 * ------------------------------
 * O que faz: Busca as divulgacoes publicas de um conjunto de igrejas (scope),
 *   sem precisar de login (usada na tela de login para admins com multiplas igrejas).
 * Para que serve: Exibir divulgacoes de todas as igrejas do escopo do admin
 *   no carrossel da tela de login, sem exigir autenticacao.
 * Como funciona: Consulta direta no Supabase via cliente anonimo usando
 *   filtro IN para buscar de varias igrejas ao mesmo tempo. Requer politica
 *   RLS anon SELECT na tabela "announcements" para funcionar.
 * ATENCAO: Para exibir na tela de login, adicione esta politica RLS no Supabase:
 *   CREATE POLICY "anon_select_announcements" ON announcements
 *   FOR SELECT TO anon USING (is_active = true);
 */
export async function listAnnouncementsPublicByScope(totvsIds: string[], limit = 10): Promise<AnnouncementItem[]> {
  const scope = Array.from(new Set((totvsIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!scope.length || !supabaseAnon) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAnon
    .from("announcements")
    .select("id,title,type,body_text,media_url,link_url,position,starts_at,ends_at,is_active,created_at")
    .in("church_totvs_id", scope)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(30, limit)));

  if (error) return [];

  return (data || [])
    .filter((item: Record<string, unknown>) => {
      const startsOk = !item?.starts_at || String(item.starts_at) <= nowIso;
      const endsOk = !item?.ends_at || String(item.ends_at) >= nowIso;
      return startsOk && endsOk;
    })
    .map((item: Record<string, unknown>) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "Aviso"),
      type: (item?.type || "text") as "text" | "image" | "video",
      body_text: item?.body_text ? String(item.body_text) : null,
      media_url: toAnnouncementMediaUrl(item?.media_url),
      link_url: item?.link_url ? String(item.link_url) : null,
      position: typeof item?.position === "number" ? item.position : null,
      starts_at: item?.starts_at ? String(item.starts_at) : null,
      ends_at: item?.ends_at ? String(item.ends_at) : null,
      is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
    }));
}

/**
 * listAnnouncementsPublicByCpf
 * ----------------------------
 * O que faz: Busca as divulgacoes da igreja do usuario usando apenas o CPF,
 *   sem precisar de login (JWT). A edge function list-announcements aceita
 *   CPF no body e encontra o church_totvs_id do usuario na tabela users.
 * Para que serve: Mostrar divulgacoes na tela de login quando o CPF esta salvo
 *   no cache (ipda_last_cpf), mesmo antes do usuario fazer login.
 * Como funciona: Chama list-announcements com skipAuth=true passando o CPF.
 *   A funcao retorna as divulgacoes da igreja e da raiz (estadual) do usuario.
 */
export async function listAnnouncementsPublicByCpf(cpf: string, limit = 10): Promise<AnnouncementItem[]> {
  const cpfRaw = String(cpf || "").replace(/\D/g, "");
  if (cpfRaw.length !== 11) return [];

  try {
    const raw = (await api.listAnnouncementsByCpf({ cpf: cpfRaw, limit, include_lineage: true })) as Record<string, unknown>;
    const rows = Array.isArray(raw?.announcements)
      ? (raw.announcements as Record<string, unknown>[])
      : Array.isArray(raw)
        ? (raw as Record<string, unknown>[])
        : [];
    return rows.map((item) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "Aviso"),
      type: (item?.type || "text") as "text" | "image" | "video",
      body_text: item?.body_text ? String(item.body_text) : null,
      media_url: toAnnouncementMediaUrl(item?.media_url),
      link_url: item?.link_url ? String(item.link_url) : null,
      position: typeof item?.position === "number" ? item.position : null,
      starts_at: item?.starts_at ? String(item.starts_at) : null,
      ends_at: item?.ends_at ? String(item.ends_at) : null,
      is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
    }));
  } catch {
    // Silencioso: sem divulgacoes na tela de login nao e critico.
    return [];
  }
}

function getTodayMonthDaySaoPaulo() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const mm = parts.find((p) => p.type === "month")?.value || "01";
  const dd = parts.find((p) => p.type === "day")?.value || "01";
  return `${mm}-${dd}`;
}

function birthDateToMonthDay(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[2]}-${match[3]}`;
}

async function notifyBirthdayWebhookOnce(payload: {
  church_totvs_id: string;
  scope_totvs_ids?: string[];
  birthdays: BirthdayItem[];
}) {
  if (payload.birthdays.length === 0) return;

  const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const scopeKey = payload.scope_totvs_ids?.length ? payload.scope_totvs_ids.join(",") : payload.church_totvs_id;
  const dedupKey = `ipda_birthdays_webhook_${dateKey}_${scopeKey}`;

  if (typeof window !== "undefined" && localStorage.getItem(dedupKey) === "1") return;

  try {
    const webhookUrl = String(import.meta.env.VITE_BIRTHDAYS_WEBHOOK_URL || "").trim();
    if (!webhookUrl) return;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "aniversario",
        event_type: "aniversario",
        date: dateKey,
        church_totvs_id: payload.church_totvs_id,
        scope_totvs_ids: payload.scope_totvs_ids || [payload.church_totvs_id],
        birthdays: payload.birthdays.map((b) => ({
          id: String(b.id || ""),
          full_name: String(b.full_name || ""),
          role: String((b as Record<string, unknown>)?.role || "obreiro"),
          phone: b.phone || null,
          email: b.email || null,
          avatar_url: b.avatar_url || null,
          birth_date: b.birth_date || null,
        })),
      }),
    });

    if (typeof window !== "undefined") localStorage.setItem(dedupKey, "1");
  } catch {
    // Comentario: falha no webhook nao pode bloquear o login.
  }
}

export async function listBirthdaysTodayPublicByTotvs(churchTotvsId: string, limit = 10): Promise<BirthdayItem[]> {
  const totvs = String(churchTotvsId || "").trim();
  if (!totvs || !supabaseAnon) return [];

  const { data, error } = await supabaseAnon
    .from("users")
    .select("id,full_name,phone,email,avatar_url,birth_date")
    .eq("default_totvs_id", totvs)
    .eq("is_active", true)
    .not("birth_date", "is", null)
    .limit(500);

  if (error) {
    try {
      const token = getToken();
      if (token) {
        const raw = (await api.birthdaysToday({ limit })) as Record<string, unknown>;
        const birthdays = Array.isArray(raw?.birthdays) ? (raw.birthdays as Record<string, unknown>[]) : [];
        return birthdays.map((u: Record<string, unknown>) => ({
          id: String(u?.id || ""),
          full_name: String(u?.full_name || ""),
          phone: u?.phone ? String(u.phone) : null,
          email: u?.email ? String(u.email) : null,
          birth_date: u?.birth_date ? String(u.birth_date) : null,
          avatar_url: u?.avatar_url || null,
        }));
      }
    } catch {
      return [];
    }
    return [];
  }

  const todayMD = getTodayMonthDaySaoPaulo();

  const birthdays = (data || [])
    .filter((u: Record<string, unknown>) => {
      if (!u?.birth_date) return false;
      return birthDateToMonthDay(String(u.birth_date)) === todayMD;
    })
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map((u: Record<string, unknown>) => ({
      id: String(u?.id || ""),
      full_name: String(u?.full_name || ""),
      phone: u?.phone ? String(u.phone) : null,
      email: u?.email ? String(u.email) : null,
      birth_date: u?.birth_date ? String(u.birth_date) : null,
      avatar_url: u?.avatar_url || null,
    }))
    .filter((x: BirthdayItem) => x.full_name);

  return birthdays;
}

export async function listBirthdaysTodayPublicByCpf(cpf: string, limit = 10): Promise<BirthdayItem[]> {
  const cpfRaw = String(cpf || "").replace(/\D/g, "");
  if (cpfRaw.length !== 11) return [];

  try {
    const raw = (await api.birthdaysTodayByCpf({ cpf: cpfRaw, limit })) as Record<string, unknown>;
    const birthdays = Array.isArray(raw?.birthdays) ? (raw.birthdays as Record<string, unknown>[]) : [];
    return birthdays
      .map((u: Record<string, unknown>) => ({
        id: String(u?.id || ""),
        full_name: String(u?.full_name || ""),
        phone: u?.phone ? String(u.phone) : null,
        email: u?.email ? String(u.email) : null,
        birth_date: u?.birth_date ? String(u.birth_date) : null,
        avatar_url: u?.avatar_url ? String(u.avatar_url) : null,
      }))
      .filter((x) => x.full_name);
  } catch {
    return [];
  }
}

export async function listBirthdaysTodayPublicByScope(totvsIds: string[], limit = 10): Promise<BirthdayItem[]> {
  const scope = Array.from(new Set((totvsIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!scope.length || !supabaseAnon) return [];

  const { data, error } = await supabaseAnon
    .from("users")
    .select("id,full_name,phone,email,avatar_url,birth_date")
    .in("default_totvs_id", scope)
    .eq("is_active", true)
    .not("birth_date", "is", null)
    .limit(1000);

  if (error) {
    try {
      const token = getToken();
      if (token) {
        const raw = (await api.birthdaysToday({ limit })) as Record<string, unknown>;
        const birthdays = Array.isArray(raw?.birthdays) ? (raw.birthdays as Record<string, unknown>[]) : [];
        return birthdays.map((u: Record<string, unknown>) => ({
          id: String(u?.id || ""),
          full_name: String(u?.full_name || ""),
          phone: u?.phone ? String(u.phone) : null,
          email: u?.email ? String(u.email) : null,
          birth_date: u?.birth_date ? String(u.birth_date) : null,
          avatar_url: u?.avatar_url || null,
        }));
      }
    } catch {
      return [];
    }
    return [];
  }

  const todayMD = getTodayMonthDaySaoPaulo();

  const birthdays = (data || [])
    .filter((u: Record<string, unknown>) => {
      if (!u?.birth_date) return false;
      return birthDateToMonthDay(String(u.birth_date)) === todayMD;
    })
    .slice(0, Math.max(1, Math.min(30, limit)))
    .map((u: Record<string, unknown>) => ({
      id: String(u?.id || ""),
      full_name: String(u?.full_name || ""),
      phone: u?.phone ? String(u.phone) : null,
      email: u?.email ? String(u.email) : null,
      birth_date: u?.birth_date ? String(u.birth_date) : null,
      avatar_url: u?.avatar_url || null,
    }))
    .filter((x: BirthdayItem) => x.full_name);

  return birthdays;
}

/**
 * getPastorByTotvsPublic
 * ----------------------
 * O que faz: Retorna os dados de contato do pastor responsavel por uma igreja,
 *   buscando pelo totvs_id via edge function (sem Supabase direto para evitar 401).
 * Para que serve: Exibe informacoes do pastor no dashboard do obreiro,
 *   pagina de documentos e formulario de carta.
 * Como funciona: Chama a edge function get-pastor-contact passando o totvs_id.
 */
export async function getPastorByTotvsPublic(churchTotvsId: string): Promise<PastorContact | null> {
  const totvs = String(churchTotvsId || "").trim();
  if (!totvs) return null;

  try {
    const raw = (await api.getPastorContact({ totvs_id: totvs })) as Record<string, unknown>;
    const p = raw?.pastor as Record<string, unknown> | null | undefined;
    if (!p) return null;
    return {
      full_name: String(p.full_name || ""),
      phone: p.phone ? String(p.phone) : null,
      email: p.email ? String(p.email) : null,
      avatar_url: p.avatar_url ? String(p.avatar_url) : null,
      minister_role: p.minister_role ? String(p.minister_role) : null,
      signature_url: p.signature_url ? String(p.signature_url) : null,
    };
  } catch {
    return null;
  }
}

export async function forgotPasswordRequest(payload: { cpf?: string; email?: string }) {
  return await api.forgotPasswordRequest(payload);
}

export async function resetPasswordConfirm(payload: { token: string; new_password: string }) {
  if (!String(payload.token || "").trim()) throw new Error("missing_token");
  if (String(payload.new_password || "").length < 6) throw new Error("password_too_short");
  return await api.resetPasswordConfirm(payload);
}

export async function publicRegisterMember(payload: {
  cpf: string;
  full_name: string;
  minister_role: string;
  birth_date?: string | null;
  profession?: string | null;
  baptism_date?: string | null;
  ordination_date?: string | null;
  rg?: string | null;
  marital_status?: string | null;
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
  lgpd_consent_at?: string | null;
}) {
  const cpf = normalizeCpf(payload.cpf);
  if (!isValidCpf(cpf)) throw new Error("cpf-invalid");
  if (!payload.full_name.trim()) throw new Error("name-required");
  if (!payload.minister_role.trim()) throw new Error("minister-role-required");
  if (!String(payload.rg || "").trim()) throw new Error("rg-required");
  if (!String(payload.marital_status || "").trim()) throw new Error("marital-status-required");
  if (!payload.totvs_id.trim()) throw new Error("totvs-required");
  if (String(payload.password || "").length < 6) throw new Error("password-too-short");

  return await api.publicRegisterMember({
    cpf,
    full_name: payload.full_name.trim(),
    minister_role: payload.minister_role.trim(),
    birth_date: payload.birth_date || null,
    profession: payload.profession || null,
    baptism_date: payload.baptism_date || null,
    ordination_date: payload.ordination_date || null,
    rg: String(payload.rg || "").trim() || null,
    marital_status: String(payload.marital_status || "").trim() || null,
    phone: payload.phone || null,
    email: payload.email || null,
    avatar_url: payload.avatar_url || null,
    cep: payload.cep || null,
    address_street: payload.address_street || null,
    address_number: payload.address_number || null,
    address_complement: payload.address_complement || null,
    address_neighborhood: payload.address_neighborhood || null,
    address_city: payload.address_city || null,
    address_state: payload.address_state || null,
    password: payload.password,
    totvs_id: payload.totvs_id.trim(),
    lgpd_consent_at: payload.lgpd_consent_at || null,
  });
}

export async function getMyRegistrationStatus(): Promise<RegistrationStatus> {
  if (!isMockMode() && supabase && getRlsToken()) {
    const currentUser = getUser();
    const currentUserId = String(currentUser?.id || "").trim();
    if (currentUserId) {
      const { data, error } = await supabase
        .from("users")
        .select("totvs_access")
        .eq("id", currentUserId)
        .maybeSingle();

      if (!error && data) {
        const direct = String((data as Record<string, unknown>)?.registration_status || "")
          .trim()
          .toUpperCase();
        if (direct === "PENDENTE") return "PENDENTE";
        if (direct === "APROVADO") return "APROVADO";

        const fromAccess = resolveRegistrationStatusFromTotvsAccess(
          (data as Record<string, unknown>)?.totvs_access || null,
        );
        if (fromAccess === "PENDENTE" || fromAccess === "APROVADO") return fromAccess;
      }
    }
  }

  const data = await api.getMyRegistrationStatus();
  const status = String(data?.registration_status || "").toUpperCase();
  if (status === "PENDENTE") return "PENDENTE";
  return "APROVADO";
}

export async function approveRelease(requestId: string) {
  if (!isMockMode()) {
    await api.approveRelease({ request_id: requestId });
    return;
  }
  const req = MOCK_RELEASES.find((r) => r.id === requestId);
  if (req) req.status = "APROVADO";
  const letter = MOCK_LETTERS.find((l) => l.id === req?.letter_id);
  if (letter && letter.storage_path) letter.status = "LIBERADA";
}

export async function denyRelease(requestId: string) {
  if (!isMockMode()) {
    await api.denyRelease({ request_id: requestId });
    return;
  }
  const req = MOCK_RELEASES.find((r) => r.id === requestId);
  if (req) req.status = "NEGADO";
  const letter = MOCK_LETTERS.find((l) => l.id === req?.letter_id);
  if (letter) letter.status = "AUTORIZADO";
}

export async function setLetterStatus(letterId: string, status: string, options?: Record<string, string>) {
  if (!isMockMode()) {
    await api.setLetterStatus({ letter_id: letterId, status, ...options });
    return;
  }
  const idx = MOCK_LETTERS.findIndex((l) => l.id === letterId);
  if (idx >= 0) MOCK_LETTERS[idx] = { ...MOCK_LETTERS[idx], status };
}

export async function softDeleteLetter(letterId: string) {
  // Marca como excluída no cache offline para não reaparecer ao recarregar
  void markLetterDeletedInCache(letterId).catch(() => {});
  return setLetterStatus(letterId, "EXCLUIDA");
}

/**
 * Busca o pastor responsavel pela congregacao local (por totvs_id).
 * Retorna { full_name, phone, email } ou null se nao encontrado.
 */
export async function getPastorByChurch(totvsId: string): Promise<{ full_name: string; phone: string | null; email: string | null } | null> {
  if (!totvsId?.trim()) return null;
  if (isMockMode()) return null;

  // 1. Verifica na tabela churches se esta congregacao/igreja tem um pastor_user_id vinculado nela
  const { data: churchInfo } = await supabase
    .from("churches")
    .select("pastor_user_id")
    .eq("totvs_id", totvsId.trim())
    .maybeSingle();

  if (!churchInfo || !churchInfo.pastor_user_id) return null;

  // 2. Busca na tabela de users os dados EXATOS desse pastor para enviar para N8n
  const { data: pastorInfo } = await supabase
    .from("users")
    .select("full_name, phone, email")
    .eq("id", churchInfo.pastor_user_id)
    .maybeSingle();

  if (!pastorInfo) return null;

  return {
    full_name: String((pastorInfo as Record<string, unknown>).full_name || ""),
    phone: (pastorInfo as Record<string, unknown>).phone ? String((pastorInfo as Record<string, unknown>).phone) : null,
    email: (pastorInfo as Record<string, unknown>).email ? String((pastorInfo as Record<string, unknown>).email) : null,
  };
}

export async function getSignedPdfUrl(value: string) {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  if (!isMockMode() && supabase && getRlsToken()) {
    const letterId = String(value || "").trim();
    const { data, error } = await supabase
      .from("letters")
      .select("url_carta, storage_path")
      .eq("id", letterId)
      .maybeSingle();

    if (!error && data) {
      const row = data as Record<string, unknown>;
      const directUrl = String(row.url_carta || "").trim();
      if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
        return directUrl;
      }

      const storagePath = String(row.storage_path || "").trim();
      if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
        return storagePath;
      }
      if (storagePath) {
        const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
        const bucket = String(import.meta.env.VITE_LETTERS_BUCKET || "cartas").trim();
        const path = storagePath.replace(/^\/+/, "");
        if (base && bucket && path) return `${base}/storage/v1/object/public/${bucket}/${path}`;
      }
    }
  }
  if (!isMockMode()) {
    const data = await api.getLetterPdfUrl({ letter_id: value });
    return String(data?.url || data?.signed_url || data?.signedUrl || "");
  }
  return null;
}

export async function requestRelease(letterId: string, _workerId: string, _churchTotvsId: string, message?: string) {
  if (!isMockMode()) {
    await api.requestRelease({ letter_id: letterId, message: message || null });
    return;
  }
  MOCK_RELEASES.push({
    id: `r-${Math.random().toString(36).slice(2, 10)}`,
    letter_id: letterId,
    requester_user_id: "u-obreiro",
    status: "PENDENTE",
    message: message || null,
    created_at: new Date().toISOString(),
  });
  const idx = MOCK_LETTERS.findIndex((l) => l.id === letterId);
  if (idx >= 0) MOCK_LETTERS[idx].status = "AGUARDANDO_LIBERACAO";
}

export async function workerDashboard(dateStart?: string, dateEnd?: string, page = 1, pageSize = 20): Promise<WorkerDashboardData> {
  if (false && !isMockMode() && supabase && getRlsToken()) {
    const currentUser = getUser();
    const currentSession = getSession();
    const userId = String(currentUser?.id || "").trim();
    const activeTotvs = String(currentSession?.totvs_id || currentUser?.default_totvs_id || "").trim();

    if (!userId) {
      throw new Error("user-not-authenticated");
    }

    const [{ data: userRaw, error: userErr }, { data: churchRaw, error: churchErr }] = await Promise.all([
      supabase
        .from("users")
        .select(
          // Comentario: inclui todos os campos necessarios para a ficha de membro e o dashboard
          "id, full_name, role, cpf, phone, email, minister_role, birth_date, ordination_date, avatar_url, default_totvs_id, totvs_access, payment_status, payment_block_reason, rg, marital_status, baptism_date, matricula, profession, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, can_create_released_letter",
        )
        .eq("id", userId)
        .maybeSingle(),
      activeTotvs
        ? supabase
            .from("churches")
            .select(
              "totvs_id, church_name, class, contact_phone, contact_email, address_street, address_number, address_neighborhood, address_city, address_state, pastor_user_id",
            )
            .eq("totvs_id", activeTotvs)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (userErr || churchErr) {
      console.warn("[workerDashboard] RLS direto falhou, seguindo com fallback por function:", userErr?.message || churchErr?.message);
    } else {

    const from = (Math.max(1, page) - 1) * Math.max(1, pageSize);
    const to = from + Math.max(1, pageSize) - 1;

    let lettersQuery = supabase
      .from("letters")
      .select(
        "id, church_totvs_id, preacher_user_id, preacher_name, minister_role, preach_date, church_origin, church_destination, status, storage_path, url_carta, url_pronta, phone, created_at",
      )
      .eq("preacher_user_id", userId)
      .neq("status", "EXCLUIDA")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (dateStart) {
      lettersQuery = lettersQuery.gte("created_at", `${dateStart}T00:00:00`);
    }
    if (dateEnd) {
      lettersQuery = lettersQuery.lte("created_at", `${dateEnd}T23:59:59`);
    }

    const { data: lettersRaw, error: lettersErr } = await lettersQuery;
    if (lettersErr) {
      console.warn("[workerDashboard] RLS letters falhou, seguindo com fallback:", lettersErr.message);
    } else {
      return {
        // Comentario: espalhamos o raw primeiro para preservar campos extras (rg, baptism_date, etc.)
        // que nao estao no tipo AuthSessionData, mas sao usados na ficha de membro.
        user: userRaw ? { ...(userRaw as Record<string, unknown>), ...mapUserLike(userRaw as Record<string, unknown>) } as AuthSessionData : null,
        church: churchRaw
          ? ({
              ...churchRaw,
              pastor_name: null,
              pastor_phone: (churchRaw as Record<string, unknown>)?.contact_phone || null,
              pastor_email: (churchRaw as Record<string, unknown>)?.contact_email || null,
            } as WorkerDashboardData["church"])
          : null,
        letters: (Array.isArray(lettersRaw) ? lettersRaw : []).map((item) =>
          mapLetterLike(item as Record<string, unknown>),
        ),
      };
    }
    }
  }

  if (!isMockMode()) {
    const data = await api.workerDashboard({
      date_start: dateStart || null,
      date_end: dateEnd || null,
      page,
      page_size: pageSize,
    });
    const lettersRaw = Array.isArray((data as Record<string, unknown>)?.letters) ? (data as Record<string, unknown>).letters : [];
    const userRawApi = (data as Record<string, unknown>)?.user as Record<string, unknown> | null | undefined;
    return {
      // Comentario: espalhamos o raw da API primeiro para preservar campos extras (rg, address_street, baptism_date, etc.)
      user: userRawApi ? { ...userRawApi, ...mapUserLike(userRawApi) } as AuthSessionData : null,
      church: (data as Record<string, unknown>)?.church as WorkerDashboardData["church"] || null,
      letters: (Array.isArray(lettersRaw) ? lettersRaw : []).map((item) => mapLetterLike(item as Record<string, unknown>)),
    };
  }
  return {
    user: mapUserLike(MOCK_USERS.find((u) => u.role === "obreiro")),
    church: {
      totvs_id: "9534",
      church_name: "CENTRAL ANCHIETA",
      pastor_name: "Daniel Paranhos Martineli",
      pastor_phone: "(27) 99999-1111",
      pastor_email: "pastor@ipda.org.br",
      address_full: "Rua da Igreja, 100 - Vitoria/ES",
    },
    letters: MOCK_LETTERS.filter((l) => l.preacher_user_id === "u-obreiro"),
  };
}

export async function listObreiroLetters(_userId: string) {
  const data = await workerDashboard();
  return data.letters;
}

export async function createUserByPastor(payload: UserCreatePayload, actorRole: AppRole) {
  const cpf = normalizeCpf(payload.cpf);
  if (!isValidCpf(cpf)) throw new Error("cpf-invalid");
  if (!payload.full_name.trim()) throw new Error("name-required");
  if (!payload.role) throw new Error("role-required");
  if (actorRole === "pastor" && payload.role === "admin") throw new Error("pastor-cannot-create-admin");
  const access = (payload.totvs_access || []).filter(Boolean);
  if (access.length === 0) throw new Error("totvs-access-required");
  if (payload.default_totvs_id && !access.includes(payload.default_totvs_id)) throw new Error("default-totvs-must-be-in-access");

  if (!isMockMode()) {
    await api.createUser({
      cpf,
      full_name: payload.full_name.trim(),
      role: payload.role,
      totvs_access: access,
      default_totvs_id: payload.default_totvs_id || null,
      phone: payload.phone || null,
      email: payload.email || null,
      birth_date: payload.birth_date || null,
      ordination_date: payload.ordination_date || null,
      minister_role: payload.minister_role || null,
      is_active: payload.is_active ?? true,
      password: payload.password || null,
      ...((payload.address_json || {}) as Record<string, unknown>),
    });
    return;
  }

  MOCK_USERS.push({
    id: `u-${Math.random().toString(36).slice(2, 10)}`,
    full_name: payload.full_name.trim(),
    role: payload.role,
    cpf,
    password: payload.password || "123456",
    default_totvs_id: payload.default_totvs_id || null,
    totvs_access: access,
    phone: payload.phone || null,
    email: payload.email || null,
    birth_date: payload.birth_date || null,
    ordination_date: payload.ordination_date || null,
    minister_role: payload.minister_role || null,
    address_json: payload.address_json || null,
    church_name: null,
    church_class: null,
    pastor_name: null,
  });
}

export async function upsertWorkerByPastor(payload: {
  id?: string;
  active_totvs_id: string;
  cpf: string;
  full_name: string;
  rg?: string;
  marital_status?: string;
  minister_role: string;
  profession?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  baptism_date?: string;
  ordination_date?: string;
  avatar_url?: string;
  cep?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  is_active?: boolean;
  password?: string | null;
}) {
  const cpf = normalizeCpf(payload.cpf);
  if (!isValidCpf(cpf)) throw new Error("cpf_invalid");
  if (!payload.full_name.trim()) throw new Error("full_name_required");
  if (!payload.minister_role.trim()) throw new Error("minister_role_required");
  if (!payload.active_totvs_id) throw new Error("active_totvs_required");

  const ministerRole = payload.minister_role.trim() as MinisterRoleFront;
  const role = roleFromMinisterRole(ministerRole);

  const body = {
    id: payload.id || undefined,
    cpf,
    full_name: payload.full_name.trim(),
    role,
    totvs_access: [{ totvs_id: payload.active_totvs_id, role }],
    default_totvs_id: payload.active_totvs_id,
    rg: payload.rg || null,
    marital_status: payload.marital_status || null,
    phone: payload.phone || null,
    email: payload.email || null,
    birth_date: payload.birth_date || null,
    baptism_date: payload.baptism_date || null,
    ordination_date: payload.ordination_date || null,
    minister_role: ministerRole,
    profession: payload.profession || null,
    avatar_url: payload.avatar_url || null,
    cep: payload.cep || null,
    address_street: payload.address_street || null,
    address_number: payload.address_number || null,
    address_complement: payload.address_complement || null,
    address_neighborhood: payload.address_neighborhood || null,
    address_city: payload.address_city || null,
    address_state: payload.address_state || null,
    is_active: payload.is_active ?? true,
    password: typeof payload.password === "undefined" ? null : payload.password,
  };

  if (!isMockMode()) {
    await api.createUser(body);
    return;
  }

  if (payload.id) {
    const idx = MOCK_USERS.findIndex((u) => u.id === payload.id);
    if (idx >= 0) {
      MOCK_USERS[idx] = {
        ...MOCK_USERS[idx],
        full_name: body.full_name,
        role: body.role,
        cpf: body.cpf,
        rg: body.rg,
        marital_status: body.marital_status,
        minister_role: body.minister_role,
        profession: body.profession,
        phone: body.phone,
        email: body.email,
        birth_date: body.birth_date,
        ordination_date: body.ordination_date,
        avatar_url: body.avatar_url,
        default_totvs_id: body.default_totvs_id,
        totvs_access: [payload.active_totvs_id],
        address_json: {
          cep: body.cep,
          street: body.address_street,
          number: body.address_number,
          complement: body.address_complement,
          neighborhood: body.address_neighborhood,
          city: body.address_city,
          state: body.address_state,
          country: "BR",
        },
      };
      (MOCK_USERS[idx] as AuthSessionData & { is_active?: boolean }).is_active = body.is_active;
      return;
    }
  }

  MOCK_USERS.push({
    id: `u-${Math.random().toString(36).slice(2, 10)}`,
    full_name: body.full_name,
    role: body.role,
    cpf: body.cpf,
    password: body.password || "123456",
    default_totvs_id: body.default_totvs_id,
    totvs_access: [payload.active_totvs_id],
    minister_role: body.minister_role,
    profession: body.profession,
    phone: body.phone,
    email: body.email,
    birth_date: body.birth_date,
    ordination_date: body.ordination_date,
    avatar_url: body.avatar_url,
    address_json: {
      cep: body.cep,
      street: body.address_street,
      number: body.address_number,
      complement: body.address_complement,
      neighborhood: body.address_neighborhood,
      city: body.address_city,
      state: body.address_state,
      country: "BR",
    },
    church_name: null,
    church_class: null,
    pastor_name: null,
  });
}

export async function setWorkerActive(workerId: string, isActive: boolean) {
  if (!isMockMode()) {
    await api.toggleWorkerActive({ worker_id: workerId, is_active: isActive });
    return;
  }
  const user = MOCK_USERS.find((u) => u.id === workerId);
  if (user) {
    (user as AuthSessionData & { is_active?: boolean }).is_active = isActive;
  }
}

export async function setWorkerDirectRelease(workerId: string, enabled: boolean) {
  if (!isMockMode()) {
    await api.setWorkerDirectRelease({
      worker_id: workerId,
      can_create_released_letter: enabled,
    });
    return;
  }
  const user = MOCK_USERS.find((u) => u.id === workerId);
  if (user) {
    (user as AuthSessionData & { can_create_released_letter?: boolean }).can_create_released_letter = enabled;
  }
}

export async function setMemberChurchAccess(userId: string, targetTotvsId: string) {
  if (!isMockMode()) {
    await api.changeMemberChurch({
      user_id: userId,
      target_totvs_id: targetTotvsId,
    });
    return;
  }
  const user = MOCK_USERS.find((u) => u.id === userId);
  if (user) {
    (user as AuthSessionData).default_totvs_id = targetTotvsId;
    (user as AuthSessionData).totvs_access = [targetTotvsId];
  }
}

export async function setMemberRoleAccess(userId: string, role: "obreiro" | "secretario" | "financeiro") {
  if (!isMockMode()) {
    await api.changeMemberAccess({
      user_id: userId,
      role,
    });
    return;
  }
  const user = MOCK_USERS.find((u) => u.id === userId);
  if (user) {
    (user as AuthSessionData).role = role;
  }
}

export async function setUserRegistrationStatus(userId: string, registrationStatus: RegistrationStatus) {
  if (!isMockMode()) {
    await api.setUserRegistrationStatus({
      user_id: userId,
      registration_status: registrationStatus,
    });
    return;
  }
  const user = MOCK_USERS.find((u) => u.id === userId);
  if (user) {
    (user as AuthSessionData).registration_status = registrationStatus;
  }
}

export async function setUserPaymentStatus(payload: {
  user_id: string;
  payment_status: PaymentStatus;
  reason?: string | null;
  amount?: number | null;
  due_date?: string | null;
}) {
  if (!isMockMode()) {
    await api.setUserPaymentStatus({
      user_id: payload.user_id,
      payment_status: payload.payment_status,
      reason: payload.reason ?? null,
      amount: typeof payload.amount === "number" ? payload.amount : null,
      due_date: payload.due_date ?? null,
    });
    return;
  }
  const user = MOCK_USERS.find((u) => u.id === payload.user_id);
  if (user) {
    (user as AuthSessionData).payment_status = payload.payment_status;
    (user as AuthSessionData).payment_block_reason = payload.reason ?? null;
  }
}

export async function saveMinisterialAttendance(payload: SaveMinisterialAttendancePayload) {
  if (!isMockMode()) {
    const requestPayload = {
      user_id: payload.user_id,
      meeting_date: payload.meeting_date,
      church_totvs_id: payload.church_totvs_id,
      status: payload.status,
      justification_text: payload.justification_text ?? null,
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueOfflineOperation("ministerial_attendance", "create", requestPayload, payload.church_totvs_id);
        return { ok: true, queued: true };
      }
      return await api.saveMinisterialAttendance(requestPayload);
    } catch (error) {
      if (isRetryableOfflineError(error)) {
        await enqueueOfflineOperation("ministerial_attendance", "create", requestPayload, payload.church_totvs_id);
        return { ok: true, queued: true };
      }
      throw error;
    }
  }

  return {
    ok: true,
    absences_without_justification_180_days: payload.status === "FALTA" ? 1 : 0,
    blocked_on_save: false,
  };
}

function mapMinisterialMeeting(raw: Record<string, unknown> | null | undefined): MinisterialMeetingItem {
  return {
    id: String(raw?.id || ""),
    church_totvs_id: String(raw?.church_totvs_id || ""),
    title: raw?.title ? String(raw.title) : null,
    meeting_date: String(raw?.meeting_date || ""),
    public_token: String(raw?.public_token || ""),
    expires_at: String(raw?.expires_at || ""),
    is_active: Boolean(raw?.is_active),
    notes: raw?.notes ? String(raw.notes) : null,
    created_at: raw?.created_at ? String(raw.created_at) : null,
    church_name: raw?.church_name ? String(raw.church_name) : null,
    church_class: raw?.church_class ? String(raw.church_class) : null,
  };
}

export async function createMinisterialMeeting(payload: CreateMinisterialMeetingPayload) {
  const data = await api.createMinisterialMeeting({
    church_totvs_id: payload.church_totvs_id ?? null,
    title: payload.title ?? null,
    meeting_date: payload.meeting_date,
    expires_at: payload.expires_at ?? null,
    notes: payload.notes ?? null,
  });
  return mapMinisterialMeeting((data?.meeting || null) as Record<string, unknown> | null);
}

export async function listMinisterialMeetings(church_totvs_id?: string | null) {
  const data = await api.listMinisterialMeetings({ church_totvs_id: church_totvs_id ?? null });
  const rows = Array.isArray(data?.meetings) ? data.meetings : [];
  return rows.map((row: Record<string, unknown>) => mapMinisterialMeeting(row));
}

export async function manageMinisterialMeeting(payload: {
  meeting_id: string;
  action: "close" | "reopen" | "delete";
  church_totvs_id?: string | null;
  expires_at?: string | null;
}) {
  const data = await api.manageMinisterialMeeting({
    meeting_id: payload.meeting_id,
    action: payload.action,
    church_totvs_id: payload.church_totvs_id ?? null,
    expires_at: payload.expires_at ?? null,
  });
  return data?.meeting ? mapMinisterialMeeting(data.meeting as Record<string, unknown>) : null;
}

export async function getPublicMinisterialMeeting(token: string) {
  const data = await api.getPublicMinisterialMeeting({ token });
  const rows = Array.isArray(data?.users) ? data.users : [];
  return {
    meeting: mapMinisterialMeeting((data?.meeting || null) as Record<string, unknown> | null),
    users: rows.map((row: Record<string, unknown>) => ({
      id: String(row?.id || ""),
      full_name: String(row?.full_name || ""),
      phone: row?.phone ? String(row.phone) : null,
      minister_role: row?.minister_role ? String(row.minister_role) : null,
      is_active: typeof row?.is_active === "boolean" ? row.is_active : true,
      attendance_status: row?.attendance_status ? String(row.attendance_status) : null,
      justification_text: row?.justification_text ? String(row.justification_text) : null,
    })),
  };
}

export async function savePublicMinisterialAttendance(payload: {
  token: string;
  user_id: string;
  status: MinisterialAttendanceStatus;
  justification_text?: string | null;
}) {
  return await api.savePublicMinisterialAttendance({
    token: payload.token,
    user_id: payload.user_id,
    status: payload.status,
    justification_text: payload.justification_text ?? null,
  });
}

export async function deleteUserPermanently(userId: string) {
  if (!isMockMode()) {
    await api.deleteUser({ user_id: userId });
    return;
  }
  const idx = MOCK_USERS.findIndex((u) => String(u.id) === String(userId));
  if (idx >= 0) MOCK_USERS.splice(idx, 1);
}

export async function setChurchPastor(church_totvs_id: string, pastor_user_id: string) {
  if (!church_totvs_id) throw new Error("church_totvs_required");
  if (!pastor_user_id) throw new Error("pastor_user_required");

  if (!isMockMode()) {
    await api.setChurchPastor({ church_totvs_id, pastor_user_id });
    return;
  }
}

export async function resetWorkerPassword(payload: { cpf?: string; user_id?: string; new_password: string }) {
  const nextPassword = String(payload.new_password || "");
  if (nextPassword.length < 8) throw new Error("password-too-short");

  const cpf = payload.cpf ? normalizeCpf(payload.cpf) : undefined;
  if (cpf && !isValidCpf(cpf)) throw new Error("cpf-invalid");

  if (!isMockMode()) {
    await api.resetPassword({
      cpf,
      user_id: payload.user_id || undefined,
      new_password: nextPassword,
    });
    return;
  }

  const worker = payload.user_id
    ? MOCK_USERS.find((u) => u.id === payload.user_id && u.role === "obreiro")
    : cpf
      ? MOCK_USERS.find((u) => u.cpf === cpf && u.role === "obreiro")
      : undefined;

  if (!worker) throw new Error("worker-not-found");
  (worker as AuthSessionData & { password?: string }).password = nextPassword;
}

export async function updateMyProfile(payload: {
  full_name?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  baptism_date?: string;
  ordination_date?: string;
  avatar_url?: string;
  cep?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
}) {
  if (!isMockMode()) {
    await api.updateMyProfile(payload);
    return;
  }
  const obreiro = MOCK_USERS.find((u) => u.role === "obreiro");
  if (!obreiro) return;
  if (typeof payload.phone === "string") obreiro.phone = payload.phone;
  if (typeof payload.email === "string") obreiro.email = payload.email;
  const address = ((obreiro.address_json || {}) as Record<string, unknown>);
  if (typeof payload.address_city === "string") address.city = payload.address_city;
  obreiro.address_json = address;
}

export async function upsertAnnouncement(payload: Record<string, unknown>) {
  if (!isMockMode()) {
    await api.upsertAnnouncement(payload);
    return;
  }
}

export async function deleteAnnouncement(id: string) {
  if (!isMockMode()) {
    await api.deleteAnnouncement({ id });
    return;
  }
}

export async function upsertStamps(payload: {
  signature_url?: string | null;
  stamp_pastor_url?: string | null;
  stamp_church_url?: string | null;
}) {
  if (!isMockMode()) {
    await api.upsertStamps(payload);
    return;
  }
}

function remanejamentoDraftKey(churchTotvsId: string) {
  return `ipda_remanejamento_draft_${churchTotvsId}`;
}

function contratoDraftKey(churchTotvsId: string) {
  return `ipda_contrato_draft_${churchTotvsId}`;
}

function laudoDraftKey(churchTotvsId: string) {
  return `ipda_laudo_draft_${churchTotvsId}`;
}

function readLocalDraft<T>(key: string): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<T>;
  } catch {
    return {};
  }
}

function writeLocalDraft<T>(key: string, payload: Partial<T>) {
  localStorage.setItem(key, JSON.stringify(payload || {}));
}

// Comentario: backend dos documentos de igreja pode ser ligado por variavel de ambiente.
const CHURCH_DOCS_BACKEND_ENABLED = String(import.meta.env.VITE_ENABLE_CHURCH_DOCS_BACKEND || "true").toLowerCase() === "true";

export async function getChurchRemanejamentoForm(church: ChurchInScopeItem): Promise<{
  hierarchy: ChurchHierarchySigner;
  draft: ChurchRemanejamentoDraft;
  status?: string;
  pdf_storage_path?: string | null;
}> {
  const localDraft = readLocalDraft<ChurchRemanejamentoDraft>(remanejamentoDraftKey(church.totvs_id));
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      const data = await api.getChurchRemanejamentoForm({ church_totvs_id: church.totvs_id });
      return {
        hierarchy: (data?.hierarchy || {
          requires_setorial_signature: false,
          signer_role: "estadual",
          signer_name: church.pastor?.full_name || "",
          message: "Esta igreja esta ligada diretamente a Estadual.",
        }) as ChurchHierarchySigner,
        draft: {
          church_totvs_id: church.totvs_id,
          ...(data?.draft as Record<string, string>),
          ...localDraft,
        },
        status: String(data?.status || "RASCUNHO"),
        pdf_storage_path: String(data?.pdf_storage_path || "") || null,
      };
    } catch {
      // Comentario: sem endpoint publicado, usa rascunho local sem quebrar a tela.
    }
  }
  return {
    hierarchy: {
      requires_setorial_signature: false,
      signer_role: "estadual",
      signer_name: church.pastor?.full_name || "",
      message: "Esta igreja esta ligada diretamente a Estadual. Assinatura setorial nao e necessaria.",
    },
    draft: {
      church_totvs_id: church.totvs_id,
      igreja_cidade: church.church_name || "",
      igreja_uf: "",
      estadual_pastor_nome: church.pastor?.full_name || "",
      ...localDraft,
    },
    status: "RASCUNHO",
    pdf_storage_path: null,
  };
}

export async function saveChurchRemanejamentoDraft(payload: ChurchRemanejamentoDraft) {
  writeLocalDraft<ChurchRemanejamentoDraft>(remanejamentoDraftKey(payload.church_totvs_id), payload);
}

export async function upsertChurchRemanejamento(payload: ChurchRemanejamentoDraft) {
  writeLocalDraft<ChurchRemanejamentoDraft>(remanejamentoDraftKey(payload.church_totvs_id), payload);
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      await api.upsertChurchRemanejamento(payload as unknown as Record<string, unknown>);
      return;
    } catch {
      // Comentario: mantem rascunho local quando endpoint ainda nao estiver implantado.
    }
  }
}

export async function generateChurchRemanejamentoPdf(churchTotvsId: string) {
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      return await api.generateChurchRemanejamentoPdf({ church_totvs_id: churchTotvsId });
    } catch {
      return { ok: false, error: "remanejamento_pdf_pending_backend" };
    }
  }
  return { ok: true };
}

export async function getChurchContratoForm(church: ChurchInScopeItem): Promise<{
  draft: ChurchContratoDraft;
  laudo: ChurchLaudoDraft;
}> {
  const localContrato = readLocalDraft<ChurchContratoDraft>(contratoDraftKey(church.totvs_id));
  const localLaudo = readLocalDraft<ChurchLaudoDraft>(laudoDraftKey(church.totvs_id));
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      const data = await api.getChurchContratoForm({ church_totvs_id: church.totvs_id });
      return {
        draft: {
          church_totvs_id: church.totvs_id,
          ...(data?.draft as Record<string, string>),
          ...localContrato,
        },
        laudo: {
          church_totvs_id: church.totvs_id,
          ...(data?.laudo as Record<string, string>),
          ...localLaudo,
        },
      };
    } catch {
      // Comentario: fallback local.
    }
  }
  return {
    draft: {
      church_totvs_id: church.totvs_id,
      dirigente_igreja: church.church_name || "",
      igreja_central: church.parent_totvs_id || "",
      ...localContrato,
    },
    laudo: {
      church_totvs_id: church.totvs_id,
      cidade_igreja: church.church_name || "",
      totvs: church.totvs_id,
      ...localLaudo,
    },
  };
}

export async function saveChurchContratoDraft(payload: ChurchContratoDraft) {
  writeLocalDraft<ChurchContratoDraft>(contratoDraftKey(payload.church_totvs_id), payload);
}

export async function upsertChurchContrato(payload: ChurchContratoDraft) {
  writeLocalDraft<ChurchContratoDraft>(contratoDraftKey(payload.church_totvs_id), payload);
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      await api.upsertChurchContrato(payload as unknown as Record<string, unknown>);
      return;
    } catch {
      // Comentario: mantem local quando backend ainda nao estiver publicado.
    }
  }
}

export async function saveChurchLaudoDraft(payload: ChurchLaudoDraft) {
  writeLocalDraft<ChurchLaudoDraft>(laudoDraftKey(payload.church_totvs_id), payload);
}

export async function upsertChurchLaudo(payload: ChurchLaudoDraft) {
  writeLocalDraft<ChurchLaudoDraft>(laudoDraftKey(payload.church_totvs_id), payload);
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      await api.upsertChurchLaudo(payload as unknown as Record<string, unknown>);
      return;
    } catch {
      // Comentario: mantem local quando backend ainda nao estiver publicado.
    }
  }
}

export async function generateChurchContratoPdf(churchTotvsId: string) {
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      return await api.generateChurchContratoPdf({ church_totvs_id: churchTotvsId });
    } catch {
      return { ok: false, error: "contrato_pdf_pending_backend" };
    }
  }
  return { ok: true };
}

export async function generateMemberDocs(payload: {
  document_type: "ficha_membro" | "carteirinha" | "ficha_obreiro" | "ficha_carteirinha";
  member_id: string;
  church_totvs_id?: string;
  dados: Record<string, unknown>;
}) {
  if (!isMockMode()) {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueOfflineOperation("member_docs", "create", payload, payload.church_totvs_id || undefined);
        return { ok: true, queued: true };
      }
      return await api.generateMemberDocs(payload);
    } catch (error) {
      if (isRetryableOfflineError(error)) {
        await enqueueOfflineOperation("member_docs", "create", payload, payload.church_totvs_id || undefined);
        return { ok: true, queued: true };
      }
      throw error;
    }
  }
  return { ok: true };
}

export type MemberDocStatusItem = {
  id?: string;
  status?: "RASCUNHO" | "ENVIADO_CONFECCAO" | "PRONTO" | "ERRO";
  final_url?: string | null;
  error_message?: string | null;
  requested_at?: string | null;
  finished_at?: string | null;
};

export type MemberDocsStatusResponse = {
  ficha: MemberDocStatusItem | null;
  carteirinha: MemberDocStatusItem | null;
  rules?: {
    ficha_pronta?: boolean;
    carteirinha_pronta?: boolean;
    can_generate_carteirinha?: boolean;
  };
};

export async function getMemberDocsStatus(payload: { member_id?: string; church_totvs_id?: string }) {
  if (!isMockMode()) {
    return (await api.getMemberDocsStatus(payload)) as MemberDocsStatusResponse;
  }
  return {
    ficha: null,
    carteirinha: null,
    rules: { ficha_pronta: false, carteirinha_pronta: false, can_generate_carteirinha: false },
  } as MemberDocsStatusResponse;
}

export async function deleteMemberDocs(payload: {
  member_id: string;
  church_totvs_id?: string;
  doc_type?: "ficha" | "carteirinha" | "all";
}) {
  if (!isMockMode()) {
    return await api.deleteMemberDocs(payload);
  }
  return { ok: true };
}

export async function deleteChurchRemanejamento(churchTotvsId: string) {
  localStorage.removeItem(remanejamentoDraftKey(churchTotvsId));
  if (!isMockMode() && CHURCH_DOCS_BACKEND_ENABLED) {
    try {
      await api.deleteChurchRemanejamento({ church_totvs_id: churchTotvsId });
      return;
    } catch {
      // Comentario: mantem sem falha visivel mesmo se backend estiver indisponivel.
    }
  }
}

// Comentario: tipo de item da listagem de carteirinhas prontas para impressao em lote
export type ReadyCarteirinhaItem = {
  id: string;
  member_id: string;
  final_url: string | null;
  ficha_url_qr: string | null;
  printed_at: string | null;
  finished_at: string | null;
  request_payload: Record<string, unknown>;
  member_name: string;
  member_cpf: string;
  member_minister_role: string;
  member_avatar_url: string;
};

export type PrintBatchCarteirinhaItem = {
  id: string;
  status: "PROCESSANDO" | "PRONTO" | "ERRO" | string;
  total_items: number;
  final_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  created_by_user_id: string | null;
};

// Comentario: busca carteirinhas com status PRONTO prontas para impressao em lote
export async function listReadyCarteirinhas(churchTotvsId: string): Promise<ReadyCarteirinhaItem[]> {
  if (!isMockMode()) {
    const res = (await api.listReadyCarteirinhas({ church_totvs_id: churchTotvsId })) as {
      ok: boolean;
      items: ReadyCarteirinhaItem[];
    };
    return res.items || [];
  }
  return [];
}

// Comentario: marca carteirinhas como impressas (atualiza printed_at no banco)
export async function markCarteirinhasPrinted(ids: string[]): Promise<void> {
  if (!isMockMode()) {
    await api.markCarteirinhasPrinted({ ids });
  }
}

export async function generatePrintBatchCarteirinhas(
  churchTotvsId: string,
  ids: string[],
): Promise<{ document_url?: string | null }> {
  if (!isMockMode()) {
    return (await api.generatePrintBatchCarteirinhas({
      church_totvs_id: churchTotvsId,
      ids,
    })) as { document_url?: string | null };
  }
  return { document_url: null };
}

export async function listPrintBatchCarteirinhas(churchTotvsId: string): Promise<PrintBatchCarteirinhaItem[]> {
  if (!isMockMode()) {
    const res = (await api.listPrintBatchCarteirinhas({ church_totvs_id: churchTotvsId })) as {
      ok: boolean;
      items: PrintBatchCarteirinhaItem[];
    };
    return res.items || [];
  }
  return [];
}

export async function createLetterByPastor(payload: LetterCreatePayload) {
  if (!payload.preacher_name.trim()) throw new Error("preacher-required");
  if (!payload.minister_role.trim()) throw new Error("minister-role-required");
  if (!payload.preach_date) throw new Error("preach-date-required");
  if (!payload.preach_period) throw new Error("invalid_preach_period");
  if (!payload.church_origin.trim()) throw new Error("origin-required");
  if (!payload.church_destination.trim()) throw new Error("destination-required");

  if (!isMockMode()) {
    const requestPayload = {
      preacher_name: payload.preacher_name.trim(),
      minister_role: payload.minister_role.trim(),
      preach_date: payload.preach_date,
      preach_period: payload.preach_period,
      church_origin: payload.church_origin.trim(),
      church_destination: payload.church_destination.trim(),
      manual_destination: Boolean(payload.manual_destination),
      preacher_user_id: payload.preacher_user_id || null,
      phone: payload.phone || null,
      email: payload.email || null,
      pastor_name: payload.pastor_name || null,
      pastor_phone: payload.pastor_phone || null,
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueOfflineOperation("letters", "create", requestPayload, payload.church_totvs_id || undefined);
        return { ok: true, queued: true };
      }
      return await api.createLetter(requestPayload);
    } catch (error) {
      if (isRetryableOfflineError(error)) {
        await enqueueOfflineOperation("letters", "create", requestPayload, payload.church_totvs_id || undefined);
        return { ok: true, queued: true };
      }
      throw error;
    }
  }

  const created = {
    id: `l-${Math.random().toString(36).slice(2, 10)}`,
    church_totvs_id: payload.church_totvs_id,
    created_at: new Date().toISOString(),
    preacher_name: payload.preacher_name.trim(),
    preach_date: payload.preach_date,
    church_origin: payload.church_origin.trim(),
    church_destination: payload.church_destination.trim(),
    minister_role: payload.minister_role.trim(),
    status: "AUTORIZADO",
    storage_path: null,
    preacher_user_id: payload.preacher_user_id || null,
  };
  MOCK_LETTERS.unshift(created);
  return {
    ok: true,
    letter: created,
    n8n: { ok: true, status: 200 },
  };
}

// ============================================================================
// MODULO DEPOSITO — controle de estoque de materiais evangelisticos
// ============================================================================

// Comentario: tipos do modulo deposito
export type DepositProduct = {
  id: string;
  code: string;
  description: string;
  group_name: string;
  subgroup: string | null;
  unit: string;
  unit_price: number;
  min_stock: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DepositStockItem = DepositProduct & {
  total_quantity: number;
  is_low_stock: boolean;
  stock_entries: Array<{ id: string; church_totvs_id: string; quantity: number }>;
};

export type DepositMovement = {
  id: string;
  product_id: string;
  type: "ENTRADA" | "SAIDA" | "TRANSFERENCIA" | "AJUSTE" | "PERDA";
  quantity: number;
  unit_price: number | null;
  church_origin_totvs: string | null;
  church_destination_totvs: string | null;
  responsible_name: string | null;
  notes: string | null;
  created_at: string;
  deposit_products?: { code: string; description: string; group_name: string };
};

export type DepositSummary = {
  total_products: number;
  total_stock: number;
  low_stock_count: number;
  entries_month: number;
  exits_month: number;
  transfers_month: number;
  total_value: number;
};

// Comentario: lista todos os produtos cadastrados no deposito
export async function depositListProducts(filters?: { search?: string; group_name?: string; is_active?: boolean }) {
  const res = await api.depositListProducts(filters || {});
  return (res as { products: DepositProduct[] }).products || [];
}

// Comentario: cria um novo produto no deposito
export async function depositCreateProduct(payload: Partial<DepositProduct>) {
  return await api.depositCreateProduct(payload as Record<string, unknown>);
}

// Comentario: atualiza um produto existente
export async function depositUpdateProduct(payload: Partial<DepositProduct> & { id: string }) {
  return await api.depositUpdateProduct(payload as Record<string, unknown>);
}

// Comentario: exclui um produto do deposito
export async function depositDeleteProduct(id: string) {
  return await api.depositDeleteProduct({ id });
}

// Comentario: lista estoque consolidado com filtros
export async function depositListStock(filters?: {
  search?: string;
  group_name?: string;
  church_totvs_id?: string;
  low_stock?: boolean;
  is_active?: boolean;
}) {
  const res = await api.depositListStock(filters || {});
  return (res as { stock: DepositStockItem[]; total: number });
}

// Comentario: retorna KPIs/resumo do deposito
export async function depositGetSummary(filters?: { church_totvs_id?: string }): Promise<DepositSummary> {
  const res = await api.depositGetSummary(filters || {});
  return (res as { summary: DepositSummary }).summary;
}

// Comentario: registra movimentacao (entrada, saida, ajuste, perda)
export async function depositCreateMovement(payload: {
  product_id: string;
  type: string;
  quantity: number;
  unit_price?: number;
  church_totvs_id?: string;
  notes?: string;
}) {
  return await api.depositCreateMovement(payload as Record<string, unknown>);
}

// Comentario: transfere mercadoria entre igrejas
export async function depositCreateTransfer(payload: {
  product_id: string;
  quantity: number;
  church_origin_totvs: string;
  church_destination_totvs: string;
  notes?: string;
}) {
  return await api.depositCreateTransfer(payload as Record<string, unknown>);
}

// Comentario: lista historico de movimentacoes com paginacao e filtros
export async function depositListMovements(filters?: {
  type?: string;
  product_id?: string;
  date_start?: string;
  date_end?: string;
  church_totvs_id?: string;
  church_origin_totvs?: string;
  church_destination_totvs?: string;
  page?: number;
  page_size?: number;
}) {
  const res = await api.depositListMovements(filters || {});
  return res as { movements: DepositMovement[]; total: number; page: number; page_size: number };
}

// Comentario: tipos e funcoes para gestao de caravanas
export type CaravanaItem = {
  id: string;
  event_id: string | null;
  church_code: string | null;
  church_name: string;
  city_state: string | null;
  pastor_name: string | null;
  pastor_email: string | null;
  pastor_phone: string | null;
  vehicle_plate: string | null;
  leader_name: string;
  leader_whatsapp: string | null;
  passenger_count: number;
  status: "Recebida" | "Confirmada";
  created_at: string;
};

export async function registerCaravana(data: {
  event_id?: string | null;
  church_code?: string | null;
  church_name: string;
  city_state?: string | null;
  pastor_name?: string | null;
  pastor_email?: string | null;
  pastor_phone?: string | null;
  vehicle_plate?: string | null;
  leader_name: string;
  leader_whatsapp: string;
  passenger_count: number;
}) {
  // Usar fetch direto para evitar problemas com headers
  const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") + "/functions/v1";
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${FUNCTIONS_BASE}/caravanas-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
    },
    body: JSON.stringify({ action: "register", ...data }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Erro ao registrar caravana: ${response.status}`);
  }

  return await response.json();
}

export async function listCaravanas(filters?: {
  status?: "Recebida" | "Confirmada" | "todas";
  search?: string;
  church_code?: string;
}) {
  const { post } = await import("@/lib/api");
  const result = await post<{ ok?: boolean; caravanas?: CaravanaItem[] }>(
    "caravanas-api",
    { action: "list", ...filters }
  );
  return result?.caravanas ?? [];
}

export async function confirmCaravana(id: string) {
  const { post } = await import("@/lib/api");
  const result = await post<{ ok?: boolean }>(
    "caravanas-api",
    { action: "confirm", id }
  );
  return result;
}

export async function deleteCaravana(id: string) {
  const { post } = await import("@/lib/api");
  const result = await post<{ ok?: boolean }>(
    "caravanas-api",
    { action: "delete", id }
  );
  return result;
}

export async function updateCaravana(id: string, data: Partial<CaravanaItem>) {
  const { post } = await import("@/lib/api");
  const result = await post<{ ok?: boolean }>(
    "caravanas-api",
    { action: "update", id, ...data }
  );
  return result;
}
