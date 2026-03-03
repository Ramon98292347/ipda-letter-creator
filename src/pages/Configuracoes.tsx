import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Megaphone, Settings2 } from "lucide-react";
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
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export default function ConfiguracoesPage() {
  const nav = useNavigate();
  const { usuario, session } = useUser();
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
      let page = 1;
      const pageSize = 200;
      let total = 0;
      const rows: Awaited<ReturnType<typeof listMembers>>["workers"] = [];

      // Comentario: pagina todos os usuarios visiveis no escopo do logado.
      do {
        const res = await listMembers({
          page,
          page_size: pageSize,
          roles: roles as Array<"pastor" | "obreiro">,
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
    <div className="min-h-screen bg-[#f3f5f9] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Configuração</h1>
          <Button variant="outline" onClick={() => nav(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" /> Sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>
                <b>Usuário:</b> {usuario?.nome || "-"}
              </p>
              <p>
                <b>Perfil:</b> {usuario?.role || "-"}
              </p>
              <p>
                <b>Igreja ativa:</b> {session?.church_name || "-"}
              </p>
              <p>
                <b>TOTVS:</b> {session?.totvs_id || "-"}
              </p>
              <Button variant="outline" className="mt-2" onClick={() => nav("/divulgacao")}>
                <Megaphone className="mr-2 h-4 w-4" /> Abrir Divulgação
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" /> Exportação de Usuários
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Role para exportar</Label>
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as ExportRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos (pastor + obreiro)</SelectItem>
                    <SelectItem value="pastor">Somente pastor</SelectItem>
                    <SelectItem value="obreiro">Somente obreiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-500">
                A exportação usa os usuários permitidos no escopo da igreja ativa.
              </p>
              <Button onClick={exportarUsuariosCsv} disabled={loadingExport}>
                {loadingExport ? "Exportando..." : "Baixar CSV"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Assinatura e Carimbos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Assinatura</Label>
                <Input type="file" accept="image/*" onChange={(e) => setSignatureFile(e.target.files?.[0] || null)} />
                {stampUrls.signature_url ? (
                  <a href={stampUrls.signature_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                    Ver assinatura atual
                  </a>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Carimbo pastor</Label>
                <Input type="file" accept="image/*" onChange={(e) => setStampPastorFile(e.target.files?.[0] || null)} />
                {stampUrls.stamp_pastor_url ? (
                  <a href={stampUrls.stamp_pastor_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                    Ver carimbo pastor
                  </a>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Carimbo igreja</Label>
                <Input type="file" accept="image/*" onChange={(e) => setStampChurchFile(e.target.files?.[0] || null)} />
                {stampUrls.stamp_church_url ? (
                  <a href={stampUrls.stamp_church_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                    Ver carimbo igreja
                  </a>
                ) : null}
              </div>
            </div>

            <Button onClick={saveStamps} disabled={savingStamps}>
              {savingStamps ? "Salvando..." : "Salvar assinatura/carimbos"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
