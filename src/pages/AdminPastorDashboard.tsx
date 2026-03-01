import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, FileText, Bell, LogOut, RefreshCw, CalendarDays, LineChart, Users, Settings } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { approveRelease, denyRelease, getPastorMetrics, listAdminChurchSummary, listObreiros, listPastorLetters, listReleaseRequests, listWorkers } from "@/services/saasService";
import { CartasTab } from "@/components/admin/CartasTab";
import { ObreirosTab } from "@/components/admin/ObreirosTab";
import { AdminChurchesTab } from "@/components/admin/AdminChurchesTab";
import { StatCards } from "@/components/shared/StatCards";

type Tab = "cartas" | "igrejas" | "obreiros";

export default function AdminPastorDashboard() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, session, clearAuth } = useUser();
  const isAdmin = usuario?.role === "admin";
  const [tab, setTab] = useState<Tab>(isAdmin ? "igrejas" : "cartas");
  const [openReleases, setOpenReleases] = useState(false);

  const activeTotvsId = String(session?.totvs_id || usuario?.default_totvs_id || usuario?.totvs || "");
  const scopeTotvsIds = useMemo(() => {
    const ids = (session?.scope_totvs_ids || usuario?.totvs_access || []).filter(Boolean);
    if (ids.length) return ids;
    if (activeTotvsId) return [activeTotvsId];
    return [];
  }, [session?.scope_totvs_ids, usuario?.totvs_access, activeTotvsId]);

  const { data: metrics, isFetching: loadingMetrics } = useQuery({
    queryKey: ["pastor-metrics"],
    queryFn: () => getPastorMetrics(),
    enabled: Boolean(activeTotvsId),
  });

  const { data: letters = [] } = useQuery({
    queryKey: ["pastor-letters", scopeTotvsIds.join("|")],
    queryFn: async () => {
      if (!scopeTotvsIds.length) return [];
      const data = await Promise.all(
        scopeTotvsIds.map((totvs) =>
          listPastorLetters(totvs, {
            period: "custom",
          }),
        ),
      );
      const map = new Map<string, (typeof data)[number][number]>();
      data.flat().forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    },
    enabled: scopeTotvsIds.length > 0,
  });

  const { data: obreiros = [] } = useQuery({
    queryKey: ["pastor-obreiros", scopeTotvsIds.join("|")],
    queryFn: async () => {
      const res = await listWorkers({ page: 1, page_size: 200 });
      return res.workers;
    },
    enabled: scopeTotvsIds.length > 0,
  });

  const { data: churchRows = [] } = useQuery({
    queryKey: ["admin-church-summary", scopeTotvsIds.join("|")],
    queryFn: () => listAdminChurchSummary(scopeTotvsIds),
    enabled: isAdmin && scopeTotvsIds.length > 0,
  });

  const { data: releaseRequests = [] } = useQuery({
    queryKey: ["release-requests", "PENDENTE"],
    queryFn: () => listReleaseRequests("PENDENTE", 1, 50),
    enabled: !isAdmin,
  });

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pastor-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["pastor-letters"] }),
      queryClient.invalidateQueries({ queryKey: ["pastor-obreiros"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-church-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["release-requests"] }),
    ]);
  }

  function logout() {
    clearAuth();
    nav("/");
  }

  async function approve(requestId: string) {
    await approveRelease(requestId);
    await refreshAll();
  }

  async function deny(requestId: string) {
    await denyRelease(requestId);
    await refreshAll();
  }

  const totalCartas = isAdmin ? churchRows.reduce((acc, r) => acc + r.total_cartas, 0) : (metrics?.totalCartas || 0);
  const cartasHoje = isAdmin ? churchRows.length : (metrics?.cartasHoje || 0);
  const ultimos7 = isAdmin ? churchRows.reduce((acc, r) => acc + r.cartas_liberadas, 0) : (metrics?.ultimos7Dias || 0);
  const totalObreiros = isAdmin ? churchRows.reduce((acc, r) => acc + r.total_obreiros, 0) : (metrics?.totalObreiros || obreiros.length);
  const pendentes = isAdmin ? churchRows.reduce((acc, r) => acc + r.pendentes_liberacao, 0) : (releaseRequests.length || metrics?.pendentesLiberacao || 0);

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2f63d4] text-white">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold leading-none text-slate-900">Painel de Gestao</h1>
              <p className="text-xl text-slate-500">Cartas e Obreiros</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-11 px-4" onClick={() => nav("/config")}>
              <Settings className="mr-2 h-4 w-4" /> Config
            </Button>
            <Button variant="outline" className="h-11 px-4" onClick={refreshAll} disabled={loadingMetrics}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Button variant="outline" className="relative h-11 w-11 p-0" onClick={() => setOpenReleases(true)}>
              <Bell className="h-5 w-5" />
              {pendentes > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-semibold text-white">
                  {pendentes}
                </span>
              ) : null}
            </Button>
            <Button variant="outline" className="h-11 px-4" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
            <div className="hidden rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 md:block">
              Igreja: {session?.church_name || usuario?.church_name || "-"}
              <br />
              Pastor: {usuario?.nome || "-"}
              <br />
              Raiz TOTVS: {session?.root_totvs_id || "-"}
            </div>
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5">
        <StatCards
          items={[
            { label: "Total de Cartas", value: totalCartas, icon: FileText, gradient: "bg-gradient-to-r from-[#2f63d4] to-[#4b77d5]" },
            { label: isAdmin ? "Igrejas no escopo" : "Cartas Hoje", value: cartasHoje, icon: CalendarDays, gradient: "bg-gradient-to-r from-[#2fa86f] to-[#49c280]" },
            { label: isAdmin ? "Cartas Liberadas" : "Ultimos 7 dias", value: ultimos7, icon: LineChart, gradient: "bg-gradient-to-r from-[#f39b1c] to-[#f3b12c]" },
            { label: "Total de Obreiros", value: totalObreiros, icon: Users, gradient: "bg-gradient-to-r from-[#8f3fd4] to-[#a957e4]" },
          ]}
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <button
              className={`rounded-xl px-4 py-2 text-lg font-semibold ${tab === (isAdmin ? "igrejas" : "cartas") ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
              onClick={() => setTab(isAdmin ? "igrejas" : "cartas")}
            >
              {isAdmin ? `Igrejas (${churchRows.length})` : `Cartas (${letters.length})`}
            </button>
            <button
              className={`rounded-xl px-4 py-2 text-lg font-semibold ${tab === "obreiros" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
              onClick={() => setTab("obreiros")}
            >
              Obreiros ({obreiros.length})
            </button>
          </div>
        </section>

        {tab === "cartas" ? (
          <CartasTab letters={letters} scopeTotvsIds={scopeTotvsIds} />
        ) : tab === "igrejas" ? (
          <AdminChurchesTab rows={churchRows} />
        ) : (
          <ObreirosTab activeTotvsId={activeTotvsId} />
        )}
      </main>

      <Dialog open={openReleases} onOpenChange={setOpenReleases}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pedidos de Liberacao</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {releaseRequests.length === 0 ? <p className="text-sm text-slate-500">Sem pedidos pendentes.</p> : null}
            {releaseRequests.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-semibold">{item.requester_name || "Obreiro"}</p>
                  <p className="text-slate-600">{item.preacher_name || "-"} | {item.message || "Sem mensagem"}</p>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approve(item.id)}>Aprovar</Button>
                  <Button variant="destructive" onClick={() => deny(item.id)}>Negar</Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
