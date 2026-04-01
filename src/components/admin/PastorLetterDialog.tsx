import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, FileText, Loader2, Phone, Search, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLetterByPastor, fetchAncestorChain, listChurchesInScope, searchChurchesPublic } from "@/services/saasService";
import type { AncestorChainItem, ChurchInScopeItem } from "@/services/saasService";
import type { Church } from "@/components/ChurchSearch";

// Tipo do pregador alvo da carta
export type LetterTarget = {
  userId: string;
  nome: string;
  telefone: string;
  ministerRole: string;
  // TOTVS da propria igreja do obreiro/pastor
  churchTotvsId: string;
  // TOTVS do pai da igreja do obreiro (para buscar escopo mais amplo)
  parentTotvsId?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterTarget: LetterTarget | null;
  onSuccess?: () => void;
}

// Normaliza e formata texto de destino manual (ex: "9901 piuma niteroi" → "9901 - PIUMA NITEROI")
function normalizeManual(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,10})\s*[-)\s]?\s*(.+)$/);
  if (!match) return raw.toUpperCase();
  const totvs = match[1].trim();
  const nome = match[2].trim().replace(/\s+/g, " ").toUpperCase();
  return nome ? `${totvs} - ${nome}` : totvs;
}

// Converte lista da API para o tipo Church do formulario
function apiToChurch(c: { totvs_id?: string | null; church_name?: string | null; address_city?: string | null; address_state?: string | null; stamp_church_url?: string | null; church_class?: string | null; parent_totvs_id?: string | null }, idx: number): Church {
  return {
    id: Number(c.totvs_id) || idx + 1,
    codigoTotvs: String(c.totvs_id || ""),
    nome: String(c.church_name || ""),
    cidade: String(c.address_city || ""),
    uf: String(c.address_state || ""),
    carimboIgreja: String(c.stamp_church_url || ""),
    carimboPastor: "",
    classificacao: String(c.church_class || ""),
    parentTotvsId: String(c.parent_totvs_id || "") || undefined,
  };
}

