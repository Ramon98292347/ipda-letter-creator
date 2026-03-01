import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { selectChurchSession } from "@/services/saasService";
import { useUser } from "@/context/UserContext";

function routeByRole(role: "admin" | "pastor" | "obreiro") {
  if (role === "admin") return "/admin";
  if (role === "pastor") return "/pastor";
  return "/obreiro";
}

export default function SelectChurch() {
  const nav = useNavigate();
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
      toast.error("Sessao de escolha de igreja invalida. Faca login novamente.");
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
      setToken(data.token);
      setSession(data.session);
      setUsuario({
        id: data.user.id,
        nome: data.user.full_name,
        full_name: data.user.full_name,
        telefone: data.user.phone || "",
        cpf: data.user.cpf,
        role: data.user.role,
        email: data.user.email || null,
        ministerial: data.user.minister_role || null,
        birth_date: data.user.birth_date || null,
        address_json: data.user.address_json || null,
        totvs: data.session.totvs_id || null,
        default_totvs_id: data.session.totvs_id || null,
        church_name: data.session.church_name || null,
        church_class: data.session.church_class || null,
        totvs_access: data.session.scope_totvs_ids || null,
        igreja_nome: data.session.church_name || null,
      });
      setPendingCpf(undefined);
      setAvailableChurches([]);
      nav(routeByRole(data.user.role), { replace: true });
    } catch (err: any) {
      toast.error(String(err?.message || "Falha ao selecionar igreja."));
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
