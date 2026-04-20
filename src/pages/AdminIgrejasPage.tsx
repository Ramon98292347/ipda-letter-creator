import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Church } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { AdminChurchesTab } from "@/components/admin/AdminChurchesTab";
import { listChurchesInScope, listChurchesInScopePaged } from "@/services/saasService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PageLoading } from "@/components/shared/PageLoading";
import { MobileFiltersCard } from "@/components/shared/MobileFiltersCard";
import { useUser } from "@/context/UserContext";
import { useDebounce } from "@/hooks/useDebounce";

function IgrejaStat({
  title,
  value,
  subtitle,
  gradient,
}: {
  title: string;
  value: number;
  subtitle: string;
  gradient: string;
}) {
  return (
    <div className={`rounded-xl shadow-md bg-gradient-to-br ${gradient} p-5`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white/80">{title}</p>
        <Church className="h-4 w-4 text-white/70" />
      </div>
      <p className="text-4xl font-extrabold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-white/70">{subtitle}</p>
    </div>
  );
}

// Comentario: pagina de igrejas para admin com filtros de busca por nome/TOTVS e classificacao.
export default function AdminIgrejasPage() {
  const queryClient = useQueryClient();
  const { session, usuario } = useUser();
  // Comentario: para admin, mostrar TODAS as igrejas do banco (sem filtro de escopo)
  // Para pastor, limitar ao escopo da igreja logada
  const roleLower = String(usuario?.role || "").toLowerCase();
  const activeTotvsId = roleLower === "admin" ? "" : String(session?.totvs_id || "");
  const [filterNome, setFilterNome] = useState("");
  // Comentario: debounce de 400ms evita recalcular o filtro a cada tecla pressionada.
  const debouncedNome = useDebounce(filterNome, 400);
  const [filterClasse, setFilterClasse] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Comentario: para admin, activeTotvsId eh vazio (mostra todas as igrejas)
  // Para pastor, activeTotvsId eh a church logada
  const isAdmin = roleLower === "admin";

  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: ["admin-igrejas-page", page, pageSize, activeTotvsId],
    queryFn: () => listChurchesInScopePaged(page, pageSize, activeTotvsId || undefined),
    enabled: isAdmin || Boolean(activeTotvsId),
  });

  const rows = pageData?.churches || [];
  const total = Number(pageData?.total || 0);
  // Comentario: para admin, usa o total oficial da API paginada para alinhar
  // os cards com o Dashboard (mesma fonte de verdade).
  const optionsFetchSize = isAdmin ? Math.max(5000, total || 0) : 5000;

  const { data: optionsRows = [], isLoading: loadingOptions, isFetching: fetchingOptions } = useQuery({
    queryKey: ["admin-igrejas-options", activeTotvsId, optionsFetchSize],
    queryFn: () => listChurchesInScope(1, optionsFetchSize, activeTotvsId || undefined),
    enabled: (isAdmin || Boolean(activeTotvsId)) && optionsFetchSize > 0,
  });

  const showPageLoading =
    isLoading ||
    (isFetching && rows.length === 0) ||
    (loadingOptions && optionsRows.length === 0) ||
    (fetchingOptions && optionsRows.length === 0);

  // Comentario: sem filterTotvs, os contadores usam sempre todas as igrejas do escopo.
  const filteredRowsForCounters = optionsRows;

  // Comentario: usa debouncedNome para nao reprocessar o filtro a cada tecla.
  const hasClientFilter = debouncedNome.trim().length >= 2 || filterClasse !== "all";

  const clientFilteredRows = useMemo(() => {
    if (!hasClientFilter) return null;
    let result = filteredRowsForCounters;
    if (debouncedNome.trim().length >= 2) {
      const q = debouncedNome.trim().toLowerCase();
      result = result.filter(
        (c) =>
          String(c.church_name || "").toLowerCase().includes(q) ||
          String(c.totvs_id || "").includes(debouncedNome.trim()),
      );
    }
    if (filterClasse !== "all") {
      result = result.filter((c) => String(c.church_class || "").toLowerCase() === filterClasse);
    }
    return result;
  }, [filteredRowsForCounters, debouncedNome, filterClasse, hasClientFilter]);

  const effectiveTotal = hasClientFilter ? (clientFilteredRows?.length ?? 0) : total;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const effectiveRows = hasClientFilter
    ? (clientFilteredRows ?? []).slice((page - 1) * pageSize, page * pageSize)
    : rows;

  useEffect(() => {
    if (page >= totalPages) return;
    const nextPage = page + 1;
    void queryClient.prefetchQuery({
      queryKey: ["admin-igrejas-page", nextPage, pageSize, activeTotvsId],
      queryFn: () => listChurchesInScopePaged(nextPage, pageSize, activeTotvsId || undefined),
    });
  }, [page, totalPages, pageSize, activeTotvsId, queryClient]);

  const totals = useMemo(() => {
    const totalForCard = hasClientFilter ? (clientFilteredRows?.length ?? 0) : Number(total || filteredRowsForCounters.length || 0);
    const source = hasClientFilter ? (clientFilteredRows ?? []) : filteredRowsForCounters;
    return {
      total: totalForCard,
      estadual: source.filter((c) => String(c.church_class || "").toLowerCase() === "estadual").length,
      setorial: source.filter((c) => String(c.church_class || "").toLowerCase() === "setorial").length,
      central: source.filter((c) => String(c.church_class || "").toLowerCase() === "central").length,
      regional: source.filter((c) => String(c.church_class || "").toLowerCase() === "regional").length,
      local: source.filter((c) => String(c.church_class || "").toLowerCase() === "local").length,
      casa_oracao: source.filter((c) => String(c.church_class || "").toLowerCase() === "casa_oracao").length,
    };
  }, [hasClientFilter, clientFilteredRows, total, filteredRowsForCounters]);

  const gradients = {
    total: "from-purple-600 to-purple-500",
    estadual: "from-blue-600 to-blue-500",
    setorial: "from-amber-500 to-amber-400",
    central: "from-orange-500 to-orange-400",
    regional: "from-emerald-600 to-emerald-500",
    local: "from-slate-600 to-slate-500",
    casa_oracao: "from-zinc-700 to-zinc-600",
  };

  return (
    <ManagementShell roleMode="admin">
      {showPageLoading ? (
        <PageLoading title="Carregando igrejas" description="Buscando dados das igrejas..." />
      ) : (
        <div className="space-y-5 bg-[#F6F8FC] p-1">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Igrejas</h2>
          <p className="mt-1 text-base text-slate-600">Administre as igrejas do sistema</p>
          <div className="mt-4 max-w-3xl">
            <MobileFiltersCard
              title="Filtros de igrejas"
              description="Busque por nome, TOTVS ou classificação."
              defaultOpenMobile={false}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={filterNome}
                  onChange={(e) => { setFilterNome(e.target.value); setPage(1); }}
                  placeholder="Buscar por nome ou TOTVS (min. 2 caracteres)..."
                />
                <Select value={filterClasse} onValueChange={(v) => { setFilterClasse(v); setPage(1); }}>
                  <SelectTrigger><SelectValue placeholder="Todas as classificacoes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as classificacoes</SelectItem>
                    <SelectItem value="estadual">Estadual</SelectItem>
                    <SelectItem value="setorial">Setorial</SelectItem>
                    <SelectItem value="central">Central</SelectItem>
                    <SelectItem value="regional">Regional</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="casa_oracao">Casa de oração</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(debouncedNome.trim().length > 0 || filterClasse !== "all") && (
                <p className="text-xs text-slate-500">
                  {effectiveTotal} resultado{effectiveTotal !== 1 ? "s" : ""} encontrado{effectiveTotal !== 1 ? "s" : ""}
                  {" "}<button className="text-blue-600 hover:underline" onClick={() => { setFilterNome(""); setFilterClasse("all"); setPage(1); }}>Limpar filtros</button>
                </p>
              )}
            </MobileFiltersCard>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7">
          <IgrejaStat title="Total" value={totals.total} subtitle="total de igrejas" gradient={gradients.total} />
          <IgrejaStat title="Estadual" value={totals.estadual} subtitle="classe estadual" gradient={gradients.estadual} />
          <IgrejaStat title="Setorial" value={totals.setorial} subtitle="classe setorial" gradient={gradients.setorial} />
          <IgrejaStat title="Central" value={totals.central} subtitle="classe central" gradient={gradients.central} />
          <IgrejaStat title="Regional" value={totals.regional} subtitle="classe regional" gradient={gradients.regional} />
          <IgrejaStat title="Local" value={totals.local} subtitle="classe local" gradient={gradients.local} />
          <div className="col-span-2 md:col-span-1">
            <IgrejaStat title="Casa de oração" value={totals.casa_oracao} subtitle="classe casa de oração" gradient={gradients.casa_oracao} />
          </div>
        </section>

        <AdminChurchesTab
          roleMode="admin"
          rows={effectiveRows}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
        </div>
      )}
    </ManagementShell>
  );
}
