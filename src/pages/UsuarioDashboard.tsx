import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import {
  getPastorByTotvsPublic,
  getSignedPdfUrl,
  listChurchesInScope,
  requestRelease,
  softDeleteLetter,
  updateMyProfile,
  upsertStamps,
  workerDashboard,
  type PastorLetter,
} from "@/services/saasService";
import { post } from "@/lib/api";
import { Bell, BellOff, Building2, CalendarDays, Download, Eye, FileText, IdCard, Loader2, MoreHorizontal, Phone, RefreshCw, Search, Share2, Trash2, Unlock, UserCircle2 } from "lucide-react";
import { ImageCaptureInput } from "@/components/shared/ImageCaptureInput";
import { AvatarCapture } from "@/components/shared/AvatarCapture";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type DestinationOption = {
  totvs_id: string;
  church_name: string;
};

type LetterFormState = {
  igreja_destino: string;
  igreja_destino_manual: string;
  dia_pregacao: string;
};

type QuickRange = "today" | "7" | "15" | "30" | "all";

const emptyLetterForm: LetterFormState = {
  igreja_destino: "",
  igreja_destino_manual: "",
  dia_pregacao: "",
};

function statusClass(status: string) {
  if (status === "LIBERADA") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "AGUARDANDO_LIBERACAO") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "BLOQUEADO") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function toInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


function isLetterReadyForView(letter: PastorLetter) {
  const readyByUrl = String(letter.url_carta || "").trim().startsWith("http");
  return letter.status === "LIBERADA" && (letter.url_pronta === true || readyByUrl);
}

