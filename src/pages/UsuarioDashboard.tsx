import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  createLetterByPastor,
  fetchAncestorChain,
  getPastorByTotvsPublic,
  getSignedPdfUrl,
  listChurchesInScope,
  requestRelease,
  searchChurchesPublic,
  softDeleteLetter,
  updateMyProfile,
  upsertStamps,
  workerDashboard,
  getMemberDocsStatus,
  type AncestorChainItem,
  type ChurchInScopeItem,
  type PastorLetter,
} from "@/services/saasService";
import { post } from "@/lib/api";
import { Bell, BellOff, Building2, CalendarDays, Download, Eye, FileText, IdCard, Loader2, MoreHorizontal, Phone, RefreshCw, Search, Share2, Trash2, Unlock, UserCircle2 } from "lucide-react";
import { ImageCaptureInput } from "@/components/shared/ImageCaptureInput";
import { AvatarCapture } from "@/components/shared/AvatarCapture";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type DestinationOption = {
  totvs_id: string;
  church_name: string;
};

type LetterFormState = {
  igreja_destino: string;
  igreja_destino_manual: string;
  dia_pregacao: string;
  preach_period: "MANHA" | "TARDE" | "NOITE" | "";
};

type QuickRange = "today" | "7" | "15" | "30" | "all";

