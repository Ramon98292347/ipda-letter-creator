import { api } from "@/lib/endpoints";
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
  cpf?: string | null;
  minister_role?: string | null;
  default_totvs_id?: string | null;
  totvs_access?: string[] | null;
  is_active?: boolean | null;
};

export type WorkerListParams = {
  search?: string;
  minister_role?: string;
  is_active?: boolean;
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
};

export type BirthdayItem = {
  full_name: string;
  avatar_url?: string | null;
};

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

function mapSessionLike(raw: any): AppSession {
  const scope = Array.isArray(raw?.scope_totvs_ids)
    ? raw.scope_totvs_ids.filter(Boolean).map(String)
    : Array.isArray(raw?.totvs_access)
      ? raw.totvs_access.filter(Boolean).map(String)
      : raw?.totvs_id
        ? [String(raw.totvs_id)]
        : [];
  return {
    totvs_id: String(raw?.totvs_id || raw?.default_totvs_id || scope[0] || ""),
    root_totvs_id: raw?.root_totvs_id ? String(raw.root_totvs_id) : undefined,
    role: (raw?.role || "obreiro") as AppRole,
    church_name: String(raw?.church_name || raw?.nome_igreja || "-"),
    church_class: raw?.church_class || raw?.class || null,
    scope_totvs_ids: scope,
  };
}

