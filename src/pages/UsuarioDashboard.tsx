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
  requestRelease,
  updateMyProfile,
  upsertStamps,
  workerDashboard,
  type PastorLetter,
} from "@/services/saasService";
import { Download, Eye, IdCard, MoreHorizontal, RefreshCw, Share2, Unlock } from "lucide-react";

type QuickRange = "today" | "7" | "15" | "30" | "all";

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

function getAddressCity(addressJson: unknown) {
  const address = (addressJson || {}) as Record<string, unknown>;
  return String(address.city || "");
}

function getAddressField(addressJson: unknown, key: string) {
  const address = (addressJson || {}) as Record<string, unknown>;
  return String(address[key] || "");
}

function normalizeStoragePath(storagePath: unknown) {
  const raw = String(storagePath || "").trim();
  if (!raw || raw === "true" || raw === "false" || raw === "null" || raw === "undefined") return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return raw.replace(/^\/+/, "");
}

function buildPublicCartaUrl(storagePath: unknown) {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const normalized = normalizeStoragePath(storagePath);
  if (!normalized) return "";
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
  return `${supabaseUrl}/storage/v1/object/public/cartas/${normalized}`;
}

function buildCartaUrlByLetterId(letterId: unknown) {
  const id = String(letterId || "").trim();
  if (!id) return "";
  return buildPublicCartaUrl(`documentos/cartas/${id}.pdf`);
}

