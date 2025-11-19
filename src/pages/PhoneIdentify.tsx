import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useUser } from "@/context/UserContext";
import { getUsuarioByTelefone, getIgrejaByTotvs } from "@/services/userService";
import { toast } from "sonner";

function maskTel(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

export default function PhoneIdentify() {
  const nav = useNavigate();
  const { setUsuario, setTelefone } = useUser();
  const logo = "/Polish_20220810_001501268%20(2).png";
  const [tel, setTel] = useState("");

  async function handleContinue() {
    const telefoneRaw = tel.replace(/\D/g, "");
    if (!telefoneRaw) {
      toast.error("Informe o telefone");
      return;
    }
    try {
      const u = await getUsuarioByTelefone(telefoneRaw);
      if (u) {
        setUsuario({
          id: u.id,
          nome: u.nome,
          telefone: u.telefone,
          totvs: u.totvs ?? null,
          igreja_nome: u.igreja_nome ?? null,
          email: u.email ?? null,
          ministerial: u.ministerial ?? null,
          data_separacao: u.data_separacao ?? null,
        });
        setTelefone(undefined);
        if (u.totvs) {
          try {
            await getIgrejaByTotvs(u.totvs);
          } catch {}
        }
        nav("/carta");
      } else {
        setUsuario(undefined);
        setTelefone(telefoneRaw);
        nav("/cadastro");
      }
    } catch {
      toast.error("Falha ao consultar. Tente novamente.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <img src={logo} alt="Logo" className="mx-auto h-16 object-contain" />
        <h1 className="text-2xl font-bold text-center">Sistema de Cartas – IPDA</h1>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" type="tel" value={maskTel(tel)} onChange={(e) => setTel(e.target.value)} placeholder="(99) 99999-9999" />
        </div>
        <Button onClick={handleContinue} className="w-full">Continuar</Button>
      </div>
    </div>
  );
}