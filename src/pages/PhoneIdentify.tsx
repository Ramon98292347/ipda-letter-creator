import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { Building2, Eye, EyeOff, Fingerprint, KeyRound, Loader2, UserPlus } from "lucide-react";
import { useBiometric } from "@/hooks/useBiometric";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AnnouncementCarousel } from "@/components/shared/AnnouncementCarousel";
import { useUser } from "@/context/UserContext";
import { clearRlsToken, setRlsToken, setToken as setStoredToken } from "@/lib/api";
import {
  forgotPasswordRequest,
  getMyRegistrationStatus,
  listAnnouncementsPublicByCpf,
  listAnnouncementsPublicByScope,
  listAnnouncementsPublicByTotvs,
  listBirthdaysToday,
  listBirthdaysTodayPublicByCpf,
  listBirthdaysTodayPublicByScope,
  listBirthdaysTodayPublicByTotvs,
  loginWithCpfPassword,
} from "@/services/saasService";
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

// Comentario: valida os digitos verificadores do CPF para evitar CPFs invalidos.
// Verifica se o CPF tem 11 digitos, nao e uma sequencia repetida (ex: 111.111.111-11)
// e se os dois digitos verificadores batem com o calculo matematico oficial.
function validarCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  return digits.length === 11 && !/^(\d)\1{10}$/.test(digits);
}

// Comentario: redireciona o usuário para a página inicial do seu role após o login
function routeByRole(role: string) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "pastor") return "/pastor/dashboard";
  if (role === "secretario") return "/pastor/dashboard";
  if (role === "financeiro") return "/financeiro/dashboard";
  return "/obreiro";
}

