import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { selectChurchSession } from "@/services/saasService";
import { useUser } from "@/context/UserContext";
import { setRlsToken, setToken as setStoredToken } from "@/lib/api";

function routeByRole(role: "admin" | "pastor" | "obreiro" | "secretario" | "financeiro") {
  if (role === "admin") return "/admin/dashboard";
  if (role === "pastor" || role === "secretario") return "/pastor/dashboard";
  if (role === "financeiro") return "/financeiro/dashboard";
  return "/obreiro";
}

export default function SelectChurch() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const {
    pendingCpf,
    availableChurches,
    setToken,
    setSession,
    setUsuario,
    setPendingCpf,
    setAvailableChurches,
  } = useUser();
  const [totvsId, setTotvsId] = useState("");
  const [loading, setLoading] = useState(false);

  const options = useMemo(() => {
    return availableChurches.filter((c) => c.totvs_id);
  }, [availableChurches]);

  async function confirm() {
    if (!pendingCpf) {
      toast.error("SessÃ£o de escolha de igreja invÃ¡lida. FaÃ§a login novamente.");
      nav("/");
      return;
    }
    if (!totvsId) {
      toast.error("Selecione a igreja.");
      return;
    }

    setLoading(true);
    try {
      const data = await selectChurchSession(pendingCpf, totvsId);
      const fixedSession = {
        ...data.session,
        root_totvs_id: data.session.root_totvs_id || data.session.totvs_id,
      };
      queryClient.clear();
      setStoredToken(data.token);
      setRlsToken(data.rls_token || null);
      setToken(data.token);
      setSession(fixedSession);
      if (fixedSession.totvs_id) localStorage.setItem("ipda_last_totvs", fixedSession.totvs_id);
      setUsuario({
        id: data.user.id,
        nome: data.user.full_name,
        full_name: data.user.full_name,
        telefone: data.user.phone || "",
        cpf: data.user.cpf,
        role: data.user.role,
        email: data.user.email || null,
        avatar_url: data.user.avatar_url || null,
        ministerial: data.user.minister_role || null,
        can_create_released_letter: Boolean(data.user.can_create_released_letter),
        birth_date: data.user.birth_date || null,
        totvs: fixedSession.totvs_id || null,
        default_totvs_id: fixedSession.totvs_id || null,
        church_name: fixedSession.church_name || null,
        church_class: fixedSession.church_class || null,
        totvs_access: fixedSession.scope_totvs_ids || null,
        igreja_nome: fixedSession.church_name || null,
      });
      setPendingCpf(undefined);
      setAvailableChurches([]);
      nav(routeByRole(data.user.role), { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Falha ao selecionar igreja.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f3f5f9]">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Selecionar Igreja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Igreja (TOTVS)</Label>
            <Select value={totvsId} onValueChange={setTotvsId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a igreja" />
              </SelectTrigger>
              <SelectContent>
                {options.map((item) => (
                  <SelectItem key={item.totvs_id} value={item.totvs_id}>
                    {item.totvs_id} - {item.church_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="w-full" onClick={() => nav("/")}>Voltar</Button>
            <Button className="w-full" onClick={confirm} disabled={loading}>
              {loading ? "Entrando..." : "Continuar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

