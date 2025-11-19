import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
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
          <Routes>
            <Route path="/" element={<PhoneIdentify />} />
            <Route path="/cadastro" element={<CadastroRapido />} />
            <Route
              path="/carta"
              element={
                <RequirePhoneOrUser>
                  <Suspense fallback={<div />}> 
                    <CartaPage />
                  </Suspense>
                </RequirePhoneOrUser>
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

function RequirePhoneOrUser({ children }: { children: JSX.Element }) {
  const { usuario, telefone } = useUser();
  if (!usuario && !telefone) return <Navigate to="/" replace />;
  return children;
}
const CartaPage = lazy(() => import("./pages/Index"));
