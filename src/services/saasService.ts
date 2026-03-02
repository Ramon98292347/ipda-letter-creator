import { getSession } from "@/lib/api";
import { api } from "@/lib/endpoints";
import { supabase } from "@/lib/supabase";
import type { AppSession, PendingChurch } from "@/context/UserContext";

export type AppRole = "admin" | "pastor" | "obreiro";

export type AuthSessionData = {
  id: string;
  full_name: string;
  role: AppRole;
  cpf: string;
  phone?: string | null;
  email?: string | null;
  minister_role?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  default_totvs_id?: string | null;
  totvs_access?: string[] | null;
  church_name?: string | null;
  church_class?: string | null;
  pastor_name?: string | null;
  address_json?: Record<string, unknown> | null;
};

export type LoginResult =
  | {
      mode: "authenticated";
      token: string;
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
  block_reason?: string | null;
  preacher_user_id?: string | null;
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
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  minister_role?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
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
  roles?: Array<"pastor" | "obreiro">;
  page?: number;
  page_size?: number;
};

export type WorkerListResponse = {
  workers: UserListItem[];
  total: number;
  page: number;
  page_size: number;
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

export type ChurchInScopeItem = {
  totvs_id: string;
  church_name: string;
  church_class?: string | null;
  parent_totvs_id?: string | null;
  is_active?: boolean;
  workers_count?: number;
  pastor_user_id?: string | null;
  pastor?: {
    id?: string | null;
    full_name?: string | null;
  } | null;
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
  full_name: string;
  avatar_url?: string | null;
};

export type PastorContact = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  minister_role?: string | null;
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
  minister_role?: string;
  address_json?: Record<string, unknown>;
  is_active?: boolean;
  password?: string;
};

export type LetterCreatePayload = {
  church_totvs_id: string;
  preacher_name: string;
  minister_role: string;
  preach_date: string;
  church_origin: string;
  church_destination: string;
  preacher_user_id?: string;
  phone?: string;
  email?: string;
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
  const totvsId = String(raw?.totvs_id || raw?.default_totvs_id || scope[0] || "");
  return {
    totvs_id: totvsId,
    root_totvs_id: raw?.root_totvs_id ? String(raw.root_totvs_id) : totvsId || undefined,
    role: (raw?.role || "obreiro") as AppRole,
    church_name: String(raw?.church_name || raw?.nome_igreja || "-"),
    church_class: raw?.church_class || raw?.class || null,
    scope_totvs_ids: scope,
  };
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
    avatar_url: raw?.avatar_url || null,
    default_totvs_id: raw?.default_totvs_id || raw?.totvs_id || null,
    totvs_access: Array.isArray(raw?.totvs_access) ? raw.totvs_access : null,
    church_name: raw?.church_name || null,
    church_class: raw?.church_class || null,
    pastor_name: raw?.pastor_name || null,
    address_json: raw?.address_json || null,
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
    block_reason: raw?.block_reason || null,
    preacher_user_id: raw?.preacher_user_id || null,
  };
}

function isMockMode() {
  return false;
}

