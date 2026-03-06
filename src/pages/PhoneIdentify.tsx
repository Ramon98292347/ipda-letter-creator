import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, UserPlus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUser } from "@/context/UserContext";
import {
  forgotPasswordRequest,
  getMyRegistrationStatus,
  listAnnouncementsPublicByScope,
  listAnnouncementsPublicByTotvs,
  listBirthdaysTodayPublicByScope,
  listBirthdaysTodayPublicByTotvs,
  loginWithCpfPassword,
} from "@/services/saasService";
import { AnnouncementCarousel } from "@/components/shared/AnnouncementCarousel";
import { getFriendlyError } from "@/lib/error-map";

function maskCpf(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function routeByRole(role: "admin" | "pastor" | "obreiro") {
  if (role === "admin") return "/admin/dashboard";
  if (role === "pastor") return "/pastor/dashboard";
  return "/obreiro";
}

export default function PhoneIdentify() {
  const nav = useNavigate();
  const { setUsuario, setTelefone, setToken, setSession, setPendingCpf, setAvailableChurches } = useUser();

  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotCpf, setForgotCpf] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  const cachedUser =
    typeof window !== "undefined"
      ? (() => {
          try {
            return JSON.parse(localStorage.getItem("ipda_user") || "{}") as { role?: string };
          } catch {
            return {};
          }
        })()
      : {};
  const cachedSession =
    typeof window !== "undefined"
      ? (() => {
          try {
            return JSON.parse(localStorage.getItem("ipda_session") || "{}") as { scope_totvs_ids?: string[] };
          } catch {
            return {};
          }
        })()
      : {};
  const cachedTotvs = typeof window !== "undefined" ? localStorage.getItem("ipda_last_totvs") || "" : "";
  const isCachedAdmin = String(cachedUser?.role || "").toLowerCase() === "admin";
  const cachedScope = Array.isArray(cachedSession?.scope_totvs_ids) ? cachedSession.scope_totvs_ids.filter(Boolean).map(String) : [];
  const announcementScope = isCachedAdmin ? cachedScope : [];

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements-login", cachedTotvs, announcementScope.join(",")],
    queryFn: () =>
      announcementScope.length ? listAnnouncementsPublicByScope(announcementScope, 30) : listAnnouncementsPublicByTotvs(cachedTotvs, 10),
    enabled: Boolean(cachedTotvs) || announcementScope.length > 0,
  });

  const { data: birthdays = [] } = useQuery({
    queryKey: ["birthdays-today-login", cachedTotvs, announcementScope.join(",")],
    queryFn: () =>
      announcementScope.length ? listBirthdaysTodayPublicByScope(announcementScope, 20) : listBirthdaysTodayPublicByTotvs(cachedTotvs, 10),
    enabled: Boolean(cachedTotvs) || announcementScope.length > 0,
  });

  async function handleLogin() {
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

      const fixedSession = {
        ...result.session,
        root_totvs_id: result.session.root_totvs_id || result.session.totvs_id,
      };

      setToken(result.token);
      setSession(fixedSession);
      if (fixedSession.totvs_id) localStorage.setItem("ipda_last_totvs", fixedSession.totvs_id);
      setPendingCpf(undefined);
      setAvailableChurches([]);

      let registrationStatus: "APROVADO" | "PENDENTE" = "APROVADO";
      try {
        registrationStatus = await getMyRegistrationStatus();
      } catch {
        // Comentario: fallback seguro caso a function ainda nao esteja implantada.
      }

      setUsuario({
        id: result.user.id,
        nome: result.user.full_name,
        full_name: result.user.full_name,
        telefone: result.user.phone || "",
        cpf: result.user.cpf,
        role: result.user.role,
        email: result.user.email || null,
        avatar_url: result.user.avatar_url || null,
        birth_date: result.user.birth_date || null,
        address_json: result.user.address_json || null,
        ministerial: result.user.minister_role || null,
        registration_status: registrationStatus,
        data_separacao: null,
        totvs: fixedSession.totvs_id || null,
        default_totvs_id: fixedSession.totvs_id || null,
        church_name: fixedSession.church_name || null,
        church_class: fixedSession.church_class || null,
        totvs_access: fixedSession.scope_totvs_ids || null,
        igreja_nome: fixedSession.church_name || null,
      });

      setTelefone(undefined);

      if (registrationStatus === "PENDENTE" && result.user.role === "obreiro") {
        toast.message("Cadastro pendente. Cartas e documentos ficam bloqueados ate liberacao.");
      }

      nav(routeByRole(result.user.role));
    } catch (err) {
      toast.error(getFriendlyError(err, "auth"));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const cpfRaw = forgotCpf.replace(/\D/g, "");
    const email = forgotEmail.trim();
    if (cpfRaw.length !== 11 && !email) {
      toast.error("Informe CPF ou e-mail.");
      return;
    }

    setForgotLoading(true);
    try {
      await forgotPasswordRequest({
        cpf: cpfRaw.length === 11 ? cpfRaw : undefined,
        email: email || undefined,
      });
      toast.success("Solicitacao enviada. Verifique seu WhatsApp/E-mail.");
      setForgotOpen(false);
      setForgotCpf("");
      setForgotEmail("");
    } catch (err) {
      toast.error(getFriendlyError(err, "auth"));
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9] p-6">
      <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_620px]">
        <form
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <img src="/Polish_20220810_001501268%20(2).png" alt="Logo" className="mx-auto h-16 object-contain" />
          <h1 className="text-center text-2xl font-bold">Sistema de Cartas - IPDA</h1>

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
            <div className="relative">
              <Input
                id="senha"
                type={showSenha ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Digite sua senha"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                onClick={() => setShowSenha((prev) => !prev)}
                aria-label={showSenha ? "Ocultar senha" : "Visualizar senha"}
              >
                {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>

          <div className="grid gap-2 sm:grid-cols-2">
            <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className="w-full">
                  <KeyRound className="mr-2 h-4 w-4" /> Esquecer senha
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Recuperar senha</DialogTitle>
                  <DialogDescription>Informe CPF ou e-mail para enviar a solicitacao.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>CPF</Label>
                    <Input value={maskCpf(forgotCpf)} onChange={(e) => setForgotCpf(e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div className="space-y-1">
                    <Label>E-mail</Label>
                    <Input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="email@exemplo.com" />
                  </div>
                  <Button type="button" className="w-full" onClick={handleForgotPassword} disabled={forgotLoading}>
                    {forgotLoading ? "Enviando..." : "Enviar solicitacao"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button type="button" variant="outline" onClick={() => nav("/cadastro")}>
              <UserPlus className="mr-2 h-4 w-4" /> Cadastro rapido
            </Button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg lg:h-[700px]">
          <p className="mb-3 text-sm font-semibold text-slate-700">Area de divulgacao</p>
          <AnnouncementCarousel
            items={announcements}
            birthdays={birthdays.slice(0, 10).map((b) => b.full_name)}
            heightClass="h-[610px]"
          />
        </div>
      </div>
    </div>
  );
}
