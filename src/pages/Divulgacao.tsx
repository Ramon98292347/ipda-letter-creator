import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  deleteAnnouncement,
  listAnnouncements,
  upsertAnnouncement,
  type AnnouncementItem,
} from "@/services/saasService";
import { ArrowLeft, Trash2 } from "lucide-react";
import { getFriendlyError } from "@/lib/error-map";
import { addAuditLog } from "@/lib/audit";
import { supabase } from "@/lib/supabase";

type FormState = {
  id?: string;
  title: string;
  type: "text" | "image" | "video";
  body_text: string;
  media_url: string;
  link_url: string;
  position: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

const initialForm: FormState = {
  title: "",
  type: "text",
  body_text: "",
  media_url: "",
  link_url: "",
  position: "1",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

export default function DivulgacaoPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(initialForm);
  const [mediaSource, setMediaSource] = useState<"url" | "file">("url");
  const [pendingMediaFile, setPendingMediaFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  function toDateInputValue(value?: string | null) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function toStartAt(value: string) {
    return value ? `${value}T00:00:00` : null;
  }

  function toEndAt(value: string) {
    return value ? `${value}T23:59:59` : null;
  }

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["announcements-config"],
    queryFn: () => listAnnouncements(10),
  });

  const ordered = useMemo(() => [...announcements].sort((a, b) => (a.position || 999) - (b.position || 999)), [announcements]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["announcements-config"] });
    await queryClient.invalidateQueries({ queryKey: ["announcements-login"] });
  }

  function edit(item: AnnouncementItem) {
    setForm({
      id: item.id,
      title: item.title || "",
      type: item.type,
      body_text: item.body_text || "",
      media_url: item.media_url || "",
      link_url: item.link_url || "",
      position: String(item.position || 1),
      starts_at: toDateInputValue(item.starts_at),
      ends_at: toDateInputValue(item.ends_at),
      is_active: item.is_active !== false,
    });
    setMediaSource("url");
    setPendingMediaFile(null);
  }

  function onFileSelected(file: File | null) {
    if (!file) return;
    if (form.type === "image" && !file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (form.type === "video" && !file.type.startsWith("video/")) {
      toast.error("Selecione um arquivo de video.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande (max 20MB).");
      return;
    }
    setPendingMediaFile(file);
    setForm((p) => ({ ...p, media_url: "" }));
    toast.success("Arquivo pronto. Clique em Salvar para enviar.");
  }

  async function uploadAnnouncementMedia(file: File, type: "image" | "video") {
    if (!supabase) throw new Error("supabase-not-configured");

    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const folder = type === "video" ? "video" : "image";
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage.from("announcements").upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
      cacheControl: "3600",
    });

    if (error) throw new Error(error.message || "storage_upload_failed");

    const { data } = supabase.storage.from("announcements").getPublicUrl(path);
    return data.publicUrl || null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (!form.title.trim()) return toast.error("Informe o titulo.");
    if (form.type === "text" && !form.body_text.trim()) return toast.error("Para tipo text, body_text e obrigatorio.");
    if ((form.type === "image" || form.type === "video") && !form.media_url.trim() && !(mediaSource === "file" && pendingMediaFile)) {
      return toast.error("Para image/video, media_url e obrigatorio.");
    }
    if (form.starts_at && form.ends_at && form.ends_at < form.starts_at) return toast.error("Data fim deve ser maior ou igual a data inicio.");

    setSaving(true);
    try {
      let mediaUrlToSave = form.media_url.trim() || null;
      if (mediaSource === "file" && pendingMediaFile) {
        mediaUrlToSave = await uploadAnnouncementMedia(pendingMediaFile, form.type === "video" ? "video" : "image");
      }

      await upsertAnnouncement({
        id: form.id || undefined,
        title: form.title.trim(),
        type: form.type,
        body_text: form.body_text.trim() || null,
        media_url: mediaUrlToSave,
        link_url: form.link_url.trim() || null,
        position: Number(form.position || "1"),
        starts_at: toStartAt(form.starts_at),
        ends_at: toEndAt(form.ends_at),
        is_active: form.is_active,
      });

      toast.success(form.id ? "Divulgacao atualizada." : "Divulgacao criada.");
      addAuditLog("announcement_saved", { announcement_id: form.id || null, type: form.type });
      setForm(initialForm);
      setMediaSource("url");
      setPendingMediaFile(null);
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "announcements"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este anuncio?")) return;
    try {
      await deleteAnnouncement(id);
      toast.success("Anuncio excluido.");
      addAuditLog("announcement_deleted", { announcement_id: id });
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "announcements"));
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Divulgação</h1>
          <Button variant="outline" onClick={() => nav(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>{form.id ? "Editar anuncio" : "Novo anuncio"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={submit}>
                <div className="space-y-1">
                  <Label>Titulo</Label>
                  <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                </div>

                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as "text" | "image" | "video" }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="image">image</SelectItem>
                      <SelectItem value="video">video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Texto</Label>
                  <Input value={form.body_text} onChange={(e) => setForm((p) => ({ ...p, body_text: e.target.value }))} />
                </div>

                <div className="space-y-1">
                  <Label>Midia (URL ou arquivo)</Label>
                  <div className="mb-2 flex gap-2">
                    <Button
                      type="button"
                      variant={mediaSource === "url" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setMediaSource("url");
                        setPendingMediaFile(null);
                      }}
                    >
                      URL
                    </Button>
                    <Button type="button" variant={mediaSource === "file" ? "default" : "outline"} size="sm" onClick={() => setMediaSource("file")}>
                      Importar arquivo
                    </Button>
                  </div>

                  {mediaSource === "url" ? (
                    <Input value={form.media_url ?? ""} onChange={(e) => setForm((p) => ({ ...p, media_url: e.target.value }))} placeholder="https://..." />
                  ) : (
                    <div className="space-y-1">
                      <input
                        type="file"
                        accept={form.type === "video" ? "video/*" : "image/*"}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium"
                        onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
                      />
                      <p className="text-xs text-slate-500">{pendingMediaFile ? `Arquivo selecionado: ${pendingMediaFile.name}` : "Nenhum arquivo selecionado."}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Link URL</Label>
                  <Input value={form.link_url} onChange={(e) => setForm((p) => ({ ...p, link_url: e.target.value }))} />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Posicao</Label>
                    <Input type="number" value={form.position} onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Inicio</Label>
                    <Input type="date" value={form.starts_at} onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fim</Label>
                    <Input type="date" value={form.ends_at} onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: Boolean(v) }))} />
                  <span className="text-sm text-slate-700">Ativo</span>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setForm(initialForm);
                      setMediaSource("url");
                      setPendingMediaFile(null);
                    }}
                  >
                    Limpar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Anuncios cadastrados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                </div>
              ) : null}

              {ordered.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.position || "-"} - {item.title}
                    </p>
                    <p className="text-xs text-slate-500">{item.type}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => edit(item)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => remove(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {!isLoading && !ordered.length ? <p className="text-sm text-slate-500">Sem anuncios.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
