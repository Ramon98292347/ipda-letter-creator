import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BarChart2, Building2, Bell, Calculator, Church, ClipboardList, DollarSign, Download, FileText, Loader2, LogOut, Megaphone, Menu, Settings, TrendingDown, Users } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/saasService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type RoleMode = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";

type MenuItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const pastorMenu: MenuItem[] = [
  { to: "/pastor/dashboard", label: "Dashboard", icon: FileText },
  { to: "/pastor/membros", label: "Membros", icon: Users },
  { to: "/pastor/igrejas", label: "Igrejas", icon: Building2 },
  { to: "/carta", label: "Cartas", icon: FileText },
  { to: "/pastor/financeiro", label: "Financeiro", icon: DollarSign },
  { to: "/divulgacao", label: "Divulgacao", icon: Megaphone },
  { to: "/config", label: "Configuracoes", icon: Settings },
];

const adminMenu: MenuItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: FileText },
  { to: "/admin/membros", label: "Membros", icon: Users },
  { to: "/admin/igrejas", label: "Igrejas", icon: Building2 },
  { to: "/carta", label: "Cartas", icon: FileText },
  { to: "/divulgacao", label: "Divulgacao", icon: Megaphone },
  { to: "/config", label: "Configuracoes", icon: Settings },
];

const obreiroMenu: MenuItem[] = [
  { to: "/obreiro", label: "Dashboard", icon: FileText },
  { to: "/usuario/documentos", label: "Documentos", icon: Users },
];

// Secretario tem o mesmo menu do pastor (incluindo financeiro)
const secretarioMenu: MenuItem[] = [
  { to: "/pastor/dashboard", label: "Dashboard", icon: FileText },
  { to: "/pastor/membros", label: "Membros", icon: Users },
  { to: "/pastor/igrejas", label: "Igrejas", icon: Building2 },
  { to: "/carta", label: "Cartas", icon: FileText },
  { to: "/pastor/financeiro", label: "Financeiro", icon: DollarSign },
  { to: "/divulgacao", label: "Divulgacao", icon: Megaphone },
  { to: "/config", label: "Configuracoes", icon: Settings },
];

// Comentario: financeiro tem acesso ao dashboard, contagem de caixa, saídas, ficha diária, relatórios e configurações
const financeiroMenu: MenuItem[] = [
  { to: "/financeiro/dashboard", label: "Dashboard", icon: FileText },
  { to: "/financeiro/contagem", label: "Contagem", icon: Calculator },
  { to: "/financeiro/saidas", label: "Saídas", icon: TrendingDown },
  { to: "/financeiro/ficha", label: "Ficha Diária", icon: ClipboardList },
  { to: "/financeiro/relatorios", label: "Relatórios", icon: BarChart2 },
  { to: "/financeiro/config", label: "Configurações", icon: Settings },
];

// Comentario: item de menu compacto em telas médias (lg) e normal em telas grandes (xl+).
function MenuNavLink({ item, onClick, loading }: { item: MenuItem; onClick?: () => void; loading?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex min-h-9 items-center gap-1.5 rounded-full px-2 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 xl:min-h-10 xl:gap-2 xl:px-3 xl:py-2 xl:text-sm ${
          isActive
            ? "bg-blue-50 text-blue-700"
            : "text-slate-700 hover:bg-blue-50 hover:text-blue-600"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-700 xl:h-4 xl:w-4" />
          ) : (
            <Icon className={`h-3.5 w-3.5 xl:h-4 xl:w-4 ${isActive ? "text-blue-700" : "text-slate-500 group-hover:text-blue-600"}`} />
          )}
          <span>{loading ? `${item.label}...` : item.label}</span>
          <span className={`absolute inset-x-2 -bottom-1 h-0.5 rounded-full xl:inset-x-3 ${isActive ? "bg-blue-600" : "bg-transparent"}`} />
        </>
      )}
    </NavLink>
  );
}