export async function loginWithCpfPassword(cpfInput: string, password: string): Promise<LoginResult> {
  const cpf = normalizeCpf(cpfInput);
  if (cpf.length !== 11) throw new Error("cpf-invalid");

  const data = await api.login({ cpf, password });
  const directToken = data?.token || data?.jwt;
  const directUser = data?.user || data?.usuario;
  const directSession = data?.session;
  if (directToken && directUser && directSession) {
    return {
      mode: "authenticated",
      token: String(directToken),
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

export async function selectChurchSession(cpfInput: string, totvsId: string): Promise<{ token: string; user: AuthSessionData; session: AppSession }> {
  const cpf = normalizeCpf(cpfInput);
  if (cpf.length !== 11) throw new Error("cpf-invalid");
  if (!totvsId) throw new Error("totvs-required");

  const data = await api.selectChurch({ cpf, totvs_id: totvsId });
  return {
    token: String(data?.token || data?.jwt || ""),
    user: mapUserLike(data?.user || data?.usuario || {}),
    session: mapSessionLike(data?.session || { totvs_id: totvsId }),
  };
}

export async function getPastorMetrics(): Promise<PastorMetrics> {
  if (!isMockMode()) {
    const data = await api.dashboardStats();
    return {
      totalCartas: Number(data?.total_letters || 0),
      cartasHoje: Number(data?.today_letters || 0),
      ultimos7Dias: Number(data?.last7_letters || 0),
      totalObreiros: Number(data?.total_workers || 0),
      pendentesLiberacao: Number(data?.pending_release || 0),
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
  if (!isMockMode()) {
    const payload: Record<string, unknown> = {
      page: filters.page || 1,
      page_size: filters.pageSize || 50,
    };
    if (filters.period === "today") payload.quick = "today";
    if (filters.period === "7") payload.quick = "7d";
    if (filters.period === "30") payload.quick = "30d";
    if (filters.dateStart) payload.date_start = filters.dateStart;
    if (filters.dateEnd) payload.date_end = filters.dateEnd;
    if (filters.status && filters.status !== "all") payload.status = filters.status;
    if (filters.role && filters.role !== "all") payload.minister_role = filters.role;
    if (filters.q) payload.search = filters.q;

    const data = await api.listLetters(payload);
    const rows = Array.isArray(data?.letters) ? data.letters : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return rows.map(mapLetterLike);
  }

  return MOCK_LETTERS.filter((l) => {
    const byStatus = !filters.status || filters.status === "all" || l.status === filters.status;
    const byRole = !filters.role || filters.role === "all" || l.minister_role === filters.role;
    const byQ = !filters.q || l.preacher_name.toLowerCase().includes(filters.q.toLowerCase());
    return byStatus && byRole && byQ;
  });
}

export async function listObreiros(_scopeTotvsIds: string[]): Promise<UserListItem[]> {
  const res = await listMembers({ page: 1, page_size: 200, roles: ["pastor", "obreiro"] });
  return res.workers;
}

export async function listMembers(params: MemberListParams): Promise<WorkerListResponse> {
  if (!isMockMode()) {
    const data = await api.listMembers({
      search: params.search || undefined,
      minister_role: params.minister_role || undefined,
      is_active: typeof params.is_active === "boolean" ? params.is_active : undefined,
      roles: params.roles?.length ? params.roles : undefined,
      page: params.page || 1,
      page_size: params.page_size || 20,
    });

    const rows = Array.isArray(data?.members) ? data.members : [];
    return {
      workers: rows.map((w: Record<string, unknown>) => ({
        id: String(w?.id || ""),
        full_name: String(w?.full_name || ""),
        role: (w?.role || null) as AppRole | null,
        cpf: w?.cpf || null,
        phone: w?.phone || null,
        email: w?.email || null,
        minister_role: w?.minister_role || null,
        birth_date: w?.birth_date || null,
        avatar_url: w?.avatar_url || null,
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
      })),
      total: Number(data?.total || rows.length),
      page: Number(data?.page || params.page || 1),
      page_size: Number(data?.page_size || params.page_size || 20),
    };
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
        phone: w?.phone || null,
        email: w?.email || null,
        minister_role: w?.minister_role || null,
        birth_date: w?.birth_date || null,
        avatar_url: w?.avatar_url || null,
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
    phone: u.phone || null,
    email: u.email || null,
    minister_role: u.minister_role || null,
    default_totvs_id: u.default_totvs_id || null,
    totvs_access: u.totvs_access || null,
    is_active: (u as AuthSessionData & { is_active?: boolean }).is_active ?? true,
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

export async function listChurchesInScope(page = 1, pageSize = 200): Promise<ChurchInScopeItem[]> {
  const data = await api.listChurchesInScope({ page, page_size: pageSize });
  const rows = Array.isArray(data?.churches)
    ? data.churches
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

  return rows.map((item: Record<string, unknown>) => ({
    totvs_id: String(item?.totvs_id || ""),
    church_name: String(item?.church_name || item?.name || "-"),
    church_class: item?.church_class || item?.class || null,
    parent_totvs_id: item?.parent_totvs_id || null,
    is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
    workers_count: Number(item?.workers_count || 0),
    pastor_user_id: item?.pastor_user_id || item?.pastor?.id || null,
    pastor: item?.pastor
      ? {
          id: item.pastor?.id || null,
          full_name: item.pastor?.full_name || item.pastor?.name || null,
        }
      : null,
  }));
}

export async function listChurchesInScopePaged(page = 1, pageSize = 20): Promise<{ churches: ChurchInScopeItem[]; total: number; page: number; page_size: number }> {
  const data = await api.listChurchesInScope({ page, page_size: pageSize });
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
}

export async function createChurch(payload: { totvs_id: string; parent_totvs_id?: string; church_name: string; class: string }) {
  if (!payload.totvs_id?.trim()) throw new Error("totvs_id_required");
  if (!payload.church_name?.trim()) throw new Error("church_name_required");
  if (!payload.class?.trim()) throw new Error("class_required");

  await api.createChurch({
    totvs_id: payload.totvs_id.trim(),
    parent_totvs_id: payload.parent_totvs_id?.trim() || null,
    church_name: payload.church_name.trim(),
    class: payload.class.trim(),
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

export async function listNotifications(page = 1, pageSize = 20, unreadOnly = false): Promise<{ notifications: AppNotification[]; unread_count: number; total: number }> {
  const currentSession = getSession();
  const rootTotvs = currentSession?.root_totvs_id || currentSession?.totvs_id;
  const data = await api.listNotifications({
    page,
    page_size: pageSize,
    unread_only: unreadOnly,
    church_totvs_id: rootTotvs,
  });
  const rows = Array.isArray(data?.notifications)
    ? data.notifications
    : Array.isArray(data?.items)
      ? data.items
      : [];

  return {
    notifications: rows.map((item: Record<string, unknown>) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "Notificacao"),
      message: item?.message || null,
      is_read: Boolean(item?.is_read),
      created_at: item?.created_at || null,
      type: item?.type || null,
    })),
    unread_count: Number(data?.unread_count || 0),
    total: Number(data?.total || rows.length),
  };
}

export async function markNotificationRead(id: string) {
  const currentSession = getSession();
  const rootTotvs = currentSession?.root_totvs_id || currentSession?.totvs_id;
  await api.markNotificationRead({ id, church_totvs_id: rootTotvs });
}

export async function markAllNotificationsRead() {
  const currentSession = getSession();
  const rootTotvs = currentSession?.root_totvs_id || currentSession?.totvs_id;
  await api.markAllNotificationsRead({ church_totvs_id: rootTotvs });
}

export async function listAnnouncements(limit = 10): Promise<AnnouncementItem[]> {
  if (!isMockMode()) {
    const data = await api.listAnnouncements({ limit });
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
      body_text: item?.body_text || null,
      media_url: toAnnouncementMediaUrl(item?.media_url),
      link_url: item?.link_url || null,
      position: typeof item?.position === "number" ? item.position : null,
      starts_at: item?.starts_at || null,
      ends_at: item?.ends_at || null,
      is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
    }));
  }
  return [...MOCK_ANNOUNCEMENTS].slice(0, limit);
}

export async function listBirthdaysToday(limit = 10): Promise<BirthdayItem[]> {
  if (!isMockMode()) {
    const data = await api.birthdaysToday();
    const rows = Array.isArray(data?.birthdays) ? data.birthdays : [];
    return rows
      .slice(0, limit)
      .map((item: Record<string, unknown>) => ({
        full_name: String(item?.full_name || ""),
        avatar_url: item?.avatar_url || null,
      }))
      .filter((item: BirthdayItem) => item.full_name);
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
      full_name: u.full_name,
      avatar_url: u.avatar_url || null,
    }));
}

export async function listAnnouncementsPublicByTotvs(churchTotvsId: string, limit = 10): Promise<AnnouncementItem[]> {
  const totvs = String(churchTotvsId || "").trim();
  if (!totvs || !supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("announcements")
    .select("id,title,type,body_text,media_url,link_url,position,starts_at,ends_at,is_active,created_at")
    .eq("church_totvs_id", totvs)
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(10, limit)));

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
      body_text: item?.body_text || null,
      media_url: toAnnouncementMediaUrl(item?.media_url),
      link_url: item?.link_url || null,
      position: typeof item?.position === "number" ? item.position : null,
      starts_at: item?.starts_at || null,
      ends_at: item?.ends_at || null,
      is_active: typeof item?.is_active === "boolean" ? item.is_active : true,
    }));
}

