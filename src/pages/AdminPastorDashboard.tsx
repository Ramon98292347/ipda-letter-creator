import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Bell, LogOut, CalendarDays, LineChart, Users, Megaphone, Download } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getPastorMetrics, getPastorPanelData, listAdminChurchSummary, listChurchesInScopePaged, listNotifications, listPastorLetters, markAllNotificationsRead, markNotificationRead } from "@/services/saasService";
import { CartasTab } from "@/components/admin/CartasTab";
import { AdminChurchesTab } from "@/components/admin/AdminChurchesTab";
import { StatCards } from "@/components/shared/StatCards";
import { Skeleton } from "@/components/ui/skeleton";
import { usePwaInstall } from "@/hooks/usePwaInstall";

type Tab = "cartas" | "igrejas";

export default function AdminPastorDashboard() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, session, token, clearAuth } = useUser();
  const isAdmin = usuario?.role === "admin";
  const canManageChurches = usuario?.role === "admin" || usuario?.role === "pastor";
  const [tab, setTab] = useState<Tab>("cartas");
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

  // Comentario: busca igrejas e membros em paralelo (Promise.all) numa única query,
  // em vez de duas queries separadas que dependiam uma da outra via effectiveScopeTotvsIds.
  const { data: panelData } = useQuery({
    queryKey: ["pastor-panel-data", activeTotvsId],
    queryFn: () => getPastorPanelData(activeTotvsId || undefined),
    enabled: Boolean(activeTotvsId),
    refetchInterval: 60 * 1000,
  });

  const fullScopeChurches = panelData?.churches || [];
  const obreiros = panelData?.workers || [];

  const effectiveScopeTotvsIds = useMemo(() => {
    const fromChurches = fullScopeChurches.map((c) => String(c.totvs_id || "")).filter(Boolean);
    if (fromChurches.length) return fromChurches;
    return scopeTotvsIds;
  }, [fullScopeChurches, scopeTotvsIds]);
  const allowScopeView = isAdmin || effectiveScopeTotvsIds.length > 1;

  const { data: metrics, isFetching: loadingMetrics } = useQuery({
    queryKey: ["pastor-metrics"],
    queryFn: () => getPastorMetrics(),
    enabled: Boolean(activeTotvsId),
    // Atualiza metricas automaticamente a cada 60 segundos
    refetchInterval: 60 * 1000,
  });

  const { data: letters = [] } = useQuery({
    queryKey: ["pastor-letters", effectiveScopeTotvsIds.join("|")],
    queryFn: async () => {
      if (!effectiveScopeTotvsIds.length) return [];
      const data = await Promise.all(
        effectiveScopeTotvsIds.map((totvs) =>
          listPastorLetters(totvs, {
            period: "custom",
          }),
        ),
      );
      const map = new Map<string, (typeof data)[number][number]>();
      data.flat().forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    },
    enabled: effectiveScopeTotvsIds.length > 0,
    // Atualiza lista de cartas automaticamente a cada 60 segundos
    refetchInterval: 60 * 1000,
  });

  // obreiros agora vem de panelData (busca unificada com getPastorPanelData).
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
    queryKey: ["admin-church-summary", effectiveScopeTotvsIds.join("|")],
    queryFn: () => listAdminChurchSummary(effectiveScopeTotvsIds),
    enabled: canManageChurches && effectiveScopeTotvsIds.length > 0,
    refetchInterval: 10000,
  });

  const { data: churchesPaged } = useQuery({
    queryKey: ["churches-in-scope", churchPage, churchPageSize],
    queryFn: () => listChurchesInScopePaged(churchPage, churchPageSize),
    enabled: canManageChurches,
    refetchInterval: 10000,
  });
  const churchesInScope = churchesPaged?.churches || [];
  const churchesTotal = churchesPaged?.total || churchesInScope.length;
  const churchesPages = Math.max(1, Math.ceil(churchesTotal / churchPageSize));
  const { canInstall, install } = usePwaInstall();

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications", 1, 50],
    queryFn: () => listNotifications(1, 50, false),
    enabled: Boolean((session?.totvs_id || session?.root_totvs_id) && token),
    refetchInterval: 60 * 1000,
  });
  const notifications = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unread_count || 0;

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pastor-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["pastor-letters"] }),
      queryClient.invalidateQueries({ queryKey: ["pastor-panel-data"] }),
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

  // Comentario: calcula localmente para evitar cards zerados quando a metrica externa nao vier.
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const validLetters = letters.filter((l) => String(l.status || "").toUpperCase() !== "EXCLUIDA");
  const totalCartasLocal = validLetters.length;
  const cartasHojeLocal = validLetters.filter((l) => {
    if (!l.created_at) return false;
    const created = new Date(l.created_at).getTime();
    return Number.isFinite(created) && created >= startOfToday.getTime();
  }).length;
  const ultimos7Local = validLetters.filter((l) => {
    if (!l.created_at) return false;
    const created = new Date(l.created_at).getTime();
    return Number.isFinite(created) && created >= now - 7 * 24 * 60 * 60 * 1000;
  }).length;
  const totalMembrosLocal = obreiros.length;

  const preferApiOrLocal = (apiValue: number, localValue: number) => {
    if (apiValue > 0) return apiValue;
    if (apiValue === 0 && localValue > 0) return localValue;
    return apiValue || localValue || 0;
  };

  const totalCartas = isAdmin
    ? churchRows.reduce((acc, r) => acc + r.total_cartas, 0)
    : preferApiOrLocal(metrics?.totalCartas || 0, totalCartasLocal);
  const cartasHoje = isAdmin
    ? churchRows.length
    : preferApiOrLocal(metrics?.cartasHoje || 0, cartasHojeLocal);
  const ultimos7 = isAdmin
    ? churchRows.reduce((acc, r) => acc + r.cartas_liberadas, 0)
    : preferApiOrLocal(metrics?.ultimos7Dias || 0, ultimos7Local);
  const totalObreiros = totalMembrosLocal;
  const pendentes = unreadCount || (isAdmin ? churchRows.reduce((acc, r) => acc + r.pendentes_liberacao, 0) : (metrics?.pendentesLiberacao || 0));
  const pastorDaLista = obreiros.find((m) => m?.role === "pastor");
  const headerAvatarUrl = usuario?.avatar_url || pastorDaLista?.avatar_url || null;
  const headerNome = usuario?.nome || pastorDaLista?.full_name || "UsuÃ¡rio";

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
                <p className="text-base text-slate-500 sm:text-xl">IPDA</p>
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
              <Button className="h-10 px-3 sm:h-11 sm:px-4" onClick={() => nav("/carta/formulario")}>
                Fazer Carta
              </Button>
            ) : null}
            <Button variant="outline" className="h-10 px-3 sm:h-11 sm:px-4" onClick={() => nav("/divulgacao")}>
              <Megaphone className="mr-2 h-4 w-4" /> Divulgação
            </Button>
            <Button variant="outline" className="h-10 px-3 sm:h-11 sm:px-4" onClick={() => nav("/config")}>
              Configuração
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
              className={`rounded-xl px-4 py-2 text-lg font-semibold ${tab === "cartas" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
              onClick={() => setTab("cartas")}
            >
              Cartas ({letters.length})
            </button>
            {canManageChurches ? (
              <button
                className={`rounded-xl px-4 py-2 text-lg font-semibold ${tab === "igrejas" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
                onClick={() => setTab("igrejas")}
              >
                Igrejas ({churchesTotal})
              </button>
            ) : null}
          </div>
        </section>

        {tab === "cartas" ? (
          <CartasTab
            letters={letters}
            scopeTotvsIds={scopeTotvsIds}
            phonesByUserId={phonesByUserId}
            phonesByName={phonesByName}
            viewerRole={usuario?.role as "admin" | "pastor"}
            viewerUserId={String(usuario?.id || "")}
            allowScopeView={allowScopeView}
          />
        ) : (
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