const emptyLetterForm: LetterFormState = {
  igreja_destino: "",
  igreja_destino_manual: "",
  dia_pregacao: "",
  preach_period: "",
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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { usuario, session, setUsuario, setTelefone } = useUser();

  // Comentario: prepara scope para validacao de hierarquia em notificacoes
  const userScopeIds = (session?.scope_totvs_ids || usuario?.totvs_access || []).filter(Boolean);

  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications(
    session?.id,
    usuario?.role,
    userScopeIds
  );

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [quickRange, setQuickRange] = useState<QuickRange>("7");
  const [openUpdateModal, setOpenUpdateModal] = useState(false);

  // Comentario: abre o modal de editar cadastro automaticamente se ?editar=1 na URL
  useEffect(() => {
    if (searchParams.get("editar") === "1") {
      setOpenUpdateModal(true);
      searchParams.delete("editar");
      setSearchParams(searchParams, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [openCadastroModal, setOpenCadastroModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAllLetters, setShowAllLetters] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState("");
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    minister_role: "",
    phone: "",
    email: "",
    rg: "",
    marital_status: "",
    profession: "",
    birth_date: "",
    // Comentario: data de batismo e data de separaÃ§Ã£o/ordenaÃ§Ã£o â€” exibidos para cooperador e acima
    baptism_date: "",
    ordination_date: "",
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
  // Dados brutos das igrejas do escopo (com info do pastor) â€” para calcular signerChurch
  const [rawScopeChurches, setRawScopeChurches] = useState<ChurchInScopeItem[]>([]);
  // Ancestrais acima do scope root (para campo "Outros" â€” mae mais alta com pastor)
  const [ancestorChain, setAncestorChain] = useState<AncestorChainItem[]>([]);
  // Debounce e busca publica para o campo "Outros"
  const [outrosDebounced, setOutrosDebounced] = useState("");
  const [outrosSuggestions, setOutrosSuggestions] = useState<Array<{totvs_id: string; church_name: string; class: string}>>([]);
  const [outrosLoading, setOutrosLoading] = useState(false);

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
  });

  const { data: pastorFromUsers } = useQuery({
    queryKey: ["pastor-by-totvs", activeTotvs],
    queryFn: () => getPastorByTotvsPublic(activeTotvs),
    enabled: Boolean(activeTotvs),
  });

  // Verifica se o usuario tem ficha de membro gerada (necessaria para QR code nas cartas)
  const { data: docsStatus } = useQuery({
    queryKey: ["member-docs-status", userId],
    queryFn: () => getMemberDocsStatus({ member_id: userId }),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const [fichaAlertShown, setFichaAlertShown] = useState(false);
  useEffect(() => {
    if (fichaAlertShown || !docsStatus || !userId) return;
    const fichaUrl = String(docsStatus?.ficha?.final_url || "").trim();
    if (!fichaUrl) {
      setFichaAlertShown(true);
      toast.warning(
        "FaÃ§a a sua ficha de membro para continuar emitindo cartas. Sem a ficha, suas cartas poderÃ£o ser bloqueadas.",
        { duration: 8000 },
      );
    }
  }, [docsStatus, userId, fichaAlertShown]);

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
      full_name: String(profile?.full_name || usuario?.nome || ""),
      minister_role: String(profile?.minister_role || ""),
      phone: profile?.phone || "",
      email: profile?.email || "",
      rg: String(profileRaw?.rg || ""),
      marital_status: String(profileRaw?.marital_status || ""),
      profession: String(profileRaw?.profession || ""),
      birth_date: String(profile?.birth_date || ""),
      // Comentario: preenche campos de batismo e separaÃ§Ã£o vindos do perfil
      baptism_date: String(profileRaw?.baptism_date || ""),
      ordination_date: String(profileRaw?.ordination_date || ""),
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

  const visibleLetters = useMemo(
    () => (showAllLetters ? filteredLetters : filteredLetters.slice(0, 5)),
    [filteredLetters, showAllLetters],
  );

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
      toast.error("PDF ainda nÃ£o liberado. Use o botÃ£o Pedir liberaÃ§Ã£o.");
    }
  }

  async function shareLetter(letter: PastorLetter) {
    if (isCadastroPendente) return toast.error("Cadastro pendente. Compartilhamento bloqueado.");
    if (!isLetterReadyForView(letter)) return toast.error("Carta bloqueada para compartilhamento.");
    const directUrl = String(letter.url_carta || "").trim();
    if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
      window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregaÃ§Ã£o: ${directUrl}`)}`, "_blank");
      return;
    }
    try {
      const url = await getSignedPdfUrl(letter.id);
      if (!url) throw new Error("share-url-empty");
      window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregaÃ§Ã£o: ${url}`)}`, "_blank");
    } catch {
      toast.error("PDF ainda nÃ£o liberado para compartilhamento.");
    }
  }

  async function pedirLiberacao(letter: PastorLetter) {
    if (isCadastroPendente) return toast.error("Cadastro pendente. Procure a secretaria da igreja.");
    if (hasDirectRelease) return toast.info("Sua liberaÃ§Ã£o direta estÃ¡ ativa. NÃ£o Ã© necessÃ¡rio pedir liberaÃ§Ã£o.");
    try {
      await requestRelease(letter.id, userId, session?.totvs_id || "");
      toast.success("Pedido enviado.");
      await queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao solicitar liberaÃ§Ã£o.");
    }
  }

  async function excluirCarta(letter: PastorLetter) {
    // ConfirmaÃ§Ã£o antes de excluir
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
      setRawScopeChurches([]);
      setAncestorChain([]);
      setOutrosSuggestions([]);
      setOutrosDebounced("");
      return;
    }
    setSearchingDestinations(true);
    listChurchesInScope(1, 1000)
      .then((churches) => {
        setRawScopeChurches(churches);
        // Comentario: ordena pela hierarquia (estadual > setorial > central > regional > local)
        // e dentro de cada nÃ­vel, pelo TOTVS numÃ©rico crescente.
        const classOrder: Record<string, number> = { estadual: 0, setorial: 1, central: 2, regional: 3, local: 4 };
        setDestinationOptions(
          [...churches]
            .sort((a, b) => {
              const oA = classOrder[String(a.church_class || "").toLowerCase()] ?? 99;
              const oB = classOrder[String(b.church_class || "").toLowerCase()] ?? 99;
              if (oA !== oB) return oA - oB;
              return Number(a.totvs_id || 0) - Number(b.totvs_id || 0);
            })
            .map((c) => ({ totvs_id: String(c.totvs_id || ""), church_name: String(c.church_name || "") }))
        );
      })
      .catch(() => { setRawScopeChurches([]); setDestinationOptions([]); })
      .finally(() => setSearchingDestinations(false));
    // Comentario: busca ancestrais acima do scope root do obreiro (ex.: estadual acima de setorial).
    // Usado para calcular a mae MAIS ALTA com pastor no campo "Outros".
    const activeTotvsId = String(session?.totvs_id || "");
    if (activeTotvsId) {
      fetchAncestorChain(activeTotvsId).then(setAncestorChain).catch(() => setAncestorChain([]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLetterDialog]);

  // â”€â”€â”€ Igreja assinante (origem da carta) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Comentario: igual ao telas-cartas â€” regional/local NUNCA e a origem.
  // Percorre rawScopeChurches de baixo para cima a partir da propria igreja do obreiro
  // ate achar a primeira com pastor (mae direta). Para "Outros", usa highestSignerForOthers.
  const signerChurch = useMemo<ChurchInScopeItem | null>(() => {
    if (!rawScopeChurches.length) return null;
    const byId = new Map(rawScopeChurches.map((c) => [String(c.totvs_id || ""), c]));
    const activeTotvs = String(session?.totvs_id || "");
    let cur: ChurchInScopeItem | null = byId.get(activeTotvs) || null;
    const visited = new Set<string>();
    while (cur) {
      const id = String(cur.totvs_id || "");
      if (visited.has(id)) break;
      visited.add(id);
      if (cur.pastor?.full_name) return cur;
      const parentId = String(cur.parent_totvs_id || "");
      cur = byId.get(parentId) || null;
    }
    // Fallback: raiz do escopo (sem pai no escopo) â€” provavelmente tem pastor
    const allIds = new Set(rawScopeChurches.map((c) => String(c.totvs_id || "")));
    return rawScopeChurches.find((c) => !c.parent_totvs_id || !allIds.has(String(c.parent_totvs_id || ""))) || null;
  }, [rawScopeChurches, session?.totvs_id]);

  // Mae mais alta com pastor: percorre ancestorChain do final (mais alto) para o inicio.
  // Usada no campo "Outros" â€” sempre pega estadual > setorial > central.
  const highestSignerForOthers = useMemo<AncestorChainItem | null>(() => {
    for (let i = ancestorChain.length - 1; i >= 0; i--) {
      if (ancestorChain[i].pastor?.full_name) return ancestorChain[i];
    }
    return null;
  }, [ancestorChain]);

  // Comentario: verifica se um destino esta na sub-arvore de uma igreja raiz,
  // subindo pelos parent_totvs_id ate encontrar a raiz ou esgotar a cadeia.
  function isInSubtree(destinoTotvs: string, raizTotvs: string): boolean {
    if (!destinoTotvs || !raizTotvs) return false;
    if (destinoTotvs === raizTotvs) return true;
    const byId = new Map(rawScopeChurches.map((c) => [String(c.totvs_id || ""), c]));
    // Comentario: tambem inclui ancestorChain no mapa para subir alem do escopo
    for (const a of ancestorChain) byId.set(String(a.totvs_id || ""), { totvs_id: a.totvs_id, church_name: a.church_name, parent_totvs_id: a.parent_totvs_id } as ChurchInScopeItem);
    let cur = byId.get(destinoTotvs);
    const visited = new Set<string>();
    while (cur) {
      const id = String(cur.totvs_id || "");
      if (visited.has(id)) break;
      visited.add(id);
      if (id === raizTotvs) return true;
      const parentId = String(cur.parent_totvs_id || "");
      if (!parentId) break;
      cur = byId.get(parentId);
    }
    return false;
  }

  // Comentario: calcula a origem correta baseada no destino selecionado.
  // Regra: se o destino esta na sub-arvore do signerChurch (mae), usa a mae.
  // Se nao, sobe pela ancestorChain ate achar um ancestral cuja sub-arvore inclua o destino.
  // Exemplo: central X quer pregar em central Y (mae setorial B) â†’ origem = estadual E (avo comum).
  const computedOrigin = useMemo(() => {
    const manualFilled = !!letterForm.igreja_destino_manual.trim();
    // Comentario: campo "Outros" sempre usa a mae mais alta (estadual/setorial)
    if (manualFilled) {
      return {
        name: highestSignerForOthers?.church_name || signerChurch?.church_name || session?.church_name || "",
        totvs: highestSignerForOthers?.totvs_id || String(signerChurch?.totvs_id || "") || String(session?.totvs_id || ""),
      };
    }
    // Comentario: destino selecionado da lista â€” verifica se esta no escopo da mae
    const destTotvs = String(letterForm.igreja_destino || "").trim();
    const destMatch = destinationOptions.find(
      (o) => o.totvs_id === destTotvs || `${o.totvs_id} - ${o.church_name}`.trim().toUpperCase() === destTotvs.toUpperCase()
    );
    const destId = destMatch?.totvs_id || "";
    // Comentario: se nao tem destino selecionado, usa a mae direta
    if (!destId || !signerChurch) {
      return {
        name: signerChurch?.church_name || session?.church_name || "",
        totvs: String(signerChurch?.totvs_id || "") || String(session?.totvs_id || ""),
      };
    }
    // Comentario: se destino esta na sub-arvore da mae (signerChurch), usa a mae
    if (isInSubtree(destId, String(signerChurch.totvs_id || ""))) {
      return {
        name: signerChurch.church_name || session?.church_name || "",
        totvs: String(signerChurch.totvs_id || "") || String(session?.totvs_id || ""),
      };
    }
    // â”€â”€â”€ REGRA DE IRMAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Comentario: se a origem (signerChurch) e o destino compartilham a MESMA MAE
    // (mesmo parent_totvs_id), sao irmas na hierarquia.
    // Nesse caso, a carta sai com a propria igreja (signerChurch) como origem,
    // sem precisar subir para o ancestral comum.
    // Ex.: Central A (mae: Estadual X) para Central B (mae: Estadual X) = origem Central A.
    // Ex.: Setorial Y (mae: Estadual X) para Setorial Z (mae: Estadual X) = origem Setorial Y.
    const destChurchData = rawScopeChurches.find((c) => String(c.totvs_id || "") === destId);
    const signerParent = String(signerChurch.parent_totvs_id || "");
    const destParent = String(destChurchData?.parent_totvs_id || "");
    if (signerParent && destParent && signerParent === destParent) {
      return {
        name: signerChurch.church_name || session?.church_name || "",
        totvs: String(signerChurch.totvs_id || "") || String(session?.totvs_id || ""),
      };
    }
    // â”€â”€â”€ FIM REGRA DE IRMAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Comentario: destino em ramo diferente (mae diferente). Sobe pela ancestorChain
    // ate achar o primeiro ancestral com pastor cuja sub-arvore inclua o destino.
    // Ex.: Central A (mae: Estadual X) para Central C (mae: Setorial Y) = origem Estadual X.
    for (const ancestor of ancestorChain) {
      if (ancestor.pastor?.full_name && isInSubtree(destId, String(ancestor.totvs_id || ""))) {
        return { name: ancestor.church_name, totvs: ancestor.totvs_id };
      }
    }
    // Comentario: fallback â€” mae mais alta com pastor
    return {
      name: highestSignerForOthers?.church_name || signerChurch?.church_name || session?.church_name || "",
      totvs: highestSignerForOthers?.totvs_id || String(signerChurch?.totvs_id || "") || String(session?.totvs_id || ""),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterForm.igreja_destino, letterForm.igreja_destino_manual, signerChurch, highestSignerForOthers, ancestorChain, destinationOptions, rawScopeChurches, session]);

  const displayOriginName = computedOrigin.name;
  const displayOriginTotvs = computedOrigin.totvs;

  // â”€â”€â”€ Debounce e busca publica para o campo "Outros" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const t = setTimeout(() => setOutrosDebounced(letterForm.igreja_destino_manual), 300);
    return () => clearTimeout(t);
  }, [letterForm.igreja_destino_manual]);

  useEffect(() => {
    const q = outrosDebounced.trim();
    if (q.length < 2) { setOutrosSuggestions([]); return; }
    setOutrosLoading(true);
    searchChurchesPublic(q, 10)
      .then(setOutrosSuggestions)
      .catch(() => setOutrosSuggestions([]))
      .finally(() => setOutrosLoading(false));
  }, [outrosDebounced]);

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
      toast.error("Informe a data da pregaÃ§Ã£o.");
      return;
    }
    if (letterForm.dia_pregacao < todayIso || letterForm.dia_pregacao > maxPregacaoIso) {
      toast.error("A data da pregaÃ§Ã£o deve ficar entre hoje e os prÃ³ximos 30 dias.");
      return;
    }
    if (!letterForm.preach_period) {
      toast.error("Selecione o horÃ¡rio da pregaÃ§Ã£o: ManhÃ£, Tarde ou Noite.");
      return;
    }

    setCreatingLetter(true);
    try {
      const result = await createLetterByPastor({
        church_totvs_id: String(session?.totvs_id || ""),
        church_destination: churchDestination,
        manual_destination: !selectedDestination && !!letterForm.igreja_destino_manual.trim(),
        preacher_name: String(profile?.full_name || usuario?.nome || ""),
        minister_role: ministerialRole,
        preach_date: letterForm.dia_pregacao,
        preach_period: letterForm.preach_period as "MANHA" | "TARDE" | "NOITE",
        // Comentario: origem e sempre a mae com pastor (signerChurch), nunca a propria regional/local.
        // Para "Outros", usa a mae mais alta (highestSignerForOthers). Igual ao telas-cartas.
        church_origin: displayOriginTotvs ? `${displayOriginTotvs} - ${displayOriginName}`.trim() : (displayOriginName || String(session?.church_name || "")),
        preacher_user_id: userId,
        phone: String(profile?.phone || usuario?.telefone || ""),
        email: String(profile?.email || "") || null,
      });
      if (Boolean((result as Record<string, unknown>)?.queued)) {
        toast.success("Sem internet. Carta salva na fila e serÃ¡ enviada automaticamente.");
      } else {
        toast.success("Carta enviada com sucesso.");
      }
      setOpenLetterDialog(false);
      await queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch (err) {
      toast.error(String((err as Error)?.message || "NÃ£o foi possÃ­vel enviar a carta."));
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
    // Comentario: foto Ã© obrigatÃ³ria â€” verifica se jÃ¡ tem foto ou estÃ¡ enviando nova
    if (!avatarFile && !profileForm.avatar_url) {
      toast.error("A foto 3x4 Ã© obrigatÃ³ria. Tire uma foto ou envie da galeria.");
      return;
    }
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
        full_name: profileForm.full_name.trim() || undefined,
        minister_role: profileForm.minister_role || undefined,
        phone: profileForm.phone || undefined,
        email: profileForm.email || undefined,
        rg: profileForm.rg || undefined,
        marital_status: profileForm.marital_status || undefined,
        profession: profileForm.profession || undefined,
        birth_date: profileForm.birth_date || undefined,
        // Comentario: envia campos de batismo e separaÃ§Ã£o ao backend
        baptism_date: profileForm.baptism_date || undefined,
        ordination_date: profileForm.ordination_date || undefined,
        avatar_url: avatarUrl,
        cep: profileForm.cep || undefined,
        address_street: profileForm.address_street || undefined,
        address_number: profileForm.address_number || undefined,
        address_complement: profileForm.address_complement || undefined,
        address_neighborhood: profileForm.address_neighborhood || undefined,
        address_city: profileForm.address_city || undefined,
        address_state: profileForm.address_state || undefined,
      });
      // Comentario: atualiza o avatar_url no contexto do usuario para refletir no header
      if (avatarUrl) {
        setUsuario({ ...usuario!, avatar_url: avatarUrl });
      }
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
    <ManagementShell roleMode={usuario?.role === "pastor" ? "pastor" : usuario?.role === "secretario" ? "secretario" : "obreiro"}>
      <div className="space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Dashboard</h2>
          <p className="mt-1 text-base text-slate-600">Visao geral das suas cartas e dados cadastrais.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {isCadastroPendente ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Seu cadastro estÃ¡ pendente de liberaÃ§Ã£o. Cartas e documentos ficam bloqueados atÃ© aprovaÃ§Ã£o.
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-3">
            <Button onClick={openLetterCreationDialog} className="w-full bg-blue-600 hover:bg-blue-700" disabled={isCadastroPendente}>
              Pedir carta
            </Button>
            {!isObreiro ? (
              <Button variant="outline" onClick={pedirPrimeiraLiberacao} className="w-full" disabled={isCadastroPendente || hasDirectRelease}>
                <Unlock className="mr-2 h-4 w-4" /> Pedir liberaÃ§Ã£o de carta
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full" disabled={isCadastroPendente}>
                  <MoreHorizontal className="mr-2 h-4 w-4" /> AÃ§Ãµes
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
          {/* Card azul â€” total de cartas */}
          <Card className="rounded-xl border-0 bg-gradient-to-br from-blue-500 to-blue-700 shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white/80">Total de cartas</p>
              <p className="text-4xl font-extrabold text-white">{stats.totalCartas}</p>
            </CardContent>
          </Card>
          {/* Card ciano â€” cartas dos ultimos 7 dias */}
          <Card className="rounded-xl border-0 bg-gradient-to-br from-cyan-500 to-cyan-700 shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white/80">Total de cartas (7 dias)</p>
              <p className="text-4xl font-extrabold text-white">{stats.cartas7dias}</p>
            </CardContent>
          </Card>
          {/* Card verde â€” cartas de hoje */}
          <Card className="rounded-xl border-0 bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-white/80">Cartas hoje</p>
              <p className="text-4xl font-extrabold text-white">{stats.cartasHoje}</p>
            </CardContent>
          </Card>
          {/* Card amarelo â€” cartas aguardando liberacao */}
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
              {visibleLetters.map((letter) => {
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
                          <Button variant="outline" className="w-full"><MoreHorizontal className="mr-2 h-4 w-4" /> AÃ§Ãµes</Button>
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
                  <span>Data pregaÃ§Ã£o</span>
                  <span>Origem</span>
                  <span>Destino</span>
                  <span>Status</span>
                  <span>AÃ§Ãµes</span>
                </div>
                {visibleLetters.map((letter) => {
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
            {!isLoading && filteredLetters.length > 5 ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setShowAllLetters((prev) => !prev)}>
                  {showAllLetters ? "Mostrar apenas 5" : `Exibir mais (${filteredLetters.length - 5} restantes)`}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Letter Creation Dialog */}
      <Dialog open={openLetterDialog} onOpenChange={setOpenLetterDialog}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>Registro de Carta de PregaÃ§Ã£o</DialogTitle>
            <DialogDescription>Preencha os dados para emissÃ£o da carta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.35fr_1fr]">
            {/* Form card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-start gap-2 text-xl text-slate-900 sm:items-center sm:text-2xl">
                  <FileText className="h-6 w-6 text-blue-600" /> Registro de Carta de PregaÃ§Ã£o
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Nome do pregador</Label>
                  <Input value={profile?.full_name || usuario?.nome || ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={profile?.phone || usuario?.telefone || ""} disabled placeholder="Telefone nÃ£o informado" />
                </div>
                <div className="space-y-2">
                  <Label>Igreja que faz a carta (origem)</Label>
                  {/* Comentario: sempre mostra a mae com pastor â€” regional/local nunca e origem.
                      Mesma regra do telas-cartas: mae direta para destino normal,
                      mae mais alta (estadual > setorial > central) para o campo "Outros". */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={displayOriginName || "Carregando..."}
                      disabled
                      className="pl-10"
                    />
                  </div>
                  {/* Aviso quando "Outros" esta preenchido â€” origem subiu para a mae mais alta */}
                  {!!letterForm.igreja_destino_manual.trim() && displayOriginName && (
                    <p className="text-xs text-amber-700">
                      Destino fora do escopo. A carta sera emitida pela: {displayOriginName}.
                    </p>
                  )}
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
                  {/* Comentario: busca qualquer igreja do banco com 2+ caracteres.
                      Igual ao ChurchSearchInput do telas-cartas â€” publico, sem auth. */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={letterForm.igreja_destino_manual}
                      onChange={(e) => setLetterForm((prev) => ({ ...prev, igreja_destino_manual: e.target.value, igreja_destino: "" }))}
                      onBlur={async (e) => {
                        const resolved = await resolveManualDestination(e.target.value);
                        setLetterForm((prev) => ({ ...prev, igreja_destino_manual: resolved, igreja_destino: "" }));
                      }}
                      placeholder="Ex.: 9901 ou PIUMA-NITEROI"
                      disabled={!!letterForm.igreja_destino.trim()}
                      className="pl-10"
                    />
                    {outrosLoading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
                  </div>
                  {/* Lista de sugestoes em tempo real (busca publica, todas as igrejas) */}
                  {outrosSuggestions.length > 0 && !letterForm.igreja_destino.trim() && (
                    <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {outrosSuggestions.map((c) => (
                        <button
                          key={c.totvs_id}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                          onClick={() => {
                            const label = `${c.totvs_id} - ${c.church_name}`;
                            setLetterForm((prev) => ({ ...prev, igreja_destino_manual: label, igreja_destino: "" }));
                            setOutrosSuggestions([]);
                            setOutrosDebounced("");
                          }}
                        >
                          <span className="font-medium text-slate-900">{c.totvs_id} - {c.church_name}</span>
                          <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">{c.class}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!outrosLoading && outrosDebounced.trim().length >= 2 && outrosSuggestions.length === 0 && (
                    <p className="text-xs text-slate-500">Nenhuma igreja encontrada. Digite o codigo ou nome manualmente.</p>
                  )}
                  <p className="text-xs text-slate-500">
                    Modelo: <span className="font-medium">9901 - PIUMA-NITEROI</span>. Se digitar diferente, o sistema tenta padronizar automaticamente.
                  </p>
                </div>
                {/* Comentario: grid de 3 colunas para data pregacao, horario e data emissao */}
                <div className="grid gap-3 md:grid-cols-3">
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
                    <Label>HorÃ¡rio da pregaÃ§Ã£o</Label>
                    <Select value={letterForm.preach_period} onValueChange={(v) => setLetterForm((prev) => ({ ...prev, preach_period: v as "MANHA" | "TARDE" | "NOITE" }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o horÃ¡rio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANHA">ManhÃ£</SelectItem>
                        <SelectItem value="TARDE">Tarde</SelectItem>
                        <SelectItem value="NOITE">Noite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Data de emissao da carta</Label>
                    <Input value={formatDateBr(todayIso)} disabled />
                  </div>
                </div>
                <p className="text-xs text-slate-500">A data da pregaÃ§Ã£o pode ser escolhida entre hoje e os prÃ³ximos 30 dias.</p>
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
                    <span className="text-base font-semibold sm:text-lg">{profile?.full_name || usuario?.nome || "NÃ£o informado"}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Igreja de origem e destino</p>
                  <div className="space-y-2 text-slate-900">
                    <div className="text-base font-semibold sm:text-lg">{session?.church_name || church?.church_name || "NÃ£o informada"}</div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      <span>{(letterForm.igreja_destino || letterForm.igreja_destino_manual).trim() || "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data de emissÃ£o</p>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                      <CalendarDays className="h-5 w-5 text-emerald-600" />
                      <span>{formatDateBr(todayIso)}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Data da pregaÃ§Ã£o</p>
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-lg">
                      <CalendarDays className="h-5 w-5 text-emerald-600" />
                      <span>{letterForm.dia_pregacao ? formatDateBr(letterForm.dia_pregacao) : "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura responsÃ¡vel</p>
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
          {/* Somente dados do usuario com foto â€” sem card do pastor */}
          <div className="space-y-4 text-sm">
            {/* Foto 3x4 centralizada */}
            <div className="flex justify-center">
              <AvatarImage
                src={profile?.avatar_url || null}
                alt="Foto 3x4"
                className="h-36 w-28 rounded-lg border-2 border-slate-200 object-cover shadow"
              />
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
                <Input
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm((p) => ({ ...p, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input value={profile?.cpf || ""} disabled />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Cargo</Label>
              <select
                value={profileForm.minister_role}
                onChange={(e) => setProfileForm((p) => ({ ...p, minister_role: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Selecione</option>
                <option value="Membro">Membro</option>
                <option value="Cooperador">Cooperador</option>
                <option value="DiÃ¡cono">DiÃ¡cono</option>
                <option value="PresbÃ­tero">PresbÃ­tero</option>
                <option value="Pastor">Pastor</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>Foto 3x4</Label>
                {/* Comentario: mostra foto atual do perfil se existir */}
                {profileForm.avatar_url && !avatarFile && (
                  <div className="mb-2 flex justify-center">
                    <AvatarImage
                      src={profileForm.avatar_url}
                      alt="Foto atual"
                      className="h-20 w-16 rounded-lg border object-cover shadow-sm"
                    />
                  </div>
                )}
                {/* AvatarCapture: inclui cÃ¢mera/galeria, remoÃ§Ã£o de fundo por IA e preview 3x4 */}
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
                <Label>RG</Label>
                <Input value={profileForm.rg} onChange={(e) => setProfileForm((p) => ({ ...p, rg: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Estado civil</Label>
                <select
                  value={profileForm.marital_status}
                  onChange={(e) => setProfileForm((p) => ({ ...p, marital_status: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Selecione</option>
                  <option value="Solteiro(a)">Solteiro(a)</option>
                  <option value="Casado(a)">Casado(a)</option>
                  <option value="Divorciado(a)">Divorciado(a)</option>
                  <option value="ViÃºvo(a)">ViÃºvo(a)</option>
                  <option value="UniÃ£o estÃ¡vel">UniÃ£o estÃ¡vel</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>ProfissÃ£o</Label>
                <Input value={profileForm.profession} onChange={(e) => setProfileForm((p) => ({ ...p, profession: e.target.value }))} />
              </div>
            </div>
            {/* Comentario: campos de batismo e separaÃ§Ã£o â€” exibidos para cooperador e acima */}
            {(() => {
              const cargo = String(profileForm.minister_role || "").toLowerCase();
              const cargosComSeparacao = ["cooperador", "obreiro", "diÃ¡cono", "diacono", "presbÃ­tero", "presbitero", "evangelista", "missionÃ¡rio", "missionario", "pastor"];
              return cargosComSeparacao.some((c) => cargo.includes(c));
            })() && (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Data de batismo</Label>
                  <Input type="date" value={profileForm.baptism_date} onChange={(e) => setProfileForm((p) => ({ ...p, baptism_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Data de separaÃ§Ã£o</Label>
                  <Input type="date" value={profileForm.ordination_date} onChange={(e) => setProfileForm((p) => ({ ...p, ordination_date: e.target.value }))} />
                </div>
              </div>
            )}
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

