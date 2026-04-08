import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import type { ChurchInScopeItem, ChurchContratoDraft, ChurchHierarchySigner, ChurchLaudoDraft, ChurchRemanejamentoDraft, UserListItem } from "@/services/saasService";
import {
  deleteChurchRemanejamento,
  generateChurchContratoPdf,
  generateChurchRemanejamentoPdf,
  getChurchContratoForm,
  getChurchRemanejamentoForm,
  listMembers,
  saveChurchContratoDraft,
  saveChurchLaudoDraft,
  saveChurchRemanejamentoDraft,
  upsertChurchContrato,
  upsertChurchLaudo,
  upsertChurchRemanejamento,
} from "@/services/saasService";
import { BRAZIL_UF_OPTIONS } from "@/lib/brazil-ufs";

type TabValue = "remanejamento" | "contrato" | "laudo";

const DOCS_BUCKET = "documentos_igrejas";
const MINISTER_ROLE_OPTIONS = ["Pastor", "Presbitero", "Diacono", "Cooperador", "Membro"];

function textValue(v: unknown) {
  return String(v || "");
}

function formatCurrencyBRL(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const value = Number(digits || "0") / 100;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function isBlank(v: unknown) {
  return String(v ?? "").trim().length === 0;
}

// Comentario: formulario completo de documentos da igreja em um modal unico com abas.
export function ChurchDocsDialog({
  open,
  onClose,
  church,
  initialTab = "remanejamento",
}: {
  open: boolean;
  onClose: () => void;
  church: ChurchInScopeItem | null;
  initialTab?: TabValue;
}) {
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hierarchy, setHierarchy] = useState<ChurchHierarchySigner>({
    requires_setorial_signature: false,
    signer_role: "estadual",
    message: "",
  });

  const [remanejamento, setRemanejamento] = useState<ChurchRemanejamentoDraft>({ church_totvs_id: "" });
  const [contrato, setContrato] = useState<ChurchContratoDraft>({ church_totvs_id: "" });
  const [laudo, setLaudo] = useState<ChurchLaudoDraft>({ church_totvs_id: "" });
  const [busyPhoto, setBusyPhoto] = useState<string>("");
  const [cepLoading, setCepLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState("");
  const [searchDirigenteSaida, setSearchDirigenteSaida] = useState("");
  const [searchNovoDirigente, setSearchNovoDirigente] = useState("");
  const [searchingSaida, setSearchingSaida] = useState(false);
  const [searchingNovo, setSearchingNovo] = useState(false);
  const [remStatus, setRemStatus] = useState<string>("RASCUNHO");
  const [remPdfUrl, setRemPdfUrl] = useState<string>("");
  const [hideRemFormManual, setHideRemFormManual] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    async function loadData() {
      if (!open || !church) return;
      setLoading(true);
      try {
        const [remData, conData] = await Promise.all([getChurchRemanejamentoForm(church), getChurchContratoForm(church)]);
        setHierarchy(remData.hierarchy);
        setRemanejamento(remData.draft);
        setRemStatus(String(remData.status || "RASCUNHO"));
        setRemPdfUrl(String(remData.pdf_storage_path || ""));
        setHideRemFormManual(false);
        setContrato(conData.draft);
        setLaudo(conData.laudo);
      } catch {
        toast.error("Não foi possível carregar os dados dos documentos.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [open, church]);

  const churchLabel = useMemo(() => {
    if (!church) return "";
    return `${church.church_name} - TOTVS ${church.totvs_id}`;
  }, [church]);

  function updateRem(field: keyof ChurchRemanejamentoDraft, value: string) {
    setRemanejamento((prev) => ({ ...prev, [field]: value }));
  }

  function updateContrato(field: keyof ChurchContratoDraft, value: string) {
    setContrato((prev) => ({ ...prev, [field]: value }));
  }

  function updateLaudo(field: keyof ChurchLaudoDraft, value: string) {
    setLaudo((prev) => ({ ...prev, [field]: value }));
  }

  function formatKmValue(raw: string) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    return `${digits} KM`;
  }

  function normalizeMinisterRole(value: string) {
    const safe = String(value || "").trim().toLowerCase();
    if (!safe) return "";
    if (safe.includes("pastor")) return "Pastor";
    if (safe.includes("presb")) return "Presbitero";
    if (safe.includes("diac")) return "Diacono";
    if (safe.includes("coop") || safe.includes("obreiro")) return "Cooperador";
    if (safe.includes("membro")) return "Membro";
    return String(value || "").trim();
  }

  async function searchMemberByNameOrCpf(query: string): Promise<UserListItem | null> {
    const q = String(query || "").trim();
    if (!q) return null;
    const data = await listMembers({ search: q, is_active: true, page: 1, page_size: 20 });
    const members = data?.workers || [];
    if (!members.length) return null;
    const exactCpf = members.find((m) => String(m.cpf || "").replace(/\D/g, "") === q.replace(/\D/g, ""));
    return exactCpf || members[0];
  }

  async function handleSearchDirigenteSaida() {
    const q = String(searchDirigenteSaida || "").trim();
    if (!q) return;
    setSearchingSaida(true);
    try {
      const member = await searchMemberByNameOrCpf(q);
      if (!member) {
        toast.error("Dirigente nao encontrado.");
        return;
      }
      setRemanejamento((prev) => ({
        ...prev,
        dirigente_saida_nome: String(member.full_name || ""),
        dirigente_saida_cpf: String(member.cpf || ""),
        dirigente_saida_rg: String(member.rg || ""),
        dirigente_saida_telefone: String(member.phone || ""),
        dirigente_saida_tipo: normalizeMinisterRole(String(member.minister_role || "")),
      }));
      toast.success("Dados do dirigente preenchidos.");
    } finally {
      setSearchingSaida(false);
    }
  }

  async function handleSearchNovoDirigente() {
    const q = String(searchNovoDirigente || "").trim();
    if (!q) return;
    setSearchingNovo(true);
    try {
      const member = await searchMemberByNameOrCpf(q);
      if (!member) {
        toast.error("Novo dirigente nao encontrado.");
        return;
      }
      setRemanejamento((prev) => ({
        ...prev,
        novo_dirigente_nome: String(member.full_name || ""),
        novo_dirigente_cpf: String(member.cpf || ""),
        novo_dirigente_rg: String(member.rg || ""),
        novo_dirigente_telefone: String(member.phone || ""),
        novo_dirigente_tipo: normalizeMinisterRole(String(member.minister_role || "")),
        novo_dirigente_data_batismo: String(member.baptism_date || prev.novo_dirigente_data_batismo || ""),
      }));
      toast.success("Dados do novo dirigente preenchidos.");
    } finally {
      setSearchingNovo(false);
    }
  }

  async function autofillLocadorCep(force = false) {
    const cep = onlyDigits(textValue(contrato.locador_cep));
    if (cep.length !== 8) return;
    if (!force && (cepLoading || lastCepLookup === cep)) return;

    setCepLoading(true);
    try {
      const data = await fetchAddressByCep(cep);
      setContrato((prev) => ({
        ...prev,
        locador_cep: maskCep(cep),
        locador_endereco: textValue(prev.locador_endereco) || data.logradouro,
        locador_bairro: textValue(prev.locador_bairro) || data.bairro,
        locador_cidade: textValue(prev.locador_cidade) || data.localidade,
        locador_uf: textValue(prev.locador_uf) || data.uf,
      }));
      setLastCepLookup(cep);
    } catch (err) {
      if (force) {
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP não encontrado." : "Falha ao buscar CEP.");
      }
    } finally {
      setCepLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "contrato") return;
    const cep = onlyDigits(textValue(contrato.locador_cep));
    if (cep.length !== 8) return;
    void autofillLocadorCep();
  }, [contrato.locador_cep, activeTab]);

  async function uploadLaudoPhoto(file: File, slot: "foto_interna_1_url" | "foto_interna_2_url" | "foto_interna_3_url" | "foto_interna_4_url") {
    if (!church || !supabase) {
      toast.error("Supabase não configurado.");
      return;
    }
    setBusyPhoto(slot);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const path = `laudos/${church.totvs_id}/${fileName}`;

      const { error } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
      if (error) {
        toast.error(`Falha no upload da foto (${error.message}).`);
        return;
      }
      const { data } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(path);
      const url = data?.publicUrl || "";
      updateLaudo(slot, url);
      toast.success("Foto do laudo enviada.");
    } finally {
      setBusyPhoto("");
    }
  }

  async function onSaveDraft() {
    if (!church) return;
    setSaving(true);
    try {
      if (activeTab === "remanejamento") {
        await saveChurchRemanejamentoDraft({ ...remanejamento, church_totvs_id: church.totvs_id });
      }
      if (activeTab === "contrato") {
        await saveChurchContratoDraft({ ...contrato, church_totvs_id: church.totvs_id });
      }
      if (activeTab === "laudo") {
        await saveChurchLaudoDraft({ ...laudo, church_totvs_id: church.totvs_id });
      }
      toast.success("Rascunho salvo localmente.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSystem() {
    if (!church) return;
    const missingRemFields = activeTab === "remanejamento" ? getMissingRemanejamentoFields() : [];
    if (missingRemFields.length > 0) {
      toast.error(`Preencha os campos obrigatorios: ${missingRemFields.join(", ")}.`);
      return;
    }
    setSaving(true);
    try {
      if (activeTab === "remanejamento") {
        await upsertChurchRemanejamento({ ...remanejamento, church_totvs_id: church.totvs_id });
        setRemStatus("FINALIZADO");
      }
      if (activeTab === "contrato") {
        await upsertChurchContrato({ ...contrato, church_totvs_id: church.totvs_id });
      }
      if (activeTab === "laudo") {
        await upsertChurchLaudo({ ...laudo, church_totvs_id: church.totvs_id });
      }
      toast.success("Dados salvos no sistema.");
    } finally {
      setSaving(false);
    }
  }

  async function onGeneratePdf() {
    if (!church) return;
    const missingRemFields = activeTab === "remanejamento" ? getMissingRemanejamentoFields() : [];
    if (missingRemFields.length > 0) {
      toast.error(`Preencha os campos obrigatorios: ${missingRemFields.join(", ")}.`);
      return;
    }
    if (activeTab === "remanejamento") setHideRemFormManual(true);
    setSaving(true);
    try {
      if (activeTab === "remanejamento") {
        // Comentario: garante persistencia dos dados atuais antes de chamar o webhook de geracao.
        await upsertChurchRemanejamento({ ...remanejamento, church_totvs_id: church.totvs_id });
        const res = await generateChurchRemanejamentoPdf(church.totvs_id);
        const nextStatus = String((res as { remanejamento?: { status?: string } })?.remanejamento?.status || "");
        const nextPdfUrl = String((res as { remanejamento?: { pdf_storage_path?: string | null } })?.remanejamento?.pdf_storage_path || "");
        if (nextStatus) setRemStatus(nextStatus);
        if (nextPdfUrl) setRemPdfUrl(nextPdfUrl);
        if ((res as { ok?: boolean }).ok) toast.success("Remanejamento enviado para geracao de PDF.");
        else toast.message("PDF de remanejamento pendente de backend.");
      } else {
        const res = await generateChurchContratoPdf(church.totvs_id);
        if ((res as { ok?: boolean }).ok) toast.success("Contrato enviado para geracao de PDF.");
        else toast.message("PDF de contrato pendente de backend.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteRemanejamento() {
    if (!church) return;
    const confirmed = window.confirm("Deseja excluir este remanejamento para fazer outro?");
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteChurchRemanejamento(church.totvs_id);
      const remData = await getChurchRemanejamentoForm(church);
      setHierarchy(remData.hierarchy);
      setRemanejamento(remData.draft);
      setRemStatus(String(remData.status || "RASCUNHO"));
      setRemPdfUrl(String(remData.pdf_storage_path || ""));
      setHideRemFormManual(false);
      toast.success("Remanejamento excluido. Formulario liberado para novo preenchimento.");
    } finally {
      setSaving(false);
    }
  }

  const remFormHidden = activeTab === "remanejamento" && (hideRemFormManual || remStatus === "FINALIZADO");

  function getMissingRemanejamentoFields() {
    const requiredFields: Array<{ key: keyof ChurchRemanejamentoDraft; label: string }> = [
      { key: "estadual_pastor_nome", label: "Nome do pastor estadual" },
      { key: "estadual_pastor_cpf", label: "CPF do pastor estadual" },
      { key: "estadual_telefone", label: "Telefone estadual" },
      { key: "estadual_email", label: "Email estadual" },
      { key: "estadual_cidade", label: "Cidade estadual" },
      { key: "estadual_uf", label: "UF estadual" },
      { key: "igreja_endereco_atual", label: "Endereco da igreja" },
      { key: "igreja_numero", label: "Numero da igreja" },
      { key: "igreja_bairro", label: "Bairro da igreja" },
      { key: "igreja_cidade", label: "Cidade da igreja" },
      { key: "igreja_uf", label: "UF da igreja" },
      { key: "porte_igreja", label: "Porte da IPDA" },
      { key: "sobre_imovel", label: "Sobre o imovel" },
      { key: "possui_escritura", label: "Possui escritura" },
      { key: "comodato", label: "Comodato" },
      { key: "entradas_atuais", label: "Entradas atuais" },
      { key: "saidas", label: "Saidas" },
      { key: "saldo", label: "Saldo" },
      { key: "numero_membros", label: "Numero de membros" },
      { key: "dirigente_saida_tipo", label: "Tipo ministerial (dirigente que deixa)" },
      { key: "dirigente_saida_data_assumiu", label: "Assumiu em" },
      { key: "dirigente_saida_nome", label: "Nome do dirigente que deixa" },
      { key: "dirigente_saida_rg", label: "RG do dirigente que deixa" },
      { key: "dirigente_saida_cpf", label: "CPF do dirigente que deixa" },
      { key: "dirigente_saida_telefone", label: "Telefone do dirigente que deixa" },
      { key: "novo_dirigente_tipo", label: "Tipo ministerial (novo dirigente)" },
      { key: "novo_dirigente_data_batismo", label: "Data de batismo" },
      { key: "novo_dirigente_nome", label: "Nome do novo dirigente" },
      { key: "novo_dirigente_rg", label: "RG do novo dirigente" },
      { key: "novo_dirigente_cpf", label: "CPF do novo dirigente" },
      { key: "novo_dirigente_telefone", label: "Telefone do novo dirigente" },
      { key: "novo_dirigente_distancia_km", label: "Distancia em KM" },
      { key: "novo_dirigente_recebe_prebenda", label: "Recebe prebenda" },
      { key: "motivo_troca", label: "Motivo da troca" },
    ];

    if (hierarchy.requires_setorial_signature) {
      requiredFields.push(
        { key: "setorial_pastor_nome", label: "Nome do pastor setorial" },
        { key: "setorial_pastor_cpf", label: "CPF do pastor setorial" },
        { key: "setorial_telefone", label: "Telefone setorial" },
        { key: "setorial_email", label: "Email setorial" },
        { key: "setorial_cidade", label: "Cidade setorial" },
        { key: "setorial_uf", label: "UF setorial" },
      );
    }

    if (textValue(remanejamento.novo_dirigente_recebe_prebenda) === "sim") {
      requiredFields.push({ key: "novo_dirigente_prebenda_desde", label: "Prebenda desde" });
    }

    return requiredFields
      .filter(({ key }) => isBlank(remanejamento[key]))
      .map(({ label }) => label)
      .slice(0, 8);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="h-[95vh] w-[calc(100vw-0.75rem)] max-w-6xl overflow-hidden p-3 sm:h-auto sm:max-h-[92vh] sm:p-6">
        <DialogHeader>
          <DialogTitle>Documentos da Igreja - {churchLabel}</DialogTitle>
          <DialogDescription>
            Preencha os dados de remanejamento, contrato e laudo da igreja selecionada.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(95vh-180px)] overflow-y-auto pr-1 sm:max-h-[72vh]">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="space-y-4">
            <TabsList className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
              <TabsTrigger value="remanejamento">Remanejamento</TabsTrigger>
              <TabsTrigger value="contrato">Contrato</TabsTrigger>
              <TabsTrigger value="laudo">Laudo</TabsTrigger>
            </TabsList>

            <Alert>
              <AlertDescription>
                {hierarchy.message ||
                  (hierarchy.requires_setorial_signature
                    ? "Esta igreja precisa da assinatura do Pastor Setorial."
                    : "Esta igreja está ligada diretamente à Estadual. Assinatura Setorial não é necessária.")}
              </AlertDescription>
            </Alert>

            <TabsContent value="remanejamento" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Status do documento</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      remStatus === "FINALIZADO" || remStatus === "GERADO"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : remStatus === "GERANDO"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                    }
                  >
                    {remStatus || "RASCUNHO"}
                  </Badge>
                  {remPdfUrl ? (
                    <Button type="button" variant="outline" onClick={() => window.open(remPdfUrl, "_blank")}>
                      Abrir documento
                    </Button>
                  ) : null}
                  {remFormHidden ? (
                    <Button type="button" variant="destructive" onClick={onDeleteRemanejamento} disabled={saving || loading}>
                      Excluir e refazer
                    </Button>
                  ) : null}
                </CardContent>
              </Card>

              {!remFormHidden ? (
                <>
                  <Card>
                    <CardHeader><CardTitle>Pastor Estadual</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Nome</Label><Input value={textValue(remanejamento.estadual_pastor_nome)} onChange={(e) => updateRem("estadual_pastor_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>CPF</Label><Input value={textValue(remanejamento.estadual_pastor_cpf)} onChange={(e) => updateRem("estadual_pastor_cpf", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={textValue(remanejamento.estadual_telefone)} onChange={(e) => updateRem("estadual_telefone", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Email</Label><Input value={textValue(remanejamento.estadual_email)} onChange={(e) => updateRem("estadual_email", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={textValue(remanejamento.estadual_cidade)} onChange={(e) => updateRem("estadual_cidade", e.target.value)} /></div>
                  <div className="space-y-1"><Label>UF</Label><Select value={textValue(remanejamento.estadual_uf)} onValueChange={(value) => updateRem("estadual_uf", value)}><SelectTrigger><SelectValue placeholder="Selecione a UF" /></SelectTrigger><SelectContent>{BRAZIL_UF_OPTIONS.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent></Select></div>
                    </CardContent>
                  </Card>

                  <Card>
                <CardHeader><CardTitle>Pastor Setorial (quando necessario)</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Nome</Label><Input value={textValue(remanejamento.setorial_pastor_nome)} onChange={(e) => updateRem("setorial_pastor_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>CPF</Label><Input value={textValue(remanejamento.setorial_pastor_cpf)} onChange={(e) => updateRem("setorial_pastor_cpf", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={textValue(remanejamento.setorial_telefone)} onChange={(e) => updateRem("setorial_telefone", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Email</Label><Input value={textValue(remanejamento.setorial_email)} onChange={(e) => updateRem("setorial_email", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={textValue(remanejamento.setorial_cidade)} onChange={(e) => updateRem("setorial_cidade", e.target.value)} /></div>
                  <div className="space-y-1"><Label>UF</Label><Select value={textValue(remanejamento.setorial_uf)} onValueChange={(value) => updateRem("setorial_uf", value)}><SelectTrigger><SelectValue placeholder="Selecione a UF" /></SelectTrigger><SelectContent>{BRAZIL_UF_OPTIONS.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent></Select></div>
                </CardContent>
                  </Card>

                  <Card>
                <CardHeader><CardTitle>Dados da Igreja e Financeiro</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Endereco</Label><Input value={textValue(remanejamento.igreja_endereco_atual)} onChange={(e) => updateRem("igreja_endereco_atual", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Numero</Label><Input value={textValue(remanejamento.igreja_numero)} onChange={(e) => updateRem("igreja_numero", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Bairro</Label><Input value={textValue(remanejamento.igreja_bairro)} onChange={(e) => updateRem("igreja_bairro", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={textValue(remanejamento.igreja_cidade)} onChange={(e) => updateRem("igreja_cidade", e.target.value)} /></div>
                  <div className="space-y-1"><Label>UF</Label><Select value={textValue(remanejamento.igreja_uf)} onValueChange={(value) => updateRem("igreja_uf", value)}><SelectTrigger><SelectValue placeholder="Selecione a UF" /></SelectTrigger><SelectContent>{BRAZIL_UF_OPTIONS.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent></Select></div>
                  <div className="space-y-1">
                    <Label>Porte da IPDA</Label>
                    <Select value={textValue(remanejamento.porte_igreja)} onValueChange={(value) => updateRem("porte_igreja", value)}>
                      <SelectTrigger><SelectValue placeholder="Selecione o porte" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="regional">Regional</SelectItem>
                        <SelectItem value="central">Central</SelectItem>
                        <SelectItem value="setorial">Setorial</SelectItem>
                        <SelectItem value="estadual">Estadual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Sobre o imovel</Label>
                    <Select value={textValue(remanejamento.sobre_imovel)} onValueChange={(value) => updateRem("sobre_imovel", value)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="propria">Propria</SelectItem>
                        <SelectItem value="alugada">Alugada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {textValue(remanejamento.sobre_imovel) === "alugada" ? (
                    <>
                      <div className="space-y-1"><Label>Contrato vence em</Label><Input type="date" value={textValue(remanejamento.contrato_vence_em)} onChange={(e) => updateRem("contrato_vence_em", e.target.value)} /></div>
                      <div className="space-y-1">
                        <Label>Valor Aluguel</Label>
                        <Input
                          inputMode="numeric"
                          value={textValue(remanejamento.valor_aluguel)}
                          onChange={(e) => updateRem("valor_aluguel", formatCurrencyBRL(e.target.value))}
                        />
                      </div>
                    </>
                  ) : null}
                  <div className="space-y-1"><Label>Possui escritura</Label><Select value={textValue(remanejamento.possui_escritura)} onValueChange={(value) => updateRem("possui_escritura", value)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Nao</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1"><Label>Comodato</Label><Select value={textValue(remanejamento.comodato)} onValueChange={(value) => updateRem("comodato", value)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Nao</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1">
                    <Label>Entradas Atuais</Label>
                    <Input
                      inputMode="numeric"
                      value={textValue(remanejamento.entradas_atuais)}
                      onChange={(e) => updateRem("entradas_atuais", formatCurrencyBRL(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Saidas</Label>
                    <Input
                      inputMode="numeric"
                      value={textValue(remanejamento.saidas)}
                      onChange={(e) => updateRem("saidas", formatCurrencyBRL(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Saldo</Label>
                    <Input
                      inputMode="numeric"
                      value={textValue(remanejamento.saldo)}
                      onChange={(e) => updateRem("saldo", formatCurrencyBRL(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1"><Label>Numero de membros</Label><Input value={textValue(remanejamento.numero_membros)} onChange={(e) => updateRem("numero_membros", e.target.value)} /></div>
                </CardContent>
                  </Card>

                  <Card>
                <CardHeader><CardTitle>Dirigente que Deixa a IPDA</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1 md:col-span-3">
                    <Label>Buscar dirigente (nome ou CPF)</Label>
                    <div className="flex gap-2">
                      <Input value={searchDirigenteSaida} onChange={(e) => setSearchDirigenteSaida(e.target.value)} placeholder="Digite nome ou CPF" />
                      <Button type="button" variant="outline" onClick={() => void handleSearchDirigenteSaida()} disabled={searchingSaida}>
                        {searchingSaida ? "Buscando..." : "Buscar"}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo ministerial</Label>
                    <Select value={textValue(remanejamento.dirigente_saida_tipo)} onValueChange={(value) => updateRem("dirigente_saida_tipo", value)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{MINISTER_ROLE_OPTIONS.map((role) => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Assumiu em</Label><Input type="date" value={textValue(remanejamento.dirigente_saida_data_assumiu)} onChange={(e) => updateRem("dirigente_saida_data_assumiu", e.target.value)} /></div>
                  <div className="space-y-1 md:col-span-3"><Label>Nome completo</Label><Input value={textValue(remanejamento.dirigente_saida_nome)} onChange={(e) => updateRem("dirigente_saida_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>RG</Label><Input value={textValue(remanejamento.dirigente_saida_rg)} onChange={(e) => updateRem("dirigente_saida_rg", e.target.value)} /></div>
                  <div className="space-y-1"><Label>CPF</Label><Input value={textValue(remanejamento.dirigente_saida_cpf)} onChange={(e) => updateRem("dirigente_saida_cpf", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={textValue(remanejamento.dirigente_saida_telefone)} onChange={(e) => updateRem("dirigente_saida_telefone", e.target.value)} /></div>
                </CardContent>
                  </Card>

                  <Card>
                <CardHeader><CardTitle>Novo Dirigente</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1 md:col-span-3">
                    <Label>Buscar novo dirigente (nome ou CPF)</Label>
                    <div className="flex gap-2">
                      <Input value={searchNovoDirigente} onChange={(e) => setSearchNovoDirigente(e.target.value)} placeholder="Digite nome ou CPF" />
                      <Button type="button" variant="outline" onClick={() => void handleSearchNovoDirigente()} disabled={searchingNovo}>
                        {searchingNovo ? "Buscando..." : "Buscar"}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo ministerial</Label>
                    <Select value={textValue(remanejamento.novo_dirigente_tipo)} onValueChange={(value) => updateRem("novo_dirigente_tipo", value)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{MINISTER_ROLE_OPTIONS.map((role) => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Data de batismo</Label><Input type="date" value={textValue(remanejamento.novo_dirigente_data_batismo)} onChange={(e) => updateRem("novo_dirigente_data_batismo", e.target.value)} /></div>
                  <div className="space-y-1 md:col-span-3"><Label>Nome completo</Label><Input value={textValue(remanejamento.novo_dirigente_nome)} onChange={(e) => updateRem("novo_dirigente_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>RG</Label><Input value={textValue(remanejamento.novo_dirigente_rg)} onChange={(e) => updateRem("novo_dirigente_rg", e.target.value)} /></div>
                  <div className="space-y-1"><Label>CPF</Label><Input value={textValue(remanejamento.novo_dirigente_cpf)} onChange={(e) => updateRem("novo_dirigente_cpf", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={textValue(remanejamento.novo_dirigente_telefone)} onChange={(e) => updateRem("novo_dirigente_telefone", e.target.value)} /></div>
                  <div className="space-y-1 md:col-span-3">
                    <Label>Reside a quantos KM da IPDA</Label>
                    <Input
                      value={textValue(remanejamento.novo_dirigente_distancia_km)}
                      onChange={(e) => updateRem("novo_dirigente_distancia_km", e.target.value.replace(/[^\d]/g, ""))}
                      onBlur={(e) => updateRem("novo_dirigente_distancia_km", formatKmValue(e.target.value))}
                      placeholder="Ex: 15"
                    />
                  </div>
                  <div className="space-y-1"><Label>Recebe prebenda</Label><Select value={textValue(remanejamento.novo_dirigente_recebe_prebenda)} onValueChange={(value) => updateRem("novo_dirigente_recebe_prebenda", value)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="sim">Sim</SelectItem><SelectItem value="nao">Nao</SelectItem></SelectContent></Select></div>
                  {textValue(remanejamento.novo_dirigente_recebe_prebenda) === "sim" ? (
                    <div className="space-y-1"><Label>Prebenda desde</Label><Input type="date" value={textValue(remanejamento.novo_dirigente_prebenda_desde)} onChange={(e) => updateRem("novo_dirigente_prebenda_desde", e.target.value)} /></div>
                  ) : null}
                </CardContent>
                  </Card>

                  <Card>
                <CardHeader><CardTitle>Motivo da Troca</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1"><Label>Motivo da troca</Label><Textarea value={textValue(remanejamento.motivo_troca)} onChange={(e) => updateRem("motivo_troca", e.target.value)} rows={4} /></div>
                </CardContent>
                  </Card>
                </>
              ) : null}
            </TabsContent>

            <TabsContent value="contrato" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Dados do Dirigente e Igreja</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Nome do dirigente</Label><Input value={textValue(contrato.dirigente_nome)} onChange={(e) => updateContrato("dirigente_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={textValue(contrato.dirigente_telefone)} onChange={(e) => updateContrato("dirigente_telefone", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Igreja</Label><Input value={textValue(contrato.dirigente_igreja)} onChange={(e) => updateContrato("dirigente_igreja", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Endereco</Label><Input value={textValue(contrato.igreja_endereco)} onChange={(e) => updateContrato("igreja_endereco", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Numero</Label><Input value={textValue(contrato.igreja_numero)} onChange={(e) => updateContrato("igreja_numero", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Bairro</Label><Input value={textValue(contrato.igreja_bairro)} onChange={(e) => updateContrato("igreja_bairro", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={textValue(contrato.igreja_cidade)} onChange={(e) => updateContrato("igreja_cidade", e.target.value)} /></div>
                  <div className="space-y-1"><Label>UF</Label><Select value={textValue(contrato.igreja_uf)} onValueChange={(value) => updateContrato("igreja_uf", value)}><SelectTrigger><SelectValue placeholder="Selecione a UF" /></SelectTrigger><SelectContent>{BRAZIL_UF_OPTIONS.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent></Select></div>
                  <div className="space-y-1"><Label>Central</Label><Input value={textValue(contrato.igreja_central)} onChange={(e) => updateContrato("igreja_central", e.target.value)} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Dados do Locador</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Nome</Label><Input value={textValue(contrato.locador_nome)} onChange={(e) => updateContrato("locador_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>CPF</Label><Input value={textValue(contrato.locador_cpf)} onChange={(e) => updateContrato("locador_cpf", e.target.value)} /></div>
                  <div className="space-y-1"><Label>RG</Label><Input value={textValue(contrato.locador_rg)} onChange={(e) => updateContrato("locador_rg", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Estado civil</Label><Input value={textValue(contrato.locador_estado_civil)} onChange={(e) => updateContrato("locador_estado_civil", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Endereco</Label><Input value={textValue(contrato.locador_endereco)} onChange={(e) => updateContrato("locador_endereco", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Numero</Label><Input value={textValue(contrato.locador_numero)} onChange={(e) => updateContrato("locador_numero", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Complemento</Label><Input value={textValue(contrato.locador_complemento)} onChange={(e) => updateContrato("locador_complemento", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Bairro</Label><Input value={textValue(contrato.locador_bairro)} onChange={(e) => updateContrato("locador_bairro", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={textValue(contrato.locador_cidade)} onChange={(e) => updateContrato("locador_cidade", e.target.value)} /></div>
                  <div className="space-y-1"><Label>UF</Label><Select value={textValue(contrato.locador_uf)} onValueChange={(value) => updateContrato("locador_uf", value)}><SelectTrigger><SelectValue placeholder="Selecione a UF" /></SelectTrigger><SelectContent>{BRAZIL_UF_OPTIONS.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}</SelectContent></Select></div>
                  <div className="space-y-1">
                    <Label>CEP</Label>
                    <Input
                      value={maskCep(textValue(contrato.locador_cep))}
                      onChange={(e) => updateContrato("locador_cep", e.target.value)}
                      onBlur={() => void autofillLocadorCep(true)}
                      placeholder="00000-000"
                    />
                    <p className="text-xs text-slate-500">{cepLoading ? "Buscando endereco..." : "Endereco preenchido automaticamente pelo CEP."}</p>
                  </div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={textValue(contrato.locador_telefone)} onChange={(e) => updateContrato("locador_telefone", e.target.value)} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Valores e Datas</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Valor aluguel</Label>
                    <Input
                      inputMode="numeric"
                      value={textValue(contrato.valor_aluguel)}
                      onChange={(e) => updateContrato("valor_aluguel", formatCurrencyBRL(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1"><Label>Valor por extenso</Label><Input value={textValue(contrato.valor_extenso)} onChange={(e) => updateContrato("valor_extenso", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Dia pagamento</Label><Input value={textValue(contrato.dia_pagamento)} onChange={(e) => updateContrato("dia_pagamento", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Dia</Label><Input value={textValue(contrato.contrato_dia)} onChange={(e) => updateContrato("contrato_dia", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Mes</Label><Input value={textValue(contrato.contrato_mes)} onChange={(e) => updateContrato("contrato_mes", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Ano</Label><Input value={textValue(contrato.contrato_ano)} onChange={(e) => updateContrato("contrato_ano", e.target.value)} /></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="laudo" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Dados do Laudo</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Nome locador</Label><Input value={textValue(laudo.locador_nome)} onChange={(e) => updateLaudo("locador_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Fiador</Label><Input value={textValue(laudo.fiador_nome)} onChange={(e) => updateLaudo("fiador_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Endereco igreja</Label><Input value={textValue(laudo.endereco_igreja)} onChange={(e) => updateLaudo("endereco_igreja", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade igreja</Label><Input value={textValue(laudo.cidade_igreja)} onChange={(e) => updateLaudo("cidade_igreja", e.target.value)} /></div>
                  <div className="space-y-1"><Label>TOTVS</Label><Input value={textValue(laudo.totvs || church?.totvs_id)} onChange={(e) => updateLaudo("totvs", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Dia</Label><Input value={textValue(laudo.dia)} onChange={(e) => updateLaudo("dia", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Mes</Label><Input value={textValue(laudo.mes)} onChange={(e) => updateLaudo("mes", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Ano</Label><Input value={textValue(laudo.ano)} onChange={(e) => updateLaudo("ano", e.target.value)} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Fotos do Laudo</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {([
                    ["foto_interna_1_url", "Imagem interna 1"],
                    ["foto_interna_2_url", "Imagem interna 2"],
                    ["foto_interna_3_url", "Imagem interna 3"],
                    ["foto_interna_4_url", "Imagem interna 4"],
                  ] as Array<[keyof ChurchLaudoDraft, string]>).map(([field, label]) => (
                    <div key={field} className="space-y-2 rounded-lg border p-3">
                      <Label>{label}</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadLaudoPhoto(file, field as "foto_interna_1_url" | "foto_interna_2_url" | "foto_interna_3_url" | "foto_interna_4_url");
                          e.currentTarget.value = "";
                        }}
                        disabled={busyPhoto === field}
                      />
                      {textValue(laudo[field]) ? <a className="text-xs text-blue-700 underline break-all" href={textValue(laudo[field])} target="_blank" rel="noreferrer">Abrir imagem enviada</a> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={onClose}>Fechar</Button>
          {!(activeTab === "remanejamento" && remFormHidden) ? (
            <Button className="w-full sm:w-auto" type="button" variant="outline" onClick={onSaveDraft} disabled={saving || loading}>
              {saving ? "Salvando..." : "Salvar rascunho"}
            </Button>
          ) : null}
          {!(activeTab === "remanejamento" && remFormHidden) ? (
            <Button className="w-full sm:w-auto" type="button" onClick={onSaveSystem} disabled={saving || loading}>
              {saving ? "Salvando..." : "Salvar no sistema"}
            </Button>
          ) : null}
          {activeTab !== "laudo" && !(activeTab === "remanejamento" && remFormHidden) ? (
            <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={onGeneratePdf} disabled={saving || loading}>
              {saving ? "Processando..." : "Gerar PDF"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
