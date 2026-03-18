import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { setLetterStatus, setWorkerDirectRelease, softDeleteLetter, type PastorLetter } from "@/services/saasService";
import { ArrowUpRight, FileText, Filter, MoreHorizontal, RotateCcw, Search, Share2, Trash2, Lock, Unlock, CheckCheck, Send, Zap } from "lucide-react";
import { PastorLetterDialog, type LetterTarget } from "@/components/admin/PastorLetterDialog";

// Comentario: URL do webhook n8n lida da variavel de ambiente para nao expor o endpoint no codigo-fonte.
// Configurada em VITE_WEBHOOK_CARTA_PREGACAO no arquivo .env.
const LETTERS_WEBHOOK_URL = String(import.meta.env.VITE_WEBHOOK_CARTA_PREGACAO || "").trim();
import { FiltersBar } from "@/components/shared/FiltersBar";
import { getFriendlyError } from "@/lib/error-map";
import { addAuditLog } from "@/lib/audit";

type QuickPeriod = "today" | "7" | "30" | "custom";

const STATUS_OPTIONS = ["AUTORIZADO", "BLOQUEADO", "AGUARDANDO_LIBERACAO", "LIBERADA"] as const;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function statusClass(status: string) {
  if (status === "BLOQUEADO") return "bg-rose-100 text-rose-700 border-rose-200";
  if (status === "LIBERADA") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "AGUARDANDO_LIBERACAO") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "ENVIADA") return "bg-teal-100 text-teal-700 border-teal-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function quickRange(period: QuickPeriod) {
  const now = new Date();
  const end = toDateOnly(now.toISOString());
  if (period === "today") return { start: end, end };
  const copy = new Date(now);
  copy.setDate(now.getDate() - (period === "7" ? 7 : 30));
  return { start: toDateOnly(copy.toISOString()), end };
}