function mapUserLike(raw: any): AuthSessionData {
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

function mapLetterLike(raw: any): PastorLetter {
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

function useMockMode() {
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
    const churches: PendingChurch[] = churchesRaw.map((item: any) => ({
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
  if (!useMockMode()) {
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
  if (!useMockMode()) {
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
  const res = await listWorkers({ page: 1, page_size: 200 });
  return res.workers;
}

export async function listWorkers(params: WorkerListParams): Promise<WorkerListResponse> {
  if (!useMockMode()) {
    const data = await api.listWorkers({
      search: params.search || undefined,
      minister_role: params.minister_role || undefined,
      is_active: typeof params.is_active === "boolean" ? params.is_active : undefined,
      page: params.page || 1,
      page_size: params.page_size || 20,
    });
    const rows = Array.isArray(data?.workers) ? data.workers : [];
    return {
      workers: rows.map((w: any) => ({
        id: String(w?.id || ""),
        full_name: String(w?.full_name || ""),
        cpf: w?.cpf || null,
        minister_role: w?.minister_role || null,
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
    cpf: u.cpf,
    minister_role: u.minister_role || null,
    default_totvs_id: u.default_totvs_id || null,
    totvs_access: u.totvs_access || null,
    is_active: (u as any).is_active ?? true,
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

export async function listReleaseRequests(status: "PENDENTE" | "APROVADO" | "NEGADO" = "PENDENTE", page = 1, pageSize = 20): Promise<ReleaseRequest[]> {
  if (!useMockMode()) {
    const data = await api.listReleaseRequests({ status, page, page_size: pageSize });
    const rows = Array.isArray(data?.requests) ? data.requests : Array.isArray(data?.items) ? data.items : [];
    return rows.map((item: any) => ({
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

export async function listAnnouncements(limit = 10): Promise<AnnouncementItem[]> {
  if (!useMockMode()) {
    const data = await api.listAnnouncements({ limit });
    const rows = Array.isArray(data?.announcements)
      ? data.announcements
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];
    return rows.map((item: any) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "Aviso"),
      type: (item?.type || "text") as "text" | "image" | "video",
      body_text: item?.body_text || null,
      media_url: item?.media_url || null,
      link_url: item?.link_url || null,
      position: typeof item?.position === "number" ? item.position : null,
    }));
  }
  return [...MOCK_ANNOUNCEMENTS].slice(0, limit);
}

export async function listBirthdaysToday(limit = 10): Promise<BirthdayItem[]> {
  if (!useMockMode()) {
    const data = await api.birthdaysToday();
    const rows = Array.isArray(data?.birthdays) ? data.birthdays : [];
    return rows
      .slice(0, limit)
      .map((item: any) => ({
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

export async function approveRelease(requestId: string) {
  if (!useMockMode()) {
    await api.approveRelease({ request_id: requestId });
    return;
  }
  const req = MOCK_RELEASES.find((r) => r.id === requestId);
  if (req) req.status = "APROVADO";
  const letter = MOCK_LETTERS.find((l) => l.id === req?.letter_id);
  if (letter && letter.storage_path) letter.status = "LIBERADA";
}

export async function denyRelease(requestId: string) {
  if (!useMockMode()) {
    await api.denyRelease({ request_id: requestId });
    return;
  }
  const req = MOCK_RELEASES.find((r) => r.id === requestId);
  if (req) req.status = "NEGADO";
  const letter = MOCK_LETTERS.find((l) => l.id === req?.letter_id);
  if (letter) letter.status = "AUTORIZADO";
}

export async function setLetterStatus(letterId: string, status: string, _blockReason?: string | null) {
  if (!useMockMode()) {
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
  if (!useMockMode()) {
    const data = await api.getLetterPdfUrl({ letter_id: value });
    return String(data?.url || data?.signed_url || data?.signedUrl || "");
  }
  return null;
}

export async function requestRelease(letterId: string, _workerId: string, _churchTotvsId: string, message?: string) {
  if (!useMockMode()) {
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
  if (!useMockMode()) {
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

  if (!useMockMode()) {
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

  const body = {
    id: payload.id || undefined,
    cpf,
    full_name: payload.full_name.trim(),
    role: "obreiro",
    totvs_access: [{ totvs_id: payload.active_totvs_id, role: "obreiro" }],
    default_totvs_id: payload.active_totvs_id,
    phone: payload.phone || null,
    email: payload.email || null,
    birth_date: payload.birth_date || null,
    minister_role: payload.minister_role.trim(),
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

  if (!useMockMode()) {
    await api.createUser(body);
    return;
  }

  if (payload.id) {
    const idx = MOCK_USERS.findIndex((u) => u.id === payload.id);
    if (idx >= 0) {
      MOCK_USERS[idx] = {
        ...MOCK_USERS[idx],
        full_name: body.full_name,
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
      (MOCK_USERS[idx] as any).is_active = body.is_active;
      return;
    }
  }

  MOCK_USERS.push({
    id: `u-${Math.random().toString(36).slice(2, 10)}`,
    full_name: body.full_name,
    role: "obreiro",
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
  if (!useMockMode()) {
    await api.toggleWorkerActive({ worker_id: workerId, is_active: isActive });
    return;
  }
  const user = MOCK_USERS.find((u) => u.id === workerId);
  if (user) {
    (user as any).is_active = isActive;
  }
}

export async function resetWorkerPassword(payload: { cpf?: string; user_id?: string; new_password: string }) {
  const nextPassword = String(payload.new_password || "");
  if (nextPassword.length < 8) throw new Error("password-too-short");

  const cpf = payload.cpf ? normalizeCpf(payload.cpf) : undefined;
  if (cpf && cpf.length !== 11) throw new Error("cpf-invalid");

  if (!useMockMode()) {
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
  if (!useMockMode()) {
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
  if (!useMockMode()) {
    await api.upsertAnnouncement(payload);
    return;
  }
}

export async function deleteAnnouncement(id: string) {
  if (!useMockMode()) {
    await api.deleteAnnouncement({ id });
    return;
  }
}

export async function createLetterByPastor(payload: LetterCreatePayload) {
  if (!payload.preacher_name.trim()) throw new Error("preacher-required");
  if (!payload.minister_role.trim()) throw new Error("minister-role-required");
  if (!payload.preach_date) throw new Error("preach-date-required");
  if (!payload.church_origin.trim()) throw new Error("origin-required");
  if (!payload.church_destination.trim()) throw new Error("destination-required");

  if (!useMockMode()) {
    await api.createLetter({
      preacher_name: payload.preacher_name.trim(),
      minister_role: payload.minister_role.trim(),
      preach_date: payload.preach_date,
      church_origin: payload.church_origin.trim(),
      church_destination: payload.church_destination.trim(),
      preacher_user_id: payload.preacher_user_id || null,
      phone: payload.phone || null,
      email: payload.email || null,
    });
    return;
  }

  MOCK_LETTERS.unshift({
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
  });
}
