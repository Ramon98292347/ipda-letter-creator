import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { deleteAnnouncement, listAnnouncements, upsertAnnouncement, type AnnouncementItem } from "@/services/saasService";
import { ArrowLeft, Trash2 } from "lucide-react";

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

export default function ConfiguracoesPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["announcements-config"],
    queryFn: () => listAnnouncements(10),
  });

  const ordered = useMemo(
    () => [...announcements].sort((a, b) => (a.position || 999) - (b.position || 999)),
    [announcements],
  );

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
      starts_at: "",
      ends_at: "",
      is_active: true,
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Informe o titulo.");
      return;
    }
    if (form.type === "text" && !form.body_text.trim()) {
      toast.error("Para tipo text, body_text e obrigatorio.");
      return;
    }
    if ((form.type === "image" || form.type === "video") && !form.media_url.trim()) {
      toast.error("Para image/video, media_url e obrigatorio.");
      return;
    }

    setSaving(true);
    try {
      await upsertAnnouncement({
        id: form.id || undefined,
        title: form.title.trim(),
        type: form.type,
        body_text: form.body_text.trim() || null,
        media_url: form.media_url.trim() || null,
        link_url: form.link_url.trim() || null,
        position: Number(form.position || "1"),
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        is_active: form.is_active,
      });
      toast.success(form.id ? "Divulgacao atualizada." : "Divulgacao criada.");
      setForm(initialForm);
      await refresh();
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("body_text")) {
        toast.error("O campo body_text e obrigatorio para tipo text.");
      } else if (msg.includes("media_url")) {
        toast.error("O campo media_url e obrigatorio para image/video.");
      } else {
        toast.error("Falha ao salvar divulgacao.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este anuncio?")) return;
    try {
      await deleteAnnouncement(id);
      toast.success("Anuncio excluido.");
      await refresh();
    } catch {
      toast.error("Falha ao excluir anuncio.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Configuracoes - Divulgacao</h1>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Label>Media URL</Label>
                  <Input value={form.media_url} onChange={(e) => setForm((p) => ({ ...p, media_url: e.target.value }))} />
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
                    <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fim</Label>
                    <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: Boolean(v) }))} />
                  <span className="text-sm text-slate-700">Ativo</span>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
                  <Button type="button" variant="outline" onClick={() => setForm(initialForm)}>Limpar</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Anuncios cadastrados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? <p className="text-sm text-slate-500">Carregando...</p> : null}
              {ordered.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-semibold text-slate-900">{item.position || "-"} - {item.title}</p>
                    <p className="text-xs text-slate-500">{item.type}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => edit(item)}>Editar</Button>
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
