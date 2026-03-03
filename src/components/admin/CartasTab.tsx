import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  setLetterStatus,
  softDeleteLetter,
  type PastorLetter,
} from "@/services/saasService";
import { ArrowUpRight, Filter, RotateCcw, Search, Share2, Trash2 } from "lucide-react";
import { FiltersBar } from "@/components/shared/FiltersBar";
import { getFriendlyError } from "@/lib/error-map";
import { addAuditLog } from "@/lib/audit";

type QuickPeriod = "today" | "7" | "30" | "custom";

const STATUS_OPTIONS = [
  "AUTORIZADO",
  "BLOQUEADO",
  "AGUARDANDO_LIBERACAO",
  "LIBERADA",
] as const;

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
}: {
  letters: PastorLetter[];
  scopeTotvsIds: string[];
  phonesByUserId: Record<string, string>;
  phonesByName: Record<string, string>;
}) {
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<QuickPeriod>("custom");
  const [scopeMode, setScopeMode] = useState<"active" | "scope">("active");
  const [flashing, setFlashing] = useState<string[]>([]);
  const [updatingReleaseId, setUpdatingReleaseId] = useState<string | null>(null);
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

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["pastor-letters"] });
    await queryClient.invalidateQueries({ queryKey: ["pastor-metrics"] });
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

  async function openPdf(letter: PastorLetter) {
    if (!letter.storage_path) {
      toast.error("PDF indisponível.");
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
    const fromLetterPhone = String((letter as PastorLetter & { phone?: string | null }).phone || "").replace(/\D/g, "");
    const fromUserMap = String(
      (letter.preacher_user_id && phonesByUserId[letter.preacher_user_id]) || "",
    ).replace(/\D/g, "");
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
    if (!window.confirm("Marcar carta como EXCLUIDA?")) return;
    try {
      await softDeleteLetter(letter.id);
      addAuditLog("letter_status_changed", { letter_id: letter.id, status: "EXCLUIDA" });
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    }
  }

  async function toggleAlwaysRelease(letter: PastorLetter, checked: boolean) {
    if (checked && !letter.storage_path) {
      toast.error("Aguarde o PDF ficar pronto para liberar.");
      return;
    }

    try {
      setUpdatingReleaseId(letter.id);
      await setLetterStatus(letter.id, checked ? "LIBERADA" : "BLOQUEADO");
      toast.success(checked ? "Carta liberada permanentemente." : "Carta bloqueada.");
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    } finally {
      setUpdatingReleaseId(null);
    }
  }

  return (
    <>
      <FiltersBar>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-3xl font-semibold text-slate-900"><Filter className="h-6 w-6 text-[#2f63d4]" /> Filtros</h2>
          <div className="text-xs text-slate-500">Escopo TOTVS: {scopeMode === "scope" ? scopeTotvsIds.join(", ") : "ativo"}</div>
        </div>

        <div className="mb-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
          <div className="flex items-center gap-2">
            <Button variant={period === "today" ? "default" : "outline"} onClick={() => setQuick("today")}>Hoje</Button>
            <Button variant={period === "7" ? "default" : "outline"} onClick={() => setQuick("7")}>7 dias</Button>
            <Button variant={period === "30" ? "default" : "outline"} onClick={() => setQuick("30")}>30 dias</Button>
          </div>

          <div className="min-w-[140px]">
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

          <div className="shrink-0">
            <Button variant="ghost" onClick={() => setQuick("clear")} title="Limpar período">
              <RotateCcw className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Limpar período</span>
            </Button>
          </div>
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
        <div className="hidden lg:grid lg:grid-cols-[110px_1fr_130px_1fr_1fr_130px_170px_120px_260px] lg:border-b lg:border-slate-200 lg:bg-slate-50 lg:px-4 lg:py-3 lg:text-xs lg:font-semibold lg:text-slate-600 xl:text-sm">
          <span>Data</span><span>Nome</span><span>Dia da pregação</span><span>Igreja origem</span><span>Igreja destino</span><span>Status</span><span>Liberar sempre</span><span>PDF</span><span>Ações</span>
        </div>
        {filtered.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">Nenhuma carta encontrada.</p> : null}

        {filtered.map((carta) => {
          const blocked = carta.status === "BLOQUEADO";
          const tone = blocked ? "bg-rose-100" : "bg-emerald-50";
          const pulse = blocked && flashing.includes(carta.id) ? "animate-pulse" : "";
          return (
            <div key={carta.id} className={`${tone} border-b border-slate-200 p-4 last:border-b-0 xl:p-0 ${pulse}`}>
              <div className="hidden items-center lg:grid lg:grid-cols-[110px_1fr_130px_1fr_1fr_130px_170px_120px_260px] lg:gap-2 lg:px-4 lg:py-3 xl:text-sm">
                <span>{formatDate(carta.created_at)}</span>
                <span className="truncate font-semibold">{carta.preacher_name}</span>
                <span>{formatDate(carta.preach_date)}</span>
                <span className="truncate">{carta.church_origin || "-"}</span>
                <span className="truncate">{carta.church_destination || "-"}</span>
                <div>
                  <Badge variant="outline" className={statusClass(carta.status)}>{carta.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={carta.status === "LIBERADA"}
                    onCheckedChange={(value) => toggleAlwaysRelease(carta, Boolean(value))}
                    disabled={updatingReleaseId === carta.id}
                  />
                  <span className="text-sm text-slate-700">Liberar sempre</span>
                </div>
                <Button variant="outline" disabled={!carta.storage_path} onClick={() => openPdf(carta)}><ArrowUpRight className="mr-2 h-4 w-4" /> Abrir PDF</Button>
                <div className="flex flex-wrap items-center gap-2">
                  <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => share(carta)}>
                    <Share2 className="mr-2 h-4 w-4" />Compartilhar
                  </Button>
                  <Button variant="destructive" onClick={() => remove(carta)}>
                    <Trash2 className="mr-2 h-4 w-4" />Excluir
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/70 bg-emerald-50/70 p-4 lg:hidden">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="font-semibold text-slate-500">Data</span>
                  <span className="break-words">{formatDate(carta.created_at)}</span>
                  <span className="font-semibold text-slate-500">Nome</span>
                  <span className="break-words">{carta.preacher_name}</span>
                  <span className="font-semibold text-slate-500">Dia da pregacao</span>
                  <span className="break-words">{formatDate(carta.preach_date)}</span>
                  <span className="font-semibold text-slate-500">Igreja origem</span>
                  <span className="break-words">{carta.church_origin || "-"}</span>
                  <span className="font-semibold text-slate-500">Igreja destino</span>
                  <span className="break-words">{carta.church_destination || "-"}</span>
                </div>

                <div className="mt-3">
                  <Badge variant="outline" className={statusClass(carta.status)}>{carta.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={carta.status === "LIBERADA"}
                    onCheckedChange={(value) => toggleAlwaysRelease(carta, Boolean(value))}
                    disabled={updatingReleaseId === carta.id}
                  />
                  <span className="text-sm text-slate-700 break-words">Liberar sempre</span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={!carta.storage_path} onClick={() => openPdf(carta)}>
                    <ArrowUpRight className="mr-2 h-4 w-4" /> Abrir PDF
                  </Button>
                  <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => share(carta)}>
                    <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                  </Button>
                  <Button className="w-full sm:col-span-2" variant="destructive" onClick={() => remove(carta)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
