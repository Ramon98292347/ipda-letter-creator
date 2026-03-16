import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Church } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { AdminChurchesTab } from "@/components/admin/AdminChurchesTab";
import { listChurchesInScope, listChurchesInScopePaged } from "@/services/saasService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageLoading } from "@/components/shared/PageLoading";

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

// Comentario: pagina de igrejas para admin com filtro por igreja + filhas.
export default function AdminIgrejasPage() {
  const queryClient = useQueryClient();
  const [filterTotvs, setFilterTotvs] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: optionsRows = [] } = useQuery({
    queryKey: ["admin-igrejas-options"],
    queryFn: () => listChurchesInScope(1, 1000),
  });

  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: ["admin-igrejas-page", page, pageSize, filterTotvs],
    queryFn: () => listChurchesInScopePaged(page, pageSize, filterTotvs === "all" ? undefined : filterTotvs),
    staleTime: 30_000,
  });

  const rows = pageData?.churches || [];
  const total = Number(pageData?.total || 0);

  const showPageLoading = isLoading || (isFetching && rows.length === 0);

  const filteredRowsForCounters = useMemo(() => {
    if (filterTotvs === "all") return optionsRows;

    const children = new Map<string, string[]>();
    for (const church of optionsRows) {
      const parent = String(church.parent_totvs_id || "");
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(String(church.totvs_id));
    }

    const scope = new Set<string>();
    const queue = [String(filterTotvs)];
    while (queue.length) {
      const current = queue.shift()!;
      if (scope.has(current)) continue;
      scope.add(current);
      for (const child of children.get(current) || []) queue.push(child);
    }

    return optionsRows.filter((church) => scope.has(String(church.totvs_id)));
  }, [optionsRows, filterTotvs]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page >= totalPages) return;
    const nextPage = page + 1;
    void queryClient.prefetchQuery({
      queryKey: ["admin-igrejas-page", nextPage, pageSize, filterTotvs],
      queryFn: () => listChurchesInScopePaged(nextPage, pageSize, filterTotvs === "all" ? undefined : filterTotvs),
      staleTime: 30_000,
    });
  }, [page, totalPages, pageSize, filterTotvs, queryClient]);

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
    <ManagementShell roleMode="admin">
      {showPageLoading ? (
        <PageLoading title="Carregando igrejas" description="Buscando dados das igrejas do seu escopo..." />
      ) : (
        <div className="space-y-5 bg-[#F6F8FC] p-1">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Igrejas</h2>
          <p className="mt-1 text-base text-slate-600">Administre as igrejas do sistema</p>
          <div className="mt-4 max-w-md">
            <Select
              value={filterTotvs}
              onValueChange={(value) => {
                setFilterTotvs(value);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por igreja e filhas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas no escopo</SelectItem>
                {optionsRows.map((church) => (
                  <SelectItem key={church.totvs_id} value={String(church.totvs_id)}>
                    {church.totvs_id} - {church.church_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <IgrejaStat title="Total" value={totals.total} subtitle="igrejas no escopo" gradient={gradients.total} />
          <IgrejaStat title="Estadual" value={totals.estadual} subtitle="classe estadual" gradient={gradients.estadual} />
          <IgrejaStat title="Setorial" value={totals.setorial} subtitle="classe setorial" gradient={gradients.setorial} />
          <IgrejaStat title="Central" value={totals.central} subtitle="classe central" gradient={gradients.central} />
          <IgrejaStat title="Regional" value={totals.regional} subtitle="classe regional" gradient={gradients.regional} />
          <IgrejaStat title="Local" value={totals.local} subtitle="classe local" gradient={gradients.local} />
        </section>

        <AdminChurchesTab
          roleMode="admin"
          rows={rows}
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
