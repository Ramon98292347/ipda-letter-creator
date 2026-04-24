import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageLoading } from "@/components/shared/PageLoading";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  Outlet,
} from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import NotFound from "./pages/NotFound";
import PhoneIdentify from "./pages/PhoneIdentify";
import CadastroRapido from "./pages/CadastroRapido";
import { UserProvider, useUser } from "./context/UserContext";
import { FinanceProvider } from "./contexts/FinanceContext";
import { registerDefaultOfflineHandlers } from "@/lib/offline/registerDefaultHandlers";
import { startOfflineSyncLoop } from "@/lib/offline/syncEngine";
import { DATA_MUTATED_EVENT } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Comentario: dados ficam frescos por mais tempo para reduzir leituras repetidas.
      staleTime: 10 * 60 * 1000,
      // Comentario: mantém cache em memoria por 24h (a persistencia cobre reabertura do app).
      gcTime: 24 * 60 * 60 * 1000,
      // Comentario: nao refaz chamada so porque o usuario voltou para a aba
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Comentario: evita reconsulta no mount quando ja temos cache local/persistido.
      refetchOnMount: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

const queryPersister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: "ipda_rq_cache_v1",
      })
    : undefined;

// Comentario: mapeia mutacao (fnName ou action) para as queryKeys afetadas.
// Evita invalidar todas as queries do sistema quando so uma area mudou.
const MUTATION_TO_KEYS: Record<string, string[]> = {
  // Cartas
  "create-letter": ["pastor-letters", "cartas-dashboard-letters", "cartas-dashboard-metrics", "pastor-metrics", "worker-dashboard", "notifications"],
  "set-letter-status": ["pastor-letters", "cartas-dashboard-letters", "cartas-dashboard-metrics", "pastor-metrics", "worker-dashboard", "notifications"],
  "approve-release": ["pastor-letters", "cartas-dashboard-letters", "cartas-dashboard-metrics", "pastor-metrics", "worker-dashboard", "notifications"],
  // Membros e usuarios
  "create-user": ["pastor-panel-data", "admin-membros-kpi", "admin-membros-inativos-count", "workers", "pastor-obreiros", "notifications"],
  "set-user-registration-status": ["pastor-panel-data", "workers", "pastor-obreiros", "pastor-metrics", "notifications"],
  "toggle-worker-active": ["workers", "pastor-obreiros", "pastor-metrics", "admin-membros-kpi"],
  "set-worker-direct-release": ["workers", "pastor-obreiros"],
  "set-user-payment-status": ["workers", "pastor-obreiros", "notifications"],
  "delete-user": ["workers", "pastor-obreiros", "pastor-metrics", "admin-membros-kpi"],
  "update-member-avatar": ["worker-dashboard", "workers"],
  // Igrejas
  "create-church": ["churches-in-scope", "admin-church-summary", "pastor-igrejas-page", "admin-igrejas-page"],
  "set-church-pastor": ["churches-in-scope", "admin-church-summary", "pastor-igrejas-page", "admin-igrejas-page"],
  // Documentos de membros
  "generate-member-docs": ["worker-docs-status", "ready-carteirinhas"],
  "member-docs-finish": ["worker-docs-status", "ready-carteirinhas"],
  "member-docs-api": ["worker-docs-status", "ready-carteirinhas"],
  // Financeiro
  "fin-api": ["fin-summary", "fin-entries", "fin-categories", "pastor-financeiro"],
  // Notificacoes
  "mark-notification-read": ["notifications"],
  "mark-all-notifications-read": ["notifications"],
  // Caravanas
  "caravanas-api": ["caravanas", "events"],
  // Divulgacao e camisas
  "announcements-api": ["div-ann"],
  "upsert-product": ["div-products", "div-sizes"],
  "upsert-product-size": ["div-sizes"],
  // Deposito/estoque
  "deposit-api": ["deposit-stock", "deposit-summary", "deposit-movements", "deposit-products"],
  // Feedback
  "feedback-api": ["admin-feedback"],
  // Church docs
  "church-docs-api": ["church-docs"],
  "upsert-church-remanejamento": ["church-docs"],
  "upsert-church-contrato": ["church-docs"],
  "upsert-church-laudo": ["church-docs"],
  // Reunioes ministeriais
  "create-ministerial-meeting": ["ministerial-meetings"],
  "manage-ministerial-meeting": ["ministerial-meetings"],
  "save-ministerial-attendance": ["ministerial-meetings"],
};

