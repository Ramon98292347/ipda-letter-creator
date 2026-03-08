import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Church, ShieldCheck, UserRound, Users } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Card, CardContent } from "@/components/ui/card";
import { listChurchesInScopePaged, listMembers } from "@/services/saasService";
import { useUser } from "@/context/UserContext";

function normalizeMinisterRole(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  onClick,
  tone,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: typeof Users;
  onClick?: () => void;
  tone?: {
    bg: string;
    border: string;
    accent: string;
  };
}) {
  const bg = tone?.bg || "#FFFFFF";
  const border = tone?.border || "#E5E7EB";
  const accent = tone?.accent || "#2563EB";

  return (
    <Card
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className="group rounded-xl shadow-sm transition-all hover:shadow-md"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <CardContent className="border-l-4 p-5" style={{ borderLeftColor: accent }}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        <p className="text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">{value}</p>
        <p className="mt-1 text-xs text-slate-500 md:text-sm">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// Comentario: dashboard com visual SaaS corporativo (azul) e foco em leitura dos indicadores.
export default function PastorDashboardPage() {
  const navigate = useNavigate();
  const { session } = useUser();

  const { data: membersRes } = useQuery({
    queryKey: ["pastor-dashboard-members"],
    queryFn: () => listMembers({ page: 1, page_size: 300, roles: ["pastor", "obreiro"] }),
  });
  const { data: churchesRes } = useQuery({
    queryKey: ["pastor-dashboard-churches"],
    queryFn: () => listChurchesInScopePaged(1, 500),
  });

  const members = membersRes?.workers || [];
  const churches = churchesRes?.churches || [];
  const totalIgrejasEscopo = Number(churchesRes?.total || churches.length || 0);

  const counters = useMemo(() => {
    const totalMembers = members.length;
    const pastors = members.filter((m) => normalizeMinisterRole(m.minister_role) === "pastor").length;
    const obreiros = members.filter((m) => normalizeMinisterRole(m.minister_role) === "obreiro").length;
    const presbiteros = members.filter((m) => normalizeMinisterRole(m.minister_role) === "presbitero").length;
    const diaconos = members.filter((m) => normalizeMinisterRole(m.minister_role) === "diacono").length;
    const membrosAtivos = members.filter((m) => normalizeMinisterRole(m.minister_role) === "membro" && m.is_active !== false).length;

    const byClass = {
      estadual: churches.filter((c) => String(c.church_class || "").toLowerCase() === "estadual").length,
      setorial: churches.filter((c) => String(c.church_class || "").toLowerCase() === "setorial").length,
      central: churches.filter((c) => String(c.church_class || "").toLowerCase() === "central").length,
      regional: churches.filter((c) => String(c.church_class || "").toLowerCase() === "regional").length,
      local: churches.filter((c) => String(c.church_class || "").toLowerCase() === "local").length,
    };

    return { totalMembers, pastors, obreiros, presbiteros, diaconos, membrosAtivos, byClass };
  }, [members, churches]);

  const churchCardTone = {
    total: { bg: "#F5F3FF", border: "#DDD6FE", accent: "#7C3AED" },
    estadual: { bg: "#EFF6FF", border: "#BFDBFE", accent: "#2563EB" },
    setorial: { bg: "#FFFBEB", border: "#FDE68A", accent: "#CA8A04" },
    central: { bg: "#FFF7ED", border: "#FED7AA", accent: "#EA580C" },
    regional: { bg: "#ECFDF5", border: "#A7F3D0", accent: "#16A34A" },
    local: { bg: "#F9FAFB", border: "#E5E7EB", accent: "#6B7280" },
  };
  const memberCardTone = {
    total: { bg: "#FFFFFF", border: "#E5E7EB", accent: "#2563EB" },
    pastor: { bg: "#F8FAFC", border: "#E5E7EB", accent: "#2563EB" },
    obreiro: { bg: "#F8FAFC", border: "#E5E7EB", accent: "#CA8A04" },
    presbitero: { bg: "#F8FAFC", border: "#E5E7EB", accent: "#7C3AED" },
    diacono: { bg: "#F8FAFC", border: "#E5E7EB", accent: "#16A34A" },
    ativo: { bg: "#F8FAFC", border: "#E5E7EB", accent: "#334155" },
  };

  return (
    <ManagementShell roleMode="pastor">
      <div className="space-y-6 bg-[#F6F8FC] p-1">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
          <p className="mt-1 text-base text-slate-600">Visao geral do seu escopo (membros e igrejas)</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>Escopo TOTVS: {session?.root_totvs_id || session?.totvs_id || "-"}</span>
            <span>•</span>
            <span>Atualizado: agora</span>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-xl font-bold text-slate-900">Membros</h3>
            <p className="text-sm text-slate-500">Indicadores de membros e cargos ministeriais.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard title="Total de membros" value={counters.totalMembers} subtitle="cadastros no escopo" icon={Users} tone={memberCardTone.total} onClick={() => navigate("/pastor/membros?status=ativo")} />
            <KpiCard title="Pastores" value={counters.pastors} subtitle="cargo pastor" icon={UserRound} tone={memberCardTone.pastor} onClick={() => navigate("/pastor/membros?cargo=pastor")} />
            <KpiCard title="Obreiros" value={counters.obreiros} subtitle="cargo obreiro" icon={Users} tone={memberCardTone.obreiro} onClick={() => navigate("/pastor/membros?cargo=obreiro")} />
            <KpiCard title="Presbiteros" value={counters.presbiteros} subtitle="cargo presbitero" icon={UserRound} tone={memberCardTone.presbitero} onClick={() => navigate("/pastor/membros?cargo=presbitero")} />
            <KpiCard title="Diaconos" value={counters.diaconos} subtitle="cargo diacono" icon={UserRound} tone={memberCardTone.diacono} onClick={() => navigate("/pastor/membros?cargo=diacono")} />
            <KpiCard title="Membros ativos" value={counters.membrosAtivos} subtitle="ministerio membro" icon={Users} tone={memberCardTone.ativo} onClick={() => navigate("/pastor/membros?status=ativo")} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-xl font-bold text-slate-900">Igrejas</h3>
              <p className="text-sm text-slate-500">Distribuicao das igrejas no seu escopo de hierarquia.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard title="Total de igrejas" value={totalIgrejasEscopo} subtitle="total de igrejas no escopo" icon={Church} tone={churchCardTone.total} onClick={() => navigate("/pastor/igrejas")} />
            <KpiCard title="Estadual" value={counters.byClass.estadual} subtitle="classe estadual" icon={Church} tone={churchCardTone.estadual} onClick={() => navigate("/pastor/igrejas?class=estadual")} />
            <KpiCard title="Setorial" value={counters.byClass.setorial} subtitle="classe setorial" icon={Church} tone={churchCardTone.setorial} onClick={() => navigate("/pastor/igrejas?class=setorial")} />
            <KpiCard title="Central" value={counters.byClass.central} subtitle="classe central" icon={Church} tone={churchCardTone.central} onClick={() => navigate("/pastor/igrejas?class=central")} />
            <KpiCard title="Regional" value={counters.byClass.regional} subtitle="classe regional" icon={Church} tone={churchCardTone.regional} onClick={() => navigate("/pastor/igrejas?class=regional")} />
            <KpiCard title="Local" value={counters.byClass.local} subtitle="classe local" icon={Church} tone={churchCardTone.local} onClick={() => navigate("/pastor/igrejas?class=local")} />
          </div>
        </section>
      </div>
    </ManagementShell>
  );
}
