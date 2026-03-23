import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageLoading } from "@/components/shared/PageLoading";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import NotFound from "./pages/NotFound";
import PhoneIdentify from "./pages/PhoneIdentify";
import CadastroRapido from "./pages/CadastroRapido";
import { UserProvider, useUser } from "./context/UserContext";
import { FinanceProvider } from "./contexts/FinanceContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

const pageFallback = <PageLoading title="Carregando" description="Aguarde..." />;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <UserProvider>
        <BrowserRouter>
          <OnReloadRedirect />
          <Routes>
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
              path="/reset-senha"
              element={
                <Suspense fallback={pageFallback}>
                  <ResetSenhaPage />
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
                <RequireRole role="obreiro">
                  <Suspense fallback={pageFallback}>
                    <UsuarioDashboardPage />
                  </Suspense>
                </RequireRole>
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
                  <Suspense fallback={pageFallback}>
                    <FinanceiroSaidasPage />
                  </Suspense>
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
                  <Suspense fallback={pageFallback}>
                    <FinanceiroConfigPage />
                  </Suspense>
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </UserProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

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
      const publicPaths = new Set(["/", "/cadastro", "/reset-senha"]);
      const isPublicPath = publicPaths.has(loc.pathname) || loc.pathname.startsWith("/presenca-publica/");
      const isSelectChurchValid = loc.pathname === "/select-church" && !!pendingCpf && availableChurches.length > 0;
      if (type === "reload" && !isPublicPath && (!usuario || !token) && !isSelectChurchValid) {
        nav("/", { replace: true });
      }
    } catch {
      return;
    }
  }, [nav, loc.pathname, usuario, token, pendingCpf, availableChurches.length]);

  return null;
}

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