// Comentario: dashboard do obreiro padronizado com o mesmo layout SaaS do sistema.
export default function UsuarioDashboard() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, session, setUsuario, setTelefone } = useUser();

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

  const userId = String(usuario?.id || "");
  const activeTotvs = String(session?.totvs_id || "");
  const isCadastroPendente = usuario?.registration_status === "PENDENTE";
  const isPastor = String(profile?.role || usuario?.role || "").toLowerCase() === "pastor";

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

  const { data, isLoading } = useQuery({
    queryKey: ["worker-dashboard", userId, dateStart, dateEnd],
    queryFn: () => workerDashboard(dateStart || undefined, dateEnd || undefined, 1, 80),
    enabled: Boolean(userId),
  });

  const { data: pastorFromUsers } = useQuery({
    queryKey: ["pastor-by-totvs", activeTotvs],
    queryFn: () => getPastorByTotvsPublic(activeTotvs),
    enabled: Boolean(activeTotvs),
  });

  const letters = useMemo(
    () => (data?.letters || []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [data?.letters]
  );
  const profile = data?.user;
  const hasDirectRelease = Boolean(profile?.can_create_released_letter);
  const church = data?.church;
  const cityFromProfile = useMemo(() => getAddressCity(profile?.address_json), [profile?.address_json]);

  useEffect(() => {
    setProfileForm({
      phone: profile?.phone || "",
      email: profile?.email || "",
      birth_date: String(profile?.birth_date || ""),
      avatar_url: String(profile?.avatar_url || ""),
      cep: getAddressField(profile?.address_json, "cep"),
      address_street: getAddressField(profile?.address_json, "street"),
      address_number: getAddressField(profile?.address_json, "number"),
      address_complement: getAddressField(profile?.address_json, "complement"),
      address_neighborhood: getAddressField(profile?.address_json, "neighborhood"),
      address_city: cityFromProfile,
      address_state: getAddressField(profile?.address_json, "state"),
    });
  }, [profile?.phone, profile?.email, profile?.birth_date, profile?.avatar_url, profile?.address_json, cityFromProfile]);

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
    if (letter.status !== "LIBERADA" && !hasDirectRelease) return toast.error("Carta bloqueada.");

    try {
      const storagePath = normalizeStoragePath(letter.storage_path);
      const publicUrl = buildPublicCartaUrl(storagePath);
      const inferredUrl = buildCartaUrlByLetterId(letter.id);
      const url = publicUrl || inferredUrl || await getSignedPdfUrl(letter.id);
      if (!url) throw new Error("signed-url-empty");
      window.open(url, "_blank");
    } catch {
      toast.error("Falha ao abrir PDF.");
    }
  }

  async function shareLetter(letter: PastorLetter) {
    if (isCadastroPendente) return toast.error("Cadastro pendente. Compartilhamento bloqueado.");
    if (letter.status !== "LIBERADA" && !hasDirectRelease) return toast.error("Carta bloqueada.");
    try {
      const storagePath = normalizeStoragePath(letter.storage_path);
      const publicUrl = buildPublicCartaUrl(storagePath);
      const inferredUrl = buildCartaUrlByLetterId(letter.id);
      const url = publicUrl || inferredUrl || await getSignedPdfUrl(letter.id);
      if (!url) throw new Error("share-url-empty");
      window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregacao: ${url}`)}`, "_blank");
    } catch {
      toast.error("Falha ao compartilhar.");
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

  async function pedirPrimeiraLiberacao() {
    if (hasDirectRelease) return toast.info("Sua liberacao direta esta ativa.");
    const candidate = letters.find((l) => l.status === "AUTORIZADO" || l.status === "AGUARDANDO_LIBERACAO");
    if (!candidate) return toast.error("Nenhuma carta disponivel para pedir liberacao.");
    await pedirLiberacao(candidate);
  }

  async function baixarPrimeiraLiberada() {
    const candidate = letters.find((l) => l.status === "LIBERADA" && Boolean(normalizeStoragePath(l.storage_path)));
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
            <Button onClick={() => nav("/carta/formulario")} className="w-full bg-blue-600 hover:bg-blue-700" disabled={isCadastroPendente}>
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardContent className="border-l-4 border-l-blue-600 p-5">
              <p className="text-sm font-semibold text-slate-800">Total de cartas</p>
              <p className="text-4xl font-extrabold text-slate-900">{stats.totalCartas}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardContent className="border-l-4 border-l-cyan-600 p-5">
              <p className="text-sm font-semibold text-slate-800">Total de cartas (7 dias)</p>
              <p className="text-4xl font-extrabold text-slate-900">{stats.cartas7dias}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardContent className="border-l-4 border-l-emerald-600 p-5">
              <p className="text-sm font-semibold text-slate-800">Cartas hoje</p>
              <p className="text-4xl font-extrabold text-slate-900">{stats.cartasHoje}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <CardContent className="border-l-4 border-l-amber-600 p-5">
              <p className="text-sm font-semibold text-slate-800">Aguardando liberacao</p>
              <p className="text-4xl font-extrabold text-slate-900">{stats.aguardando}</p>
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                const canOpen = letter.status === "LIBERADA" || (hasDirectRelease && !["BLOQUEADO", "AGUARDANDO_LIBERACAO"].includes(letter.status));
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
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[120px_120px_180px_180px_120px_1fr] border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                  <span>Criada em</span>
                  <span>Data pregacao</span>
                  <span>Origem</span>
                  <span>Destino</span>
                  <span>Status</span>
                  <span>Acoes</span>
                </div>
                {filteredLetters.map((letter) => {
                  const canOpen = letter.status === "LIBERADA" || (hasDirectRelease && !["BLOQUEADO", "AGUARDANDO_LIBERACAO"].includes(letter.status));
                  const canRequest = !hasDirectRelease && (letter.status === "AUTORIZADO" || letter.status === "AGUARDANDO_LIBERACAO");
                  return (
                    <div key={letter.id} className="grid grid-cols-[120px_120px_180px_180px_120px_1fr] items-center border-b px-4 py-3 text-sm">
                      <span>{formatDate(letter.created_at)}</span>
                      <span>{formatDate(letter.preach_date)}</span>
                      <span className="truncate">{letter.church_origin || "-"}</span>
                      <span className="truncate">{letter.church_destination || "-"}</span>
                      <span><Badge variant="outline" className={statusClass(letter.status)}>{letter.status}</Badge></span>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={!canOpen} onClick={() => openPdf(letter)}>
                          <Download className="mr-2 h-4 w-4" /> Abrir
                        </Button>
                        <Button variant="outline" disabled={!canOpen} onClick={() => shareLetter(letter)}>
                          <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                        </Button>
                        <Button variant="outline" disabled={!canRequest} onClick={() => pedirLiberacao(letter)}>
                          <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!isLoading && filteredLetters.length === 0 ? <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Nenhuma carta encontrada.</div> : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={openCadastroModal} onOpenChange={setOpenCadastroModal}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastro</DialogTitle>
            <DialogDescription>Dados do usuario e do pastor responsavel.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Resumo do Usuario</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>Nome:</strong> {profile?.full_name || usuario?.nome || "-"}</p>
                <p><strong>CPF:</strong> {profile?.cpf || usuario?.cpf || "-"}</p>
                <p><strong>Cargo:</strong> {profile?.minister_role || usuario?.ministerial || "-"}</p>
                <p><strong>Igreja:</strong> {session?.church_name || church?.church_name || "-"}</p>
                <p><strong>Celular:</strong> {profile?.phone || "-"}</p>
                <p><strong>Nascimento:</strong> {formatDate(profile?.birth_date || null)}</p>
              </CardContent>
            </Card>
            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Dados do seu pastor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><strong>Nome:</strong> {pastorFromUsers?.full_name || church?.pastor_name || "-"}</p>
                <p><strong>Telefone:</strong> {pastorFromUsers?.phone || church?.pastor_phone || "-"}</p>
                <p><strong>Email:</strong> {pastorFromUsers?.email || church?.pastor_email || "-"}</p>
                <p><strong>Endereco:</strong> {church?.address_full || "-"}</p>
              </CardContent>
            </Card>
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
            <div className="grid gap-3 md:grid-cols-[160px_1fr]">
              <div className="space-y-1">
                <Label>Foto 3x4</Label>
                <div className="h-44 w-32 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <img
                    src={
                      avatarFile
                        ? URL.createObjectURL(avatarFile)
                        : profileForm.avatar_url || profile?.avatar_url || "/placeholder.svg"
                    }
                    alt="Pre-visualizacao avatar"
                    className="h-full w-full object-cover object-[center_top]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label>Selecionar foto</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>URL da foto</Label>
                  <Input value={profileForm.avatar_url} onChange={(e) => setProfileForm((p) => ({ ...p, avatar_url: e.target.value }))} />
                </div>
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
                      <Input type="file" accept="image/*" onChange={(e) => setSignatureFile(e.target.files?.[0] || null)} />
                      {profile?.signature_url ? (
                        <a href={profile.signature_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                          Ver assinatura atual
                        </a>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <Label>Carimbo do pastor</Label>
                      <Input type="file" accept="image/*" onChange={(e) => setStampPastorFile(e.target.files?.[0] || null)} />
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
