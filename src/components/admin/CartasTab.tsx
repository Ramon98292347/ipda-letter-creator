import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  getSignedPdfUrl,
  setLetterStatus,
  softDeleteLetter,
  type PastorLetter,
} from "@/services/saasService";
import { ArrowUpRight, Ban, Eye, Filter, Search, Share2, Trash2 } from "lucide-react";
import { FiltersBar } from "@/components/shared/FiltersBar";
import { Table } from "@/components/shared/Table";
import { Modal } from "@/components/shared/Modal";

type QuickPeriod = "today" | "7" | "30" | "custom";

const STATUS_OPTIONS = [
  "AUTORIZADO",
  "BLOQUEADO",
  "AGUARDANDO_LIBERACAO",
  "LIBERADA",
  "ENVIADA",
  "EXCLUIDA",
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

export function CartasTab({ letters, scopeTotvsIds }: { letters: PastorLetter[]; scopeTotvsIds: string[] }) {
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<QuickPeriod>("custom");
  const [scopeMode, setScopeMode] = useState<"active" | "scope">("active");
  const [flashing, setFlashing] = useState<string[]>([]);
  const [selected, setSelected] = useState<PastorLetter | null>(null);
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
  }, [filtered.map((l) => `${l.id}:${l.status}`).join("|")]);

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

  async function openPdf(letter: PastorLetter) {
    if (!letter.storage_path) {
      toast.error("PDF indisponivel.");
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

  async function share(letter: PastorLetter) {
    if (letter.storage_path) {
      try {
        const url = await getSignedPdfUrl(letter.id);
        if (url) {
          window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregacao: ${url}`)}`, "_blank");
          return;
        }
      } catch {
        // fallback below
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregacao de ${letter.preacher_name}`)}`, "_blank");
  }

  async function updateStatus(letter: PastorLetter, status: string, reason?: string | null) {
    try {
      await setLetterStatus(letter.id, status, reason);
      await refresh();
    } catch {
      toast.error("Falha ao atualizar status.");
    }
  }

  async function toggleBlock(letter: PastorLetter) {
    if (letter.status === "BLOQUEADO") return updateStatus(letter, "AUTORIZADO", null);
    const reason = window.prompt("Motivo do bloqueio:", letter.block_reason || "");
    if (reason === null) return;
    return updateStatus(letter, "BLOQUEADO", reason || "Bloqueio manual");
  }

  async function remove(letter: PastorLetter) {
    if (!window.confirm("Marcar carta como EXCLUIDA?")) return;
    try {
      await softDeleteLetter(letter.id);
      await refresh();
    } catch {
      toast.error("Falha ao excluir.");
    }
  }

  function openCarta(letter: PastorLetter) {
    nav("/carta", {
      state: {
        reemitir: {
          nome: letter.preacher_name,
          igreja_origem: letter.church_origin || "",
          igreja_destino: letter.church_destination || "",
          dia_pregacao: formatDate(letter.preach_date),
          data_emissao: toDateOnly(letter.created_at),
        },
      },
    });
  }

  return (
    <>
      <FiltersBar>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-3xl font-semibold text-slate-900"><Filter className="h-6 w-6 text-[#2f63d4]" /> Filtros</h2>
          <div className="text-xs text-slate-500">Escopo TOTVS: {scopeMode === "scope" ? scopeTotvsIds.join(", ") : "ativo"}</div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant={period === "today" ? "default" : "outline"} onClick={() => setQuick("today")}>Hoje</Button>
          <Button variant={period === "7" ? "default" : "outline"} onClick={() => setQuick("7")}>7 dias</Button>
          <Button variant={period === "30" ? "default" : "outline"} onClick={() => setQuick("30")}>30 dias</Button>
          <Button variant="ghost" onClick={() => setQuick("clear")}>Limpar periodo</Button>
        </div>

        <div className="grid gap-3 md:grid-cols-6">
          <Input type="date" value={filters.dateStart} onChange={(e) => { setPeriod("custom"); setFilters((p) => ({ ...p, dateStart: e.target.value })); }} />
          <Input type="date" value={filters.dateEnd} onChange={(e) => { setPeriod("custom"); setFilters((p) => ({ ...p, dateEnd: e.target.value })); }} />
          <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as "active" | "scope")}>
            <SelectTrigger><SelectValue placeholder="Escopo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Somente igreja logada</SelectItem>
              <SelectItem value="scope">Todas do escopo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.church} onValueChange={(value) => setFilters((p) => ({ ...p, church: value }))}>
            <SelectTrigger><SelectValue placeholder="Igreja" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {churchOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.role} onValueChange={(value) => setFilters((p) => ({ ...p, role: value }))}>
            <SelectTrigger><SelectValue placeholder="Cargo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos cargos</SelectItem>
              {roleOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(value) => setFilters((p) => ({ ...p, status: value }))}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por nome..." value={filters.q} onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))} />
        </div>
      </FiltersBar>

      <Table minWidth="1720px">
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm min-w-[1720px]">
        <div className="hidden border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-500 xl:block">
          Arraste horizontalmente para ver todas as colunas.
        </div>
        <div className="hidden xl:grid xl:min-w-[1720px] xl:grid-cols-[120px_210px_160px_220px_200px_140px_130px_1fr] xl:border-b xl:border-slate-200 xl:bg-slate-50 xl:px-5 xl:py-4 xl:text-sm xl:font-semibold xl:text-slate-600">
          <span>Data</span><span>Nome</span><span>Dia da pregacao</span><span>Igreja origem</span><span>Igreja destino</span><span>Status</span><span>PDF</span><span>Acoes</span>
        </div>
        {filtered.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">Nenhuma carta encontrada.</p> : null}

        {filtered.map((carta) => {
          const blocked = carta.status === "BLOQUEADO";
          const tone = blocked ? "bg-rose-100" : "bg-emerald-50";
          const pulse = blocked && flashing.includes(carta.id) ? "animate-pulse" : "";
          return (
            <div key={carta.id} className={`${tone} border-b border-slate-200 p-4 last:border-b-0 xl:p-0 ${pulse}`}>
              <div className="hidden items-center xl:grid xl:min-w-[1720px] xl:grid-cols-[120px_210px_160px_220px_200px_140px_130px_1fr] xl:px-5 xl:py-4">
                <span className="whitespace-nowrap">{formatDate(carta.created_at)}</span>
                <span className="text-base font-semibold whitespace-nowrap">{carta.preacher_name}</span>
                <span className="whitespace-nowrap">{formatDate(carta.preach_date)}</span>
                <span className="whitespace-nowrap">{carta.church_origin || "-"}</span>
                <span className="whitespace-nowrap">{carta.church_destination || "-"}</span>
                <div>
                  <Badge variant="outline" className={statusClass(carta.status)}>{carta.status}</Badge>
                  {blocked ? <p className="mt-1 text-xs font-semibold text-rose-700">BLOQUEADO - EXCLUA ESSA CARTA</p> : null}
                </div>
                <Button variant="outline" disabled={!carta.storage_path} onClick={() => openPdf(carta)}><ArrowUpRight className="mr-2 h-4 w-4" /> Abrir PDF</Button>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Button className="bg-sky-600 hover:bg-sky-700" onClick={() => setSelected(carta)}><Eye className="mr-2 h-4 w-4" />Detalhes</Button>
                  <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => toggleBlock(carta)}><Ban className="mr-2 h-4 w-4" />{blocked ? "Desbloquear" : "Bloquear"}</Button>
                  <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => share(carta)}><Share2 className="mr-2 h-4 w-4" />Compartilhar</Button>
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => openCarta(carta)}>Carta</Button>
                  <Button className="bg-teal-600 hover:bg-teal-700" disabled={carta.status === "ENVIADA"} onClick={() => updateStatus(carta, "ENVIADA")}>Enviada</Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={carta.status === "LIBERADA"} onClick={() => updateStatus(carta, "LIBERADA")}>Liberar</Button>
                  <Button variant="destructive" onClick={() => remove(carta)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-500/70 bg-emerald-50/70 p-4 xl:hidden">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="font-semibold text-slate-500">Data</span>
                  <span>{formatDate(carta.created_at)}</span>
                  <span className="font-semibold text-slate-500">Nome</span>
                  <span>{carta.preacher_name}</span>
                  <span className="font-semibold text-slate-500">Dia da pregacao</span>
                  <span>{formatDate(carta.preach_date)}</span>
                  <span className="font-semibold text-slate-500">Igreja origem</span>
                  <span>{carta.church_origin || "-"}</span>
                  <span className="font-semibold text-slate-500">Igreja destino</span>
                  <span>{carta.church_destination || "-"}</span>
                </div>

                <div className="mt-3">
                  <Badge variant="outline" className={statusClass(carta.status)}>{carta.status}</Badge>
                  {blocked ? <p className="mt-1 text-xs font-semibold text-rose-700">BLOQUEADO - EXCLUA ESSA CARTA</p> : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setSelected(carta)}><Eye className="mr-2 h-4 w-4" />Detalhes</Button>
                  <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => toggleBlock(carta)}>{blocked ? "Desbloquear" : "Bloquear"}</Button>
                  <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => share(carta)}><Share2 className="mr-2 h-4 w-4" />Compartilhar</Button>
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => openCarta(carta)}>Carta</Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!carta.storage_path} onClick={() => openPdf(carta)}><ArrowUpRight className="mr-2 h-4 w-4" />PDF</Button>
                  <Button variant="destructive" onClick={() => remove(carta)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
                  <Button className="col-span-2 bg-teal-500 hover:bg-teal-600" disabled={carta.status === "ENVIADA"} onClick={() => updateStatus(carta, "ENVIADA")}>Enviada</Button>
                </div>
              </div>
            </div>
          );
        })}
      </section>
      </Table>

      <Modal open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title="Detalhes da Carta">
        <p className="text-sm text-slate-500">Informacoes da carta selecionada.</p>
          {selected ? (
            <div className="space-y-2 text-sm">
              <p><strong>Pregador:</strong> {selected.preacher_name}</p>
              <p><strong>Data:</strong> {formatDate(selected.created_at)}</p>
              <p><strong>Dia pregacao:</strong> {formatDate(selected.preach_date)}</p>
              <p><strong>Origem:</strong> {selected.church_origin || "-"}</p>
              <p><strong>Destino:</strong> {selected.church_destination || "-"}</p>
              <p><strong>Status:</strong> {selected.status}</p>
              <p><strong>Motivo:</strong> {selected.block_reason || "-"}</p>
            </div>
          ) : null}
      </Modal>
    </>
  );
}
