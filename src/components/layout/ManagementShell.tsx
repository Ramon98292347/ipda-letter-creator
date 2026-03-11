import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Building2, Bell, Church, Download, FileText, Loader2, LogOut, Megaphone, Menu, Settings, Users } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/saasService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type RoleMode = "admin" | "pastor" | "obreiro";

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

// Comentario: item de menu com estilo SaaS corporativo (pill azul suave + underline no ativo).
function MenuNavLink({ item, onClick, loading }: { item: MenuItem; onClick?: () => void; loading?: boolean }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex min-h-10 items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          isActive
            ? "bg-blue-50 text-blue-700"
            : "text-slate-700 hover:bg-blue-50 hover:text-blue-600"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          ) : (
            <Icon className={`h-4 w-4 ${isActive ? "text-blue-700" : "text-slate-500 group-hover:text-blue-600"}`} />
          )}
          <span>{loading ? `${item.label}...` : item.label}</span>
          <span className={`absolute inset-x-3 -bottom-1 h-0.5 rounded-full ${isActive ? "bg-blue-600" : "bg-transparent"}`} />
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
  const menu = roleMode === "admin" ? adminMenu : roleMode === "pastor" ? pastorMenu : obreiroMenu;
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
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4">
          <div className="min-w-0 flex items-center gap-2">
            <Church className="h-6 w-6 text-blue-600" />
            <span className="truncate text-base font-bold text-slate-900 sm:text-lg">Sistema de Gestao Eclesiastica</span>
          </div>

          <div className="hidden flex-1 px-4 lg:block">
            <nav className="flex items-center justify-center gap-3 overflow-x-auto pb-1">
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

          <div className="hidden items-center gap-2 lg:flex">
            {canInstall ? (
              <Button variant="outline" onClick={onInstallApp} className="hover:border-blue-600 hover:bg-blue-50">
                <Download className="mr-2 h-4 w-4" />
                Baixar app
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOpenNotifications(true)}
              className="relative hover:border-blue-600 hover:bg-blue-50"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-semibold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Button>
            <span className="max-w-[240px] truncate text-sm text-slate-500">{usuario?.email || usuario?.nome || "Usuario"}</span>
            <Button variant="outline" onClick={onLogout} className="hover:border-blue-600 hover:bg-blue-50">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
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

      <main className={`mx-auto w-full max-w-[1600px] px-4 py-5 transition-opacity ${pendingRoute ? "opacity-80" : "opacity-100"}`}>{children}</main>

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
            {notifications.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="text-slate-600">{item.message || "Sem mensagem"}</p>
                </div>
                <Button variant="outline" onClick={() => onReadNotification(item.id)} disabled={item.is_read}>
                  {item.is_read ? "Lida" : "Marcar lida"}
                </Button>
              </div>
            ))}
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
