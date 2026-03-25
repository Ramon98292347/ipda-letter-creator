import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Church, ShieldCheck, UserRound, Users } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
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

// Comentario: dashboard com visual SaaS corporativo (azul) e foco em leitura dos indicadores.
export default function PastorDashboardPage() {
  const navigate = useNavigate();
  const { session } = useUser();

  const { data: membersRes } = useQuery({
    queryKey: ["pastor-dashboard-members"],
    queryFn: () => listMembers({ page: 1, page_size: 300, roles: ["pastor", "obreiro"] }),
    refetchInterval: 10000,
  });
  const { data: churchesRes } = useQuery({
    queryKey: ["pastor-dashboard-churches"],
    queryFn: () => listChurchesInScopePaged(1, 500),
    refetchInterval: 10000,
  });

  const members = membersRes?.workers || [];
  const churches = churchesRes?.churches || [];
  const totalIgrejasEscopo = Number(churchesRes?.total || churches.length || 0);

  // Comentario: total real vem da API — não do length do array (que é limitado pelo page_size)
  const totalMembrosReal = Number(membersRes?.total || members.length || 0);

  const counters = useMemo(() => {
    // Comentario: pastor = role "pastor" OU minister_role "pastor" (cobre ambos os casos do banco)
    const pastors = members.filter(
      (m) => String(m.role || "").toLowerCase() === "pastor" || normalizeMinisterRole(m.minister_role) === "pastor"
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
    };

    return { totalMembers: totalMembrosReal, pastors, obreiros, presbiteros, diaconos, membrosAtivos, byClass };
  }, [members, churches, totalMembrosReal]);

  return (
    <ManagementShell roleMode="pastor">
      {/* Comentario: padding responsivo — mais folgado no celular */}
      <div className="space-y-5 bg-[#F6F8FC] px-2 py-2 sm:px-1 sm:py-1">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">Visão geral do seu escopo (membros e igrejas)</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>Escopo TOTVS: {session?.root_totvs_id || session?.totvs_id || "-"}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Atualizado: agora</span>
          </div>
        </section>

        {/* ── Membros — Pastor | Presbítero | Diácono | Cooperador | Membros Ativos ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="text-xl font-bold text-slate-900">Membros</h3>
            <p className="text-sm text-slate-500">Indicadores por cargo ministerial. Clique para filtrar.</p>
          </div>
          {/* Comentario: 1 col no celular | 2 no sm | 3 no md | 6 no desktop */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard title="Total de membros" value={counters.totalMembers} subtitle="cadastros no escopo" icon={Users} gradient="from-blue-600 to-blue-500" onClick={() => navigate("/pastor/membros?status=ativo")} />
            <KpiCard title="Pastor" value={counters.pastors} subtitle="cargo pastor" icon={UserRound} gradient="from-blue-700 to-blue-600" onClick={() => navigate("/pastor/membros?cargo=pastor")} />
            <KpiCard title="Presbítero" value={counters.presbiteros} subtitle="cargo presbítero" icon={UserRound} gradient="from-purple-600 to-purple-500" onClick={() => navigate("/pastor/membros?cargo=presbitero")} />
            <KpiCard title="Diácono" value={counters.diaconos} subtitle="cargo diácono" icon={UserRound} gradient="from-emerald-600 to-emerald-500" onClick={() => navigate("/pastor/membros?cargo=diacono")} />
            <KpiCard title="Cooperador" value={counters.obreiros} subtitle="cargo cooperador" icon={Users} gradient="from-amber-500 to-amber-400" onClick={() => navigate("/pastor/membros?cargo=obreiro")} />
            <KpiCard title="Membros Ativos" value={counters.membrosAtivos} subtitle="ministério membro" icon={Users} gradient="from-slate-600 to-slate-500" onClick={() => navigate("/pastor/membros?status=ativo")} />
          </div>
        </section>

        {/* ── Igrejas ─────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-xl font-bold text-slate-900">Igrejas</h3>
              <p className="text-sm text-slate-500">Distribuição por classificação no seu escopo.</p>
            </div>
          </div>
          {/* Comentario: 2 col no celular | 3 no tablet | 6 no desktop */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <KpiCard title="Total" value={totalIgrejasEscopo} subtitle="igrejas no escopo" icon={Church} gradient="from-purple-600 to-purple-500" onClick={() => navigate("/pastor/igrejas")} />
            <KpiCard title="Estadual" value={counters.byClass.estadual} subtitle="classe estadual" icon={Church} gradient="from-blue-600 to-blue-500" onClick={() => navigate("/pastor/igrejas?class=estadual")} />
            <KpiCard title="Setorial" value={counters.byClass.setorial} subtitle="classe setorial" icon={Church} gradient="from-amber-500 to-amber-400" onClick={() => navigate("/pastor/igrejas?class=setorial")} />
            <KpiCard title="Central" value={counters.byClass.central} subtitle="classe central" icon={Church} gradient="from-orange-500 to-orange-400" onClick={() => navigate("/pastor/igrejas?class=central")} />
            <KpiCard title="Regional" value={counters.byClass.regional} subtitle="classe regional" icon={Church} gradient="from-emerald-600 to-emerald-500" onClick={() => navigate("/pastor/igrejas?class=regional")} />
            <KpiCard title="Local" value={counters.byClass.local} subtitle="classe local" icon={Church} gradient="from-slate-600 to-slate-500" onClick={() => navigate("/pastor/igrejas?class=local")} />
          </div>
        </section>
      </div>
    </ManagementShell>
  );
}
