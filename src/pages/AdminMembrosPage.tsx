import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { ObreirosTab } from "@/components/admin/ObreirosTab";
import { MinisterialAttendanceTab } from "@/components/admin/MinisterialAttendanceTab";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listChurchesInScope, listMembers } from "@/services/saasService";
import { PageLoading } from "@/components/shared/PageLoading";
import { MobileFiltersCard } from "@/components/shared/MobileFiltersCard";
import { useUser } from "@/context/UserContext";
import { useDebounce } from "@/hooks/useDebounce";

function normalizeMinisterRole(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function MiniCard({
  title,
  value,
  subtitle,
  gradient,
  onClick,
  active,
}: {
  title: string;
  value: number;
  subtitle: string;
  gradient: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div className={`${gradient} rounded-xl p-5 shadow-md ${onClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""} ${active ? "ring-2 ring-white ring-offset-2" : ""}`} onClick={onClick}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold text-white/80">{title}</p>
        <Users className="h-4 w-4 text-white/70" />
      </div>
      <p className="text-4xl font-extrabold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-white/70">{subtitle}</p>
    </div>
  );
}

// Comentario: pagina de membros para admin com combobox de busca de igreja e filtro por cargo.
export default function AdminMembrosPage() {
  const { session } = useUser();
  // Comentario: activeTotvsId limita o escopo ao da igreja logada, igual ao dashboard.
  const activeTotvsId = String(session?.totvs_id || "");

  const [selectedChurchTotvs, setSelectedChurchTotvs] = useState("");

  // Comentario: searchChurch e o texto digitado no combobox de busca de igreja.
  const [searchChurch, setSearchChurch] = useState("");
  const debouncedSearch = useDebounce(searchChurch, 400);

  // Comentario: filterCargo controla o Select de cargo (pastor, presbitero, etc).
  const [filterCargo, setFilterCargo] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");

  // Comentario: showChurchList controla se o dropdown de opcoes de igrejas esta visivel.
  const [showChurchList, setShowChurchList] = useState(false);
  const [section, setSection] = useState<"membros" | "presenca">("membros");
  // Comentario: filtro de ativos/inativos — undefined = todos, false = so inativos
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);

  const { data: churches = [], isLoading: loadingChurches, isFetching: fetchingChurches } = useQuery({
    queryKey: ["admin-membros-churches", activeTotvsId],
    queryFn: () => listChurchesInScope(1, 400, activeTotvsId || undefined),
    enabled: Boolean(activeTotvsId),
  });

  // Comentario: filtra a lista de igrejas pelo texto digitado (2+ chars) para o combobox de busca.
  const filteredChurches = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (q.length < 2) return churches.slice(0, 10); // mostra as 10 primeiras quando vazio
    return churches
      .filter(
        (c) =>
          String(c.church_name || "").toLowerCase().includes(q) ||
          String(c.totvs_id || "").includes(debouncedSearch.trim()),
      )
      .slice(0, 20);
  }, [churches, debouncedSearch]);

  const selectedChurch = useMemo(
    () => churches.find((church) => String(church.totvs_id || "") === selectedChurchTotvs) || null,
    [churches, selectedChurchTotvs],
  );

  const { data: membersRes, isLoading: loadingMembers, isFetching: fetchingMembers } = useQuery({
    queryKey: ["admin-membros-kpi", selectedChurchTotvs, filterCargo],
    queryFn: () =>
      listMembers({
        // Comentario: quando filtrando por cargo especifico de pastor, usa roles=["pastor"],
        // para outros cargos usa roles=["pastor","obreiro"] para pegar todos os ministeriais.
        // Comentario: todos = todos os roles; pastor = filtra por role; demais = filtra por minister_role
        roles: filterCargo === "all"
          ? ["pastor", "obreiro", "secretario", "financeiro"]
          : filterCargo === "pastor"
          ? ["pastor"]
          : ["pastor", "obreiro"],
        minister_role: filterCargo !== "all" && filterCargo !== "pastor" ? filterCargo : undefined,
        church_totvs_id: selectedChurchTotvs || undefined,
        page: 1,
        // Comentario: page_size=1 basta para trazer as metricas do backend, sem lista grande.
        page_size: 1,
      }),
    // Comentario: enabled=true permite buscar mesmo sem igreja selecionada (todas as igrejas do escopo).
    enabled: true,
  });

  // Comentario: busca contagem de membros inativos para exibir no card
  const { data: inativosData } = useQuery({
    queryKey: ["admin-membros-inativos-count", selectedChurchTotvs],
    queryFn: () =>
      listMembers({
        page: 1,
        page_size: 1,
        roles: ["pastor", "obreiro", "secretario", "financeiro"],
        church_totvs_id: selectedChurchTotvs || undefined,
        is_active: false,
      }),
    staleTime: 60_000,
  });
  const inativosCount = Number(inativosData?.total || 0);

  const showPageLoading =
    loadingChurches ||
    (fetchingChurches && churches.length === 0) ||
    (Boolean(selectedChurchTotvs) && loadingMembers && !membersRes) ||
    (fetchingMembers && !membersRes && Boolean(selectedChurchTotvs));

  const counters = useMemo(() => {
    const metrics = membersRes?.metrics;
    if (metrics) {
      return {
        total: Number(membersRes?.total || metrics.total || 0),
        pastor: Number(metrics.pastor || 0),
        presbitero: Number(metrics.presbitero || 0),
        diacono: Number(metrics.diacono || 0),
        obreiro: Number(metrics.cooperador || 0),
        membrosAtivos: Number(metrics.membro || 0),
      };
    }

    const workers = membersRes?.workers || [];
    return {
      total: workers.length,
      pastor: workers.filter((w) => w.role === "pastor").length,
      presbitero: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "presbitero").length,
      diacono: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "diacono").length,
      obreiro: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "cooperador").length,
      membrosAtivos: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "membro" && w.is_active !== false).length,
    };
  }, [membersRes]);

  const memberTone = {
    total: "bg-gradient-to-br from-blue-600 to-blue-500",
    pastor: "bg-gradient-to-br from-blue-500 to-blue-400",
    presbitero: "bg-gradient-to-br from-purple-600 to-purple-500",
    diacono: "bg-gradient-to-br from-emerald-600 to-emerald-500",
    obreiro: "bg-gradient-to-br from-amber-500 to-amber-400",
    ativo: "bg-gradient-to-br from-slate-600 to-slate-500",
    inativos: "bg-gradient-to-br from-red-600 to-red-500",
  };

  return (
    <ManagementShell roleMode="admin">
      {showPageLoading ? (
        <PageLoading title="Carregando membros" description="Buscando membros e indicadores da igreja..." />
      ) : (
        <div className="space-y-5 bg-[#F6F8FC] p-1">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Membros</h2>
          <p className="mt-1 text-base text-slate-600">Visualize os membros por igreja e cadastre pastores/obreiros.</p>
          <div className="mt-4 max-w-3xl">
            <MobileFiltersCard
              title="Filtros de membros"
              description="Escolha a igreja e o cargo que deseja visualizar."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Buscar nome/cpf..."
                />

                <div className="relative">
                  <Input
                    value={searchChurch}
                    onChange={(e) => { setSearchChurch(e.target.value); setShowChurchList(true); }}
                    onFocus={() => setShowChurchList(true)}
                    onBlur={() => setTimeout(() => setShowChurchList(false), 200)}
                    placeholder="Buscar igreja por nome ou TOTVS..."
                  />
                  {selectedChurch && !showChurchList && (
                    <p className="mt-1 text-xs text-slate-500">
                      Igreja: <span className="font-medium">{selectedChurch.church_name}</span>
                      {" "}<button className="text-blue-600 hover:underline" onClick={() => { setSelectedChurchTotvs(""); setSearchChurch(""); }}>Todas</button>
                    </p>
                  )}
                  {showChurchList && (
                    <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      <button
                        className="w-full border-b px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50"
                        onMouseDown={() => { setSelectedChurchTotvs(""); setSearchChurch(""); setShowChurchList(false); }}
                      >
                        Todas as igrejas
                      </button>
                      {filteredChurches.map((church) => (
                        <button
                          key={church.totvs_id}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onMouseDown={() => {
                            setSelectedChurchTotvs(String(church.totvs_id));
                            setSearchChurch(`${church.totvs_id} - ${church.church_name}`);
                            setShowChurchList(false);
                          }}
                        >
                          <span className="font-mono text-xs text-slate-400">{church.totvs_id}</span>{" "}
                          {church.church_name}
                        </button>
                      ))}
                      {debouncedSearch.trim().length >= 2 && filteredChurches.length === 0 && (
                        <p className="px-3 py-2 text-sm text-slate-400">Nenhuma igreja encontrada.</p>
                      )}
                    </div>
                  )}
                </div>

                <Select value={filterCargo} onValueChange={setFilterCargo}>
                  <SelectTrigger><SelectValue placeholder="Todos os cargos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os cargos</SelectItem>
                    <SelectItem value="pastor">Pastor</SelectItem>
                    <SelectItem value="presbitero">Presbítero</SelectItem>
                    <SelectItem value="diacono">Diácono</SelectItem>
                    <SelectItem value="cooperador">Cooperador</SelectItem>
                    <SelectItem value="membro">Membro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </MobileFiltersCard>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
          <MiniCard title="Total de membros" value={counters.total} subtitle="cadastros na igreja" gradient={memberTone.total} />
          <MiniCard title="Pastor" value={counters.pastor} subtitle="cargo pastor" gradient={memberTone.pastor} />
          <MiniCard title="Presbítero" value={counters.presbitero} subtitle="cargo presbítero" gradient={memberTone.presbitero} />
          <MiniCard title="Diácono" value={counters.diacono} subtitle="cargo diácono" gradient={memberTone.diacono} />
          <MiniCard title="Cooperador" value={counters.obreiro} subtitle="cargo cooperador" gradient={memberTone.obreiro} />
          <MiniCard title="Membros ativos" value={counters.membrosAtivos} subtitle="ministério membro" gradient={memberTone.ativo} />
          {/* Comentario: card clicavel — ao clicar mostra so os inativos na tabela */}
          <div className="col-span-2 md:col-span-1">
            <MiniCard
              title="Inativos"
              value={inativosCount}
              subtitle="membros inativos"
              gradient={memberTone.inativos}
              active={filterActive === false}
              onClick={() => {
                if (filterActive === false) {
                  setFilterActive(undefined);
                } else {
                  setFilterActive(false);
                }
              }}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex w-full gap-2 overflow-x-auto">
            <Button
              className="rounded-none border-b-2 border-transparent px-2"
              variant="ghost"
              style={{ borderBottomColor: section === "membros" ? "#2563EB" : "transparent", color: section === "membros" ? "#2563EB" : "#6B7280" }}
              onClick={() => setSection("membros")}
            >
              Lista de membros
            </Button>
            <Button
              className="rounded-none border-b-2 border-transparent px-2"
              variant="ghost"
              style={{ borderBottomColor: section === "presenca" ? "#2563EB" : "transparent", color: section === "presenca" ? "#2563EB" : "#6B7280" }}
              onClick={() => setSection("presenca")}
            >
              Presença
            </Button>
          </div>
        </section>

        {section === "membros" ? (
          <ObreirosTab
            activeTotvsId={selectedChurchTotvs}
            forceSingleChurchFilter
            filterMinisterRole={filterCargo !== "all" ? filterCargo : undefined}
            initialActiveFilter={filterActive === false ? "inactive" : "all"}
            externalSearch={memberSearch}
            onExternalSearchChange={setMemberSearch}
            hideInternalSearch
          />
        ) : null}

        {section === "presenca" ? (
          <MinisterialAttendanceTab
            activeTotvsId={activeTotvsId}
            initialChurchTotvsId={selectedChurchTotvs || activeTotvsId}
          />
        ) : null}
        </div>
      )}
    </ManagementShell>
  );
}

