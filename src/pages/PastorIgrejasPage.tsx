import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Church } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { AdminChurchesTab } from "@/components/admin/AdminChurchesTab";
import { listChurchesInScope, listChurchesInScopePaged } from "@/services/saasService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PageLoading } from "@/components/shared/PageLoading";
import { useUser } from "@/context/UserContext";
import { useDebounce } from "@/hooks/useDebounce";

function KpiCard({
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

// Comentario: pagina de igrejas para pastor com filtros de busca por nome/TOTVS e classificacao.
export default function PastorIgrejasPage() {
  const queryClient = useQueryClient();
  const { session } = useUser();
  // Comentario: activeTotvsId limita o escopo ao mesmo que o dashboard usa,
  // evitando mostrar igrejas fora do escopo da igreja logada.
  const activeTotvsId = String(session?.totvs_id || "");
  const [filterNome, setFilterNome] = useState("");
  // Comentario: debounce de 400ms evita recalcular o filtro a cada tecla pressionada.
  const debouncedNome = useDebounce(filterNome, 400);
  const [filterClasse, setFilterClasse] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: optionsRows = [] } = useQuery({
    queryKey: ["pastor-igrejas-options", activeTotvsId],
    queryFn: () => listChurchesInScope(1, 5000, activeTotvsId || undefined),
    enabled: Boolean(activeTotvsId),
    refetchInterval: 10000,
  });

  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: ["pastor-igrejas-page", page, pageSize, activeTotvsId],
    queryFn: () => listChurchesInScopePaged(page, pageSize, activeTotvsId || undefined),
    enabled: Boolean(activeTotvsId),
    staleTime: 30_000,
    refetchInterval: 10000,
  });

  const rows = pageData?.churches || [];
  const total = Number(pageData?.total || 0);

  const showPageLoading = isLoading || (isFetching && rows.length === 0);

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
      queryKey: ["pastor-igrejas-page", nextPage, pageSize, activeTotvsId],
      queryFn: () => listChurchesInScopePaged(nextPage, pageSize, activeTotvsId || undefined),
      staleTime: 30_000,
    });
  }, [page, totalPages, pageSize, activeTotvsId, queryClient]);

  const totals = useMemo(() => {
    return {
      total: filteredRowsForCounters.length,
      estadual: filteredRowsForCounters.filter((c) => String(c.church_class || "").toLowerCase() === "estadual").length,
      setorial: filteredRowsForCounters.filter((c) => String(c.church_class || "").toLowerCase() === "setorial").length,
      central: filteredRowsForCounters.filter((c) => String(c.church_class || "").toLowerCase() === "central").length,
      regional: filteredRowsForCounters.filter((c) => String(c.church_class || "").toLowerCase() === "regional").length,
      local: filteredRowsForCounters.filter((c) => String(c.church_class || "").toLowerCase() === "local").length,
    };
  }, [filteredRowsForCounters]);

  const gradients = {
    total: "from-purple-600 to-purple-500",
    estadual: "from-blue-600 to-blue-500",
    setorial: "from-amber-500 to-amber-400",
    central: "from-orange-500 to-orange-400",
    regional: "from-emerald-600 to-emerald-500",
    local: "from-slate-600 to-slate-500",
  };

  return (
    <ManagementShell roleMode="pastor">
      {showPageLoading ? (
        <PageLoading title="Carregando igrejas" description="Buscando dados das igrejas do seu escopo..." />
      ) : (
        <div className="space-y-5 bg-[#F6F8FC] p-1">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Igrejas</h2>
          <p className="mt-1 text-base text-slate-600">Gerencie as igrejas da sua regiao com visualizacao em lista ou grade.</p>
          {/* Comentario: filtros de busca por nome/TOTVS e classificacao ficam no header para economia de espaco */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 max-w-2xl">
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
              </SelectContent>
            </Select>
          </div>
          {/* Comentario: exibe contagem de resultados e botao para limpar filtros quando algum esta ativo */}
          {(debouncedNome.trim().length > 0 || filterClasse !== "all") && (
            <p className="mt-2 text-xs text-slate-500">
              {effectiveTotal} resultado{effectiveTotal !== 1 ? "s" : ""} encontrado{effectiveTotal !== 1 ? "s" : ""}
              {" "}<button className="text-blue-600 hover:underline" onClick={() => { setFilterNome(""); setFilterClasse("all"); setPage(1); }}>Limpar filtros</button>
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Total" value={totals.total} subtitle="igrejas no escopo" gradient={gradients.total} />
          <KpiCard title="Estadual" value={totals.estadual} subtitle="classe estadual" gradient={gradients.estadual} />
          <KpiCard title="Setorial" value={totals.setorial} subtitle="classe setorial" gradient={gradients.setorial} />
          <KpiCard title="Central" value={totals.central} subtitle="classe central" gradient={gradients.central} />
          <KpiCard title="Regional" value={totals.regional} subtitle="classe regional" gradient={gradients.regional} />
          <KpiCard title="Local" value={totals.local} subtitle="classe local" gradient={gradients.local} />
        </section>

        <AdminChurchesTab
          roleMode="pastor"
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
