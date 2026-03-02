import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Bell, LogOut, CalendarDays, LineChart, Users, Megaphone, Download } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getPastorMetrics, listAdminChurchSummary, listChurchesInScopePaged, listMembers, listNotifications, listPastorLetters, markAllNotificationsRead, markNotificationRead } from "@/services/saasService";
import { CartasTab } from "@/components/admin/CartasTab";
import { ObreirosTab } from "@/components/admin/ObreirosTab";
import { AdminChurchesTab } from "@/components/admin/AdminChurchesTab";
import { StatCards } from "@/components/shared/StatCards";
import { Skeleton } from "@/components/ui/skeleton";
import { usePwaInstall } from "@/hooks/usePwaInstall";

type Tab = "cartas" | "igrejas" | "obreiros";

export default function AdminPastorDashboard() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, session, clearAuth } = useUser();
  const isAdmin = usuario?.role === "admin";
  const [tab, setTab] = useState<Tab>(isAdmin ? "igrejas" : "cartas");
  const [openReleases, setOpenReleases] = useState(false);
  const [churchPage, setChurchPage] = useState(1);
  const [churchPageSize, setChurchPageSize] = useState(20);

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
      const res = await listMembers({ page: 1, page_size: 200, roles: ["pastor", "obreiro"] });
      return res.workers;
    },
    enabled: scopeTotvsIds.length > 0,
  });
  const phonesByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    obreiros.forEach((u) => {
      const id = String(u?.id || "");
      const phone = String(u?.phone || "");
      if (id && phone) map[id] = phone;
    });
    return map;
  }, [obreiros]);
  const phonesByName = useMemo(() => {
    const map: Record<string, string> = {};
    obreiros.forEach((u) => {
      const nome = String(u?.full_name || "").trim().toLowerCase();
      const phone = String(u?.phone || "");
      if (nome && phone) map[nome] = phone;
    });
    return map;
  }, [obreiros]);

  const { data: churchRows = [] } = useQuery({
    queryKey: ["admin-church-summary", scopeTotvsIds.join("|")],
    queryFn: () => listAdminChurchSummary(scopeTotvsIds),
    enabled: isAdmin && scopeTotvsIds.length > 0,
  });

  const { data: churchesPaged } = useQuery({
    queryKey: ["churches-in-scope", churchPage, churchPageSize],
    queryFn: () => listChurchesInScopePaged(churchPage, churchPageSize),
    enabled: isAdmin,
  });
  const churchesInScope = churchesPaged?.churches || [];
  const churchesTotal = churchesPaged?.total || churchesInScope.length;
  const churchesPages = Math.max(1, Math.ceil(churchesTotal / churchPageSize));
  const { canInstall, install } = usePwaInstall();

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications", 1, 50],
    queryFn: () => listNotifications(1, 50, false),
    enabled: Boolean(session?.totvs_id),
  });
  const notifications = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unread_count || 0;

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pastor-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["pastor-letters"] }),
      queryClient.invalidateQueries({ queryKey: ["pastor-obreiros"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-church-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  }

  function logout() {
    clearAuth();
    nav("/");
  }

  async function readNotification(id: string) {
    await markNotificationRead(id);
    await refreshAll();
  }

  async function readAllNotifications() {
    await markAllNotificationsRead();
    await refreshAll();
  }

  async function installApp() {
    await install();
  }

  const totalCartas = isAdmin ? churchRows.reduce((acc, r) => acc + r.total_cartas, 0) : (metrics?.totalCartas || 0);
  const cartasHoje = isAdmin ? churchRows.length : (metrics?.cartasHoje || 0);
  const ultimos7 = isAdmin ? churchRows.reduce((acc, r) => acc + r.cartas_liberadas, 0) : (metrics?.ultimos7Dias || 0);
  const totalObreiros = isAdmin ? churchRows.reduce((acc, r) => acc + r.total_obreiros, 0) : (metrics?.totalObreiros || obreiros.length);
  const pendentes = unreadCount || (isAdmin ? churchRows.reduce((acc, r) => acc + r.pendentes_liberacao, 0) : (metrics?.pendentesLiberacao || 0));
  const pastorDaLista = obreiros.find((m) => m?.role === "pastor");
  const headerAvatarUrl = usuario?.avatar_url || pastorDaLista?.avatar_url || null;
  const headerNome = usuario?.nome || pastorDaLista?.full_name || "Usuário";

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2f63d4] text-white sm:h-12 sm:w-12">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold leading-none text-slate-900 sm:text-3xl">Painel de Gestão</h1>
                <p className="text-base text-slate-500 sm:text-xl">Cartas e Obreiros</p>
              </div>
            </div>

            <div className="w-full space-y-2 lg:w-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {canInstall ? (
                    <Button variant="outline" className="h-10 px-3 sm:h-11 sm:px-4" onClick={installApp}>
                      <Download className="mr-2 h-4 w-4" /> Instalar app
                    </Button>
                  ) : null}
                  <Button variant="outline" className="relative h-10 w-10 p-0 sm:h-11 sm:w-11" onClick={() => setOpenReleases(true)}>
                    <Bell className="h-5 w-5" />
                    {pendentes > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-semibold text-white">
                        {pendentes}
                      </span>
                    ) : null}
                  </Button>
                  <Button variant="outline" className="h-10 px-3 sm:h-11 sm:px-4" onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" /> Sair
                  </Button>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1">
                  {headerAvatarUrl ? (
                    <img src={headerAvatarUrl} alt="Avatar usuario" className="h-9 w-9 rounded-full border object-cover object-[center_top]" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-slate-100 text-sm font-semibold text-slate-600">
                      {(headerNome || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="max-w-[180px] truncate text-sm font-medium text-slate-700">{headerNome}</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 sm:text-sm">
                Igreja: {session?.church_name || usuario?.church_name || "-"}
                <br />
                Pastor: {usuario?.nome || "-"}
                <br />
                Raiz TOTVS: {session?.root_totvs_id || session?.totvs_id || "-"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5">
        <section className="mt-[10px] rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap gap-2">
            {!isAdmin ? (
              <Button className="h-10 px-3 sm:h-11 sm:px-4" onClick={() => nav("/carta")}>
                Fazer Carta
              </Button>
            ) : null}
            <Button variant="outline" className="h-10 px-3 sm:h-11 sm:px-4" onClick={() => nav("/config")}>
              <Megaphone className="mr-2 h-4 w-4" /> Divulgação
            </Button>
          </div>
        </section>

        {loadingMetrics ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : (
          <StatCards
            items={[
              { label: "Total de Cartas", value: totalCartas, icon: FileText, gradient: "bg-gradient-to-r from-[#2f63d4] to-[#4b77d5]" },
              { label: isAdmin ? "Total de Igrejas" : "Cartas Hoje", value: cartasHoje, icon: CalendarDays, gradient: "bg-gradient-to-r from-[#2fa86f] to-[#49c280]" },
              { label: isAdmin ? "Cartas Liberadas" : "Últimos 7 dias", value: ultimos7, icon: LineChart, gradient: "bg-gradient-to-r from-[#f39b1c] to-[#f3b12c]" },
              { label: "Total de Membros", value: totalObreiros, icon: Users, gradient: "bg-gradient-to-r from-[#8f3fd4] to-[#a957e4]" },
            ]}
          />
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <button
              className={`rounded-xl px-4 py-2 text-lg font-semibold ${tab === (isAdmin ? "igrejas" : "cartas") ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
              onClick={() => setTab(isAdmin ? "igrejas" : "cartas")}
            >
              {isAdmin ? `Igrejas (${churchesTotal})` : `Cartas (${letters.length})`}
            </button>
            <button
              className={`rounded-xl px-4 py-2 text-lg font-semibold ${tab === "obreiros" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
              onClick={() => setTab("obreiros")}
            >
              Membros cadastrados ({obreiros.length})
            </button>
          </div>
        </section>

        {tab === "cartas" ? (
          <CartasTab letters={letters} scopeTotvsIds={scopeTotvsIds} phonesByUserId={phonesByUserId} phonesByName={phonesByName} />
        ) : tab === "igrejas" ? (
          <AdminChurchesTab
            rows={churchesInScope}
            page={churchPage}
            pageSize={churchPageSize}
            totalPages={churchesPages}
            onPageChange={setChurchPage}
            onPageSizeChange={(n) => {
              setChurchPageSize(n);
              setChurchPage(1);
            }}
          />
        ) : (
          <ObreirosTab activeTotvsId={activeTotvsId} />
        )}
      </main>

      <Dialog open={openReleases} onOpenChange={setOpenReleases}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Notificações</DialogTitle>
          </DialogHeader>
          <div className="mb-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={readAllNotifications}>
              Marcar todas como lidas
            </Button>
          </div>
          <div className="space-y-2">
            {notifications.length === 0 ? <p className="text-sm text-slate-500">Sem notificações.</p> : null}
            {notifications.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-slate-600">{item.message || "Sem mensagem"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => readNotification(item.id)} disabled={item.is_read}>
                    {item.is_read ? "Lida" : "Marcar lida"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
