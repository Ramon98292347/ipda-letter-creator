import { useEffect, useMemo, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, FileText, LineChart, SlidersHorizontal } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { CartasTab } from "@/components/admin/CartasTab";
import { Button } from "@/components/ui/button";
import { useUser } from "@/context/UserContext";
import { getPastorMetrics, listChurchesInScope, listMembers, listPastorLetters } from "@/services/saasService";
import { PageLoading } from "@/components/shared/PageLoading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseRealtime } from "@/lib/supabaseRealtime";
import { useDebounce } from "@/hooks/useDebounce";

function KpiCard({
  label,
  value,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: number;
  icon: typeof FileText;
  gradient: string;
}) {
  return (
    <div className={`rounded-xl shadow-md bg-gradient-to-br ${gradient} p-5`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
        <Icon className="h-4 w-4 text-white/70" />
        {label}
      </p>
      <p className="mt-3 text-4xl font-extrabold text-white">{value}</p>
    </div>
  );
}

// Comentario: dashboard exclusivo de cartas para pastor/admin.
export default function CartasDashboardPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, session } = useUser();
  const [selectedChurchTotvs, setSelectedChurchTotvs] = useState<string>("all");
  const [filterChurchClass, setFilterChurchClass] = useState<string>("all");
  const [filterChurchTotvsInput, setFilterChurchTotvsInput] = useState<string>("");
  // Comentario: debounce de 600ms aguarda o usuario terminar de digitar antes de filtrar
  const debouncedFilterTotvs = useDebounce(filterChurchTotvsInput, 600);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [lettersPageSize, setLettersPageSize] = useState(100);

  const role = String(usuario?.role || "").toLowerCase();
  if (role === "obreiro") {
    return <Navigate to="/usuario" replace />;
  }

  const roleMode = role === "admin" ? "admin" : "pastor";
  const activeTotvsId = String(session?.totvs_id || usuario?.default_totvs_id || usuario?.totvs || "");
  const scopeTotvsIds = useMemo(() => {
    const ids = (session?.scope_totvs_ids || usuario?.totvs_access || []).filter(Boolean);
    if (ids.length) return ids;
    if (activeTotvsId) return [activeTotvsId];
    return [];
  }, [session?.scope_totvs_ids, usuario?.totvs_access, activeTotvsId]);

  const { data: churchesInScope = [] } = useQuery({
    queryKey: ["cartas-dashboard-scope", activeTotvsId, roleMode],
    queryFn: () => (roleMode === "admin" ? listChurchesInScope(1, 1000) : listChurchesInScope(1, 1000, activeTotvsId || undefined)),
    enabled: Boolean(activeTotvsId) || roleMode === "admin",
  });

  const effectiveScopeTotvsIds = useMemo(() => {
    const fromChurches = churchesInScope.map((c) => String(c.totvs_id || "")).filter(Boolean);
    if (fromChurches.length) return fromChurches;
    return scopeTotvsIds;
  }, [churchesInScope, scopeTotvsIds]);

  // Comentario: filtra igrejas por classe e totvs quando admin tem "all" selecionado
  const filteredChurchesInScope = useMemo(() => {
    if (roleMode !== "admin" || selectedChurchTotvs !== "all") return churchesInScope;

    let result = churchesInScope;
    if (filterChurchClass !== "all") {
      result = result.filter((c) => String(c.class || "").toLowerCase() === filterChurchClass.toLowerCase());
    }
    if (debouncedFilterTotvs.trim()) {
      const query = debouncedFilterTotvs.trim().toLowerCase();
      result = result.filter((c) => String(c.totvs_id || "").toLowerCase().includes(query));
    }
    return result;
  }, [churchesInScope, filterChurchClass, debouncedFilterTotvs, roleMode, selectedChurchTotvs]);

  const allowScopeView = roleMode === "admin" || effectiveScopeTotvsIds.length > 1;
  const selectedScopeForLetters = useMemo(() => {
    if (roleMode === "admin" && selectedChurchTotvs !== "all") {
      return [selectedChurchTotvs];
    }
    if (roleMode === "admin" && selectedChurchTotvs === "all") {
      // Comentario: usa igrejas filtradas por classe/totvs
      return filteredChurchesInScope.map((c) => String(c.totvs_id || "")).filter(Boolean);
    }
    return effectiveScopeTotvsIds;
  }, [roleMode, selectedChurchTotvs, filteredChurchesInScope, effectiveScopeTotvsIds]);

  useEffect(() => {
    setLettersPageSize(100);
  }, [selectedChurchTotvs, roleMode, selectedScopeForLetters.join("|")]);

  const { data: metrics, isLoading: loadingMetrics, isFetching: fetchingMetrics } = useQuery({
    queryKey: ["cartas-dashboard-metrics", selectedScopeForLetters.join("|")],
    queryFn: () => getPastorMetrics(),
    enabled: selectedScopeForLetters.length > 0,
  });

  const { data: letters = [], isLoading: loadingLetters, isFetching: fetchingLetters } = useQuery({
    queryKey: ["cartas-dashboard-letters", selectedScopeForLetters.join("|"), roleMode, selectedChurchTotvs, lettersPageSize],
    queryFn: async () => {
      // Comentario: para pastor, uma consulta unica ja traz escopo + cartas proprias (preacher_user_id).
      if (roleMode === "pastor") {
        return listPastorLetters("", {
          period: "custom",
          pageSize: lettersPageSize,
          onlyNewSinceCache: true,
        });
      }

      const data = await Promise.all(
        selectedScopeForLetters.map((totvs) =>
          listPastorLetters(totvs, {
            period: "custom",
            pageSize: lettersPageSize,
            onlyNewSinceCache: true,
          }),
        ),
      );
      const map = new Map<string, (typeof data)[number][number]>();
      data.flat().forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    },
    enabled: selectedScopeForLetters.length > 0,
  });

  const { data: membrosRes, isLoading: loadingMembers, isFetching: fetchingMembers } = useQuery({
    queryKey: ["cartas-dashboard-members", selectedScopeForLetters.join("|"), selectedChurchTotvs],
    queryFn: () =>
      listMembers({
        page: 1,
        page_size: 300,
        roles: ["pastor", "obreiro"],
        church_totvs_id: roleMode === "admin" && selectedChurchTotvs !== "all" ? selectedChurchTotvs : undefined,
      }),
    enabled: selectedScopeForLetters.length > 0,
  });

  const loadingPage =
    !effectiveScopeTotvsIds.length ||
    loadingMetrics ||
    loadingLetters ||
    loadingMembers ||
    (fetchingMetrics && !metrics) ||
    (fetchingLetters && !letters.length) ||
    (fetchingMembers && !membrosRes);

  useEffect(() => {
    if (!selectedScopeForLetters.length) return;

    const scopeSet = new Set(selectedScopeForLetters.map(String));
    const lettersKey = ["cartas-dashboard-letters", selectedScopeForLetters.join("|"), roleMode, selectedChurchTotvs, lettersPageSize] as const;
    const metricsKey = ["cartas-dashboard-metrics", selectedScopeForLetters.join("|")] as const;
    const membersKey = ["cartas-dashboard-members", selectedScopeForLetters.join("|"), selectedChurchTotvs] as const;
    const scopeKey = ["cartas-dashboard-scope", activeTotvsId, roleMode] as const;

    function isInScope(churchTotvsId: string) {
      return churchTotvsId ? scopeSet.has(churchTotvsId) : false;
    }

    function toRealtimeLetter(row: Record<string, unknown>) {
      return {
        id: String(row.id || ""),
        church_totvs_id: row.church_totvs_id ? String(row.church_totvs_id) : null,
        created_at: String(row.created_at || new Date().toISOString()),
        preacher_name: String(row.preacher_name || ""),
        preach_date: row.preach_date ? String(row.preach_date) : null,
        church_origin: row.church_origin ? String(row.church_origin) : null,
        church_destination: row.church_destination ? String(row.church_destination) : null,
        minister_role: row.minister_role ? String(row.minister_role) : null,
        status: String(row.status || ""),
        storage_path: row.storage_path ? String(row.storage_path) : null,
        url_carta: row.url_carta ? String(row.url_carta) : null,
        url_pronta: typeof row.url_pronta === "boolean" ? row.url_pronta : null,
        phone: row.phone ? String(row.phone) : null,
        block_reason: row.block_reason ? String(row.block_reason) : null,
        preacher_user_id: row.preacher_user_id ? String(row.preacher_user_id) : null,
      };
    }

    function upsertLetterCache(row: Record<string, unknown>) {
      const incoming = toRealtimeLetter(row);
      if (!incoming.id) return;
      queryClient.setQueryData(lettersKey, (current: unknown) => {
        const list = Array.isArray(current) ? [...current] : [];
        const idx = list.findIndex((item) => String((item as Record<string, unknown>)?.id || "") === incoming.id);
        if (idx >= 0) {
          list[idx] = { ...(list[idx] as Record<string, unknown>), ...incoming };
        } else {
          list.unshift(incoming);
        }
        list.sort((a, b) => String((b as Record<string, unknown>)?.created_at || "").localeCompare(String((a as Record<string, unknown>)?.created_at || "")));
        return list;
      });
    }

    function removeLetterCache(id: string) {
      if (!id) return;
      queryClient.setQueryData(lettersKey, (current: unknown) => {
        const list = Array.isArray(current) ? current : [];
        return list.filter((item) => String((item as Record<string, unknown>)?.id || "") !== id);
      });
    }

    const channel = supabaseRealtime
      .channel(`cartas-dashboard-letters-${roleMode}-${selectedScopeForLetters.join("-")}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "letters" },
        (payload) => {
          const row = ((payload.new || payload.old || {}) as Record<string, unknown>);
          const churchTotvsId = String(row.church_totvs_id || "").trim();
          const preacherUserId = String(row.preacher_user_id || "").trim();
          const inScope = isInScope(churchTotvsId);
          const isOwnPastorLetter = roleMode === "pastor" && preacherUserId === String(usuario?.id || "");
          if (!inScope && !isOwnPastorLetter) return;

          if (payload.eventType === "DELETE") {
            removeLetterCache(String(row.id || ""));
          } else {
            upsertLetterCache(row);
          }
          void queryClient.invalidateQueries({ queryKey: metricsKey });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        (payload) => {
          const row = ((payload.new || payload.old || {}) as Record<string, unknown>);
          const churchTotvsId = String(row.default_totvs_id || "").trim();
          if (!churchTotvsId || (!isInScope(churchTotvsId) && roleMode !== "admin")) return;
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: membersKey }),
            queryClient.invalidateQueries({ queryKey: metricsKey }),
          ]);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "churches" },
        (payload) => {
          const row = ((payload.new || payload.old || {}) as Record<string, unknown>);
          const churchTotvsId = String(row.totvs_id || "").trim();
          if (churchTotvsId && !isInScope(churchTotvsId) && roleMode !== "admin") return;
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: scopeKey }),
            queryClient.invalidateQueries({ queryKey: membersKey }),
          ]);
        },
      )
      .subscribe();

    return () => {
      void supabaseRealtime.removeChannel(channel);
    };
  }, [queryClient, roleMode, selectedScopeForLetters, selectedChurchTotvs, lettersPageSize, activeTotvsId, usuario?.id]);

  const obreiros = membrosRes?.workers || [];
  const phonesByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    obreiros.forEach((u) => {
      const id = String(u?.id || "");
      const phone = String(u?.phone || "");
      if (id && phone) map[id] = phone;
    });
    return map;
  }, [obreiros]);

  const phonesByName = useMemo(() => {
    const map: Record<string, string> = {};
    obreiros.forEach((u) => {
      const nome = String(u?.full_name || "").trim().toLowerCase();
      const phone = String(u?.phone || "");
      if (nome && phone) map[nome] = phone;
    });
    return map;
  }, [obreiros]);

  // Mapa de liberacao automatica por user_id para o CartasTab mostrar ON/OFF corretamente
  const autoReleaseByUserId = useMemo(() => {
    const map: Record<string, boolean> = {};
    obreiros.forEach((u) => {
      const id = String(u?.id || "");
      if (id) map[id] = Boolean(u?.can_create_released_letter);
    });
    return map;
  }, [obreiros]);

  const gradients = {
    total: "from-purple-600 to-purple-500",
    hoje: "from-sky-500 to-sky-400",
    seteDias: "from-amber-500 to-amber-400",
    membros: "from-slate-600 to-slate-500",
    liberadas: "from-emerald-600 to-emerald-500",
    bloqueadas: "from-rose-600 to-rose-500",
    aguardando: "from-violet-600 to-violet-500",
  };

  const lettersStats = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    let total = 0;
    let today = 0;
    let last7 = 0;

    for (const letter of letters) {
      const status = String(letter?.status || "").toUpperCase();
      if (status === "EXCLUIDA") continue;

      total += 1;

      const createdAt = String(letter?.created_at || "");
      const createdDate = createdAt ? new Date(createdAt) : null;
      const createdKey = createdAt ? createdAt.slice(0, 10) : "";

      if (createdKey === todayKey) today += 1;
      if (createdDate && !Number.isNaN(createdDate.getTime()) && createdDate >= sevenDaysAgo) last7 += 1;
    }

    return { total, today, last7 };
  }, [letters]);
  const canLoadMoreLetters = letters.length >= lettersPageSize;
  const statusStats = useMemo(() => {
    let liberadas = 0;
    let bloqueadas = 0;
    let aguardando = 0;
    for (const letter of letters) {
      const status = String(letter?.status || "").toUpperCase();
      if (status === "LIBERADA") liberadas += 1;
      if (status === "BLOQUEADO") bloqueadas += 1;
      if (status === "AGUARDANDO_LIBERACAO") aguardando += 1;
    }
    return { liberadas, bloqueadas, aguardando };
  }, [letters]);

  const useChurchFilteredKpi = roleMode === "admin" && selectedChurchTotvs !== "all";
  const totalCartas = useChurchFilteredKpi
    ? lettersStats.total
    : Number(metrics?.totalCartas || 0) > 0
      ? Number(metrics?.totalCartas || 0)
      : lettersStats.total;
  const cartasHoje = useChurchFilteredKpi
    ? lettersStats.today
    : Number(metrics?.cartasHoje || 0) > 0
      ? Number(metrics?.cartasHoje || 0)
      : lettersStats.today;
  const ultimos7Dias = useChurchFilteredKpi
    ? lettersStats.last7
    : Number(metrics?.ultimos7Dias || 0) > 0
      ? Number(metrics?.ultimos7Dias || 0)
      : lettersStats.last7;
  const totalMembros = useChurchFilteredKpi
    ? Number(membrosRes?.total || 0)
    : Number(metrics?.totalObreiros || 0);

  if (loadingPage) {
    return (
      <ManagementShell roleMode={roleMode as "admin" | "pastor"}>
        <PageLoading title="Carregando cartas" description="Buscando indicadores e historico..." />
      </ManagementShell>
    );
  }

  return (
    <ManagementShell roleMode={roleMode as "admin" | "pastor"}>
      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Cartas</h2>
            <p className="mt-1 text-base text-slate-600">Painel de cartas e historico por periodo.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {/* Comentario: botao para mostrar/recolher filtro no celular (apenas admin) */}
            {roleMode === "admin" ? (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm sm:hidden"
                onClick={() => setShowFiltersMobile((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                {showFiltersMobile ? "Recolher filtros" : "Filtros"}
              </button>
            ) : null}
            {/* Comentario: filtros de admin — escondidos no celular, visiveis em sm+ */}
            {roleMode === "admin" ? (
              <div className={`${showFiltersMobile ? "flex flex-col" : "hidden"} w-full gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center`}>
                {/* Filtro de igreja */}
                <Select value={selectedChurchTotvs} onValueChange={(v) => { setSelectedChurchTotvs(v); setFilterChurchClass("all"); setFilterChurchTotvsInput(""); }}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Filtrar por igreja" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as igrejas</SelectItem>
                    {churchesInScope.map((church) => (
                      <SelectItem key={church.totvs_id} value={String(church.totvs_id)}>
                        {church.totvs_id} - {church.church_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Filtros adicionais quando "Todas as igrejas" está selecionado */}
                {selectedChurchTotvs === "all" && (
                  <>
                    {/* Filtro por classe */}
                    <Select value={filterChurchClass} onValueChange={setFilterChurchClass}>
                      <SelectTrigger className="w-full sm:w-[160px]">
                        <SelectValue placeholder="Classe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as classes</SelectItem>
                        <SelectItem value="estadual">Estadual</SelectItem>
                        <SelectItem value="setorial">Setorial</SelectItem>
                        <SelectItem value="central">Central</SelectItem>
                        <SelectItem value="regional">Regional</SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Input para buscar por TOTVS — aguarda terminar de digitar para filtrar */}
                    <input
                      type="text"
                      placeholder="Buscar TOTVS..."
                      value={filterChurchTotvsInput}
                      onChange={(e) => setFilterChurchTotvsInput(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-[140px]"
                    />
                  </>
                )}
              </div>
            ) : null}
            <Button
              className="h-11 px-6 font-semibold text-white shadow-sm bg-blue-600 hover:bg-blue-700 border border-blue-700"
              onClick={() => nav("/carta/formulario")}
            >
              Fazer carta
            </Button>
          </div>
        </div>
      </section>

      {/* Comentario: 1 col no celular, 3 no tablet/desktop — "Total de membros" removido */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <KpiCard label="Total de cartas" value={totalCartas} icon={FileText} gradient={gradients.total} />
        <KpiCard label="Cartas hoje" value={cartasHoje} icon={CalendarDays} gradient={gradients.hoje} />
        <KpiCard label="Últimos 7 dias" value={ultimos7Dias} icon={LineChart} gradient={gradients.seteDias} />
      </section>
      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <KpiCard label="Cartas liberadas" value={statusStats.liberadas} icon={FileText} gradient={gradients.liberadas} />
        <KpiCard label="Cartas bloqueadas" value={statusStats.bloqueadas} icon={FileText} gradient={gradients.bloqueadas} />
        <KpiCard label="Aguardando liberação" value={statusStats.aguardando} icon={FileText} gradient={gradients.aguardando} />
      </section>

      <div className="mt-5">
        <CartasTab
          letters={letters}
          scopeTotvsIds={effectiveScopeTotvsIds}
          phonesByUserId={phonesByUserId}
          phonesByName={phonesByName}
          viewerRole={roleMode as "admin" | "pastor"}
          viewerUserId={String(usuario?.id || "")}
          allowScopeView={allowScopeView}
          autoReleaseByUserId={autoReleaseByUserId}
        />
        {canLoadMoreLetters ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              disabled={fetchingLetters}
              onClick={() => setLettersPageSize((prev) => prev + 100)}
            >
              {fetchingLetters ? "Carregando..." : "Carregar mais cartas"}
            </Button>
          </div>
        ) : null}
      </div>
    </ManagementShell>
  );
}
