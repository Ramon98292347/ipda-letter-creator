import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import type { ChurchInScopeItem, ChurchContratoDraft, ChurchHierarchySigner, ChurchLaudoDraft, ChurchRemanejamentoDraft } from "@/services/saasService";
import {
  generateChurchContratoPdf,
  generateChurchRemanejamentoPdf,
  getChurchContratoForm,
  getChurchRemanejamentoForm,
  saveChurchContratoDraft,
  saveChurchLaudoDraft,
  saveChurchRemanejamentoDraft,
  upsertChurchContrato,
  upsertChurchLaudo,
  upsertChurchRemanejamento,
} from "@/services/saasService";

type TabValue = "remanejamento" | "contrato" | "laudo";

const DOCS_BUCKET = "documentos_igrejas";

function textValue(v: unknown) {
  return String(v || "");
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
    setSaving(true);
    try {
      if (activeTab === "remanejamento") {
        await upsertChurchRemanejamento({ ...remanejamento, church_totvs_id: church.totvs_id });
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
    setSaving(true);
    try {
      if (activeTab === "remanejamento") {
        const res = await generateChurchRemanejamentoPdf(church.totvs_id);
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

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Documentos da Igreja - {churchLabel}</DialogTitle>
          <DialogDescription>
            Preencha os dados de remanejamento, contrato e laudo da igreja selecionada.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[72vh] overflow-y-auto pr-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="space-y-4">
            <TabsList className="grid grid-cols-3 w-full">
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
                <CardHeader><CardTitle>Pastor Estadual</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Nome</Label><Input value={textValue(remanejamento.estadual_pastor_nome)} onChange={(e) => updateRem("estadual_pastor_nome", e.target.value)} /></div>
                  <div className="space-y-1"><Label>CPF</Label><Input value={textValue(remanejamento.estadual_pastor_cpf)} onChange={(e) => updateRem("estadual_pastor_cpf", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Telefone</Label><Input value={textValue(remanejamento.estadual_telefone)} onChange={(e) => updateRem("estadual_telefone", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Email</Label><Input value={textValue(remanejamento.estadual_email)} onChange={(e) => updateRem("estadual_email", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={textValue(remanejamento.estadual_cidade)} onChange={(e) => updateRem("estadual_cidade", e.target.value)} /></div>
                  <div className="space-y-1"><Label>UF</Label><Input value={textValue(remanejamento.estadual_uf)} onChange={(e) => updateRem("estadual_uf", e.target.value)} /></div>
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
                  <div className="space-y-1"><Label>UF</Label><Input value={textValue(remanejamento.setorial_uf)} onChange={(e) => updateRem("setorial_uf", e.target.value)} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Dados da Igreja e Financeiro</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1"><Label>Endereco</Label><Input value={textValue(remanejamento.igreja_endereco_atual)} onChange={(e) => updateRem("igreja_endereco_atual", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Numero</Label><Input value={textValue(remanejamento.igreja_numero)} onChange={(e) => updateRem("igreja_numero", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Bairro</Label><Input value={textValue(remanejamento.igreja_bairro)} onChange={(e) => updateRem("igreja_bairro", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={textValue(remanejamento.igreja_cidade)} onChange={(e) => updateRem("igreja_cidade", e.target.value)} /></div>
                  <div className="space-y-1"><Label>UF</Label><Input value={textValue(remanejamento.igreja_uf)} onChange={(e) => updateRem("igreja_uf", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Porte da Igreja</Label><Input value={textValue(remanejamento.porte_igreja)} onChange={(e) => updateRem("porte_igreja", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Valor Aluguel</Label><Input value={textValue(remanejamento.valor_aluguel)} onChange={(e) => updateRem("valor_aluguel", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Entradas Atuais</Label><Input value={textValue(remanejamento.entradas_atuais)} onChange={(e) => updateRem("entradas_atuais", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Saidas</Label><Input value={textValue(remanejamento.saidas)} onChange={(e) => updateRem("saidas", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Saldo</Label><Input value={textValue(remanejamento.saldo)} onChange={(e) => updateRem("saldo", e.target.value)} /></div>
                  <div className="space-y-1"><Label>Numero de membros</Label><Input value={textValue(remanejamento.numero_membros)} onChange={(e) => updateRem("numero_membros", e.target.value)} /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Motivo da Troca e Resolucao</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1"><Label>Motivo da troca</Label><Textarea value={textValue(remanejamento.motivo_troca)} onChange={(e) => updateRem("motivo_troca", e.target.value)} rows={4} /></div>
                  <div className="space-y-1"><Label>Resolucao da diretoria</Label><Textarea value={textValue(remanejamento.resolucao_diretoria)} onChange={(e) => updateRem("resolucao_diretoria", e.target.value)} rows={4} /></div>
                </CardContent>
              </Card>
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
                  <div className="space-y-1"><Label>UF</Label><Input value={textValue(contrato.igreja_uf)} onChange={(e) => updateContrato("igreja_uf", e.target.value)} /></div>
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
                  <div className="space-y-1"><Label>UF</Label><Input value={textValue(contrato.locador_uf)} onChange={(e) => updateContrato("locador_uf", e.target.value)} /></div>
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
                  <div className="space-y-1"><Label>Valor aluguel</Label><Input value={textValue(contrato.valor_aluguel)} onChange={(e) => updateContrato("valor_aluguel", e.target.value)} /></div>
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

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar rascunho"}
          </Button>
          <Button type="button" onClick={onSaveSystem} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar no sistema"}
          </Button>
          {activeTab !== "laudo" ? (
            <Button type="button" variant="secondary" onClick={onGeneratePdf} disabled={saving || loading}>
              {saving ? "Processando..." : "Gerar PDF"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
