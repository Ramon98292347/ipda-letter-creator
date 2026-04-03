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
  });
  const { data: membersData } = useQuery({
    queryKey: ["admin-dashboard-members-all"],
    queryFn: () => listMembers({ page: 1, page_size: 1000, roles: ["pastor", "obreiro"] }),
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
      {/* Comentario: padding maior em mobile, menor em desktop */}
      <div className="space-y-5 bg-[#F6F8FC] px-2 py-2 sm:px-1 sm:py-1">

        {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Dashboard Administrativo
          </h2>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            VisÃ£o geral das igrejas e dos membros da organizaÃ§Ã£o
          </p>
        </section>

        {/* â”€â”€ Membros â€” Total | Pastor | PresbÃ­tero | DiÃ¡cono | Cooperador | Membros Ativos â”€â”€ */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">Membros</h3>
          <p className="mt-1 text-sm text-slate-600">Indicadores por cargo ministerial.</p>
          {/* Comentario: 2 col no celular | 3 no md/lg | 6 no xl+ */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <StatCard title="Total de membros" value={memberCounters.total} subtitle="cadastros ativos" gradient="from-blue-600 to-blue-500" icon="users" />
            <StatCard title="Pastor" value={memberCounters.pastores} subtitle="cargo pastor" gradient="from-blue-700 to-blue-600" icon="users" />
            <StatCard title="PresbÃ­tero" value={memberCounters.presbiteros} subtitle="cargo presbÃ­tero" gradient="from-purple-600 to-purple-500" icon="users" />
            <StatCard title="DiÃ¡cono" value={memberCounters.diaconos} subtitle="cargo diÃ¡cono" gradient="from-emerald-600 to-emerald-500" icon="users" />
            <StatCard title="Cooperador" value={memberCounters.obreiros} subtitle="cargo cooperador" gradient="from-amber-500 to-amber-400" icon="users" />
            <StatCard title="Membros Ativos" value={memberCounters.membrosAtivos} subtitle="ministÃ©rio membro" gradient="from-slate-600 to-slate-500" icon="users" />
          </div>
        </section>

        {/* â”€â”€ Igrejas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">Igrejas</h3>
          <p className="mt-1 text-sm text-slate-600">Indicadores por classificaÃ§Ã£o.</p>
          {/* Comentario: 2 col no celular | 3 no tablet | 6 no desktop */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <StatCard title="Total" value={churchCounters.total} subtitle="igrejas cadastradas" gradient="from-purple-600 to-purple-500" />
            <StatCard title="Estadual" value={churchCounters.estadual} subtitle="classificaÃ§Ã£o estadual" gradient="from-blue-600 to-blue-500" />
            <StatCard title="Setorial" value={churchCounters.setorial} subtitle="classificaÃ§Ã£o setorial" gradient="from-amber-500 to-amber-400" />
            <StatCard title="Central" value={churchCounters.central} subtitle="classificaÃ§Ã£o central" gradient="from-orange-500 to-orange-400" />
            <StatCard title="Regional" value={churchCounters.regional} subtitle="classificaÃ§Ã£o regional" gradient="from-emerald-600 to-emerald-500" />
            <StatCard title="Local" value={churchCounters.local} subtitle="classificaÃ§Ã£o local" gradient="from-slate-600 to-slate-500" />
          </div>
        </section>

        {/* â”€â”€ RodapÃ© informativo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Card className="border border-slate-200 bg-white">
          <CardContent className="p-4 text-sm text-slate-600 sm:p-6">
            Use os menus <b>Membros</b> e <b>Igrejas</b> para gerenciar os cadastros do sistema.
            <div className="mt-3 flex items-center gap-2 text-slate-800">
              <Building2 className="h-4 w-4" />
              Total de igrejas: <b>{churchCounters.total}</b>
            </div>
          </CardContent>
        </Card>
      </div>
    </ManagementShell>
  );
}