export function CartasTab({
  letters,
  scopeTotvsIds,
  phonesByUserId,
  phonesByName,
  viewerRole,
  viewerUserId,
  allowScopeView,
  autoReleaseByUserId = {},
}: {
  letters: PastorLetter[];
  scopeTotvsIds: string[];
  phonesByUserId: Record<string, string>;
  phonesByName: Record<string, string>;
  viewerRole: "admin" | "pastor" | "obreiro";
  viewerUserId: string;
  allowScopeView: boolean;
  autoReleaseByUserId?: Record<string, boolean>;
}) {
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<QuickPeriod>("custom");
  const [scopeMode, setScopeMode] = useState<"active" | "scope">("active");
  const [flashing, setFlashing] = useState<string[]>([]);
  const [updatingReleaseId, setUpdatingReleaseId] = useState<string | null>(null);
  const [updatingEnvioId, setUpdatingEnvioId] = useState<string | null>(null);
  const [updatingBlockId, setUpdatingBlockId] = useState<string | null>(null);
  // Rastreia alteracoes locais de liberacao automatica para atualizar a UI sem recarregar
  const [localAutoRelease, setLocalAutoRelease] = useState<Record<string, boolean>>({});
  // Estado do dialog de criar carta para um obreiro/pastor especifico
  const [letterDialogOpen, setLetterDialogOpen] = useState(false);
  const [letterDialogTarget, setLetterDialogTarget] = useState<LetterTarget | null>(null);
  const [filters, setFilters] = useState({
    dateStart: "",
    dateEnd: "",
    church: "all",
    role: "all",
    status: "all",
    q: "",
  });

  const filtered = useMemo(() => {
    const now = new Date();
    return letters
      .filter((l) => l.status !== "EXCLUIDA")
      .filter((l) => {
        const created = new Date(l.created_at);
        if (period === "today") return toDateOnly(created.toISOString()) === toDateOnly(now.toISOString());
        if (period === "7") {
          const min = new Date(now);
          min.setDate(min.getDate() - 7);
          return created >= min;
        }
        if (period === "30") {
          const min = new Date(now);
          min.setDate(min.getDate() - 30);
          return created >= min;
        }
        if (filters.dateStart && toDateOnly(l.created_at) < filters.dateStart) return false;
        if (filters.dateEnd && toDateOnly(l.created_at) > filters.dateEnd) return false;
        return true;
      })
      .filter((l) => (filters.church === "all" ? true : l.church_origin === filters.church))
      .filter((l) => (filters.role === "all" ? true : l.minister_role === filters.role))
      .filter((l) => (filters.status === "all" ? true : l.status === filters.status))
      .filter((l) => {
        if (!filters.q.trim()) return true;
        return l.preacher_name.toLowerCase().includes(filters.q.toLowerCase());
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [letters, period, filters]);

  const churchOptions = useMemo(() => {
    const set = new Set<string>();
    letters.forEach((l) => l.church_origin && set.add(l.church_origin));
    return Array.from(set.values()).sort();
  }, [letters]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    letters.forEach((l) => l.minister_role && set.add(l.minister_role));
    return Array.from(set.values()).sort();
  }, [letters]);

  useEffect(() => {
    const ids = filtered.filter((l) => l.status === "BLOQUEADO").map((l) => l.id);
    setFlashing(ids);
    const t = window.setTimeout(() => setFlashing([]), 2500);
    return () => window.clearTimeout(t);
  }, [filtered]);

  // Chama o mesmo webhook n8n do sistema de cartas, enviando os mesmos dados.
  // Falha silenciosa: nao bloqueia a acao principal.
  async function callWebhook(letter: PastorLetter, action: string, extra?: Record<string, string>) {
    // Comentario: se a URL do webhook nao estiver configurada, ignora silenciosamente.
    if (!LETTERS_WEBHOOK_URL) return;
    try {
      const pdfUrl = getPublicPdfUrl(letter);
      const payload: Record<string, string> = {
        action,
        tipo_fluxo: "manual",
        docId: letter.id,
        pdfUrl,
        full_name: letter.preacher_name || "-",
        church_name: letter.church_origin || "-",
        church_destination: letter.church_destination || "-",
        preach_date: letter.preach_date || "-",
        minister_role: letter.minister_role || "-",
        statusCarta: action === "send_letter" ? "LIBERADA" : action === "set_envio" ? "ENVIADO" : "",
        source: "ipda-letter-creator",
        ...(extra || {}),
      };
      await fetch(LETTERS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Ignora falha no webhook para nao bloquear a acao
    }
  }

  async function refresh() {
    // Invalida todas as queries de cartas usadas nas diferentes páginas do sistema.
    // "pastor-letters" → usado em AdminPastorDashboard
    // "cartas-dashboard-letters" → usado em CartasDashboardPage
    // "pastor-metrics" / "cartas-dashboard-metrics" → contadores de status
    // "worker-dashboard" → lista de cartas do obreiro
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pastor-letters"] }),
      queryClient.invalidateQueries({ queryKey: ["cartas-dashboard-letters"] }),
      queryClient.invalidateQueries({ queryKey: ["pastor-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["cartas-dashboard-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] }),
    ]);
  }

  function setQuick(periodValue: QuickPeriod | "clear") {
    if (periodValue === "clear") {
      setPeriod("custom");
      setFilters((p) => ({ ...p, dateStart: "", dateEnd: "" }));
      return;
    }
    const range = quickRange(periodValue);
    setPeriod(periodValue);
    setFilters((p) => ({ ...p, dateStart: range.start, dateEnd: range.end }));
  }

  function getPublicPdfUrl(letter: PastorLetter) {
    const directUrl = String(letter.url_carta || "").trim();
    if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
      return directUrl;
    }

    const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    if (base && letter.id) {
      return `${base}/storage/v1/object/public/cartas/documentos/cartas/${letter.id}.pdf`;
    }

    if (!letter.storage_path) return "";
    if (letter.storage_path.startsWith("http://") || letter.storage_path.startsWith("https://")) {
      return letter.storage_path;
    }
    const bucket = String(import.meta.env.VITE_LETTERS_BUCKET || "cartas").trim();
    const path = String(letter.storage_path || "").replace(/^\/+/, "");
    if (!base || !bucket || !path) return "";
    return `${base}/storage/v1/object/public/${bucket}/${path}`;
  }

  function canViewOrShare(letter: PastorLetter) {
    // Comentario: para pastor, abrir/compartilhar apenas carta dele (preacher_user_id).
    if (viewerRole === "pastor" && !allowScopeView) {
      const ownerId = String(letter.preacher_user_id || "").trim();
      if (!ownerId || ownerId !== String(viewerUserId || "").trim()) return false;
    }
    const hasDirectUrl = String(letter.url_carta || "").trim().startsWith("http");
    return letter.status === "LIBERADA" && (letter.url_pronta === true || hasDirectUrl);
  }

  async function openPdf(letter: PastorLetter) {
    if (!canViewOrShare(letter)) {
      toast.error("Carta bloqueada para visualizacao.");
      return;
    }
    const url = getPublicPdfUrl(letter);
    if (!url) {
      toast.error("Link do PDF inválido.");
      return;
    }
    window.open(url, "_blank");
  }

  async function share(letter: PastorLetter) {
    if (!canViewOrShare(letter)) {
      toast.error("Carta bloqueada para compartilhamento.");
      return;
    }
    const fromLetterPhone = String((letter as PastorLetter & { phone?: string | null }).phone || "").replace(/\D/g, "");
    const fromUserMap = String((letter.preacher_user_id && phonesByUserId[letter.preacher_user_id]) || "").replace(/\D/g, "");
    const fromNameMap = String(phonesByName[String(letter.preacher_name || "").trim().toLowerCase()] || "").replace(/\D/g, "");
    let targetPhone = fromLetterPhone || fromUserMap || fromNameMap;
    if (targetPhone && targetPhone.length <= 11 && !targetPhone.startsWith("55")) {
      targetPhone = `55${targetPhone}`;
    }
    const text = `Carta de pregação de ${letter.preacher_name}`;
    const pdfUrl = getPublicPdfUrl(letter);
    const withUrl = pdfUrl ? `${text}: ${pdfUrl}` : text;
    if (targetPhone) {
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(withUrl)}`, "_blank");
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(withUrl)}`, "_blank");
  }

  async function remove(letter: PastorLetter) {
    if (!window.confirm("Marcar carta como EXCLUÍDA?")) return;
    try {
      await softDeleteLetter(letter.id);
      addAuditLog("letter_status_changed", { letter_id: letter.id, status: "EXCLUIDA" });
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    }
  }

  async function releaseLetter(letter: PastorLetter) {
    if (letter.status === "LIBERADA") {
      toast.message("Esta carta já está liberada.");
      return;
    }
    try {
      setUpdatingReleaseId(letter.id);
      await setLetterStatus(letter.id, "LIBERADA");
      // Chama o mesmo webhook do sistema de cartas para gerar PDF e processar a carta
      await callWebhook(letter, "send_letter");
      toast.success("Carta liberada com sucesso.");
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    } finally {
      setUpdatingReleaseId(null);
    }
  }

  async function marcarEnvio(letter: PastorLetter) {
    if (letter.status === "ENVIADA") {
      toast.message("Carta ja marcada como enviada.");
      return;
    }
    try {
      setUpdatingEnvioId(letter.id);
      await setLetterStatus(letter.id, "ENVIADA");
      await callWebhook(letter, "set_envio");
      toast.success("Envio marcado com sucesso.");
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    } finally {
      setUpdatingEnvioId(null);
    }
  }

  async function toggleBlock(letter: PastorLetter) {
    const isBlocked = letter.status === "BLOQUEADO";
    try {
      setUpdatingBlockId(letter.id);
      const nextStatus = isBlocked ? "AGUARDANDO_LIBERACAO" : "BLOQUEADO";
      await setLetterStatus(letter.id, nextStatus);
      await callWebhook(letter, isBlocked ? "unblock_user" : "block_user");
      toast.success(isBlocked ? "Usuario desbloqueado." : "Usuario bloqueado.");
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    } finally {
      setUpdatingBlockId(null);
    }
  }

  async function toggleAutoRelease(letter: PastorLetter) {
    const userId = String(letter.preacher_user_id || "").trim();
    if (!userId) {
      toast.error("Obreiro nao identificado para liberar automaticamente.");
      return;
    }
    // Verifica o estado atual: primeiro no estado local, depois no mapa vindo da pagina pai
    const current = userId in localAutoRelease ? localAutoRelease[userId] : Boolean(autoReleaseByUserId[userId]);
    const next = !current;
    try {
      await setWorkerDirectRelease(userId, next);
      setLocalAutoRelease((prev) => ({ ...prev, [userId]: next }));
      toast.success(next ? "Liberacao automatica ativada." : "Liberacao automatica desativada.");
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    }
  }

  function renderActions(letter: PastorLetter) {
    // Para obreiro: apenas visualizar PDF e excluir
    if (viewerRole === "obreiro") {
      return (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!canViewOrShare(letter)} onClick={() => openPdf(letter)}>
            <ArrowUpRight className="mr-2 h-4 w-4" /> Ver PDF
          </Button>
          <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remove(letter)}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir
          </Button>
        </div>
      );
    }

    const isBlocked = letter.status === "BLOQUEADO";
    const isEnviada = letter.status === "ENVIADA";
    const userId = String(letter.preacher_user_id || "").trim();
    const autoRelease = userId in localAutoRelease ? localAutoRelease[userId] : Boolean(autoReleaseByUserId[userId]);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="w-full justify-center">
            <MoreHorizontal className="mr-2 h-4 w-4" />
            Ações
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => releaseLetter(letter)}
            disabled={letter.status === "LIBERADA" || isBlocked || updatingReleaseId === letter.id}
          >
            <Send className="mr-2 h-4 w-4 text-emerald-600" />
            Liberar carta
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => marcarEnvio(letter)}
            disabled={isEnviada || isBlocked || updatingEnvioId === letter.id}
          >
            <CheckCheck className="mr-2 h-4 w-4 text-sky-600" />
            Marcar envio
          </DropdownMenuItem>
          {!isBlocked && (
            <DropdownMenuItem onClick={() => toggleAutoRelease(letter)}>
              <Zap className={`mr-2 h-4 w-4 ${autoRelease ? "text-yellow-500" : "text-slate-400"}`} />
              Liberacao automatica: {autoRelease ? "ON" : "OFF"}
            </DropdownMenuItem>
          )}
          {/* Botao Carta: abre dialog para criar nova carta para este pregador */}
          {!isBlocked && (
            <DropdownMenuItem
              onClick={() => {
                setLetterDialogTarget({
                  userId: String(letter.preacher_user_id || "").trim(),
                  nome: String(letter.preacher_name || ""),
                  telefone: String((letter as PastorLetter & { phone?: string }).phone || ""),
                  ministerRole: String(letter.minister_role || "Obreiro"),
                  churchTotvsId: String(letter.church_totvs_id || "").trim(),
                });
                setLetterDialogOpen(true);
              }}
            >
              <FileText className="mr-2 h-4 w-4 text-blue-600" />
              Carta
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => share(letter)} disabled={!canViewOrShare(letter)}>
            <Share2 className="mr-2 h-4 w-4 text-blue-600" />
            Compartilhar
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => toggleBlock(letter)}
            disabled={updatingBlockId === letter.id}
            className={isBlocked ? "text-emerald-700 focus:text-emerald-800" : "text-amber-700 focus:text-amber-800"}
          >
            {isBlocked
              ? <><Unlock className="mr-2 h-4 w-4" />Desbloquear</>
              : <><Lock className="mr-2 h-4 w-4" />Bloquear</>}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={() => remove(letter)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <FiltersBar>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-3xl font-semibold text-slate-900"><Filter className="h-6 w-6 text-[#2f63d4]" /> Filtros</h2>
          <div className="text-xs text-slate-500">Escopo TOTVS: {scopeMode === "scope" ? scopeTotvsIds.join(", ") : "ativo"}</div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 sm:pb-0">
            <Button variant={period === "today" ? "default" : "outline"} onClick={() => setQuick("today")}>Hoje</Button>
            <Button variant={period === "7" ? "default" : "outline"} onClick={() => setQuick("7")}>7 dias</Button>
            <Button variant={period === "30" ? "default" : "outline"} onClick={() => setQuick("30")}>30 dias</Button>
          </div>

          <div className="min-w-[170px] flex-1 sm:flex-none sm:min-w-[180px]">
            <Select value={filters.church} onValueChange={(value) => setFilters((p) => ({ ...p, church: value }))}>
              <SelectTrigger><SelectValue placeholder="Igreja" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Igrejas</SelectItem>
                {churchOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[130px]">
            <Select value={filters.role} onValueChange={(value) => setFilters((p) => ({ ...p, role: value }))}>
              <SelectTrigger><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cargos</SelectItem>
                {roleOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-[120px]">
            <Select value={filters.status} onValueChange={(value) => setFilters((p) => ({ ...p, status: value }))}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status</SelectItem>
                {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button variant="ghost" onClick={() => setQuick("clear")} title="Limpar período" className="shrink-0">
            <RotateCcw className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Limpar período</span>
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Input type="date" value={filters.dateStart} onChange={(e) => { setPeriod("custom"); setFilters((p) => ({ ...p, dateStart: e.target.value })); }} />
          <Input type="date" value={filters.dateEnd} onChange={(e) => { setPeriod("custom"); setFilters((p) => ({ ...p, dateEnd: e.target.value })); }} />
          <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as "active" | "scope")}>
            <SelectTrigger><SelectValue placeholder="Escopo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Somente igreja logada</SelectItem>
              <SelectItem value="scope">Todas do escopo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por nome..." value={filters.q} onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))} />
        </div>
      </FiltersBar>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden overflow-x-auto xl:block">
          <div className="min-w-[1150px]">
            <div className="grid grid-cols-[110px_1fr_130px_1fr_1fr_130px_140px_200px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              <span>Data</span><span>Nome</span><span>Dia da pregação</span><span>Igreja origem</span><span>Igreja destino</span><span>Status</span><span>PDF</span><span>Ações</span>
            </div>
            {filtered.map((carta) => {
              const blocked = carta.status === "BLOQUEADO";
              const tone = blocked ? "bg-rose-50" : "bg-emerald-50/50";
              const pulse = blocked && flashing.includes(carta.id) ? "animate-pulse" : "";
              return (
                <div key={carta.id} className={`grid grid-cols-[110px_1fr_130px_1fr_1fr_130px_140px_200px] items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm ${tone} ${pulse}`}>
                  <span>{formatDate(carta.created_at)}</span>
                  <span className="truncate font-semibold">{carta.preacher_name}</span>
                  <span>{formatDate(carta.preach_date)}</span>
                  <span className="truncate">{carta.church_origin || "-"}</span>
                  <span className="truncate">{carta.church_destination || "-"}</span>
                  <div><Badge variant="outline" className={statusClass(carta.status)}>{carta.status}</Badge></div>
                  <Button variant="outline" disabled={!canViewOrShare(carta)} onClick={() => openPdf(carta)}>
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Abrir PDF
                  </Button>
                  <div>{renderActions(carta)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">Nenhuma carta encontrada.</p> : null}

        <div className="space-y-3 p-4 xl:hidden">
          {filtered.map((carta) => {
            const blocked = carta.status === "BLOQUEADO";
            const tone = blocked ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50/60";
            const pulse = blocked && flashing.includes(carta.id) ? "animate-pulse" : "";
            return (
              <div key={`card-${carta.id}`} className={`rounded-2xl border p-4 ${tone} ${pulse}`}>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="font-semibold text-slate-500">Data</span>
                  <span className="break-words">{formatDate(carta.created_at)}</span>
                  <span className="font-semibold text-slate-500">Nome</span>
                  <span className="break-words">{carta.preacher_name}</span>
                  <span className="font-semibold text-slate-500">Dia da pregação</span>
                  <span className="break-words">{formatDate(carta.preach_date)}</span>
                  <span className="font-semibold text-slate-500">Igreja origem</span>
                  <span className="break-words">{carta.church_origin || "-"}</span>
                  <span className="font-semibold text-slate-500">Igreja destino</span>
                  <span className="break-words">{carta.church_destination || "-"}</span>
                </div>

                <div className="mt-3">
                  <Badge variant="outline" className={statusClass(carta.status)}>{carta.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={!canViewOrShare(carta)} onClick={() => openPdf(carta)}>
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Abrir PDF
                  </Button>
                  <div className="w-full">{renderActions(carta)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Dialog para criar carta de pregacao para um obreiro/pastor especifico */}
      <PastorLetterDialog
        open={letterDialogOpen}
        onOpenChange={setLetterDialogOpen}
        letterTarget={letterDialogTarget}
        onSuccess={() => void refresh()}
      />
    </>
  );
}