// Comentario: actions dentro de functions compostas (ex: members-api action=update)
const ACTION_TO_KEYS: Record<string, string[]> = {
  "update": ["workers", "pastor-obreiros", "worker-dashboard", "pastor-panel-data"],
  "update-profile": ["worker-dashboard"],
  "generate": ["worker-docs-status", "ready-carteirinhas"],
  "finish": ["worker-docs-status", "ready-carteirinhas"],
  "delete-docs": ["worker-docs-status", "ready-carteirinhas"],
  "mark-printed": ["ready-carteirinhas"],
  "generate-print-batch": ["ready-carteirinhas"],
  "upsert": ["div-ann", "div-products", "div-sizes"],
  "delete": ["div-ann", "div-products", "div-sizes", "div-orders"],
  "create": ["caravanas", "events", "deposit-stock", "deposit-summary"],
  "entry": ["deposit-stock", "deposit-summary", "deposit-movements"],
  "exit": ["deposit-stock", "deposit-summary", "deposit-movements"],
};

function resolveAffectedQueryKeys(fnName: string, action: string): string[] {
  const keys = new Set<string>();

  // Comentario: tenta achar pelo nome da function
  const fnKeys = MUTATION_TO_KEYS[fnName];
  if (fnKeys) fnKeys.forEach((k) => keys.add(k));

  // Comentario: tenta achar pela action
  const actKeys = ACTION_TO_KEYS[action];
  if (actKeys) actKeys.forEach((k) => keys.add(k));

  return Array.from(keys);
}

const pageFallback = <PageLoading title="Carregando" description="Aguarde..." />;