export function PastorLetterDialog({ open, onOpenChange, letterTarget, onSuccess }: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const maxDateIso = maxDate.toISOString().slice(0, 10);

  const [destino, setDestino] = useState<Church | null>(null);
  const [destinoSearch, setDestinoSearch] = useState("");
  // Campo "Outros": texto livre digitado pelo usuario
  const [destinoOutros, setDestinoOutros] = useState("");
  // Debounce do campo Outros — so dispara a busca apos 300ms sem digitar
  const [outrosDebounced, setOutrosDebounced] = useState("");
  const [preachDate, setPreachDate] = useState("");
  const [preachPeriod, setPreachPeriod] = useState<"MANHA" | "TARDE" | "NOITE" | "">("");
  const [saving, setSaving] = useState(false);

  // ─── Escopo proprio: igreja do obreiro/pastor ───────────────────────────────
  // Comentario: mantemos dados brutos (ownScopeRaw) para verificar se a propria
  // igreja do alvo tem pastor — informacao necessaria para calcular signerChurch.
  const { data: ownScopeRaw = [] } = useQuery<ChurchInScopeItem[]>({
    queryKey: ["churches-dialog-own", letterTarget?.churchTotvsId],
    queryFn: () => listChurchesInScope(1, 1000, letterTarget?.churchTotvsId || undefined),
    enabled: open && Boolean(letterTarget?.churchTotvsId),
    staleTime: 60_000,
    refetchInterval: 10000,
  });
  const ownScopeChurches = useMemo(() => ownScopeRaw.map(apiToChurch), [ownScopeRaw]);

  // ─── Escopo da mae: todas as igrejas do pai (escopo mais amplo) ─────────────
  // Busca o parent totvs da propria igreja do alvo
  const targetParentTotvs = useMemo(() => {
    if (letterTarget?.parentTotvsId) return letterTarget.parentTotvsId;
    const own = ownScopeChurches.find((c) => c.codigoTotvs === letterTarget?.churchTotvsId);
    return own?.parentTotvsId || "";
  }, [letterTarget, ownScopeChurches]);

  // Comentario: mantemos dados brutos (parentScopeRaw) para ordenar por church_class
  // diretamente — mesmo formato usado no obreiro (UsuarioDashboard).
  const { data: parentScopeRaw = [] } = useQuery<ChurchInScopeItem[]>({
    queryKey: ["churches-dialog-parent", targetParentTotvs],
    queryFn: () => listChurchesInScope(1, 1000, targetParentTotvs || undefined),
    enabled: open && Boolean(targetParentTotvs),
    staleTime: 60_000,
    refetchInterval: 10000,
  });
  const parentScopeChurches = useMemo(() => parentScopeRaw.map(apiToChurch), [parentScopeRaw]);

  // ─── Ancestrais acima da igreja do alvo (para mae mais alta no campo Outros) ─
  // ancestor_chain retorna [pai, avo, bisavo, ...] — o ULTIMO com pastor e o mais alto.
  // Regra: campo "Outros" sempre usa estadual > setorial > central como origem.
  const { data: ancestorChain = [] } = useQuery<AncestorChainItem[]>({
    queryKey: ["churches-ancestor-chain", letterTarget?.churchTotvsId],
    queryFn: () => fetchAncestorChain(letterTarget?.churchTotvsId || ""),
    enabled: open && Boolean(letterTarget?.churchTotvsId),
    staleTime: 60_000,
  });

  // Mae mais alta com pastor: percorre ancestorChain do final (mais alto) para o inicio.
  // Usada no campo "Outros" — sempre pega estadual > setorial > central.
  const highestSignerForOthers = useMemo<AncestorChainItem | null>(() => {
    for (let i = ancestorChain.length - 1; i >= 0; i--) {
      if (ancestorChain[i].pastor?.full_name) return ancestorChain[i];
    }
    return null;
  }, [ancestorChain]);

  // Igreja propria do alvo com dados brutos (inclui pastor info)
  const targetChurchRaw = useMemo(
    () => ownScopeRaw.find((c) => c.totvs_id === letterTarget?.churchTotvsId) || null,
    [ownScopeRaw, letterTarget?.churchTotvsId],
  );

  // Comentario: signerChurch e a mae direta com pastor — assina a carta para destinos normais.
  // Regra: se a propria igreja do alvo tem pastor, ela assina. Caso contrario, sobe pelo
  // ancestorChain ate achar o primeiro com pastor (regional/local NUNCA assina).
  const signerChurch = useMemo<AncestorChainItem | null>(() => {
    // Verifica se a propria igreja tem pastor
    if (targetChurchRaw?.pastor?.full_name) {
      return {
        totvs_id: targetChurchRaw.totvs_id,
        church_name: targetChurchRaw.church_name,
        parent_totvs_id: targetChurchRaw.parent_totvs_id || null,
        pastor: targetChurchRaw.pastor,
      };
    }
    // Sobe na hierarquia pelo ancestorChain (pai, avo...) ate achar pastor
    for (const anc of ancestorChain) {
      if (anc.pastor?.full_name) return anc;
    }
    return null;
  }, [targetChurchRaw, ancestorChain]);

  // ─── Debounce do campo Outros ────────────────────────────────────────────────
  // Comentario: igual ao Index.tsx — atualiza outrosDebounced 300ms apos o usuario parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => setOutrosDebounced(destinoOutros), 300);
    return () => clearTimeout(t);
  }, [destinoOutros]);

  // ─── Busca publica para o campo Outros ──────────────────────────────────────
  // Comentario: usa search-churches-public (sem auth) para buscar QUALQUER igreja do banco,
  // nao apenas as do escopo do pastor. Igual ao que telas-cartas faz com ChurchSearchInput.
  const { data: outrosSuggestions = [], isFetching: outrosLoading } = useQuery({
    queryKey: ["churches-outros-search", outrosDebounced],
    queryFn: () => searchChurchesPublic(outrosDebounced, 10),
    enabled: outrosDebounced.trim().length >= 2,
    staleTime: 30_000,
  });

  // ─── Reset dos campos ao abrir o dialog ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setDestino(null);
    setDestinoSearch("");
    setDestinoOutros("");
    setOutrosDebounced("");
    setPreachDate("");
    setPreachPeriod("");
  }, [open, letterTarget]);

  // ─── Igrejas de destino disponíveis (escopo da mae ou proprio) ───────────────
  // Se o alvo tem mae, usa escopo da mae (mais amplo). Senao usa proprio.
  const destinationSourceChurches = useMemo(() => {
    // Comentario: ordena pela hierarquia (estadual > setorial > central > regional > local)
    // e dentro de cada nível, pelo TOTVS numérico crescente.
    // Usa dados brutos (ChurchInScopeItem com church_class) para ordenar — mesmo formato
    // que o obreiro (UsuarioDashboard) que funciona corretamente.
    const classOrder: Record<string, number> = { estadual: 0, setorial: 1, central: 2, regional: 3, local: 4 };
    const baseRaw = parentScopeRaw.length ? parentScopeRaw : ownScopeRaw;
    return [...baseRaw]
      .sort((a, b) => {
        const oA = classOrder[String(a.church_class || "").toLowerCase().trim()] ?? 99;
        const oB = classOrder[String(b.church_class || "").toLowerCase().trim()] ?? 99;
        if (oA !== oB) return oA - oB;
        return Number(a.totvs_id || 0) - Number(b.totvs_id || 0);
      })
      .map(apiToChurch);
  }, [parentScopeRaw, ownScopeRaw]);

  // Comentario: verifica se um destino esta na sub-arvore de uma igreja raiz,
  // subindo pelos parent_totvs_id (codigoTotvs/parentTotvsId) ate encontrar a raiz.
  function isInSubtreeDialog(destinoTotvs: string, raizTotvs: string): boolean {
    if (!destinoTotvs || !raizTotvs) return false;
    if (destinoTotvs === raizTotvs) return true;
    // Comentario: monta mapa com igrejas do escopo + ancestorChain para subir
    const byId = new Map<string, { parent?: string }>();
    for (const c of ownScopeChurches) byId.set(String(c.codigoTotvs || ""), { parent: String(c.parentTotvsId || "") });
    for (const c of parentScopeChurches) byId.set(String(c.codigoTotvs || ""), { parent: String(c.parentTotvsId || "") });
    for (const a of ancestorChain) byId.set(String(a.totvs_id || ""), { parent: String(a.parent_totvs_id || "") });
    let cur = byId.get(destinoTotvs);
    const visited = new Set<string>();
    while (cur) {
      const parentId = cur.parent || "";
      if (!parentId || visited.has(parentId)) break;
      if (parentId === raizTotvs) return true;
      visited.add(parentId);
      cur = byId.get(parentId);
    }
    return false;
  }

  // ─── Origem calculada baseada no destino selecionado ──────────────────────
  // Comentario: se o destino esta na sub-arvore da mae (signerChurch), usa a mae.

  const computedOrigin = useMemo(() => {
    const manualFilled = !!destinoOutros.trim();
    // Comentario: campo "Outros" sempre usa a mae mais alta
    if (manualFilled) {
      return {
        name: highestSignerForOthers?.church_name || signerChurch?.church_name || "",
        totvs: highestSignerForOthers?.totvs_id || signerChurch?.totvs_id || letterTarget?.churchTotvsId || "",
      };
    }
    // Comentario: destino selecionado da lista
    const destId = String(destino?.codigoTotvs || "");
    if (!destId || !signerChurch) {
      return {
        name: signerChurch?.church_name || "",
        totvs: signerChurch?.totvs_id || letterTarget?.churchTotvsId || "",
      };
    }
    // Comentario: se destino esta na sub-arvore da mae, usa a mae
    if (isInSubtreeDialog(destId, signerChurch.totvs_id)) {
      return { name: signerChurch.church_name, totvs: signerChurch.totvs_id };
    }
    // ─── REGRA DE IRMAS ────────────────────────────────────────────────────────
    // Comentario: se a origem (signerChurch) e o destino compartilham a MESMA MAE
    // (mesmo parent_totvs_id), sao irmas na hierarquia.
    // Nesse caso, a carta sai com a propria igreja (signerChurch) como origem,
    // sem precisar subir para o ancestral comum.
    // Ex.: Central A (mae: Estadual X) para Central B (mae: Estadual X) = origem Central A.
    // Ex.: Setorial Y (mae: Estadual X) para Setorial Z (mae: Estadual X) = origem Setorial Y.
    const signerParent = String(signerChurch?.parent_totvs_id || "");
    const destParentId = String(destino?.parentTotvsId || "");
    if (signerParent && destParentId && signerParent === destParentId) {
      return { name: signerChurch.church_name, totvs: signerChurch.totvs_id };
    }
    // ─── FIM REGRA DE IRMAS ────────────────────────────────────────────────────
    // Comentario: sobe pela ancestorChain ate achar ancestral que englobe o destino
    for (const ancestor of ancestorChain) {
      if (ancestor.pastor?.full_name && isInSubtreeDialog(destId, ancestor.totvs_id)) {
        return { name: ancestor.church_name, totvs: ancestor.totvs_id };
      }
    }
    // Comentario: fallback — mae mais alta
    return {
      name: highestSignerForOthers?.church_name || signerChurch?.church_name || "",
      totvs: highestSignerForOthers?.totvs_id || signerChurch?.totvs_id || letterTarget?.churchTotvsId || "",
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino, destinoOutros, signerChurch, highestSignerForOthers, ancestorChain, ownScopeChurches, parentScopeChurches, letterTarget]);

  const displayOriginName = computedOrigin.name;
  const displayOriginTotvs = computedOrigin.totvs;

  // ─── Opcoes de destino filtradas pelo texto digitado ────────────────────────
  const filteredDestinoOptions = useMemo(() => {
    const q = destinoSearch.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (q.length < 2) return [];
    return destinationSourceChurches
      .filter((c) => {
        const hay = `${c.codigoTotvs} ${c.nome} ${c.classificacao || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return hay.includes(q);
      })
      .slice(0, 15);
  }, [destinationSourceChurches, destinoSearch]);

  // ─── Preview ─────────────────────────────────────────────────────────────────
  const formatDateBr = (iso: string) => {
    if (!iso) return "-";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const previewOriginName = displayOriginName
    ? `${displayOriginTotvs} - ${displayOriginName}`
    : "Carregando...";
  const previewDestination = destino
    ? `${destino.codigoTotvs} - ${destino.nome}`
    : destinoOutros.trim() || "-";

  // Comentario: aviso quando a origem subiu na hierarquia (diferente da mae direta)
  const originAdjustedMessage = useMemo(() => {
    if (!signerChurch) return null;
    if (displayOriginTotvs !== signerChurch.totvs_id) {
      return `Origem ajustada para: ${displayOriginTotvs} - ${displayOriginName}.`;
    }
    return null;
  }, [displayOriginTotvs, displayOriginName, signerChurch]);

  // ─── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!letterTarget) return;
    if (!preachPeriod) { toast.error("Selecione o período da pregação."); return; }
    if (!preachDate) { toast.error("Selecione a data da pregação."); return; }
    if (preachDate < todayIso) { toast.error("A data de pregação deve ser hoje ou no futuro."); return; }
    // Comentario: validacao do campo "Outros" — deve comecal com numero (codigo TOTVS)
    if (!destino && !normalizeManual(destinoOutros).match(/^\d{3,}/)) { toast.error("O campo 'Outros' deve iniciar com o código da igreja. Ex: 9530 - CAMPO GRANDE"); return; }

    const origemText = displayOriginName
      ? `${displayOriginTotvs} - ${displayOriginName}`
      : displayOriginTotvs;
    const destinoText = destino
      ? `${destino.codigoTotvs} - ${destino.nome}`
      : normalizeManual(destinoOutros);

    try {
      setSaving(true);
      const result = await createLetterByPastor({
        church_totvs_id: displayOriginTotvs,
        preacher_name: letterTarget.nome,
        preacher_user_id: letterTarget.userId || undefined,
        minister_role: letterTarget.ministerRole || "Obreiro",
        preach_date: preachDate,
        preach_period: preachPeriod,
        church_origin: origemText,
        church_destination: destinoText,
        destination_totvs_id: destino?.codigoTotvs || undefined,
        manual_destination: !destino && Boolean(normalizeManual(destinoOutros)),
        phone: (letterTarget.telefone || "").replace(/\D/g, ""),
        email: null,
      });
      if (Boolean((result as Record<string, unknown>)?.queued)) {
        toast.success("Sem internet. Carta salva na fila e será enviada automaticamente.");
      } else {
        toast.success("Carta criada e enviada para geracao do PDF.");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast.error("Erro ao criar carta. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle>Registro de Carta de Pregação</DialogTitle>
          <DialogDescription>
            O pastor pode tirar carta para o usuário da linha ou para si mesmo. A origem segue a regra da igreja dele e da igreja mãe.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.35fr_1fr]">
          {/* ── Coluna esquerda: formulario ──────────────────────────────── */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-start gap-2 text-xl font-display text-slate-900 sm:items-center sm:text-2xl">
                <FileText className="h-6 w-6 text-primary" /> Registro de Carta de Pregacao
              </CardTitle>
              <CardDescription>Preencha os dados para emissao da carta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Nome do pregador */}
              <div className="space-y-2">
                <Label>Nome do pregador</Label>
                <Input value={letterTarget?.nome || ""} disabled />
              </div>

              {/* Telefone */}
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={letterTarget?.telefone || ""} disabled placeholder="Telefone do pregador" />
              </div>

              {/* Igreja de origem — calculada automaticamente pela hierarquia */}
              <div className="space-y-2">
                <Label>Igreja que faz a carta (origem)</Label>
                {/* Comentario: campo somente leitura — a origem e sempre a mae com pastor.
                    Regional/local nunca aparece como origem pela regra do sistema. */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={
                      displayOriginName
                        ? `${displayOriginTotvs} - ${displayOriginName}`
                        : "Carregando..."
                    }
                    disabled
                    className="pl-10 bg-slate-50"
                  />
                </div>
                {/* Aviso quando "Outros" esta preenchido e a origem subiu para a mae mais alta */}
                {originAdjustedMessage && (
                  <p className="text-xs text-amber-700">{originAdjustedMessage}</p>
                )}
              </div>

              {/* Funcao ministerial */}
              <div className="space-y-2">
                <Label>Funcao ministerial</Label>
                <Input value={letterTarget?.ministerRole || ""} disabled />
              </div>

              {/* Igreja de destino — escopo da mae */}
              <div className="space-y-2">
                <Label>Igreja que vai pregar (destino)</Label>

                {/* Comentario: seletor rapido (todas do escopo da mae) — mesmo formato do obreiro */}
                <Select
                  value=""
                  onValueChange={(value) => {
                    const found = destinationSourceChurches.find(
                      (c) => `${c.codigoTotvs} - ${c.nome}` === value,
                    );
                    if (found) {
                      setDestino(found);
                      setDestinoSearch(`${found.codigoTotvs} - ${found.nome}`);
                      setDestinoOutros("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma igreja do seu escopo" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationSourceChurches.map((c) => {
                      const val = `${c.codigoTotvs} - ${c.nome}`;
                      return (
                        <SelectItem key={c.codigoTotvs} value={val}>
                          {val} {c.classificacao ? `(${c.classificacao})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {/* Busca por texto */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={destinoSearch}
                    onChange={(e) => {
                      setDestinoSearch(e.target.value);
                      // Se apagou a busca, limpa o destino selecionado
                      if (!e.target.value.trim()) setDestino(null);
                    }}
                    placeholder="Digite o TOTVS ou nome da igreja"
                    disabled={!!destinoOutros.trim()}
                    className="pl-10"
                  />
                </div>

                {/* Lista de sugestoes da busca */}
                {filteredDestinoOptions.length > 0 && !destinoOutros.trim() && (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                    {filteredDestinoOptions.map((c) => (
                      <button
                        key={c.codigoTotvs}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                        onClick={() => {
                          setDestino(c);
                          setDestinoSearch(`${c.codigoTotvs} - ${c.nome}`);
                          setDestinoOutros("");
                        }}
                      >
                        <span className="font-medium text-slate-900">{c.codigoTotvs} - {c.nome}</span>
                        <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">{c.classificacao}</span>
                      </button>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Se escolher uma igreja do escopo no seletor, a origem volta para a igreja do seu papel logado. Se digitar um destino fora do escopo, a origem sobe para a igreja mãe.
                </p>
              </div>

              {/* Outros: busca em TODAS as igrejas do banco */}
              <div className="space-y-2">
                <Label>Outros (se não encontrar na lista)</Label>

                {/* Campo unico: digitar busca automaticamente, ao sair formata o valor */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={destinoOutros}
                    onChange={(e) => {
                      setDestinoOutros(e.target.value);
                      if (e.target.value.trim()) {
                        setDestino(null);
                        setDestinoSearch("");
                      }
                    }}
                    onBlur={(e) => {
                      // Formata "9530 campo grande" -> "9530 - CAMPO GRANDE"
                      const raw = e.target.value.trim();
                      if (!raw) return;
                      const match = raw.match(/^(\d{1,10})\s*[-)\s]?\s*(.+)$/);
                      const formatted = match
                        ? `${match[1].trim()} - ${match[2].trim().replace(/\s+/g, " ").toUpperCase()}`
                        : raw.toUpperCase();
                      setDestinoOutros(formatted);
                    }}
                    placeholder="Ex.: 9530 campo grande → 9530 - CAMPO GRANDE"
                    disabled={!!destino || !!destinoSearch.trim()}
                    className="pl-10"
                  />
                </div>

                {/* Lista de sugestoes do campo Outros (todas do banco) */}
                {/* Spinner enquanto a busca carrega */}
                {outrosLoading && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando igrejas...
                  </p>
                )}
                {/* Lista de sugestoes vindas da busca publica (todas as igrejas) */}
                {outrosSuggestions.length > 0 && !destino && !destinoSearch.trim() && (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                    {outrosSuggestions.map((c) => (
                      <button
                        key={c.totvs_id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                        onClick={() => {
                          const label = `${c.totvs_id} - ${c.church_name}`;
                          setDestinoOutros(label);
                          setOutrosDebounced("");
                          setDestino(null);
                          setDestinoSearch("");
                        }}
                      >
                        <span className="font-medium text-slate-900">{c.totvs_id} - {c.church_name}</span>
                        <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">{c.class}</span>
                      </button>
                    ))}
                  </div>
                )}
                {/* Sem resultados apos digitar 2+ chars */}
                {!outrosLoading && outrosDebounced.trim().length >= 2 && outrosSuggestions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma igreja encontrada. Digite o nome ou código manualmente.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Modelo: <span className="font-medium">9901 - PIUMA-NITEROI</span>. Se digitar diferente, o sistema formata automaticamente ao sair do campo.
                </p>
              </div>

              {/* Data da pregação e data de emissão */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data da pregação</Label>
                  <Input
                    type="date"
                    min={todayIso}
                    max={maxDateIso}
                    value={preachDate}
                    onChange={(e) => setPreachDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de emissão da carta</Label>
                  <Input value={formatDateBr(todayIso)} disabled />
                </div>
              </div>

              {/* Periodo */}
              <div className="space-y-2">
                <Label>Periodo</Label>
                <Select
                  value={preachPeriod}
                  onValueChange={(v: "MANHA" | "TARDE" | "NOITE") => setPreachPeriod(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANHA">Manha</SelectItem>
                    <SelectItem value="TARDE">Tarde</SelectItem>
                    <SelectItem value="NOITE">Noite</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground">A data da pregação pode ser escolhida entre hoje e os próximos 30 dias.</p>
            </CardContent>
          </Card>

          {/* ── Coluna direita: pre-visualizacao ─────────────────────────── */}
          <Card className="overflow-hidden border-emerald-100 shadow-sm">
            <CardHeader className="bg-emerald-50/80">
              <CardTitle className="flex items-start gap-2 text-xl font-display text-slate-900 sm:items-center sm:text-2xl">
                <FileText className="h-6 w-6 text-emerald-600" /> Pre-visualizacao da Carta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-5">

              {/* Pregador */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pregador</p>
                <div className="flex items-start gap-3 text-slate-900 sm:items-center">
                  <UserCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="text-base font-semibold sm:text-lg">{letterTarget?.nome || "Não informado"}</span>
                </div>
              </div>

              {/* Origem e destino */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Igreja de origem e destino</p>
                <div className="space-y-2 text-slate-900">
                  <div className="text-base font-semibold sm:text-lg">{previewOriginName}</div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span>{previewDestination}</span>
                  </div>
                </div>
              </div>

              {/* Datas */}
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
                    <span>{preachDate ? formatDateBr(preachDate) : "-"}</span>
                  </div>
                </div>
              </div>

              {/* Assinatura */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura responsavel</p>
                <div className="space-y-2 text-slate-900">
                  <div className="text-base font-semibold sm:text-lg">{previewOriginName}</div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>Definido pela igreja de origem na geracao da carta</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Botoes */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
            disabled={saving}
          >
            Fechar
          </Button>
          <Button
            type="button"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Enviar carta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