export async function listBirthdaysTodayPublicByTotvs(churchTotvsId: string, limit = 10): Promise<BirthdayItem[]> {
  const totvs = String(churchTotvsId || "").trim();
  if (!totvs || !supabase) return [];

  const { data, error } = await supabase
    .from("users")
    .select("full_name,avatar_url,birth_date")
    .eq("role", "obreiro")
    .eq("default_totvs_id", totvs)
    .eq("is_active", true)
    .not("birth_date", "is", null)
    .limit(500);

  if (error) return [];

  const today = new Date();
  const m = today.getMonth() + 1;
  const d = today.getDate();

  return (data || [])
    .filter((u: Record<string, unknown>) => {
      if (!u?.birth_date) return false;
      const dt = new Date(String(u.birth_date));
      return dt.getMonth() + 1 === m && dt.getDate() === d;
    })
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map((u: Record<string, unknown>) => ({
      full_name: String(u?.full_name || ""),
      avatar_url: u?.avatar_url || null,
    }))
    .filter((x: BirthdayItem) => x.full_name);
}

export async function getPastorByTotvsPublic(churchTotvsId: string): Promise<PastorContact | null> {
  const totvs = String(churchTotvsId || "").trim();
  if (!totvs || !supabase) return null;

  const { data, error } = await supabase
    .from("users")
    .select("full_name,phone,email,avatar_url,minister_role")
    .eq("role", "pastor")
    .eq("default_totvs_id", totvs)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    full_name: String((data as Record<string, unknown>).full_name || ""),
    phone: (data as Record<string, unknown>).phone || null,
    email: (data as Record<string, unknown>).email || null,
    avatar_url: (data as Record<string, unknown>).avatar_url || null,
    minister_role: (data as Record<string, unknown>).minister_role || null,
  };
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

