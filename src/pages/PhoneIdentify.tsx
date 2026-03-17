import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Eye, EyeOff, KeyRound, Loader2, UserPlus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUser } from "@/context/UserContext";
import { clearRlsToken, setRlsToken, setToken as setStoredToken } from "@/lib/api";
import {
  forgotPasswordRequest,
  getMyRegistrationStatus,
  listAnnouncementsPublicByScope,
  listAnnouncementsPublicByTotvs,
  listBirthdaysToday,
  listBirthdaysTodayPublicByScope,
  listBirthdaysTodayPublicByTotvs,
  loginWithCpfPassword,
} from "@/services/saasService";
import { AnnouncementCarousel } from "@/components/shared/AnnouncementCarousel";
import { getFriendlyError } from "@/lib/error-map";

function isBlockedPaymentError(err: unknown) {
  const data = (err || {}) as {
    code?: string;
    message?: string;
    details?: { error?: string; message?: string };
  };
  const code = String(data.code || data.details?.error || "").toLowerCase();
  const message = String(data.message || data.details?.message || "").toLowerCase();
  return code === "blocked_payment" || message.includes("blocked_payment");
}

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
  const queryClient = useQueryClient();

  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openingCadastro, setOpeningCadastro] = useState(false);

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
  // Totvs da mae (root): salvo apos login para mostrar divulgacoes da mae na proxima abertura
  const cachedRootTotvs = typeof window !== "undefined" ? localStorage.getItem("ipda_root_totvs") || "" : "";
  const isCachedAdmin = String(cachedUser?.role || "").toLowerCase() === "admin";
  const cachedScope = Array.isArray(cachedSession?.scope_totvs_ids) ? cachedSession.scope_totvs_ids.filter(Boolean).map(String) : [];
  const announcementScope = isCachedAdmin ? cachedScope : [];
  // Para pastor/obreiro usa o totvs da mae; se nao tiver, usa o proprio totvs
  const announcementTotvs = cachedRootTotvs || cachedTotvs;

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements-login", announcementTotvs, announcementScope.join(",")],
    queryFn: () =>
      announcementScope.length ? listAnnouncementsPublicByScope(announcementScope, 30) : listAnnouncementsPublicByTotvs(announcementTotvs, 10),
    enabled: Boolean(announcementTotvs) || announcementScope.length > 0,
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
        clearRlsToken();
        setSession(undefined);
        setUsuario(undefined);
        nav("/select-church");
        return;
      }

      const fixedSession = {
        ...result.session,
        root_totvs_id: result.session.root_totvs_id || result.session.totvs_id,
      };

      // Limpa cache do usuario anterior antes de aplicar nova sessao.
      queryClient.clear();
      // Comentario: persiste o token imediatamente para chamadas de API no mesmo fluxo.
      setStoredToken(result.token);
      setRlsToken(result.rls_token || null);
      setToken(result.token);
      setSession(fixedSession);
      if (fixedSession.totvs_id) localStorage.setItem("ipda_last_totvs", fixedSession.totvs_id);
      // Salva a totvs mae (root) para mostrar divulgacoes corretas na proxima abertura da tela de login
      if (fixedSession.root_totvs_id) localStorage.setItem("ipda_root_totvs", fixedSession.root_totvs_id);
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
        can_create_released_letter: Boolean(result.user.can_create_released_letter),
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

      try {
        const birthdaysToday = await listBirthdaysToday(30);
        const currentUserBirthday = birthdaysToday.find((b) => String(b.id || "") === String(result.user.id));
        const todayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
        const toastKey = `ipda_birthday_toast_${todayKey}_${String(result.user.id)}`;

        if (localStorage.getItem(toastKey) !== "1") {
          if (currentUserBirthday) {
            toast.success(`Parabens, ${currentUserBirthday.full_name}! Deus abencoe seu dia.`);
          } else if (birthdaysToday.length > 0) {
            const names = birthdaysToday.slice(0, 3).map((b) => b.full_name).join(", ");
            toast.message(`Aniversariantes de hoje: ${names}${birthdaysToday.length > 3 ? "..." : ""}`);
          }
          localStorage.setItem(toastKey, "1");
        }
      } catch {
        // Comentario: erro de aniversariantes nao bloqueia o login.
      }

      nav(routeByRole(result.user.role));
    } catch (err) {
      const msg = getFriendlyError(err, "auth");
      if (isBlockedPaymentError(err)) {
        toast.error(msg, {
          duration: 12000,
          style: {
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            color: "#991b1b",
          },
        });
      } else {
        toast.error(msg);
      }
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

  function openCadastroRapido() {
    setOpeningCadastro(true);
    nav("/cadastro");
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Building2 className="h-9 w-9" />
          </div>
          <h1 className="text-center text-2xl font-bold">Sistema de Gestão Eclesiástica</h1>

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
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Entrando...
              </span>
            ) : (
              "Entrar"
            )}
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
                    {forgotLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando...
                      </span>
                    ) : (
                      "Enviar solicitacao"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button type="button" variant="outline" onClick={openCadastroRapido} disabled={openingCadastro}>
              {openingCadastro ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              {openingCadastro ? "Abrindo..." : "Cadastro rapido"}
            </Button>
          </div>

          <div className="pt-2 text-center text-xs text-slate-500">
            <p>Desenvolvedor: Ramon Rodrigues de Freitas</p>
            <p>Telefone: (27) 99829-2347</p>
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