const CartaPage = lazy(() => import("./pages/Index"));
const CartasDashboardPage = lazy(() => import("./pages/CartasDashboardPage"));
const UsuarioDashboardPage = lazy(() => import("./pages/UsuarioDashboard"));
const UsuarioDocumentosPage = lazy(() => import("./pages/UsuarioDocumentosPage"));
const PastorDashboardPage = lazy(() => import("./pages/PastorDashboardPage"));
const PastorIgrejasPage = lazy(() => import("./pages/PastorIgrejasPage"));
const PastorMembrosPage = lazy(() => import("./pages/PastorMembrosPage"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminIgrejasPage = lazy(() => import("./pages/AdminIgrejasPage"));
const AdminMembrosPage = lazy(() => import("./pages/AdminMembrosPage"));
const SelectChurchPage = lazy(() => import("./pages/SelectChurch"));
const ResetSenhaPage = lazy(() => import("./pages/ResetSenhaPage"));
const ConfiguracoesPage = lazy(() => import("./pages/Configuracoes"));
const DivulgacaoPage = lazy(() => import("./pages/Divulgacao"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const PresencaPublicaPage = lazy(() => import("./pages/PresencaPublica"));
const FinanceiroDashboardPage = lazy(() => import("./pages/FinanceiroDashboardPage"));
const FinanceiroContagemPage = lazy(() => import("./pages/FinanceiroContagemPage"));
const FinanceiroSaidasPage = lazy(() => import("./pages/FinanceiroSaidasPage"));
const PastorFinanceiroPage = lazy(() => import("./pages/PastorFinanceiroPage"));
const FinanceiroFichaPage = lazy(() => import("./pages/FinanceiroFichaPage"));
const FinanceiroRelatoriosPage = lazy(() => import("./pages/FinanceiroRelatoriosPage"));
const FinanceiroConfigPage = lazy(() => import("./pages/FinanceiroConfigPage"));
const CamisasPublicPage = lazy(() => import("./pages/CamisasPublicPage"));
const CamisasPedidoPage = lazy(() => import("./pages/CamisasPedidoPage"));
const ValidarCartaPage = lazy(() => import("./pages/ValidarCartaPage"));
// Comentario: pagina do modulo Deposito (controle de estoque)
const DepositoPage = lazy(() => import("./pages/DepositoPage"));
// Comentario: paginas de caravanas
const CaravanaPublicPage = lazy(() => import("./pages/CaravanaPublicPage"));
const CaravanasPage = lazy(() => import("./pages/CaravanasPage"));
const CaravanaLandingPage = lazy(() => import("./pages/CaravanaLandingPage"));
const CaravanaByChurchPage = lazy(() => import("./pages/CaravanaByChurchPage"));
const CaravanaEventPage = lazy(() => import("./pages/CaravanaEventPage"));
const SYSTEM_SHUTDOWN_MODE = true;
const AUTH_CLEARED_EVENT = "ipda-auth-cleared";

function RequireAuth({ children }: { children: JSX.Element }) {
  if (SYSTEM_SHUTDOWN_MODE) return <Navigate to="/" replace />;
  const { usuario, token } = useUser();
  if (!usuario || !token) return <Navigate to="/" replace />;
  return children;
}

type AppRole = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";

function redirectByRole(role?: AppRole | null) {
  if (role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (role === "pastor") return <Navigate to="/pastor/dashboard" replace />;
  if (role === "secretario") return <Navigate to="/pastor/dashboard" replace />;
  if (role === "obreiro") return <Navigate to="/obreiro" replace />;
  if (role === "financeiro") return <Navigate to="/financeiro/dashboard" replace />;
  return <Navigate to="/" replace />;
}

function RequireRole({ children, role }: { children: JSX.Element; role: AppRole }) {
  if (SYSTEM_SHUTDOWN_MODE) return <Navigate to="/" replace />;
  const { usuario, token } = useUser();
  if (!usuario || !token) return <Navigate to="/" replace />;
  if (usuario.role !== role) return redirectByRole(usuario.role as AppRole);
  return children;
}

function RequireAnyRole({ children, roles }: { children: JSX.Element; roles: AppRole[] }) {
  if (SYSTEM_SHUTDOWN_MODE) return <Navigate to="/" replace />;
  const { usuario, token } = useUser();
  if (!usuario || !token) return <Navigate to="/" replace />;
  if (!roles.includes(usuario.role as AppRole)) return redirectByRole(usuario.role as AppRole);
  return children;
}

function OnReloadRedirect() {
  const nav = useNavigate();
  const loc = useLocation();
  const { usuario, token, pendingCpf, availableChurches } = useUser();

  useEffect(() => {
    try {
      const entries = performance.getEntriesByType("navigation") as PerformanceEntry[];
      const last = entries && entries.length ? entries[entries.length - 1] : undefined;
      const type = (last && (last as unknown as { type?: string }).type) ?? undefined;
      const publicPaths = new Set(["/", "/cadastro", "/reset-senha", "/validar-carta", "/caravanas/registrar", "/caravanas-evento"]);
      const isPublicPath = publicPaths.has(loc.pathname) || loc.pathname.startsWith("/presenca-publica/") || (loc.pathname.startsWith("/caravanas/") && loc.pathname !== "/caravanas");
      const isCamisasPublicPath = loc.pathname.startsWith("/camisas/");
      const isSelectChurchValid = loc.pathname === "/select-church" && !!pendingCpf && availableChurches.length > 0;
      if (type === "reload" && !isPublicPath && !isCamisasPublicPath && (!usuario || !token) && !isSelectChurchValid) {
        nav("/", { replace: true });
      }
    } catch {
      return;
    }
  }, [nav, loc.pathname, usuario, token, pendingCpf, availableChurches.length]);

  return null;
}

const RootLayout = () => (
  <RootGuard />
);

function RootGuard() {
  const loc = useLocation();
  if (SYSTEM_SHUTDOWN_MODE && loc.pathname !== "/") return <Navigate to="/" replace />;
  return (
    <>
      <OnReloadRedirect />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route path="/" element={<PhoneIdentify />} />
      <Route
        path="/presenca-publica/:token"
        element={
          <Suspense fallback={pageFallback}>
            <PresencaPublicaPage />
          </Suspense>
        }
      />
      <Route
        path="/select-church"
        element={
          <Suspense fallback={pageFallback}>
            <SelectChurchPage />
          </Suspense>
        }
      />
      <Route path="/cadastro" element={<CadastroRapido />} />
      <Route
        path="/camisas/:churchTotvsId"
        element={
          <Suspense fallback={pageFallback}>
            <CamisasPublicPage />
          </Suspense>
        }
      />
      <Route
        path="/camisas/:churchTotvsId/pedido"
        element={
          <Suspense fallback={pageFallback}>
            <CamisasPedidoPage />
          </Suspense>
        }
      />
      <Route
        path="/reset-senha"
        element={
          <Suspense fallback={pageFallback}>
            <ResetSenhaPage />
          </Suspense>
        }
      />
      <Route
        path="/caravanas-evento"
        element={
          <Suspense fallback={pageFallback}>
            <CaravanaLandingPage />
          </Suspense>
        }
      />
      <Route
        path="/caravanas/registrar"
        element={
          <Suspense fallback={pageFallback}>
            <CaravanaPublicPage />
          </Suspense>
        }
      />
      <Route
        path="/caravanas/evento/:eventId"
        element={
          <Suspense fallback={pageFallback}>
            <CaravanaEventPage />
          </Suspense>
        }
      />
      <Route
        path="/caravanas/:churchTotvsId"
        element={
          <Suspense fallback={pageFallback}>
            <CaravanaByChurchPage />
          </Suspense>
        }
      />
      <Route
        path="/usuario"
        element={
          <RequireAuth>
            <Suspense fallback={pageFallback}>
              <UsuarioDashboardPage />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        path="/usuario/documentos"
        element={
          <RequireAuth>
            <Suspense fallback={pageFallback}>
              <UsuarioDocumentosPage />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        path="/obreiro"
        element={
          <RequireAnyRole roles={["obreiro", "pastor", "admin", "secretario", "financeiro"]}>
            <Suspense fallback={pageFallback}>
              <UsuarioDashboardPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <Navigate to="/admin/dashboard" replace />
          </RequireRole>
        }
      />
      <Route
        path="/pastor"
        element={
          <RequireAnyRole roles={["pastor", "secretario"]}>
            <Navigate to="/pastor/dashboard" replace />
          </RequireAnyRole>
        }
      />
      <Route
        path="/pastor/dashboard"
        element={
          <RequireAnyRole roles={["pastor", "secretario"]}>
            <Suspense fallback={pageFallback}>
              <PastorDashboardPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/pastor/perfil"
        element={
          <RequireAnyRole roles={["pastor", "secretario"]}>
            <Suspense fallback={pageFallback}>
              <UsuarioDashboardPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/pastor/igrejas"
        element={
          <RequireAnyRole roles={["pastor", "secretario"]}>
            <Suspense fallback={pageFallback}>
              <PastorIgrejasPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/pastor/membros"
        element={
          <RequireAnyRole roles={["pastor", "secretario"]}>
            <Suspense fallback={pageFallback}>
              <PastorMembrosPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/pastor/financeiro"
        element={
          <RequireAnyRole roles={["pastor", "secretario"]}>
            <Suspense fallback={pageFallback}>
              <PastorFinanceiroPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      {/* Comentario: rota Deposito para pastor e secretario */}
      <Route
        path="/pastor/deposito"
        element={
          <RequireAnyRole roles={["pastor", "secretario"]}>
            <Suspense fallback={pageFallback}>
              <DepositoPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/secretario"
        element={
          <RequireRole role="secretario">
            <Navigate to="/pastor/dashboard" replace />
          </RequireRole>
        }
      />
      <Route
        path="/financeiro"
        element={
          <RequireRole role="financeiro">
            <Navigate to="/financeiro/dashboard" replace />
          </RequireRole>
        }
      />
      <Route
        path="/financeiro/dashboard"
        element={
          <RequireRole role="financeiro">
            <FinanceProvider>
              <Suspense fallback={pageFallback}>
                <FinanceiroDashboardPage />
              </Suspense>
            </FinanceProvider>
          </RequireRole>
        }
      />
      <Route
        path="/financeiro/perfil"
        element={
          <RequireRole role="financeiro">
            <Suspense fallback={pageFallback}>
              <UsuarioDashboardPage />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/financeiro/contagem"
        element={
          <RequireRole role="financeiro">
            <FinanceProvider>
              <Suspense fallback={pageFallback}>
                <FinanceiroContagemPage />
              </Suspense>
            </FinanceProvider>
          </RequireRole>
        }
      />
      <Route
        path="/financeiro/saidas"
        element={
          <RequireRole role="financeiro">
            <FinanceProvider>
              <Suspense fallback={pageFallback}>
                <FinanceiroSaidasPage />
              </Suspense>
            </FinanceProvider>
          </RequireRole>
        }
      />
      <Route
        path="/financeiro/ficha"
        element={
          <RequireRole role="financeiro">
            <FinanceProvider>
              <Suspense fallback={pageFallback}>
                <FinanceiroFichaPage />
              </Suspense>
            </FinanceProvider>
          </RequireRole>
        }
      />
      <Route
        path="/financeiro/relatorios"
        element={
          <RequireRole role="financeiro">
            <FinanceProvider>
              <Suspense fallback={pageFallback}>
                <FinanceiroRelatoriosPage />
              </Suspense>
            </FinanceProvider>
          </RequireRole>
        }
      />
      <Route
        path="/financeiro/config"
        element={
          <RequireRole role="financeiro">
            <FinanceProvider>
              <Suspense fallback={pageFallback}>
                <FinanceiroConfigPage />
              </Suspense>
            </FinanceProvider>
          </RequireRole>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <RequireRole role="admin">
            <Suspense fallback={pageFallback}>
              <AdminDashboardPage />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/admin/perfil"
        element={
          <RequireRole role="admin">
            <Suspense fallback={pageFallback}>
              <UsuarioDashboardPage />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/admin/igrejas"
        element={
          <RequireRole role="admin">
            <Suspense fallback={pageFallback}>
              <AdminIgrejasPage />
            </Suspense>
          </RequireRole>
        }
      />
      {/* Comentario: rota Deposito para admin */}
      <Route
        path="/admin/deposito"
        element={
          <RequireRole role="admin">
            <Suspense fallback={pageFallback}>
              <DepositoPage />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/admin/membros"
        element={
          <RequireRole role="admin">
            <Suspense fallback={pageFallback}>
              <AdminMembrosPage />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/admin/cartas"
        element={
          <RequireRole role="admin">
            <Suspense fallback={pageFallback}>
              <CartasDashboardPage />
            </Suspense>
          </RequireRole>
        }
      />
      <Route
        path="/caravanas"
        element={
          <RequireAnyRole roles={["admin", "pastor", "secretario"]}>
            <Suspense fallback={pageFallback}>
              <CaravanasPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/config"
        element={
          <RequireAnyRole roles={["admin", "pastor"]}>
            <Suspense fallback={pageFallback}>
              <ConfiguracoesPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/divulgacao"
        element={
          <RequireAnyRole roles={["admin", "pastor"]}>
            <Suspense fallback={pageFallback}>
              <DivulgacaoPage />
            </Suspense>
          </RequireAnyRole>
        }
      />
      <Route
        path="/feedback"
        element={
          <RequireAuth>
            <Suspense fallback={pageFallback}>
              <FeedbackPage />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        path="/carta"
        element={
          <RequireAuth>
            <Suspense fallback={pageFallback}>
              <CartasDashboardPage />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        path="/carta/formulario"
        element={
          <RequireAuth>
            <Suspense fallback={pageFallback}>
              <CartaPage />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        path="/validar-carta"
        element={
          <Suspense fallback={pageFallback}>
            <ValidarCartaPage />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Route>
  ),
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  },
);

import { PwaUpdater } from "@/components/shared/PwaUpdater";
import { PwaOnboarding } from "@/components/shared/PwaOnboarding";

function AppBootstrap() {
  const queryClient = useQueryClient();
  const [resetDone, setResetDone] = useState(!SYSTEM_SHUTDOWN_MODE);

  useEffect(() => {
    if (!SYSTEM_SHUTDOWN_MODE || typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        queryClient.clear();
        localStorage.clear();
        sessionStorage.clear();
        window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));

        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        }

        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      } finally {
        if (!cancelled) setResetDone(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(() => {
    if (SYSTEM_SHUTDOWN_MODE) return;
    registerDefaultOfflineHandlers();
    const stop = startOfflineSyncLoop();
    return () => stop();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timer: number | null = null;
    const handleDataMutation = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { fnName?: string; action?: string } | undefined;
      const fnName = String(detail?.fnName || "").toLowerCase();
      const action = String(detail?.action || "").toLowerCase();

      // Comentario: consolida mutacoes em lote para evitar cascata de refetch.
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        // Comentario: mapa de mutacao → queries afetadas.
        // Invalida apenas as queries relacionadas, nao o sistema inteiro.
        const affectedKeys = resolveAffectedQueryKeys(fnName, action);

        if (affectedKeys.length === 0) {
          // Comentario: mutacao desconhecida — invalida apenas queries ativas como fallback seguro.
          await queryClient.invalidateQueries({ type: "active" }, { cancelRefetch: false });
          await queryClient.refetchQueries({ type: "active" });
          return;
        }

        // Comentario: invalida apenas as queries afetadas pela mutacao
        for (const key of affectedKeys) {
          await queryClient.invalidateQueries({ queryKey: [key] }, { cancelRefetch: false });
        }
        // Comentario: refaz apenas queries ativas (visiveis na tela)
        await queryClient.refetchQueries({ type: "active" });
      }, 150);
    };

    window.addEventListener(DATA_MUTATED_EVENT, handleDataMutation as EventListener);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(DATA_MUTATED_EVENT, handleDataMutation as EventListener);
    };
  }, [queryClient]);

  if (!resetDone) return null;

  return (
    <>
      <RouterProvider router={router} />
      {!SYSTEM_SHUTDOWN_MODE ? (
        <>
          <PwaUpdater />
          <PwaOnboarding />
        </>
      ) : null}
    </>
  );
}

const AppProviders = () => (
  <TooltipProvider>
    <Sonner />
    <UserProvider>
      <AppBootstrap />
    </UserProvider>
  </TooltipProvider>
);

const App = () => {
  if (!queryPersister) {
    return (
      <QueryClientProvider client={queryClient}>
        <AppProviders />
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: SYSTEM_SHUTDOWN_MODE ? "shutdown-2026-04-23" : "v1",
      }}
    >
      <AppProviders />
    </PersistQueryClientProvider>
  );
};

export default App;
