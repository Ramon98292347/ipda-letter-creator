import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Church, Users } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Card, CardContent } from "@/components/ui/card";
import { listChurchesInScopePaged, listMembers } from "@/services/saasService";

function StatCard({
  title,
  value,
  subtitle,
  gradient,
  icon = "church",
}: {
  title: string;
  value: number;
  subtitle: string;
  gradient: string;
  icon?: "church" | "users";
}) {
  return (
    <Card className={`rounded-xl shadow-md bg-gradient-to-br ${gradient}`}>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white/80">{title}</p>
          {icon === "users" ? (
            <Users className="h-5 w-5 text-white/70" />
          ) : (
            <Church className="h-5 w-5 text-white/70" />
          )}
        </div>
        <p className="text-4xl font-extrabold tracking-tight text-white">{value}</p>
        <p className="mt-1 text-xs text-white/70">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// Comentario: dashboard administrativo com indicadores de membros por cargo e igrejas por classificacao.
export default function AdminDashboardPage() {
  const { data } = useQuery({
    queryKey: ["admin-dashboard-churches"],
    queryFn: () => listChurchesInScopePaged(1, 1000),
    refetchInterval: 10000,
  });
  const { data: membersData } = useQuery({
    queryKey: ["admin-dashboard-members-all"],
    queryFn: () => listMembers({ page: 1, page_size: 1000, roles: ["pastor", "obreiro"] }),
    refetchInterval: 10000,
  });

  const churches = data?.churches || [];
  const members = membersData?.workers || [];
  const totalIgrejasEscopo = Number(data?.total || churches.length || 0);

  const churchCounters = useMemo(() => {
    return {
      total: totalIgrejasEscopo,
      estadual: churches.filter((c) => String(c.church_class || "").toLowerCase() === "estadual").length,
      setorial: churches.filter((c) => String(c.church_class || "").toLowerCase() === "setorial").length,
      central: churches.filter((c) => String(c.church_class || "").toLowerCase() === "central").length,
      regional: churches.filter((c) => String(c.church_class || "").toLowerCase() === "regional").length,
      local: churches.filter((c) => String(c.church_class || "").toLowerCase() === "local").length,
    };
  }, [churches, totalIgrejasEscopo]);

  const memberCounters = useMemo(() => {
    const normalized = members.map((m) => ({
      role: String(m.role || "").toLowerCase(),
      minister_role: String(m.minister_role || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
      is_active: m.is_active !== false,
    }));

    return {
      total: normalized.length,
      pastores: normalized.filter((m) => m.role === "pastor" || m.minister_role === "pastor").length,
      obreiros: normalized.filter((m) => m.minister_role === "cooperador").length,
      presbiteros: normalized.filter((m) => m.minister_role === "presbitero").length,
      diaconos: normalized.filter((m) => m.minister_role === "diacono").length,
      membrosAtivos: normalized.filter((m) => m.minister_role === "membro" && m.is_active).length,
    };
  }, [members]);

  return (
    <ManagementShell roleMode="admin">
      <div className="space-y-5 bg-[#F6F8FC] p-1">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Dashboard Administrativo</h2>
          <p className="mt-1 text-base text-slate-600">Visao geral das igrejas e dos membros da organizacao</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-2xl font-bold text-slate-900">Membros</h3>
          <p className="mt-1 text-sm text-slate-600">Indicadores de membros e cargos ministeriais.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard title="Total de membros" value={memberCounters.total} subtitle="membros no escopo" gradient="from-blue-600 to-blue-500" icon="users" />
            <StatCard title="Pastores" value={memberCounters.pastores} subtitle="cargo pastor" gradient="from-blue-600 to-blue-500" icon="users" />
            <StatCard title="Cooperador" value={memberCounters.obreiros} subtitle="cargo cooperador" gradient="from-amber-500 to-amber-400" icon="users" />
            <StatCard title="Presbiteros" value={memberCounters.presbiteros} subtitle="cargo presbitero" gradient="from-purple-600 to-purple-500" icon="users" />
            <StatCard title="Diaconos" value={memberCounters.diaconos} subtitle="cargo diacono" gradient="from-emerald-600 to-emerald-500" icon="users" />
            <StatCard title="Membros ativos" value={memberCounters.membrosAtivos} subtitle="ministerio membro" gradient="from-slate-600 to-slate-500" icon="users" />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Total de igrejas" value={churchCounters.total} subtitle="igrejas cadastradas" gradient="from-purple-600 to-purple-500" />
          <StatCard title="Estadual" value={churchCounters.estadual} subtitle="classificacao estadual" gradient="from-blue-600 to-blue-500" />
          <StatCard title="Setorial" value={churchCounters.setorial} subtitle="classificacao setorial" gradient="from-amber-500 to-amber-400" />
          <StatCard title="Central" value={churchCounters.central} subtitle="classificacao central" gradient="from-orange-500 to-orange-400" />
          <StatCard title="Regional" value={churchCounters.regional} subtitle="classificacao regional" gradient="from-emerald-600 to-emerald-500" />
          <StatCard title="Local" value={churchCounters.local} subtitle="classificacao local" gradient="from-slate-600 to-slate-500" />
        </section>

        <Card className="border border-slate-200 bg-white">
          <CardContent className="text-sm text-slate-600">
            Use os menus <b>Membros</b> e <b>Igrejas</b> para gerenciar os cadastros do sistema.
            <div className="mt-3 flex items-center gap-2 text-slate-800">
              <Building2 className="h-4 w-4" />
              Total de igrejas no escopo atual: <b>{churchCounters.total}</b>
            </div>
          </CardContent>
        </Card>
      </div>
    </ManagementShell>
  );
}