// Comentario: dashboard do obreiro padronizado com o mesmo layout SaaS do sistema.
export default function UsuarioDashboard() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, session, setUsuario, setTelefone } = useUser();
  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications(session?.id);

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [quickRange, setQuickRange] = useState<QuickRange>("7");
  const [openUpdateModal, setOpenUpdateModal] = useState(false);
  const [openCadastroModal, setOpenCadastroModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [savingProfile, setSavingProfile] = useState(false);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState("");
  const [profileForm, setProfileForm] = useState({
    phone: "",
    email: "",
    birth_date: "",
    avatar_url: "",
    cep: "",
    address_street: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    address_city: "",
    address_state: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [stampPastorFile, setStampPastorFile] = useState<File | null>(null);
  const [savingStamps, setSavingStamps] = useState(false);

  // Letter creation dialog state
  const [openLetterDialog, setOpenLetterDialog] = useState(false);
  const [letterForm, setLetterForm] = useState<LetterFormState>(emptyLetterForm);
  const [destinationOptions, setDestinationOptions] = useState<DestinationOption[]>([]);
  const [searchingDestinations, setSearchingDestinations] = useState(false);
  const [creatingLetter, setCreatingLetter] = useState(false);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxPregacaoIso = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return limit.toISOString().slice(0, 10);
  }, []);

  const userId = String(usuario?.id || "");
  const activeTotvs = String(session?.totvs_id || "");
  const isCadastroPendente = usuario?.registration_status === "PENDENTE";
  const isObreiro = String(usuario?.role || "").toLowerCase() === "obreiro";

  useEffect(() => {
    const now = new Date();
    const end = toInputDate(now);
    if (quickRange === "all") {
      setDateStart("");
      setDateEnd("");
      return;
    }
    if (quickRange === "today") {
      setDateStart(end);
      setDateEnd(end);
      return;
    }
    const days = Number(quickRange);
    const start = new Date(now);
    start.setDate(now.getDate() - days + 1);
    setDateStart(toInputDate(start));
    setDateEnd(end);
  }, [quickRange]);

  useEffect(() => {
    if (isObreiro && statusFilter !== "all") {
      setStatusFilter("all");
    }
  }, [isObreiro, statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["worker-dashboard", userId],
    queryFn: () => workerDashboard(undefined, undefined, 1, 200),
    enabled: Boolean(userId),
    // Atualiza cartas e dados do obreiro automaticamente a cada 60 segundos
    refetchInterval: 60 * 1000,
  });

  const { data: pastorFromUsers } = useQuery({
    queryKey: ["pastor-by-totvs", activeTotvs],
    queryFn: () => getPastorByTotvsPublic(activeTotvs),
    enabled: Boolean(activeTotvs),
    refetchInterval: 10000,
  });

  const letters = useMemo(
    () => (data?.letters || []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [data?.letters]
  );
  const profile = data?.user;
  const isPastor = String(profile?.role || usuario?.role || "").toLowerCase() === "pastor";
  const hasDirectRelease = Boolean(profile?.can_create_released_letter);
  const church = data?.church;
  // Comentario: o banco retorna colunas planas (address_street, cep, etc.), nao um campo address_json.
  const profileRaw = profile as Record<string, unknown> | undefined;
  const cityFromProfile = String(profileRaw?.address_city || "");

  useEffect(() => {
    setProfileForm({
      phone: profile?.phone || "",
      email: profile?.email || "",
      birth_date: String(profile?.birth_date || ""),
      avatar_url: String(profile?.avatar_url || ""),
      // Lendo das colunas planas corretas retornadas pelo worker-dashboard
      cep: String(profileRaw?.cep || ""),
      address_street: String(profileRaw?.address_street || ""),
      address_number: String(profileRaw?.address_number || ""),
      address_complement: String(profileRaw?.address_complement || ""),
      address_neighborhood: String(profileRaw?.address_neighborhood || ""),
      address_city: String(profileRaw?.address_city || ""),
      address_state: String(profileRaw?.address_state || ""),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.phone, profile?.email, profile?.birth_date, profile?.avatar_url, profile?.address_street, profile?.address_city]);

  async function autofillCep(force = false) {
    const cepDigits = onlyDigits(profileForm.cep);
    if (cepDigits.length !== 8) return;
    if (!force && (cepLookupLoading || lastCepLookup === cepDigits)) return;

    setCepLookupLoading(true);
    try {
      const data = await fetchAddressByCep(cepDigits);
      setProfileForm((prev) => ({
        ...prev,
        cep: maskCep(cepDigits),
        address_street: prev.address_street || data.logradouro,
        address_neighborhood: prev.address_neighborhood || data.bairro,
        address_city: prev.address_city || data.localidade,
        address_state: prev.address_state || data.uf,
      }));
      setLastCepLookup(cepDigits);
    } catch (err) {
      if (force) {
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP nao encontrado." : "Falha ao buscar CEP.");
      }
    } finally {
      setCepLookupLoading(false);
    }
  }

  async function uploadStampFile(file: File, folder: "assinatura" | "carimbos/pastor") {
    if (!supabase) throw new Error("Supabase nao configurado.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const path = `users/${folder}/${fileName}`;
    const { error } = await supabase.storage.from("assinat_carimbo").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (error) throw new Error(error.message || "stamp_upload_failed");
    const { data } = supabase.storage.from("assinat_carimbo").getPublicUrl(path);
    return data.publicUrl;
  }

  async function savePastorStamps() {
    if (!isPastor) {
      toast.error("Apenas pastor pode salvar assinatura e carimbo.");
      return;
    }
    if (!signatureFile && !stampPastorFile) {
      toast.error("Selecione a assinatura ou o carimbo do pastor.");
      return;
    }
    setSavingStamps(true);
    try {
      let signatureUrl = String(profile?.signature_url || "");
      let stampPastorUrl = String(profile?.stamp_pastor_url || "");
      if (signatureFile) signatureUrl = await uploadStampFile(signatureFile, "assinatura");
      if (stampPastorFile) stampPastorUrl = await uploadStampFile(stampPastorFile, "carimbos/pastor");
      await upsertStamps({
        signature_url: signatureUrl || null,
        stamp_pastor_url: stampPastorUrl || null,
      });
      toast.success("Assinatura e carimbo salvos com sucesso.");
      setSignatureFile(null);
      setStampPastorFile(null);
      await queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch (err) {
      toast.error(String((err as Error)?.message || "Falha ao salvar assinatura."));
    } finally {
      setSavingStamps(false);
    }
  }

  useEffect(() => {
    const cepDigits = onlyDigits(profileForm.cep);
    if (!openUpdateModal || cepDigits.length !== 8) return;
    void autofillCep();
  }, [profileForm.cep, openUpdateModal]);

  useEffect(() => {
    if (!profile?.phone) return;
    setTelefone(profile.phone);
    setUsuario({
      ...(usuario || { nome: profile.full_name || "Usuario", telefone: "" }),
      telefone: profile.phone || "",
    });
  }, [profile?.phone, profile?.full_name, setTelefone, setUsuario, usuario]);

  const filteredLetters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return letters.filter((l) => {
      const createdDate = toInputDate(new Date(l.created_at));
      if (dateStart && createdDate < dateStart) return false;
      if (dateEnd && createdDate > dateEnd) return false;
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      const haystack = `${l.preacher_name || ""} ${l.church_origin || ""} ${l.church_destination || ""} ${l.preach_date || ""}`.toLowerCase();
      return matchesStatus && (!q || haystack.includes(q));
    });
  }, [letters, search, statusFilter, dateStart, dateEnd]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = toInputDate(now);
    const start7 = new Date(now);
    start7.setDate(now.getDate() - 6);
    const start7Str = toInputDate(start7);
    return {
      totalCartas: filteredLetters.length,
      cartasHoje: filteredLetters.filter((l) => toInputDate(new Date(l.created_at)) === today).length,
      cartas7dias: filteredLetters.filter((l) => toInputDate(new Date(l.created_at)) >= start7Str).length,
      aguardando: filteredLetters.filter((l) => l.status === "AGUARDANDO_LIBERACAO").length,
    };
  }, [filteredLetters]);

async function openPdf(letter: PastorLetter) {
    if (isCadastroPendente) return toast.error("Cadastro pendente. Procure a secretaria da igreja.");
    if (!isLetterReadyForView(letter)) return toast.error("Carta bloqueada para visualizacao.");
    const directUrl = String(letter.url_carta || "").trim();
    if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
      window.open(directUrl, "_blank");
      return;
    }

    try {
      const url = await getSignedPdfUrl(letter.id);
      if (!url) throw new Error("signed-url-empty");
      window.open(url, "_blank");
    } catch {
      toast.error("PDF ainda nao liberado. Use o botao Pedir liberacao.");
    }
  }

  async function shareLetter(letter: PastorLetter) {
    if (isCadastroPendente) return toast.error("Cadastro pendente. Compartilhamento bloqueado.");
    if (!isLetterReadyForView(letter)) return toast.error("Carta bloqueada para compartilhamento.");
    const directUrl = String(letter.url_carta || "").trim();
    if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
      window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregacao: ${directUrl}`)}`, "_blank");
      return;
    }
    try {
      const url = await getSignedPdfUrl(letter.id);
      if (!url) throw new Error("share-url-empty");
      window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregacao: ${url}`)}`, "_blank");
    } catch {
      toast.error("PDF ainda nao liberado para compartilhamento.");
    }
  }

  async function pedirLiberacao(letter: PastorLetter) {
    if (isCadastroPendente) return toast.error("Cadastro pendente. Procure a secretaria da igreja.");
    if (hasDirectRelease) return toast.info("Sua liberacao direta esta ativa. Nao e necessario pedir liberacao.");
    try {
      await requestRelease(letter.id, userId, session?.totvs_id || "");
      toast.success("Pedido enviado.");
      await queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao solicitar liberacao.");
    }
  }

  async function excluirCarta(letter: PastorLetter) {
    // Confirmação antes de excluir
    if (!window.confirm(`Excluir a carta para "${letter.church_destination || "destino"}"? Esta acao nao pode ser desfeita.`)) return;
    try {
      await softDeleteLetter(letter.id);
      toast.success("Carta excluida.");
      await queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao excluir carta.");
    }
  }

  async function pedirPrimeiraLiberacao() {
    if (hasDirectRelease) return toast.info("Sua liberacao direta esta ativa.");
    const candidate = letters.find((l) => l.status === "AUTORIZADO" || l.status === "AGUARDANDO_LIBERACAO");
    if (!candidate) return toast.error("Nenhuma carta disponivel para pedir liberacao.");
    await pedirLiberacao(candidate);
  }

  // Load destination churches when letter dialog opens
  useEffect(() => {
    if (!openLetterDialog) {
      setDestinationOptions([]);
      return;
    }
    setSearchingDestinations(true);
    listChurchesInScope(1, 1000)
      .then((churches) => {
        setDestinationOptions(
          churches.map((c) => ({ totvs_id: String(c.totvs_id || ""), church_name: String(c.church_name || "") }))
        );
      })
      .catch(() => {
        setDestinationOptions([]);
      })
      .finally(() => setSearchingDestinations(false));
  }, [openLetterDialog]);

  const filteredDestinationOptions = useMemo(() => {
    const term = String(letterForm.igreja_destino || "").trim().toLowerCase();
    if (term.length < 2 || letterForm.igreja_destino_manual.trim()) return [];
    return destinationOptions
      .filter((item) => `${item.totvs_id} - ${item.church_name}`.toLowerCase().includes(term))
      .slice(0, 12);
  }, [destinationOptions, letterForm.igreja_destino, letterForm.igreja_destino_manual]);

  const selectedDestination = useMemo(() => {
    const typed = String(letterForm.igreja_destino || "").trim().toUpperCase();
    if (!typed) return null;
    return (
      destinationOptions.find((item) => item.church_name.trim().toUpperCase() === typed) ||
      destinationOptions.find((item) => item.totvs_id.trim().toUpperCase() === typed) ||
      destinationOptions.find((item) => `${item.totvs_id} - ${item.church_name}`.trim().toUpperCase() === typed) ||
      null
    );
  }, [destinationOptions, letterForm.igreja_destino]);

  function normalizeManualDestination(raw: string): string {
    return String(raw || "").trim().toUpperCase();
  }

  async function resolveManualDestination(rawValue: string): Promise<string> {
    const normalized = normalizeManualDestination(rawValue);
    if (!normalized) return normalized;

    const totvsMatch = normalized.match(/^(\d{4,})/);
    if (totvsMatch) {
      const matchedScope = destinationOptions.find((c) => c.totvs_id === totvsMatch[1]);
      if (matchedScope) return `${matchedScope.totvs_id} - ${matchedScope.church_name}`;
    }

    try {
      const result = await post<{ ok?: boolean; churches?: Array<{ totvs_id: string; church_name: string }> }>(
        "search-churches-public",
        { query: rawValue, limit: 5 },
        { skipAuth: true }
      );
      if (result?.churches?.length) {
        const first = result.churches[0];
        return `${first.totvs_id} - ${first.church_name}`;
      }
    } catch {
      // silently ignore search failures
    }
    return normalized;
  }

  function openLetterCreationDialog() {
    if (isCadastroPendente) {
      toast.error("Cadastro pendente. Procure a secretaria da igreja.");
      return;
    }
    const isBlocked = String(profile?.is_active ?? true) === "false" || String(usuario?.role || "").toLowerCase() === "obreiro" && false;
    const ministerialRole = String(profile?.minister_role || usuario?.ministerial || "").trim();
    if (!ministerialRole) {
      toast.error("Preencha o cargo ministerial no seu cadastro antes de gerar a carta.");
      return;
    }
    setLetterForm(emptyLetterForm);
    setOpenLetterDialog(true);
  }

  async function handleCreateLetter() {
    const ministerialRole = String(profile?.minister_role || usuario?.ministerial || "").trim();
    const churchDestination = selectedDestination
      ? `${selectedDestination.totvs_id} - ${selectedDestination.church_name}`
      : normalizeManualDestination(letterForm.igreja_destino.trim() || letterForm.igreja_destino_manual);

    if (!ministerialRole) {
      toast.error("Cargo ministerial nao informado. Atualize seu cadastro.");
      return;
    }
    if (!churchDestination) {
      toast.error("Selecione ou informe a igreja de destino.");
      return;
    }
    if (!letterForm.dia_pregacao) {
      toast.error("Informe a data da pregacao.");
      return;
    }
    if (letterForm.dia_pregacao < todayIso || letterForm.dia_pregacao > maxPregacaoIso) {
      toast.error("A data da pregacao deve ficar entre hoje e os proximos 30 dias.");
      return;
    }

    setCreatingLetter(true);
    try {
      await post("create-letter", {
        church_destination: churchDestination,
        manual_destination: !selectedDestination || !!letterForm.igreja_destino_manual.trim(),
        preacher_name: String(profile?.full_name || usuario?.nome || ""),
        minister_role: ministerialRole,
        preach_date: letterForm.dia_pregacao,
        preach_period: "NOITE",
        church_origin: String(session?.totvs_id ? `${session.totvs_id} ${session.church_name || ""}`.trim() : session?.church_name || ""),
        preacher_user_id: userId,
        phone: String(profile?.phone || usuario?.telefone || ""),
        email: String(profile?.email || "") || null,
      });
      toast.success("Carta enviada com sucesso.");
      setOpenLetterDialog(false);
      await queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch (err) {
      toast.error(String((err as Error)?.message || "Nao foi possivel enviar a carta."));
    } finally {
      setCreatingLetter(false);
    }
  }

  function formatDateBr(value: string) {
    if (!value) return "-";
    const [y, m, d] = value.split("-");
    if (!y || !m || !d) return value;
    return `${d}/${m}/${y}`;
  }

  async function baixarPrimeiraLiberada() {
    const candidate = letters.find((l) => l.status === "LIBERADA");
    if (!candidate) return toast.error("Nenhuma carta liberada para baixar.");
    await openPdf(candidate);
  }

  async function salvarPerfil() {
    setSavingProfile(true);
    try {
      let avatarUrl = profileForm.avatar_url || undefined;
      if (avatarFile && supabase) {
        const ext = (avatarFile.name.split(".").pop() || "png").toLowerCase();
        const cpf = String(profile?.cpf || usuario?.cpf || "tmp").replace(/\D/g, "");
        const path = `users/${cpf || Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("avatars").upload(path, avatarFile, {
          upsert: true,
          contentType: avatarFile.type || undefined,
          cacheControl: "3600",
        });
        if (error) throw new Error(error.message || "avatar_upload_failed");
        const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = publicData.publicUrl ? `${publicData.publicUrl}?t=${Date.now()}` : avatarUrl;
      }

      await updateMyProfile({
        phone: profileForm.phone || undefined,
        email: profileForm.email || undefined,
        birth_date: profileForm.birth_date || undefined,
        avatar_url: avatarUrl,
        cep: profileForm.cep || undefined,
        address_street: profileForm.address_street || undefined,
        address_number: profileForm.address_number || undefined,
        address_complement: profileForm.address_complement || undefined,
        address_neighborhood: profileForm.address_neighborhood || undefined,
        address_city: profileForm.address_city || undefined,
        address_state: profileForm.address_state || undefined,
      });
      toast.success("Perfil atualizado.");
      setOpenUpdateModal(false);
      setAvatarFile(null);
      await queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao atualizar perfil.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <ManagementShell roleMode="obreiro">
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
          <p className="mt-1 text-base text-slate-600">Visao geral das suas cartas e dados cadastrais.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {isCadastroPendente ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Seu cadastro esta pendente de liberacao. Cartas e documentos ficam bloqueados ate aprovacao.
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-3">
            <Button onClick={openLetterCreationDialog} className="w-full bg-blue-600 hover:bg-blue-700" disabled={isCadastroPendente}>
              Pedir carta
            </Button>
            <Button variant="outline" onClick={pedirPrimeiraLiberacao} className="w-full" disabled={isCadastroPendente || hasDirectRelease}>
              <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao de carta
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full" disabled={isCadastroPendente}>
                  <MoreHorizontal className="mr-2 h-4 w-4" /> Acoes
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                <DropdownMenuItem onClick={baixarPrimeiraLiberada} disabled={isCadastroPendente}>
                  <Download className="mr-2 h-4 w-4" /> Baixar carta
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav("/usuario/documentos")} disabled={isCadastroPendente}>
                  <IdCard className="mr-2 h-4 w-4" /> Documentos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenUpdateModal(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Atualizar cadastro
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenCadastroModal(true)}>
                  <Eye className="mr-2 h-4 w-4" /> Visualizar cadastro
                </DropdownMenuItem>
                {pushSupported ? (
                  <DropdownMenuItem
                    disabled={pushLoading}
                    onClick={() => (pushSubscribed ? unsubscribePush() : subscribePush())}
                  >
                    {pushSubscribed ? (
                      <><BellOff className="mr-2 h-4 w-4" /> Desativar notificacoes</>
                    ) : (
                      <><Bell className="mr-2 h-4 w-4" /> Ativar notificacoes</>
                    )}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card azul — total de cartas */}
          <Card className="rounded-xl border-0 bg-gradient-to-br from-blue-500 to-blue-700 shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white/80">Total de cartas</p>
              <p className="text-4xl font-extrabold text-white">{stats.totalCartas}</p>
            </CardContent>
          </Card>
          {/* Card ciano — cartas dos ultimos 7 dias */}
          <Card className="rounded-xl border-0 bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white/80">Total de cartas (7 dias)</p>
              <p className="text-4xl font-extrabold text-white">{stats.cartas7dias}</p>
            </CardContent>
          </Card>
          {/* Card verde — cartas de hoje */}
          <Card className="rounded-xl border-0 bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white/80">Cartas hoje</p>
              <p className="text-4xl font-extrabold text-white">{stats.cartasHoje}</p>
            </CardContent>
          </Card>
          {/* Card amarelo — cartas aguardando liberacao */}
          <Card className="rounded-xl border-0 bg-gradient-to-br from-amber-400 to-amber-600 shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white/80">Aguardando liberacao</p>
              <p className="text-4xl font-extrabold text-white">{stats.aguardando}</p>
            </CardContent>
          </Card>
        </section>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Historico de Cartas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Button variant={quickRange === "today" ? "default" : "outline"} onClick={() => setQuickRange("today")} className="shrink-0">Hoje</Button>
              <Button variant={quickRange === "7" ? "default" : "outline"} onClick={() => setQuickRange("7")} className="shrink-0">7 dias</Button>
              <Button variant={quickRange === "15" ? "default" : "outline"} onClick={() => setQuickRange("15")} className="shrink-0">15 dias</Button>
              <Button variant={quickRange === "30" ? "default" : "outline"} onClick={() => setQuickRange("30")} className="shrink-0">30 dias</Button>
              <Button variant={quickRange === "all" ? "default" : "outline"} onClick={() => setQuickRange("all")} className="shrink-0">Todos</Button>
            </div>

            <div className="grid gap-2 md:grid-cols-[1fr_220px]">
              <Input placeholder="Buscar por destino, origem, nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select value={statusFilter} onValueChange={setStatusFilter} disabled={isObreiro}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="AUTORIZADO">AUTORIZADO</SelectItem>
                  <SelectItem value="AGUARDANDO_LIBERACAO">AGUARDANDO_LIBERACAO</SelectItem>
                  <SelectItem value="LIBERADA">LIBERADA</SelectItem>
                  <SelectItem value="BLOQUEADO">BLOQUEADO</SelectItem>
                  <SelectItem value="ENVIADA">ENVIADA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? <p className="text-sm text-slate-500">Carregando...</p> : null}

            <div className="space-y-3 md:hidden">
              {filteredLetters.map((letter) => {
                const canOpen = isLetterReadyForView(letter);
                const canRequest = !hasDirectRelease && (letter.status === "AUTORIZADO" || letter.status === "AGUARDANDO_LIBERACAO");
                return (
                  <Card key={letter.id} className="border border-slate-200">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{letter.church_destination || "-"}</p>
                          <p className="text-xs text-slate-500">Pregacao: {formatDate(letter.preach_date)}</p>
                        </div>
                        <Badge variant="outline" className={statusClass(letter.status)}>{letter.status}</Badge>
                      </div>
                      <p className="text-xs text-slate-600">Origem: {letter.church_origin || "-"}</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full"><MoreHorizontal className="mr-2 h-4 w-4" /> Acoes</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem disabled={!canOpen} onClick={() => openPdf(letter)}>
                            <Download className="mr-2 h-4 w-4" /> Abrir PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={!canOpen} onClick={() => shareLetter(letter)}>
                            <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={!canRequest} onClick={() => pedirLiberacao(letter)}>
                            <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
              <div className="min-w-[840px]">
                <div className="grid grid-cols-[120px_120px_180px_180px_180px_60px] border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                  <span>Criada em</span>
                  <span>Data pregacao</span>
                  <span>Origem</span>
                  <span>Destino</span>
                  <span>Status</span>
                  <span>Acoes</span>
                </div>
                {filteredLetters.map((letter) => {
                  const canOpen = isLetterReadyForView(letter);
                  return (
                    <div key={letter.id} className="grid grid-cols-[120px_120px_180px_180px_180px_60px] items-center border-b px-4 py-3 text-sm">
                      <span>{formatDate(letter.created_at)}</span>
                      <span>{formatDate(letter.preach_date)}</span>
                      <span className="truncate">{letter.church_origin || "-"}</span>
                      <span className="truncate">{letter.church_destination || "-"}</span>
                      <span className="overflow-hidden"><Badge variant="outline" className={`${statusClass(letter.status)} max-w-full truncate text-xs`}>{letter.status}</Badge></span>
                      {/* Menu de acoes: icone compacto sem texto */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={!canOpen} onClick={() => openPdf(letter)}>
                            <Download className="mr-2 h-4 w-4" /> Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={!canOpen} onClick={() => shareLetter(letter)}>
                            <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600"
                            onClick={() => excluirCarta(letter)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>

            {!isLoading && filteredLetters.length === 0 ? <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Nenhuma carta encontrada.</div> : null}
          </CardContent>
        </Card>
      </div>

      {/* Letter Creation Dialog */}
      <Dialog open={openLetterDialog} onOpenChange={setOpenLetterDialog}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>Registro de Carta de Pregacao</DialogTitle>
            <DialogDescription>Preencha os dados para emissao da carta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.35fr_1fr]">
            {/* Form card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-start gap-2 text-xl text-slate-900 sm:items-center sm:text-2xl">
                  <FileText className="h-6 w-6 text-blue-600" /> Registro de Carta de Pregacao
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Nome do pregador</Label>
                  <Input value={profile?.full_name || usuario?.nome || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={profile?.phone || usuario?.telefone || ""} disabled placeholder="Telefone nao informado" />
                </div>
                <div className="space-y-2">
                  <Label>Igreja que faz a carta (origem)</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={session?.church_name || church?.church_name || ""} disabled className="pl-10" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Funcao ministerial</Label>
                  <Input value={profile?.minister_role || usuario?.ministerial || "Nao informado"} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Igreja que vai pregar (destino)</Label>
                  <Select
                    value=""
                    onValueChange={(value) =>
                      setLetterForm((prev) => ({
                        ...prev,
                        igreja_destino: value,
                        igreja_destino_manual: "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma igreja sugerida" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationOptions.map((item) => {
                        const value = `${item.totvs_id} - ${item.church_name}`;
                        return (
                          <SelectItem key={item.totvs_id} value={value}>
                            {value}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={letterForm.igreja_destino}
                      onChange={(e) =>
                        setLetterForm((prev) => ({
                          ...prev,
                          igreja_destino: e.target.value,
                          igreja_destino_manual: "",
                        }))
                      }
                      placeholder="Digite o TOTVS ou nome da igreja destino"
                      disabled={!!letterForm.igreja_destino_manual.trim()}
                      className="pl-10"
                    />
                  </div>
                  {filteredDestinationOptions.length > 0 && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {filteredDestinationOptions.map((item) => (
                        <button
                          key={item.totvs_id}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                          onClick={() =>
                            setLetterForm((prev) => ({
                              ...prev,
                              igreja_destino: `${item.totvs_id} - ${item.church_name}`,
                              igreja_destino_manual: "",
                            }))
                          }
                        >
                          <span className="font-medium text-slate-900">{item.totvs_id} - {item.church_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchingDestinations && (
                    <p className="text-xs text-slate-500">Buscando igrejas...</p>
                  )}
                  <p className="text-xs text-slate-500">
                    Se escolher uma igreja sugerida, a origem segue a sua igreja atual. Se digitar um destino fora das opcoes conhecidas, o sistema trata como manual.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Outros (se nao encontrar)</Label>
                  <Input
                    value={letterForm.igreja_destino_manual}
                    onChange={(e) => setLetterForm((prev) => ({ ...prev, igreja_destino_manual: e.target.value, igreja_destino: "" }))}
                    onBlur={async (e) => {
                      const resolved = await resolveManualDestination(e.target.value);
                      setLetterForm((prev) => ({ ...prev, igreja_destino_manual: resolved, igreja_destino: "" }));
                    }}
                    placeholder="Ex.: 9901 - PIUMA-NITEROI"
                    disabled={!!letterForm.igreja_destino.trim()}
                  />
                  <p className="text-xs text-slate-500">
                    Modelo: <span className="font-medium">9901 - PIUMA-NITEROI</span>. Se digitar diferente, o sistema tenta padronizar automaticamente.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Data da pregacao</Label>
                    <Input
                      type="date"
                      min={todayIso}
                      max={maxPregacaoIso}
                      value={letterForm.dia_pregacao}
                      onChange={(e) => setLetterForm((prev) => ({ ...prev, dia_pregacao: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data de emissao da carta</Label>
                    <Input value={formatDateBr(todayIso)} disabled />
                  </div>
                </div>
                <p className="text-xs text-slate-500">A data da pregacao pode ser escolhida entre hoje e os proximos 30 dias.</p>
              </CardContent>
            </Card>

            {/* Preview card */}
            <Card className="overflow-hidden border-emerald-100 shadow-sm">
              <CardHeader className="bg-emerald-50/80">
                <CardTitle className="flex items-start gap-2 text-xl text-slate-900 sm:items-center sm:text-2xl">
                  <FileText className="h-6 w-6 text-emerald-600" /> Pre-visualizacao da Carta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pregador</p>
                  <div className="flex items-start gap-3 text-slate-900 sm:items-center">
                    <UserCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="text-base font-semibold sm:text-lg">{profile?.full_name || usuario?.nome || "Nao informado"}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Igreja de origem e destino</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{session?.church_name || church?.church_name || "Nao informada"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <span>{(letterForm.igreja_destino || letterForm.igreja_destino_manual).trim() || "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data de emissao</p>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                      <CalendarDays className="h-5 w-5 text-emerald-600" />
                      <span>{formatDateBr(todayIso)}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data da pregacao</p>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                      <CalendarDays className="h-5 w-5 text-emerald-600" />
                      <span>{letterForm.dia_pregacao ? formatDateBr(letterForm.dia_pregacao) : "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura responsavel</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{pastorFromUsers?.full_name || church?.pastor_name || "Resolvido pela hierarquia"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span>{pastorFromUsers?.phone || church?.pastor_phone || "Definido na liberacao/geracao da carta"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpenLetterDialog(false)} className="w-full sm:w-auto">Fechar</Button>
            <Button
              type="button"
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
              onClick={handleCreateLetter}
              disabled={creatingLetter}
            >
              {creatingLetter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar carta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openCadastroModal} onOpenChange={setOpenCadastroModal}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Meu Cadastro</DialogTitle>
            <DialogDescription>Seus dados e foto 3x4.</DialogDescription>
          </DialogHeader>
          {/* Somente dados do usuario com foto — sem card do pastor */}
          <div className="space-y-4 text-sm">
            {/* Foto 3x4 centralizada */}
            <div className="flex justify-center">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Foto 3x4"
                  className="h-36 w-28 rounded-lg border-2 border-slate-200 object-cover shadow"
                />
              ) : (
                <div className="flex h-36 w-28 items-center justify-center rounded-lg border-2 border-slate-200 bg-slate-100 text-slate-400">
                  <UserCircle2 className="h-16 w-16" />
                </div>
              )}
            </div>
            {/* Dados pessoais */}
            <div className="space-y-2">
              <p><strong>Nome:</strong> {profile?.full_name || usuario?.nome || "-"}</p>
              <p><strong>CPF:</strong> {profile?.cpf || usuario?.cpf || "-"}</p>
              <p><strong>Cargo:</strong> {profile?.minister_role || usuario?.ministerial || "-"}</p>
              <p><strong>Igreja:</strong> {session?.church_name || church?.church_name || "-"}</p>
              <p><strong>Celular:</strong> {profile?.phone || "-"}</p>
              <p><strong>E-mail:</strong> {profile?.email || "-"}</p>
              <p><strong>Nascimento:</strong> {formatDate(profile?.birth_date || null)}</p>
              {/* Endereco (so aparece se tiver dados) */}
              {(() => {
                // Comentario: leitura direta das colunas planas do banco (nao existe address_json).
                const street = String((profileRaw?.address_street as string) || "");
                const number = String((profileRaw?.address_number as string) || "");
                const neighborhood = String((profileRaw?.address_neighborhood as string) || "");
                const city = String((profileRaw?.address_city as string) || "");
                const state = String((profileRaw?.address_state as string) || "");
                const cep = String((profileRaw?.cep as string) || "");
                const hasAddress = street || city;
                return hasAddress ? (
                  <p><strong>Endereco:</strong> {[street, number, neighborhood, city, state, cep].filter(Boolean).join(", ")}</p>
                ) : null;
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openUpdateModal} onOpenChange={setOpenUpdateModal}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Atualizar cadastro</DialogTitle>
            <DialogDescription>Atualize seus dados, endereco e foto 3x4.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={profile?.full_name || ""} disabled />
              </div>
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input value={profile?.cpf || ""} disabled />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Input value={profile?.minister_role || ""} disabled />
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>Foto 3x4</Label>
                {/* AvatarCapture: inclui câmera/galeria, remoção de fundo por IA e preview 3x4 */}
                <AvatarCapture
                  onFileReady={(file) => setAvatarFile(file)}
                  disabled={savingProfile}
                />
              </div>
              <div className="space-y-1">
                <Label>URL da foto</Label>
                <Input value={profileForm.avatar_url} onChange={(e) => setProfileForm((p) => ({ ...p, avatar_url: e.target.value }))} />
              </div>
            </div>
            {isPastor ? (
              <Card className="border border-slate-200 bg-slate-50 shadow-sm">
                <CardHeader>
                  <CardTitle>Assinatura e carimbo do pastor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Assinatura</Label>
                      <ImageCaptureInput
                        accept="image/*"
                        capture="environment"
                        allowWhiteBg
                        defaultRatio={0}
                        editorTitle="Editar assinatura"
                        onChange={(file) => setSignatureFile(file)}
                      />
                      {profile?.signature_url ? (
                        <a href={profile.signature_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                          Ver assinatura atual
                        </a>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <Label>Carimbo do pastor</Label>
                      <ImageCaptureInput
                        accept="image/*"
                        capture="environment"
                        allowWhiteBg
                        defaultRatio={1}
                        editorTitle="Editar carimbo"
                        onChange={(file) => setStampPastorFile(file)}
                      />
                      {profile?.stamp_pastor_url ? (
                        <a href={profile.stamp_pastor_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                          Ver carimbo do pastor
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={savePastorStamps} disabled={savingStamps}>
                    {savingStamps ? "Salvando..." : "Salvar assinatura e carimbo"}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data de nascimento</Label>
              <Input type="date" value={profileForm.birth_date} onChange={(e) => setProfileForm((p) => ({ ...p, birth_date: e.target.value }))} />
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input
                  value={maskCep(profileForm.cep)}
                  onChange={(e) => setProfileForm((p) => ({ ...p, cep: e.target.value }))}
                  onBlur={() => void autofillCep(true)}
                  placeholder="00000-000"
                />
                <p className="text-xs text-slate-500">{cepLookupLoading ? "Buscando endereco..." : "Endereco preenchido automaticamente pelo CEP."}</p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Endereco</Label>
                <Input value={profileForm.address_street} onChange={(e) => setProfileForm((p) => ({ ...p, address_street: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Numero</Label>
                <Input value={profileForm.address_number} onChange={(e) => setProfileForm((p) => ({ ...p, address_number: e.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Complemento</Label>
                <Input value={profileForm.address_complement} onChange={(e) => setProfileForm((p) => ({ ...p, address_complement: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={profileForm.address_neighborhood} onChange={(e) => setProfileForm((p) => ({ ...p, address_neighborhood: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Cidade</Label>
                <Input value={profileForm.address_city} onChange={(e) => setProfileForm((p) => ({ ...p, address_city: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input value={profileForm.address_state} onChange={(e) => setProfileForm((p) => ({ ...p, address_state: e.target.value }))} />
              </div>
            </div>
            <Button className="w-full" onClick={salvarPerfil} disabled={savingProfile}>
              {savingProfile ? "Salvando..." : "Atualizar perfil"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
