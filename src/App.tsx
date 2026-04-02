import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageLoading } from "@/components/shared/PageLoading";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { lazy, Suspense, useEffect } from "react";
import NotFound from "./pages/NotFound";
import PhoneIdentify from "./pages/PhoneIdentify";
import CadastroRapido from "./pages/CadastroRapido";
import { UserProvider, useUser } from "./context/UserContext";
import { FinanceProvider } from "./contexts/FinanceContext";
import { registerDefaultOfflineHandlers } from "@/lib/offline/registerDefaultHandlers";
import { startOfflineSyncLoop } from "@/lib/offline/syncEngine";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Comentario: dados ficam "frescos" por 5 minutos — evita refetch ao navegar entre paginas
      staleTime: 5 * 60 * 1000,
      // Comentario: cache fica na memoria por 30 minutos apos sair da tela
      gcTime: 30 * 60 * 1000,
      // Comentario: nao refaz chamada so porque o usuario voltou para a aba
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Comentario: se dado ainda esta "fresco" (dentro do staleTime), usa o cache sem chamar a API
      refetchOnMount: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

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

function RequireAuth({ children }: { children: JSX.Element }) {
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
  const { usuario, token } = useUser();
  if (!usuario || !token) return <Navigate to="/" replace />;
  if (usuario.role !== role) return redirectByRole(usuario.role as AppRole);
  return children;
}

function RequireAnyRole({ children, roles }: { children: JSX.Element; roles: AppRole[] }) {
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
      const isPublicPath = publicPaths.has(loc.pathname) || loc.pathname.startsWith("/presenca-publica/");
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
  <>
    <OnReloadRedirect />
    <Outlet />
  </>
);

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
  useEffect(() => {
    registerDefaultOfflineHandlers();
    const stop = startOfflineSyncLoop();
    return () => stop();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <PwaUpdater />
      <PwaOnboarding />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <UserProvider>
        <AppBootstrap />
      </UserProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