// Comentario: layout principal para pastor/admin com header responsivo e menu mobile suspenso.
export function ManagementShell({
  roleMode,
  children,
}: {
  roleMode: RoleMode;
  children: ReactNode;
}) {
  const nav = useNavigate();
  const location = useLocation();
  const { usuario, clearAuth } = useUser();
  const menu =
    roleMode === "admin" ? adminMenu :
    roleMode === "pastor" ? pastorMenu :
    roleMode === "secretario" ? secretarioMenu :
    roleMode === "financeiro" ? financeiroMenu :
    obreiroMenu;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [openInstallPrompt, setOpenInstallPrompt] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const { canInstall, install, isInstalled } = usePwaInstall();
  const queryClient = useQueryClient();

  const { data: notificationsData } = useQuery({
    queryKey: ["topbar-notifications", 1, 30],
    queryFn: () => listNotifications(1, 30, false),
    enabled: Boolean(usuario?.role),
    // Verifica novas notificacoes automaticamente a cada 60 segundos
    refetchInterval: 60 * 1000,
  });
  const notifications = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unread_count || 0;

  useEffect(() => {
    if (!canInstall || isInstalled || !usuario?.id) return;
    const key = `ipda_install_prompt_seen_${usuario.id}`;
    const seen = localStorage.getItem(key) === "1";
    if (!seen) {
      setOpenInstallPrompt(true);
      localStorage.setItem(key, "1");
    }
  }, [canInstall, isInstalled, usuario?.id]);

  useEffect(() => {
    if (!pendingRoute) return;
    const timer = setTimeout(() => setPendingRoute(null), 350);
    return () => clearTimeout(timer);
  }, [location.pathname, pendingRoute]);

  function navigateWithLoading(to: string) {
    setPendingRoute(to);
    nav(to);
  }

  function onLogout() {
    clearAuth();
    nav("/", { replace: true });
  }

  async function onInstallApp() {
    await install();
    setOpenInstallPrompt(false);
  }

  async function onReadNotification(id: string) {
    await markNotificationRead(id);
    await queryClient.invalidateQueries({ queryKey: ["topbar-notifications"] });
  }

  async function onReadAllNotifications() {
    await markAllNotificationsRead();
    await queryClient.invalidateQueries({ queryKey: ["topbar-notifications"] });
    setOpenNotifications(false);
  }

  return (
    <div className="min-h-screen bg-[#F6F8FC]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-2 px-3 xl:h-16 xl:gap-3 xl:px-4">
          {/* Comentario: logo — texto curto em lg, completo em xl+ */}
          <div className="flex shrink-0 items-center gap-2">
            <Church className="h-5 w-5 text-blue-600 xl:h-6 xl:w-6" />
            <span className="hidden text-sm font-bold text-slate-900 sm:block lg:hidden xl:block xl:text-lg">
              Sistema de Gestao Eclesiastica
            </span>
            <span className="block text-sm font-bold text-slate-900 sm:hidden">IPDA</span>
          </div>

          {/* Comentario: nav visível a partir de lg, gap compacto em lg e normal em xl */}
          <div className="hidden min-w-0 flex-1 px-2 lg:block xl:px-4">
            <nav className="flex items-center justify-center gap-1 overflow-x-auto pb-1 xl:gap-2">
              {menu.map((item) => (
                <MenuNavLink
                  key={item.to}
                  item={item}
                  loading={pendingRoute === item.to}
                  onClick={() => setPendingRoute(item.to)}
                />
              ))}
            </nav>
          </div>

          <div className="hidden shrink-0 items-center gap-1.5 lg:flex xl:gap-2">
            {canInstall ? (
              <Button variant="outline" size="sm" onClick={onInstallApp} className="hover:border-blue-600 hover:bg-blue-50">
                <Download className="mr-1 h-3.5 w-3.5 xl:mr-2 xl:h-4 xl:w-4" />
                <span className="hidden xl:inline">Baixar app</span>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOpenNotifications(true)}
              className="relative h-8 w-8 hover:border-blue-600 hover:bg-blue-50 xl:h-9 xl:w-9"
            >
              <Bell className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-semibold text-white xl:h-5 xl:w-5 xl:text-[10px]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Button>
            {/* Comentario: para o role financeiro, exibe card com nome e totvs da igreja */}
            {roleMode === "financeiro" && usuario?.church_name ? (
              <div className="flex flex-col items-end rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 xl:px-3">
                <span className="max-w-[140px] truncate text-xs font-semibold text-blue-800 xl:max-w-[200px]">{usuario.church_name}</span>
                <span className="text-[10px] text-blue-500">TOTVS: {usuario.default_totvs_id || usuario.totvs}</span>
              </div>
            ) : (
              <span className="hidden max-w-[140px] truncate text-xs text-slate-500 xl:block xl:max-w-[200px] xl:text-sm">{usuario?.email || usuario?.nome || "Usuario"}</span>
            )}
            <Button variant="outline" size="sm" onClick={onLogout} className="hover:border-blue-600 hover:bg-blue-50">
              <LogOut className="mr-1 h-3.5 w-3.5 xl:mr-2 xl:h-4 xl:w-4" />
              <span className="hidden xl:inline">Sair</span>
            </Button>
          </div>

          <div className="lg:hidden">
            <DropdownMenu open={mobileOpen} onOpenChange={setMobileOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {menu.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.to}
                      onClick={() => {
                        setMobileOpen(false);
                        navigateWithLoading(item.to);
                      }}
                      className="flex min-h-10 items-center gap-2"
                    >
                      {pendingRoute === item.to ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      ) : (
                        <Icon className="h-4 w-4 text-slate-500" />
                      )}
                      <span>{pendingRoute === item.to ? `${item.label}...` : item.label}</span>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuItem
                  onClick={() => {
                    setMobileOpen(false);
                    setOpenNotifications(true);
                  }}
                  className="flex min-h-10 items-center gap-2"
                >
                  <Bell className="h-4 w-4 text-slate-500" />
                  <span>Notificações</span>
                  {unreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </DropdownMenuItem>
                {canInstall ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setMobileOpen(false);
                      void onInstallApp();
                    }}
                    className="flex min-h-10 items-center gap-2"
                  >
                    <Download className="h-4 w-4 text-slate-500" />
                    <span>Baixar app</span>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="mt-1 flex min-h-10 items-center gap-2 text-rose-600"
                  onClick={() => {
                    setMobileOpen(false);
                    onLogout();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {pendingRoute ? (
        <div className="mx-auto w-full max-w-[1600px] px-4 pt-2">
          <div className="h-1 overflow-hidden rounded bg-blue-100">
            <div className="h-full w-1/3 animate-pulse rounded bg-blue-600" />
          </div>
        </div>
      ) : null}

      {/* Comentario: padding menor em telas médias, normal em xl+ */}
      <main className={`mx-auto w-full max-w-[1600px] px-3 py-4 transition-opacity xl:px-4 xl:py-5 ${pendingRoute ? "opacity-80" : "opacity-100"}`}>{children}</main>

      <Dialog open={openNotifications} onOpenChange={setOpenNotifications}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Notificações</DialogTitle>
            <DialogDescription>Atualizações do seu escopo de igrejas.</DialogDescription>
          </DialogHeader>
          <div className="mb-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={onReadAllNotifications}>
              Limpar notificacoes
            </Button>
          </div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {notifications.length === 0 ? <p className="text-sm text-slate-500">Sem notificações.</p> : null}
            {notifications.map((item) => {
              // Comentario: para notificacoes de aniversario, exibe telefone se disponivel no campo data
              const phone = item.type === "birthday" && item.data?.phone ? String(item.data.phone) : null;
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-slate-600">{item.message || "Sem mensagem"}</p>
                    {phone ? (
                      <a
                        href={`https://wa.me/55${phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                      >
                        📱 {phone}
                      </a>
                    ) : null}
                  </div>
                  <Button variant="outline" onClick={() => onReadNotification(item.id)} disabled={item.is_read}>
                    {item.is_read ? "Lida" : "Marcar lida"}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openInstallPrompt} onOpenChange={setOpenInstallPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Instalar aplicativo</DialogTitle>
            <DialogDescription>No primeiro acesso, recomendamos instalar o app para usar mais rápido no celular.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenInstallPrompt(false)}>
              Agora não
            </Button>
            <Button onClick={onInstallApp} className="bg-blue-600 hover:bg-blue-700">
              <Download className="mr-2 h-4 w-4" />
              Baixar app
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
