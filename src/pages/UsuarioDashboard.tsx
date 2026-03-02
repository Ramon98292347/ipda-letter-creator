import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getPastorByTotvsPublic, getSignedPdfUrl, requestRelease, updateMyProfile, workerDashboard, type PastorLetter } from "@/services/saasService";
import { Share2, Download, Unlock, LogOut, Bell, RefreshCw, MoreHorizontal, Eye } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

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

type QuickRange = "today" | "7" | "15" | "30" | "all";

function getAddressCity(addressJson: unknown) {
  const address = (addressJson || {}) as Record<string, unknown>;
  return String(address.city || "");
}

export default function UsuarioDashboard() {
  const { usuario, session, clearAuth, setUsuario, setTelefone } = useUser();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [quickRange, setQuickRange] = useState<QuickRange>("7");
  const [openUpdateModal, setOpenUpdateModal] = useState(false);
  const [openCadastroModal, setOpenCadastroModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [profileForm, setProfileForm] = useState({ phone: "", email: "", address_city: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const { canInstall, install } = usePwaInstall();

  const userId = String(usuario?.id || "");

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
    queryFn: () => workerDashboard(dateStart || undefined, dateEnd || undefined, 1, 50),
    enabled: Boolean(userId),
  });

  const letters = useMemo(() => (data?.letters || []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), [data?.letters]);
  const filteredLetters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return letters.filter((l) => {
      const matchesStatus = statusFilter === "all" || l.status === statusFilter;
      const haystack = `${l.preacher_name || ""} ${l.church_origin || ""} ${l.church_destination || ""} ${l.preach_date || ""}`.toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [letters, search, statusFilter]);
  const profile = data?.user;
  const church = data?.church;
  const activeTotvs = String(session?.totvs_id || church?.totvs_id || "");

  const { data: pastorFromUsers } = useQuery({
    queryKey: ["pastor-by-totvs", activeTotvs],
    queryFn: () => getPastorByTotvsPublic(activeTotvs),
    enabled: Boolean(activeTotvs),
  });

  const cityFromProfile = useMemo(() => getAddressCity(profile?.address_json), [profile?.address_json]);

  useEffect(() => {
    setProfileForm({
      phone: profile?.phone || "",
      email: profile?.email || "",
      address_city: cityFromProfile,
    });
  }, [profile?.phone, profile?.email, cityFromProfile]);

  useEffect(() => {
    if (!profile?.phone) return;
    setTelefone(profile.phone);
    setUsuario({
      ...(usuario || { nome: profile.full_name || "Usuário", telefone: "" }),
      telefone: profile.phone || "",
    });
  }, [profile?.phone, profile?.full_name, setTelefone, setUsuario, usuario]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = toInputDate(now);
    const start7 = new Date(now);
    start7.setDate(now.getDate() - 6);
    const start7Str = toInputDate(start7);

    const cartasHoje = filteredLetters.filter((l) => toInputDate(new Date(l.created_at)) === today).length;
    const cartas7dias = filteredLetters.filter((l) => toInputDate(new Date(l.created_at)) >= start7Str).length;
    const aguardando = filteredLetters.filter((l) => l.status === "AGUARDANDO_LIBERACAO").length;
    const liberadas = filteredLetters.filter((l) => l.status === "LIBERADA").length;
    const totalCartas = filteredLetters.length;

    return { cartasHoje, cartas7dias, aguardando, liberadas, totalCartas };
  }, [filteredLetters]);

  function logout() {
    clearAuth();
    nav("/");
  }

  async function openPdf(letter: PastorLetter) {
    if (letter.status !== "LIBERADA") {
      toast.error("Carta bloqueada.");
      return;
    }
    if (!letter.storage_path) {
      toast.error("PDF ainda indisponivel.");
      return;
    }
    try {
      const url = await getSignedPdfUrl(letter.id);
      if (!url) throw new Error("signed-url-empty");
      window.open(url, "_blank");
    } catch {
      toast.error("Falha ao abrir PDF.");
    }
  }

  async function shareLetter(letter: PastorLetter) {
    if (letter.status !== "LIBERADA") {
      toast.error("Carta bloqueada.");
      return;
    }
    try {
      const url = await getSignedPdfUrl(letter.id);
      if (url) {
        window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregacao: ${url}`)}`, "_blank");
      }
    } catch {
      toast.error("Falha ao compartilhar.");
    }
  }

  async function pedirLiberacao(letter: PastorLetter) {
    try {
      await requestRelease(letter.id, userId, session?.totvs_id || "");
      toast.success("Pedido enviado.");
      queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao solicitar liberacao.");
    }
  }

  async function pedirPrimeiraLiberacao() {
    const candidate = letters.find((l) => l.status === "AUTORIZADO" || l.status === "AGUARDANDO_LIBERACAO");
    if (!candidate) {
      toast.error("Nenhuma carta disponivel para pedir liberacao.");
      return;
    }
    await pedirLiberacao(candidate);
  }

  async function baixarPrimeiraLiberada() {
    const candidate = letters.find((l) => l.status === "LIBERADA" && !!l.storage_path);
    if (!candidate) {
      toast.error("Nenhuma carta liberada para baixar.");
      return;
    }
    await openPdf(candidate);
  }

  async function salvarPerfil() {
    setSavingProfile(true);
    try {
      await updateMyProfile({
        phone: profileForm.phone || undefined,
        email: profileForm.email || undefined,
        address_city: profileForm.address_city || undefined,
      });
      toast.success("Perfil atualizado.");
      setOpenUpdateModal(false);
      queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao atualizar perfil.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function installApp() {
    await install();
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <header className="bg-[#2f63d4] text-white shadow-md">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold sm:hidden">Cartas de Pregacao</h1>
            <h1 className="hidden text-2xl font-bold sm:block">Sistema de Cartas de Pregacao</h1>
            <p className="text-sm text-white/90">Dashboard do Usuario</p>
          </div>
          <div className="w-full sm:w-auto">
            <div className="mt-2 flex items-center justify-between gap-2 sm:mt-0">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 border-white/30 bg-white/10 text-white hover:bg-white/20 sm:hidden"
                  onClick={() => setOpenCadastroModal(true)}
                  aria-label="Visualizar cadastro"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="hidden h-10 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20 sm:inline-flex sm:px-4"
                  onClick={() => setOpenCadastroModal(true)}
                >
                  Visualizar cadastro
                </Button>
                {canInstall ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-white/30 bg-white/10 text-white hover:bg-white/20 sm:hidden"
                    onClick={installApp}
                    aria-label="Instalar app"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                ) : null}
                {canInstall ? (
                  <Button
                    variant="outline"
                    className="hidden h-10 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20 sm:inline-flex sm:px-4"
                    onClick={installApp}
                  >
                    <Download className="mr-2 h-4 w-4" /> Instalar app
                  </Button>
                ) : null}
                <Button variant="outline" size="icon" className="relative h-9 w-9 border-white/30 bg-white/10 text-white hover:bg-white/20 sm:h-10 sm:w-10">
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                  {stats.liberadas > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-semibold text-white">
                      {stats.liberadas}
                    </span>
                  ) : null}
                </Button>
                <Button variant="outline" className="h-9 border-white/30 bg-white/10 px-3 text-white hover:bg-white/20 sm:h-10 sm:px-4" onClick={logout}>
                  <LogOut className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Sair</span>
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-2 py-1">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar usuario"
                    className="mt-px h-11 w-11 rounded-full border border-white/30 object-cover object-[center_top] sm:h-9 sm:w-9 md:h-12 md:w-12"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/20 text-base font-semibold sm:h-9 sm:w-9 md:h-12 md:w-12">
                    {(profile?.full_name || usuario?.nome || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="max-w-[120px] truncate text-xs font-medium sm:max-w-[220px] sm:text-sm">
                  {profile?.full_name || usuario?.nome || "Usuario"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-2">
        <section className="mt-[5px] rounded-2xl border border-slate-200 bg-white p-3">
          <div className="hidden gap-2 md:grid md:grid-cols-2">
            <Button onClick={() => nav("/carta")} className="w-full">Gerar carta</Button>
            <Button variant="outline" onClick={pedirPrimeiraLiberacao} className="w-full">
              <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao de carta
            </Button>
            <Button variant="outline" onClick={baixarPrimeiraLiberada} className="w-full">
              <Download className="mr-2 h-4 w-4" /> Baixa carta
            </Button>
            <Button variant="outline" onClick={() => setOpenUpdateModal(true)} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar cadastro
            </Button>
          </div>
          <div className="space-y-2 md:hidden">
            <Button onClick={() => nav("/carta")} className="w-full">Gerar carta</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full">Outras acoes</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                <DropdownMenuItem onClick={pedirPrimeiraLiberacao}>
                  <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao de carta
                </DropdownMenuItem>
                <DropdownMenuItem onClick={baixarPrimeiraLiberada}>
                  <Download className="mr-2 h-4 w-4" /> Baixar carta
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpenUpdateModal(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Atualizar cadastro
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <section className="mt-[10px]">
          <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-0 bg-gradient-to-r from-[#20418f] to-[#2f63d4] text-white">
            <CardContent className="pt-4">
              <p className="text-sm opacity-90">Total de cartas</p>
              <p className="text-3xl font-bold">{stats.totalCartas}</p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-r from-[#2f63d4] to-[#4b77d5] text-white">
            <CardContent className="pt-4">
              <p className="text-sm opacity-90">Total de cartas (7 dias)</p>
              <p className="text-3xl font-bold">{stats.cartas7dias}</p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-r from-[#2fa86f] to-[#49c280] text-white">
            <CardContent className="pt-4">
              <p className="text-sm opacity-90">Cartas hoje</p>
              <p className="text-3xl font-bold">{stats.cartasHoje}</p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-r from-[#f39b1c] to-[#f3b12c] text-white">
            <CardContent className="pt-4">
              <p className="text-sm opacity-90">Aguardando liberacao</p>
              <p className="text-3xl font-bold">{stats.aguardando}</p>
            </CardContent>
          </Card>
          </div>
        </section>

        <div className="grid gap-4">
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
                    const canOpen = letter.status === "LIBERADA" && Boolean(letter.storage_path);
                    const canRequest = letter.status === "AUTORIZADO" || letter.status === "AGUARDANDO_LIBERACAO";
                    return (
                      <div key={letter.id} className="grid grid-cols-[120px_120px_180px_180px_120px_1fr] items-center border-b px-4 py-3 text-sm">
                        <span>{formatDate(letter.created_at)}</span>
                        <span>{formatDate(letter.preach_date)}</span>
                        <span className="truncate">{letter.church_origin || "-"}</span>
                        <span className="truncate">{letter.church_destination || "-"}</span>
                        <span>
                          <Badge variant="outline" className={statusClass(letter.status)}>{letter.status}</Badge>
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" disabled={!canOpen} onClick={() => openPdf(letter)}>
                            <Download className="mr-2 h-4 w-4" /> Abrir
                          </Button>
                          <Button variant="outline" disabled={!canOpen} onClick={() => shareLetter(letter)}>
                            <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem disabled={!canRequest} onClick={() => pedirLiberacao(letter)}>
                                <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}

                  {!isLoading && filteredLetters.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">Nenhuma carta encontrada.</div> : null}
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {filteredLetters.map((letter) => {
                  const canOpen = letter.status === "LIBERADA" && Boolean(letter.storage_path);
                  const canRequest = letter.status === "AUTORIZADO" || letter.status === "AGUARDANDO_LIBERACAO";
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
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" disabled={!canOpen} onClick={() => openPdf(letter)}>
                            Ver PDF
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem disabled={!canOpen} onClick={() => shareLetter(letter)}>
                                <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={!canRequest} onClick={() => pedirLiberacao(letter)}>
                                <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {!isLoading && filteredLetters.length === 0 ? <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Nenhuma carta encontrada.</div> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={openCadastroModal} onOpenChange={setOpenCadastroModal}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Resumo do Usuario</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-[1fr_120px] gap-4 sm:grid-cols-[1fr_150px]">
                  <div className="space-y-2">
                    <p><strong>Nome:</strong> {profile?.full_name || usuario?.nome || "-"}</p>
                    <p><strong>CPF:</strong> {profile?.cpf || usuario?.cpf || "-"}</p>
                    <p><strong>Cargo:</strong> {profile?.minister_role || usuario?.ministerial || "-"}</p>
                    <p><strong>Igreja:</strong> {session?.church_name || church?.church_name || "-"}</p>
                    <p><strong>Celular:</strong> {profile?.phone || "-"}</p>
                    <p><strong>Nascimento:</strong> {formatDate(profile?.birth_date || null)}</p>
                  </div>
                  <div className="flex justify-end">
                    {profile?.avatar_url ? (
                      <>
                        <img src={profile.avatar_url} alt="Foto do membro" className="mt-px h-20 w-20 rounded-full border border-slate-200 object-cover object-[center_top] md:hidden" />
                        <img src={profile.avatar_url} alt="Foto 3x4 do membro" className="mt-px hidden h-48 w-36 rounded-lg border border-slate-200 object-cover object-[center_top] md:block" />
                      </>
                    ) : (
                      <>
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-2xl font-bold text-slate-500 md:hidden">
                          {(profile?.full_name || usuario?.nome || "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="hidden h-48 w-36 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-6xl font-bold text-slate-400 md:flex">
                          {(profile?.full_name || usuario?.nome || "U").charAt(0).toUpperCase()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Dados do seu pastor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-[1fr_120px] gap-4 sm:grid-cols-[1fr_150px]">
                  <div className="space-y-2">
                    <p><strong>Nome:</strong> {pastorFromUsers?.full_name || church?.pastor_name || "-"}</p>
                    <p><strong>Telefone:</strong> {pastorFromUsers?.phone || church?.pastor_phone || "-"}</p>
                    <p><strong>Email:</strong> {pastorFromUsers?.email || church?.pastor_email || "-"}</p>
                    <p><strong>Endereco:</strong> {church?.address_full || "-"}</p>
                  </div>
                  <div className="flex justify-end">
                    {pastorFromUsers?.avatar_url ? (
                      <>
                        <img src={pastorFromUsers.avatar_url} alt="Foto do pastor" className="mt-px h-20 w-20 rounded-full border border-slate-200 object-cover object-[center_top] md:hidden" />
                        <img src={pastorFromUsers.avatar_url} alt="Foto 3x4 do pastor" className="mt-px hidden h-48 w-36 rounded-lg border border-slate-200 object-cover object-[center_top] md:block" />
                      </>
                    ) : (
                      <>
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-2xl font-bold text-slate-500 md:hidden">
                          {(pastorFromUsers?.full_name || church?.pastor_name || "P").charAt(0).toUpperCase()}
                        </div>
                        <div className="hidden h-48 w-36 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-6xl font-bold text-slate-400 md:flex">
                          {(pastorFromUsers?.full_name || church?.pastor_name || "P").charAt(0).toUpperCase()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openUpdateModal} onOpenChange={setOpenUpdateModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Atualizar cadastro</DialogTitle>
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
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Cidade</Label>
              <Input value={profileForm.address_city} onChange={(e) => setProfileForm((p) => ({ ...p, address_city: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={salvarPerfil} disabled={savingProfile}>
              {savingProfile ? "Salvando..." : "Atualizar perfil"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
