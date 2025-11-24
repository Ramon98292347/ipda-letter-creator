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
  const digits = d.slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{0,2})(\d{0,4})(\d{0,4})/, (m, a, b, c) => {
    if (!a && !b && !c) return "";
    if (a && !b) return `(${a}`;
    if (a && b && !c) return `(${a}) ${b}`;
    return `(${a}) ${b}-${c}`;
  });
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

export default function PhoneIdentify() {
  const nav = useNavigate();
  const { setUsuario, setTelefone } = useUser();
  const logo = "/Polish_20220810_001501268%20(2).png";
  const [tel, setTel] = useState("");
  const [telError, setTelError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    const telefoneRaw = tel.replace(/\D/g, "");
    if (!telefoneRaw) {
      setTelError("Informe o telefone com 11 dígitos (DDD + número)");
      toast.error("Informe o telefone com 11 dígitos (DDD + número)");
      return;
    }
    if (telefoneRaw.length !== 11) {
      setTelError("Telefone deve ter 11 dígitos (DDD + número)");
      toast.error("Telefone deve ter 11 dígitos (DDD + número)");
      return;
    }
    setLoading(true);
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
          central_totvs: (u as any)?.central_totvs ?? null,
          central_nome: (u as any)?.central_nome ?? null,
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
    } catch (err: any) {
      console.error("consulta-telefone-erro", err);
      const msg = String(err?.message || "");
      if (msg.includes("supabase-not-configured")) {
        toast.error("Configuração do Supabase ausente. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
      } else {
        toast.error("Falha ao consultar. Verifique conexão e permissões.");
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <img src={logo} alt="Logo" className="mx-auto h-16 object-contain" />
        <h1 className="text-2xl font-bold text-center">Sistema de Cartas – IPDA</h1>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input
            id="telefone"
            type="tel"
            value={maskTel(tel)}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              if (raw.length > 11) {
                setTelError("Telefone deve ter no máximo 11 dígitos (DDD + número)");
                toast.error("Telefone deve ter no máximo 11 dígitos (DDD + número)");
              } else {
                setTelError("");
              }
              setTel(raw.slice(0, 11));
            }}
            onBlur={() => {
              const len = tel.replace(/\D/g, "").length;
              if (len > 0 && len !== 11) setTelError("Telefone deve ter 11 dígitos (DDD + número)");
            }}
            placeholder="(99) 99999-9999"
          />
          {telError ? (<p className="text-sm text-red-600">{telError}</p>) : null}
        </div>
        <Button onClick={handleContinue} className="w-full" disabled={loading}>
          {loading ? "Consultando..." : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