export async function setLetterStatus(letterId: string, status: string, _blockReason?: string | null) {
  if (!isMockMode()) {
    await api.setLetterStatus({ letter_id: letterId, status });
    return;
  }
  const idx = MOCK_LETTERS.findIndex((l) => l.id === letterId);
  if (idx >= 0) MOCK_LETTERS[idx] = { ...MOCK_LETTERS[idx], status };
}

export async function softDeleteLetter(letterId: string) {
  return setLetterStatus(letterId, "EXCLUIDA");
}

export async function getSignedPdfUrl(value: string) {
  if (!value) return null;
  if (value.startsWith("http")) return value;
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
  if (!isMockMode()) {
    const data = await api.workerDashboard({
      date_start: dateStart || null,
      date_end: dateEnd || null,
      page,
      page_size: pageSize,
    });
    const lettersRaw = Array.isArray(data?.letters) ? data.letters : [];
    return {
      user: data?.user ? mapUserLike(data.user) : null,
      church: data?.church || null,
      letters: lettersRaw.map(mapLetterLike),
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
  if (cpf.length !== 11) throw new Error("cpf-invalid");
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
  minister_role: string;
  phone?: string;
  email?: string;
  birth_date?: string;
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
  if (cpf.length !== 11) throw new Error("cpf_invalid");
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
    phone: payload.phone || null,
    email: payload.email || null,
    birth_date: payload.birth_date || null,
    minister_role: ministerRole,
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
        minister_role: body.minister_role,
        phone: body.phone,
        email: body.email,
        birth_date: body.birth_date,
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
    phone: body.phone,
    email: body.email,
    birth_date: body.birth_date,
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
  if (cpf && cpf.length !== 11) throw new Error("cpf-invalid");

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

export async function updateMyProfile(payload: { phone?: string; email?: string; address_city?: string }) {
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

export async function createLetterByPastor(payload: LetterCreatePayload) {
  if (!payload.preacher_name.trim()) throw new Error("preacher-required");
  if (!payload.minister_role.trim()) throw new Error("minister-role-required");
  if (!payload.preach_date) throw new Error("preach-date-required");
  if (!payload.church_origin.trim()) throw new Error("origin-required");
  if (!payload.church_destination.trim()) throw new Error("destination-required");

  if (!isMockMode()) {
    return await api.createLetter({
      preacher_name: payload.preacher_name.trim(),
      minister_role: payload.minister_role.trim(),
      preach_date: payload.preach_date,
      church_origin: payload.church_origin.trim(),
      church_destination: payload.church_destination.trim(),
      preacher_user_id: payload.preacher_user_id || null,
      phone: payload.phone || null,
      email: payload.email || null,
    });
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
