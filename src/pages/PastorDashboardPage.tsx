import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Church, MessageSquare, UserRound, Users } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { listChurchesInScope, listMembers } from "@/services/saasService";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";

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
  gradient,
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: typeof Users;
  onClick?: () => void;
  gradient: string;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group rounded-xl shadow-md bg-gradient-to-br ${gradient} p-5 transition-all hover:shadow-lg ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-white/80">{title}</p>
        <Icon className="h-5 w-5 text-white/70" />
      </div>
      <p className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">{value}</p>
      <p className="mt-1 text-xs text-white/70 md:text-sm">{subtitle}</p>
    </div>
  );
}

export default function PastorDashboardPage() {
  const navigate = useNavigate();
  const { session } = useUser();
  const activeTotvsId = String(session?.totvs_id || "");
  // Usa a mesma regra da tela de Igrejas:
  // passa root_totvs_id somente quando existir e deixa undefined nos demais casos
  // para a API resolver o escopo do usuário autenticado.
  const scopeRootTotvsId = session?.root_totvs_id ? String(session.root_totvs_id) : undefined;

  const { data: membersRes } = useQuery({
    queryKey: ["pastor-dashboard-members", activeTotvsId],
    queryFn: () =>
      listMembers({
        page: 1,
        page_size: 5000,
        roles: ["pastor", "obreiro", "secretario", "financeiro"],
        church_totvs_id: activeTotvsId || undefined,
        exact_church: true,
      }),
    enabled: Boolean(activeTotvsId),
  });

  const { data: churchesRes } = useQuery({
    queryKey: ["pastor-dashboard-churches", activeTotvsId, scopeRootTotvsId],
    queryFn: () => listChurchesInScope(1, 5000, scopeRootTotvsId || undefined),
    enabled: Boolean(activeTotvsId),
  });

  const members = membersRes?.workers || [];
  const churches = churchesRes || [];
  const totalIgrejasEscopo = Number(churches.length || 0);

  const counters = useMemo(() => {
    const totalMembers = Number(membersRes?.total || members.length || 0);
    const pastors = members.filter(
      (m) => String(m.role || "").toLowerCase() === "pastor" || normalizeMinisterRole(m.minister_role) === "pastor",
    ).length;
    const obreiros = members.filter((m) => normalizeMinisterRole(m.minister_role) === "cooperador").length;
    const presbiteros = members.filter((m) => normalizeMinisterRole(m.minister_role) === "presbitero").length;
    const diaconos = members.filter((m) => normalizeMinisterRole(m.minister_role) === "diacono").length;
    const membrosAtivos = members.filter((m) => normalizeMinisterRole(m.minister_role) === "membro" && m.is_active !== false).length;

    const byClass = {
      estadual: churches.filter((c) => String(c.church_class || "").toLowerCase() === "estadual").length,
      setorial: churches.filter((c) => String(c.church_class || "").toLowerCase() === "setorial").length,
      central: churches.filter((c) => String(c.church_class || "").toLowerCase() === "central").length,
      regional: churches.filter((c) => String(c.church_class || "").toLowerCase() === "regional").length,
      local: churches.filter((c) => String(c.church_class || "").toLowerCase() === "local").length,
      casa_oracao: churches.filter((c) => String(c.church_class || "").toLowerCase() === "casa_oracao").length,
    };

    return { totalMembers, pastors, obreiros, presbiteros, diaconos, membrosAtivos, byClass };
  }, [membersRes?.total, members, churches]);

  return (
    <ManagementShell roleMode="pastor">
      <div className="space-y-5 bg-[#F6F8FC] px-2 py-2 sm:px-1 sm:py-1">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">Visao geral dos membros e igrejas</p>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate("/feedback?open=1&from=pastor-dashboard")}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Feedback
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="text-xl font-bold text-slate-900">Membros</h3>
            <p className="text-sm text-slate-500">Indicadores por cargo ministerial. Clique para filtrar.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Total de membros" value={counters.totalMembers} subtitle="cadastros ativos" icon={Users} gradient="from-blue-600 to-blue-500" onClick={() => navigate("/pastor/membros?status=ativo")} />
            <KpiCard title="Pastor" value={counters.pastors} subtitle="cargo pastor" icon={UserRound} gradient="from-blue-700 to-blue-600" onClick={() => navigate("/pastor/membros?cargo=pastor")} />
            <KpiCard title="Presbítero" value={counters.presbiteros} subtitle="cargo presbítero" icon={UserRound} gradient="from-purple-600 to-purple-500" onClick={() => navigate("/pastor/membros?cargo=presbitero")} />
            <KpiCard title="Diácono" value={counters.diaconos} subtitle="cargo diácono" icon={UserRound} gradient="from-emerald-600 to-emerald-500" onClick={() => navigate("/pastor/membros?cargo=diacono")} />
            <KpiCard title="Cooperador" value={counters.obreiros} subtitle="cargo cooperador" icon={Users} gradient="from-amber-500 to-amber-400" onClick={() => navigate("/pastor/membros?cargo=obreiro")} />
            <KpiCard title="Membros Ativos" value={counters.membrosAtivos} subtitle="ministério membro" icon={Users} gradient="from-slate-600 to-slate-500" onClick={() => navigate("/pastor/membros?status=ativo")} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-xl font-bold text-slate-900">Igrejas</h3>
              <p className="text-sm text-slate-500">Distribuicao por classificacao.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard title="Total" value={totalIgrejasEscopo} subtitle="total de igrejas" icon={Church} gradient="from-purple-600 to-purple-500" onClick={() => navigate("/pastor/igrejas")} />
            <KpiCard title="Estadual" value={counters.byClass.estadual} subtitle="classe estadual" icon={Church} gradient="from-blue-600 to-blue-500" onClick={() => navigate("/pastor/igrejas?class=estadual")} />
            <KpiCard title="Setorial" value={counters.byClass.setorial} subtitle="classe setorial" icon={Church} gradient="from-amber-500 to-amber-400" onClick={() => navigate("/pastor/igrejas?class=setorial")} />
            <KpiCard title="Central" value={counters.byClass.central} subtitle="classe central" icon={Church} gradient="from-orange-500 to-orange-400" onClick={() => navigate("/pastor/igrejas?class=central")} />
            <KpiCard title="Regional" value={counters.byClass.regional} subtitle="classe regional" icon={Church} gradient="from-emerald-600 to-emerald-500" onClick={() => navigate("/pastor/igrejas?class=regional")} />
            <KpiCard title="Local" value={counters.byClass.local} subtitle="classe local" icon={Church} gradient="from-slate-600 to-slate-500" onClick={() => navigate("/pastor/igrejas?class=local")} />
            <div className="col-span-2">
              <KpiCard title="Casa de oração" value={counters.byClass.casa_oracao} subtitle="classe casa de oração" icon={Church} gradient="from-zinc-700 to-zinc-600" onClick={() => navigate("/pastor/igrejas?class=casa_oracao")} />
            </div>
          </div>
        </section>
      </div>
    </ManagementShell>
  );
}

