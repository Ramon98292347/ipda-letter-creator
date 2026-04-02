import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Loader2, Megaphone, Settings2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { listMembers, upsertStamps } from "@/services/saasService";
import { useUser } from "@/context/UserContext";
import { getFriendlyError } from "@/lib/error-map";
import { supabase } from "@/lib/supabase";
import { addAuditLog } from "@/lib/audit";

type ExportRole = "todos" | "pastor" | "obreiro";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (!text.includes(",") && !text.includes("\"") && !text.includes("\n")) return text;
  return `"${text.replace(/\"/g, "\"\"")}"`;
}

export default function ConfiguracoesPage() {
  const nav = useNavigate();
  const { usuario, session } = useUser();
  const isAdmin = String(usuario?.role || "").toLowerCase() === "admin";
  const [roleFilter, setRoleFilter] = useState<ExportRole>("todos");
  const [loadingExport, setLoadingExport] = useState(false);
  const [savingStamps, setSavingStamps] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [stampPastorFile, setStampPastorFile] = useState<File | null>(null);
  const [stampChurchFile, setStampChurchFile] = useState<File | null>(null);
  const [stampUrls, setStampUrls] = useState({
    signature_url: "",
    stamp_pastor_url: "",
    stamp_church_url: "",
  });

  async function exportarUsuariosCsv() {
    setLoadingExport(true);
    try {
      const roles = roleFilter === "todos" ? ["pastor", "obreiro"] : [roleFilter];
      const churchTotvsId = String(session?.totvs_id || "").trim() || undefined;
      let page = 1;
      const pageSize = 200;
      let total = 0;
      const rows: Awaited<ReturnType<typeof listMembers>>["workers"] = [];

      // Comentário: pagina todos os usuários visíveis no escopo do logado.
      do {
        const res = await listMembers({
          page,
          page_size: pageSize,
          roles: roles as Array<"pastor" | "obreiro">,
          church_totvs_id: churchTotvsId,
        });
        total = res.total || 0;
        rows.push(...res.workers);
        page += 1;
      } while (rows.length < total);

      const header = [
        "nome",
        "cpf",
        "role",
        "cargo_ministerial",
        "telefone",
        "email",
        "ativo",
        "totvs",
      ];
      const lines = rows.map((item) =>
        [
          csvEscape(item.full_name),
          csvEscape(item.cpf),
          csvEscape(item.role),
          csvEscape(item.minister_role),
          csvEscape(item.phone),
          csvEscape(item.email),
          csvEscape(item.is_active ? "sim" : "nao"),
          csvEscape(item.default_totvs_id),
        ].join(","),
      );
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const data = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `usuarios_${roleFilter}_${data}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída.");
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "generic"));
    } finally {
      setLoadingExport(false);
    }
  }

  async function exportarIgrejasCsv() {
    setLoadingExport(true);
    try {
      // Comentario: busca todas as igrejas do escopo do usuario logado
      const { data: igrejas, error } = await supabase
        .from("churches")
        .select("totvs_id, nome, parent_totvs_id, class, pastor_user_id, phone, email, address")
        .order("nome");

      if (error) throw error;
      if (!igrejas || igrejas.length === 0) {
        toast.info("Nenhuma igreja encontrada.");
        return;
      }

      const header = ["TOTVS", "Nome", "Classe", "Pai (TOTVS)", "Pastor (ID)", "Telefone", "Email", "Endereço"];
      const lines = (igrejas || []).map((item: any) =>
        [
          csvEscape(item.totvs_id),
          csvEscape(item.nome),
          csvEscape(item.class || "-"),
          csvEscape(item.parent_totvs_id || "-"),
          csvEscape(item.pastor_user_id || "-"),
          csvEscape(item.phone || "-"),
          csvEscape(item.email || "-"),
          csvEscape(item.address || "-"),
        ].join(","),
      );
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const data = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `igrejas_${data}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação de igrejas concluída.");
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "Erro ao exportar igrejas"));
    } finally {
      setLoadingExport(false);
    }
  }

  async function uploadStampFile(file: File, folder: "assinatura" | "carimbos/pastor" | "carimbos/igreja") {
    if (!supabase) throw new Error("supabase-not-configured");
    if (!file.type.startsWith("image/")) throw new Error("invalid-image");
    if (file.size > 10 * 1024 * 1024) throw new Error("stamp-file-too-large");

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `users/${folder}/${fileName}`;

    const { error } = await supabase.storage.from("assinat_carimbo").upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
      cacheControl: "3600",
    });
    if (error) throw new Error(`stamp_upload_failed: ${error.message || "erro de upload"}`);

    const { data } = supabase.storage.from("assinat_carimbo").getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveStamps() {
    if (usuario?.role !== "admin" && usuario?.role !== "pastor") {
      toast.error("Apenas pastor/admin pode salvar assinatura e carimbos.");
      return;
    }

    setSavingStamps(true);
    try {
      let signatureUrl = stampUrls.signature_url || null;
      let stampPastorUrl = stampUrls.stamp_pastor_url || null;
      let stampChurchUrl = stampUrls.stamp_church_url || null;

      if (signatureFile) signatureUrl = await uploadStampFile(signatureFile, "assinatura");
      if (stampPastorFile) stampPastorUrl = await uploadStampFile(stampPastorFile, "carimbos/pastor");
      if (stampChurchFile) stampChurchUrl = await uploadStampFile(stampChurchFile, "carimbos/igreja");

      await upsertStamps({
        signature_url: signatureUrl,
        stamp_pastor_url: stampPastorUrl,
        stamp_church_url: stampChurchUrl,
      });

      setStampUrls({
        signature_url: signatureUrl || "",
        stamp_pastor_url: stampPastorUrl || "",
        stamp_church_url: stampChurchUrl || "",
      });
      setSignatureFile(null);
      setStampPastorFile(null);
      setStampChurchFile(null);
      toast.success("Assinatura e carimbos salvos com sucesso.");
      addAuditLog("stamps_upserted", { by_role: usuario?.role || null });
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "generic"));
    } finally {
      setSavingStamps(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8fc] p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Configuração</h1>
              <p className="text-sm text-slate-600">Ajustes gerais do sistema, exportação e assinatura da igreja.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => nav("/divulgacao")} className="border-slate-300">
                <Megaphone className="mr-2 h-4 w-4" /> Ir para divulgação
              </Button>
              <Button variant="outline" onClick={() => nav(-1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-5 w-5 text-blue-600" /> Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <div className="flex items-center gap-3">
                {/* Comentario: avatar do usuario logado */}
                {usuario?.avatar_url ? (
                  <img src={usuario.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-200" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
                    {(usuario?.nome || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-slate-900">{usuario?.nome || usuario?.full_name || "-"}</p>
                  <p className="text-xs text-slate-500">{usuario?.role || "-"}</p>
                </div>
              </div>
              <p><b>Igreja ativa:</b> {isAdmin ? "Admin global (sem igreja fixa)" : (session?.church_name || "-")}</p>
              <p><b>TOTVS:</b> {isAdmin ? "-" : (session?.totvs_id || "-")}</p>
              {/* Comentario: botao para editar o cadastro do usuario logado */}
              <Button variant="outline" onClick={() => nav("/obreiro?editar=1")} className="mt-2 w-full border-blue-300 text-blue-700 hover:bg-blue-50">
                <UserCircle2 className="mr-2 h-4 w-4" /> Editar meu cadastro
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="h-5 w-5 text-blue-600" /> Exportação de usuários
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Perfil para exportar</Label>
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as ExportRole)}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Pastor + Obreiro</SelectItem>
                    <SelectItem value="pastor">Somente pastor</SelectItem>
                    <SelectItem value="obreiro">Somente obreiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500">A exportação usa os usuários permitidos no escopo da igreja ativa.</p>
              <Button onClick={exportarUsuariosCsv} disabled={loadingExport} className="bg-blue-600 hover:bg-blue-700">
                {loadingExport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {loadingExport ? "Exportando..." : "Baixar CSV"}
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="h-5 w-5 text-emerald-600" /> Exportação de Igreja
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-500">Exporte todas as igrejas do sistema em formato CSV com informações de hierarquia, pastor responsável e contato.</p>
              <Button onClick={exportarIgrejasCsv} disabled={loadingExport} className="bg-emerald-600 hover:bg-emerald-700 w-full">
                {loadingExport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {loadingExport ? "Exportando..." : "Baixar CSV de Igrejas"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Assinatura e carimbos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Comentario: aviso importante sobre formato das imagens */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <b>Importante:</b> As imagens devem ser <b>PNG com fundo transparente</b> (sem fundo).
              Tamanho recomendado: <b>largura entre 200px e 400px</b>.
              Imagens com fundo branco ou colorido vão aparecer com o fundo na carta.
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Assinatura</Label>
                <p className="text-[11px] text-slate-500">PNG sem fundo, ~300x130px</p>
                <Input className="h-11 rounded-xl border-slate-300 bg-slate-50" type="file" accept=".png,.webp" onChange={(e) => setSignatureFile(e.target.files?.[0] || null)} />
                {stampUrls.signature_url ? <a href={stampUrls.signature_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Ver assinatura atual</a> : null}
              </div>
              <div className="space-y-2">
                <Label>Carimbo pastor</Label>
                <p className="text-[11px] text-slate-500">PNG sem fundo, ~300x300px</p>
                <Input className="h-11 rounded-xl border-slate-300 bg-slate-50" type="file" accept=".png,.webp" onChange={(e) => setStampPastorFile(e.target.files?.[0] || null)} />
                {stampUrls.stamp_pastor_url ? <a href={stampUrls.stamp_pastor_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Ver carimbo pastor</a> : null}
              </div>
              <div className="space-y-2">
                <Label>Carimbo igreja</Label>
                <p className="text-[11px] text-slate-500">PNG sem fundo, ~300x300px</p>
                <Input className="h-11 rounded-xl border-slate-300 bg-slate-50" type="file" accept=".png,.webp" onChange={(e) => setStampChurchFile(e.target.files?.[0] || null)} />
                {stampUrls.stamp_church_url ? <a href={stampUrls.stamp_church_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Ver carimbo igreja</a> : null}
              </div>
            </div>

            <Button onClick={saveStamps} disabled={savingStamps} className="bg-blue-600 hover:bg-blue-700">
              {savingStamps ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {savingStamps ? "Salvando..." : "Salvar assinatura e carimbos"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