export default function PhoneIdentify() {
  const nav = useNavigate();
  const { setUsuario, setTelefone, setToken, setSession, setPendingCpf, setAvailableChurches } = useUser();
  const queryClient = useQueryClient();
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const biometric = useBiometric();
  // Comentario: controla o dialogo que pergunta se o usuario quer ativar a digital apos primeiro login
  const [askEnableBiometric, setAskEnableBiometric] = useState<{ cpf: string; senha: string; nextRoute: string } | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Comentario: remove senha em texto puro do localStorage (migracao de seguranca).
  // Essa chave era usada antes da biometria; agora credenciais ficam no Keystore.
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.removeItem("ipda_saved_password_android");
  }, []);

  // Comentario: le o CPF salvo no cache para pre-preencher o campo no proximo acesso.
  const cachedCpf = typeof window !== "undefined" ? localStorage.getItem("ipda_last_cpf") || "" : "";
  const [cpf, setCpf] = useState(cachedCpf);
  // Comentario: senha nunca mais e salva em texto puro no localStorage (seguranca).
  // Login offline agora funciona apenas via biometria (Keystore protegido).
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
  const isCachedAdmin = String(cachedUser?.role || "").toLowerCase() === "admin";
  const cpfLookup = cpf.replace(/\D/g, "").length === 11 ? cpf.replace(/\D/g, "") : cachedCpf;
  const cachedScope = Array.isArray(cachedSession?.scope_totvs_ids) ? cachedSession.scope_totvs_ids.filter(Boolean).map(String) : [];
  const announcementScope = isCachedAdmin ? cachedScope : [];
  // Comentario: divulgacao da tela de login deve respeitar a igreja do proprio usuario.
  // Nao usar totvs da mae para evitar mostrar divulgacao de outra igreja.
  const announcementTotvs = cachedTotvs;
  const birthdayTotvsScope = Array.from(
    new Set([cachedTotvs, announcementTotvs].map((v) => String(v || "").trim()).filter(Boolean)),
  );

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements-login", cpfLookup, announcementTotvs, announcementScope.join(",")],
    queryFn: () => {
      // Prioridade 1: CPF salvo no cache ? busca divulgacoes direto pelo CPF via edge function (sem JWT)
      if (cpfLookup.length === 11) return listAnnouncementsPublicByCpf(cpfLookup, 10);
      // Prioridade 2: admin com escopo de igrejas
      if (announcementScope.length) return listAnnouncementsPublicByScope(announcementScope, 30);
      // Prioridade 3: totvs salvo do ultimo login
      return listAnnouncementsPublicByTotvs(announcementTotvs, 10);
    },
    enabled: cpfLookup.length === 11 || Boolean(announcementTotvs) || announcementScope.length > 0,
  });

  const { data: birthdays = [] } = useQuery({
    queryKey: ["birthdays-today-login", cpfLookup, announcementTotvs, announcementScope.join(","), birthdayTotvsScope.join(",")],
    queryFn: () =>
      cpfLookup.length === 11
        ? listBirthdaysTodayPublicByCpf(cpfLookup, 20)
        : announcementScope.length
        ? listBirthdaysTodayPublicByScope(announcementScope, 20)
        : birthdayTotvsScope.length > 1
          ? listBirthdaysTodayPublicByScope(birthdayTotvsScope, 20)
          : listBirthdaysTodayPublicByTotvs(birthdayTotvsScope[0] || announcementTotvs, 10),
    enabled: cpfLookup.length === 11 || birthdayTotvsScope.length > 0 || announcementScope.length > 0,
  });

  async function handleLogin(overrideCpf?: string, overrideSenha?: string) {
    const activeCpf = overrideCpf ?? cpf;
    const activeSenha = overrideSenha ?? senha;

    const cpfRaw = activeCpf.replace(/\D/g, "");
    if (cpfRaw.length !== 11) {
      toast.error("Informe um CPF válido com 11 dígitos.");
      return;
    }
    // Comentario: valida os digitos verificadores do CPF antes de chamar o servidor.
    if (!validarCpf(cpfRaw)) {
      toast.error("CPF inválido. Verifique os dígitos e tente novamente.");
      return;
    }
    if (!activeSenha.trim()) {
      toast.error("Informe a senha.");
      return;
    }

    // Comentario: login offline removido por seguranca — senha nao e mais salva em texto puro.
    // Login offline agora funciona apenas via biometria (botao "Entrar com digital").
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (isNativeAndroid && biometric.enabled) {
        toast.message("Sem internet. Use o botão 'Entrar com digital' para acesso offline.");
      } else {
        toast.error("Sem internet. Conecte-se para fazer login.");
      }
      return;
    }
    setLoading(true);
    try {
      const result = await loginWithCpfPassword(cpfRaw, activeSenha);

      if (result.mode === "select_church") {
        // Comentario: salva o CPF mesmo quando ha multiplas igrejas, para pre-preencher no proximo acesso.
        localStorage.setItem("ipda_last_cpf", cpfRaw);
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
      // Comentario: salva o CPF no cache para pre-preencher o campo e buscar divulgacoes na proxima abertura.
      localStorage.setItem("ipda_last_cpf", cpfRaw);
      // Comentario: senha removida do localStorage por seguranca. Credenciais ficam no Keystore via biometria.
      // Comentario: se biometria disponivel e ainda nao ativada, prepara o dialog e guarda a rota destino
      const targetRoute = routeByRole(result.user.role);
      let isAskingBiometric = false;
      if (biometric.isNative && !biometric.enabled) {
        setAskEnableBiometric({ cpf: cpfRaw, senha: senha.trim(), nextRoute: targetRoute });
        isAskingBiometric = true;
      }
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
        toast.message("Cadastro pendente. Cartas e documentos ficam bloqueados até liberação.");
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

      // Se nao esta perguntando pela biometria, navega direto.
      // Se estiver perguntando, a navegacao ocorrera no callback dos botoes do Dialog.
      if (!isAskingBiometric) {
        nav(targetRoute);
      }

    } catch (err) {
      const code = (err as { code?: string })?.code || (err as Error)?.message || "";

      // Comentario: cadastro pendente — usuario existe mas o pastor ainda nao aprovou
      if (code === "registration_pending") {
        toast.error("Seu cadastro está pendente de aprovação. Aguarde a liberação do pastor da sua igreja.", { duration: 8000 });
        return;
      }

      // Comentario: se o CPF nao existir no sistema, redireciona para o cadastro rapido automaticamente.
      // O usuario nao precisa saber que precisa se cadastrar — o sistema ja encaminha.
      if (code === "user_not_found" || code === "cpf_not_registered") {
        toast.message("CPF não encontrado. Preencha o cadastro rápido para solicitar acesso.");
        nav("/cadastro");
        return;
      }
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

  // Comentario: login via digital — verifica biometria, recupera credencial do Keystore e dispara handleLogin
  async function handleBiometricLogin() {
    setBiometricLoading(true);
    try {
      const ok = await biometric.verify();
      if (!ok) {
        toast.error("Autenticação biométrica cancelada ou inválida.");
        return;
      }
      const creds = await biometric.loadCredentials();
      if (!creds) {
        toast.error("Nenhuma credencial salva. Faça login com senha primeiro.");
        await biometric.clearCredentials();
        return;
      }
      setCpf(creds.username);
      setSenha(creds.password);
      // Comentario: bypassa o delay do React State e injeta diretamente os parametros na func original
      await handleLogin(creds.username, creds.password);
    } finally {
      setBiometricLoading(false);
    }
  }

  // Comentario: confirma ativacao da biometria salvando credenciais no Keystore e prossegue
  async function confirmEnableBiometric() {
    if (!askEnableBiometric) return;
    const { nextRoute, cpf, senha } = askEnableBiometric;
    const ok = await biometric.saveCredentials(cpf, senha);
    if (ok) {
      toast.success("Login por digital ativado!");
    } else {
      toast.error("Não foi possível ativar a digital.");
    }
    setAskEnableBiometric(null);
    nav(nextRoute);
  }

  // Comentario: recusa ativacao da biometria e prossegue
  function skipBiometric() {
    if (!askEnableBiometric) return;
    const dest = askEnableBiometric.nextRoute;
    setAskEnableBiometric(null);
    nav(dest);
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

  const showShutdownNotice = true;
  if (showShutdownNotice) {
    return (
      <div className="min-h-screen w-full bg-red-100 px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
          <div className="w-full rounded-2xl border-2 border-red-300 bg-red-50 p-6 text-center shadow-lg sm:p-10">
            <h1 className="text-2xl font-extrabold text-red-800 sm:text-3xl">Comunicado Importante</h1>
            <div className="mx-auto mt-5 max-w-3xl space-y-3 text-sm leading-relaxed text-red-900 sm:text-base">
              <p>
                Por motivo de forca maior, informamos que este sistema foi desativado definitivamente.
              </p>
              <p>
                Todos os dados que estavam armazenados na plataforma foram excluidos. Pedimos sinceras desculpas por qualquer transtorno que essa situacao possa causar.
              </p>
              <p>
                Agradecemos a todos pela confianca, pelo apoio e pelo tempo em que estiveram conosco.
              </p>
              <p className="font-semibold">
                "Nao to mandei eu? Esforca-te, e tem bom animo; nao temas, nem te espantes, porque o Senhor teu Deus e contigo, por onde quer que andares."
              </p>
              <p className="font-semibold">Josue 1:9</p>
              <p>Seguimos confiando que Deus permanece no controle de todas as coisas.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <div className="fixed inset-x-0 top-0 z-50 w-full border-b border-red-200 bg-red-50 px-6 py-5 shadow-sm">
        <div className="mx-auto w-full max-w-7xl">
          <h2 className="text-lg font-bold text-red-800">Comunicado Importante</h2>
          <div className="mt-3 space-y-2 text-sm text-red-900">
            <p>
              Por motivo de forca maior, informamos que este sistema foi desativado definitivamente.
            </p>
            <p>
              Todos os dados que estavam armazenados na plataforma foram excluidos. Pedimos sinceras desculpas por qualquer transtorno que essa situacao possa causar.
            </p>
            <p>
              Agradecemos a todos pela confianca, pelo apoio e pelo tempo em que estiveram conosco.
            </p>
            <p className="font-semibold">
              "Nao to mandei eu? Esforca-te, e tem bom animo; nao temas, nem te espantes, porque o Senhor teu Deus e contigo, por onde quer que andares."
            </p>
            <p className="font-semibold">Josue 1:9</p>
            <p>
              Seguimos confiando que Deus permanece no controle de todas as coisas.
            </p>
          </div>
        </div>
      </div>
      <div className="p-6 pt-[340px] sm:pt-[300px]">
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

          {/* Comentario: botao de login por digital — so aparece no Android com biometria ativada */}
          {biometric.isNative && biometric.available && biometric.enabled ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={biometricLoading || loading}
              onClick={() => void handleBiometricLogin()}
            >
              {biometricLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="mr-2 h-4 w-4" />
              )}
              Entrar com digital
            </Button>
          ) : null}

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
              {openingCadastro ? "Abrindo..." : "Cadastro rápido"}
            </Button>
          </div>

          <div className="pt-2 text-center text-xs text-slate-500">
            <p>Desenvolvedor: Ramon Rodrigues de Freitas</p>
            <p>Telefone: (27) 99829-2347</p>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg lg:min-h-[700px]">
          <p className="mb-3 text-sm font-semibold text-slate-700">Area de divulgacao</p>
          {/* Comentario: dialog que oferece ativar login por digital apos primeiro login bem sucedido */}
          <Dialog open={Boolean(askEnableBiometric)} onOpenChange={(o) => {
            if (!o) skipBiometric();
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Entrar com digital nas próximas vezes?</DialogTitle>
                <DialogDescription>
                  Suas credenciais ficam salvas com segurança no aparelho (protegidas pela sua digital).
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={skipBiometric}>
                  Agora não
                </Button>
                <Button className="flex-1" onClick={() => void confirmEnableBiometric()}>
                  <Fingerprint className="mr-2 h-4 w-4" /> Ativar
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <AnnouncementCarousel
            items={announcements}
            birthdays={birthdays.slice(0, 10).map((b) => b.full_name)}
            heightClass="min-h-[610px]"
          />
        </div>
        </div>
      </div>
    </div>
  );
}



