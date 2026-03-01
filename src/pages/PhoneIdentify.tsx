import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useUser } from "@/context/UserContext";
import { toast } from "sonner";
import { listAnnouncements, listBirthdaysToday, loginWithCpfPassword } from "@/services/saasService";
import { AnnouncementCarousel } from "@/components/shared/AnnouncementCarousel";

function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function routeByRole(role: "admin" | "pastor" | "obreiro") {
  if (role === "admin") return "/admin";
  if (role === "pastor") return "/pastor";
  return "/obreiro";
}

export default function PhoneIdentify() {
  const nav = useNavigate();
  const { token, setUsuario, setTelefone, setToken, setSession, setPendingCpf, setAvailableChurches } = useUser();
  const logo = "/Polish_20220810_001501268%20(2).png";

  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements-login"],
    queryFn: () => listAnnouncements(10),
    enabled: Boolean(token),
  });
  const { data: birthdays = [] } = useQuery({
    queryKey: ["birthdays-today-login"],
    queryFn: () => listBirthdaysToday(10),
    enabled: Boolean(token),
  });

  async function handleContinue() {
    const cpfRaw = cpf.replace(/\D/g, "");
    if (cpfRaw.length !== 11) {
      toast.error("Informe um CPF valido com 11 digitos.");
      return;
    }
    if (!senha.trim()) {
      toast.error("Informe a senha.");
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithCpfPassword(cpfRaw, senha);
      if (result.mode === "select_church") {
        setPendingCpf(result.cpf);
        setAvailableChurches(result.churches);
        setToken(undefined);
        setSession(undefined);
        setUsuario(undefined);
        nav("/select-church");
        return;
      }

      const logged = result.user;
      setToken(result.token);
      setSession(result.session);
      setPendingCpf(undefined);
      setAvailableChurches([]);
      setUsuario({
        id: logged.id,
        nome: logged.full_name,
        full_name: logged.full_name,
        telefone: logged.phone || "",
        cpf: logged.cpf,
        role: logged.role,
        email: logged.email || null,
        birth_date: logged.birth_date || null,
        address_json: logged.address_json || null,
        ministerial: logged.minister_role || null,
        data_separacao: null,
        totvs: result.session.totvs_id || null,
        default_totvs_id: result.session.totvs_id || null,
        church_name: result.session.church_name || null,
        church_class: result.session.church_class || null,
        totvs_access: result.session.scope_totvs_ids || null,
        igreja_nome: result.session.church_name || null,
      });
      setTelefone(undefined);
      nav(routeByRole(logged.role));
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("invalid-credentials")) {
        toast.error("CPF ou senha invalidos.");
      } else if (msg.includes("supabase-not-configured")) {
        toast.error("Supabase nao configurado.");
      } else {
        toast.error("Falha ao autenticar.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f3f5f9]">
      <div className="w-full max-w-5xl grid gap-4 lg:grid-cols-[1fr_620px]">
      <form
        className="w-full space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        <img src={logo} alt="Logo" className="mx-auto h-16 object-contain" />
        <h1 className="text-2xl font-bold text-center">Sistema de Cartas - IPDA</h1>

        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            type="text"
            value={maskCpf(cpf)}
            onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="000.000.000-00"
            inputMode="numeric"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite sua senha"
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg lg:h-[720px]">
        <p className="mb-3 text-sm font-semibold text-slate-700">Area de Divulgacao</p>
        <AnnouncementCarousel items={announcements} birthdays={birthdays.slice(0, 10).map((b) => b.full_name)} />
      </div>
      <div className="mt-4 text-center text-xs text-slate-500">
        <p>Desenvolvedor Ramon Rodrigues</p>
        <a
          href="https://wa.me/5527998292347?text=Eu%20gostei%20do%20seu%20sistema%20e%20quero%20colocar%20na%20minha%20igreja."
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-emerald-600 hover:underline"
        >
          WhatsApp 27998292347
        </a>
      </div>
      </div>
    </div>
  );
}
