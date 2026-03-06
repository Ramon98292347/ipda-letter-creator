import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Church } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { AdminChurchesTab } from "@/components/admin/AdminChurchesTab";
import { listChurchesInScope } from "@/services/saasService";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageLoading } from "@/components/shared/PageLoading";

function KpiCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: number;
  subtitle: string;
  tone?: { bg: string; border: string; accent: string };
}) {
  const bg = tone?.bg || "#FFFFFF";
  const border = tone?.border || "#E5E7EB";
  const accent = tone?.accent || "#2563EB";

  return (
    <Card className="rounded-xl shadow-sm" style={{ backgroundColor: bg, borderColor: border }}>
      <CardContent className="border-l-4 p-5" style={{ borderLeftColor: accent }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <Church className="h-4 w-4" style={{ color: accent }} />
        </div>
        <p className="text-4xl font-extrabold tracking-tight text-slate-900">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// Comentario: pagina de igrejas com layout SaaS corporativo e cards de KPI neutros/suaves.
export default function PastorIgrejasPage() {
  const [filterTotvs, setFilterTotvs] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: allRows = [], isLoading, isFetching } = useQuery({
    queryKey: ["pastor-igrejas-page-all"],
    queryFn: () => listChurchesInScope(1, 1000),
  });

  const showPageLoading = isLoading || (isFetching && allRows.length === 0);

  const filteredRows = useMemo(() => {
    if (filterTotvs === "all") return allRows;

    const children = new Map<string, string[]>();
    for (const church of allRows) {
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

    return allRows.filter((church) => scope.has(String(church.totvs_id)));
  }, [allRows, filterTotvs]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = useMemo(() => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return filteredRows.slice(from, to);
  }, [filteredRows, page, pageSize]);

  const totals = useMemo(() => {
    return {
      total: filteredRows.length,
      estadual: filteredRows.filter((c) => String(c.church_class || "").toLowerCase() === "estadual").length,
      setorial: filteredRows.filter((c) => String(c.church_class || "").toLowerCase() === "setorial").length,
      central: filteredRows.filter((c) => String(c.church_class || "").toLowerCase() === "central").length,
      regional: filteredRows.filter((c) => String(c.church_class || "").toLowerCase() === "regional").length,
      local: filteredRows.filter((c) => String(c.church_class || "").toLowerCase() === "local").length,
    };
  }, [filteredRows]);

  const tone = {
    total: { bg: "#F5F3FF", border: "#DDD6FE", accent: "#7C3AED" },
    estadual: { bg: "#EFF6FF", border: "#BFDBFE", accent: "#2563EB" },
    setorial: { bg: "#FFFBEB", border: "#FDE68A", accent: "#CA8A04" },
    central: { bg: "#FFF7ED", border: "#FED7AA", accent: "#EA580C" },
    regional: { bg: "#ECFDF5", border: "#A7F3D0", accent: "#16A34A" },
    local: { bg: "#F9FAFB", border: "#E5E7EB", accent: "#6B7280" },
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
                {allRows.map((church) => (
                  <SelectItem key={church.totvs_id} value={String(church.totvs_id)}>
                    {church.totvs_id} - {church.church_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard title="Total" value={totals.total} subtitle="igrejas no escopo" tone={tone.total} />
          <KpiCard title="Estadual" value={totals.estadual} subtitle="classe estadual" tone={tone.estadual} />
          <KpiCard title="Setorial" value={totals.setorial} subtitle="classe setorial" tone={tone.setorial} />
          <KpiCard title="Central" value={totals.central} subtitle="classe central" tone={tone.central} />
          <KpiCard title="Regional" value={totals.regional} subtitle="classe regional" tone={tone.regional} />
          <KpiCard title="Local" value={totals.local} subtitle="classe local" tone={tone.local} />
        </section>

        <AdminChurchesTab
          roleMode="pastor"
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
