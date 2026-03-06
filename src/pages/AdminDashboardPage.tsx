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
  tone,
  icon = "church",
}: {
  title: string;
  value: number;
  subtitle: string;
  tone?: { bg: string; border: string; accent: string };
  icon?: "church" | "users";
}) {
  const bg = tone?.bg || "#FFFFFF";
  const border = tone?.border || "#E5E7EB";
  const accent = tone?.accent || "#2563EB";

  return (
    <Card className="rounded-xl border shadow-sm" style={{ backgroundColor: bg, borderColor: border }}>
      <CardContent className="border-l-4 p-5" style={{ borderLeftColor: accent }}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          {icon === "users" ? <Users className="h-4 w-4" style={{ color: accent }} /> : <Church className="h-4 w-4" style={{ color: accent }} />}
        </div>
        <p className="text-4xl font-extrabold tracking-tight text-slate-900">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
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
      minister_role: String(m.minister_role || "").toLowerCase(),
      is_active: m.is_active !== false,
    }));

    return {
      total: normalized.length,
      pastores: normalized.filter((m) => m.role === "pastor" || m.minister_role === "pastor").length,
      obreiros: normalized.filter((m) => m.role === "obreiro" || m.minister_role === "obreiro").length,
      presbiteros: normalized.filter((m) => m.minister_role === "presbitero").length,
      diaconos: normalized.filter((m) => m.minister_role === "diacono").length,
      membrosAtivos: normalized.filter((m) => m.minister_role === "membro" && m.is_active).length,
    };
  }, [members]);

  const churchTone = {
    total: { bg: "#F5F3FF", border: "#DDD6FE", accent: "#7C3AED" },
    estadual: { bg: "#EFF6FF", border: "#BFDBFE", accent: "#2563EB" },
    setorial: { bg: "#FFFBEB", border: "#FDE68A", accent: "#CA8A04" },
    central: { bg: "#FFF7ED", border: "#FED7AA", accent: "#EA580C" },
    regional: { bg: "#ECFDF5", border: "#A7F3D0", accent: "#16A34A" },
    local: { bg: "#F9FAFB", border: "#E5E7EB", accent: "#6B7280" },
  };

  const memberTone = {
    total: { bg: "#EFF6FF", border: "#BFDBFE", accent: "#2563EB" },
    pastores: { bg: "#EFF6FF", border: "#BFDBFE", accent: "#2563EB" },
    obreiros: { bg: "#FFFBEB", border: "#FDE68A", accent: "#CA8A04" },
    presbiteros: { bg: "#F5F3FF", border: "#DDD6FE", accent: "#7C3AED" },
    diaconos: { bg: "#ECFDF5", border: "#A7F3D0", accent: "#16A34A" },
    membrosAtivos: { bg: "#F8FAFC", border: "#E2E8F0", accent: "#334155" },
  };

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
            <StatCard title="Total de membros" value={memberCounters.total} subtitle="membros no escopo" tone={memberTone.total} icon="users" />
            <StatCard title="Pastores" value={memberCounters.pastores} subtitle="cargo pastor" tone={memberTone.pastores} icon="users" />
            <StatCard title="Obreiros" value={memberCounters.obreiros} subtitle="cargo obreiro" tone={memberTone.obreiros} icon="users" />
            <StatCard title="Presbiteros" value={memberCounters.presbiteros} subtitle="cargo presbitero" tone={memberTone.presbiteros} icon="users" />
            <StatCard title="Diaconos" value={memberCounters.diaconos} subtitle="cargo diacono" tone={memberTone.diaconos} icon="users" />
            <StatCard title="Membros ativos" value={memberCounters.membrosAtivos} subtitle="ministerio membro" tone={memberTone.membrosAtivos} icon="users" />
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Total de igrejas" value={churchCounters.total} subtitle="igrejas cadastradas" tone={churchTone.total} />
          <StatCard title="Estadual" value={churchCounters.estadual} subtitle="classificacao estadual" tone={churchTone.estadual} />
          <StatCard title="Setorial" value={churchCounters.setorial} subtitle="classificacao setorial" tone={churchTone.setorial} />
          <StatCard title="Central" value={churchCounters.central} subtitle="classificacao central" tone={churchTone.central} />
          <StatCard title="Regional" value={churchCounters.regional} subtitle="classificacao regional" tone={churchTone.regional} />
          <StatCard title="Local" value={churchCounters.local} subtitle="classificacao local" tone={churchTone.local} />
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
