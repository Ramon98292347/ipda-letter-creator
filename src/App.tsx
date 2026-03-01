import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import NotFound from "./pages/NotFound";
import PhoneIdentify from "./pages/PhoneIdentify";
import CadastroRapido from "./pages/CadastroRapido";
import { UserProvider, useUser } from "./context/UserContext";

const queryClient = new QueryClient();

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
              path="/select-church"
              element={
                <Suspense fallback={<div />}>
                  <SelectChurchPage />
                </Suspense>
              }
            />
            <Route
              path="/cadastro"
              element={
                <RequireAuth>
                  <CadastroRapido />
                </RequireAuth>
              }
            />
            <Route
              path="/usuario"
              element={
                <RequireAuth>
                  <Suspense fallback={<div />}>
                    <UsuarioDashboardPage />
                  </Suspense>
                </RequireAuth>
              }
            />
            <Route
              path="/obreiro"
              element={
                <RequireRole role="obreiro">
                  <Suspense fallback={<div />}>
                    <UsuarioDashboardPage />
                  </Suspense>
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole role="admin">
                  <Suspense fallback={<div />}>
                    <AdminPastorDashboardPage />
                  </Suspense>
                </RequireRole>
              }
            />
            <Route
              path="/pastor"
              element={
                <RequireRole role="pastor">
                  <Suspense fallback={<div />}>
                    <AdminPastorDashboardPage />
                  </Suspense>
                </RequireRole>
              }
            />
            <Route
              path="/config"
              element={
                <RequireAnyRole roles={["admin", "pastor"]}>
                  <Suspense fallback={<div />}>
                    <ConfiguracoesPage />
                  </Suspense>
                </RequireAnyRole>
              }
            />
            <Route
              path="/carta"
              element={
                <RequireAuth>
                  <Suspense fallback={<div />}> 
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
function RequireRole({ children, role }: { children: JSX.Element; role: "admin" | "pastor" | "obreiro" }) {
  const { usuario, token } = useUser();
  if (!usuario || !token) return <Navigate to="/" replace />;
  if (usuario.role !== role) {
    if (usuario.role === "admin") return <Navigate to="/admin" replace />;
    if (usuario.role === "pastor") return <Navigate to="/pastor" replace />;
    if (usuario.role === "obreiro") return <Navigate to="/obreiro" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
}
function RequireAnyRole({ children, roles }: { children: JSX.Element; roles: Array<"admin" | "pastor" | "obreiro"> }) {
  const { usuario, token } = useUser();
  if (!usuario || !token) return <Navigate to="/" replace />;
  if (!roles.includes(usuario.role as "admin" | "pastor" | "obreiro")) {
    if (usuario.role === "admin") return <Navigate to="/admin" replace />;
    if (usuario.role === "pastor") return <Navigate to="/pastor" replace />;
    if (usuario.role === "obreiro") return <Navigate to="/obreiro" replace />;
    return <Navigate to="/" replace />;
  }
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
      const isSelectChurchValid = loc.pathname === "/select-church" && !!pendingCpf && availableChurches.length > 0;
      if (type === "reload" && loc.pathname !== "/" && (!usuario || !token) && !isSelectChurchValid) {
        nav("/", { replace: true });
      }
    } catch { return; }
  }, [nav, loc.pathname, usuario, token, pendingCpf, availableChurches.length]);
  return null;
}
const CartaPage = lazy(() => import("./pages/Index"));
const UsuarioDashboardPage = lazy(() => import("./pages/UsuarioDashboard"));
const AdminPastorDashboardPage = lazy(() => import("./pages/AdminPastorDashboard"));
const SelectChurchPage = lazy(() => import("./pages/SelectChurch"));
const ConfiguracoesPage = lazy(() => import("./pages/Configuracoes"));
