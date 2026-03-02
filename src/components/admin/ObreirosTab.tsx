import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, PlusCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { listMembers, resetWorkerPassword, setWorkerActive, upsertWorkerByPastor, type UserListItem } from "@/services/saasService";
import { getFriendlyError } from "@/lib/error-map";
import { addAuditLog } from "@/lib/audit";
import { supabase } from "@/lib/supabase";

function normalizeCpf(v: string) {
  return (v || "").replace(/\D/g, "").slice(0, 11);
}

function maskCpf(v: string) {
  const d = normalizeCpf(v);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

type WorkerForm = {
  id?: string;
  cpf: string;
  full_name: string;
  minister_role: string;
  phone: string;
  email: string;
  birth_date: string;
  avatar_url: string;
  cep: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  is_active: boolean;
};

const initialForm: WorkerForm = {
  cpf: "",
  full_name: "",
  minister_role: "",
  phone: "",
  email: "",
  birth_date: "",
  avatar_url: "",
  cep: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
  is_active: true,
};

const ministerRoleOptions = ["Pastor", "Presbitero", "Diacono", "Obreiro", "Membro"];

export function ObreirosTab({ activeTotvsId }: { activeTotvsId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [ministerRole, setMinisterRole] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WorkerForm>(initialForm);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

  const [openResetModal, setOpenResetModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["workers", search, ministerRole, activeFilter, page, pageSize],
    queryFn: () =>
      listMembers({
        search: search || undefined,
        minister_role: ministerRole === "all" ? undefined : ministerRole,
        is_active: activeFilter === "all" ? undefined : activeFilter === "active",
        roles: ["pastor", "obreiro"],
        page,
        page_size: pageSize,
      }),
  });

  const workers = data?.workers || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => w.minister_role && set.add(w.minister_role));
    return Array.from(set.values()).sort();
  }, [workers]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["workers"] });
    await queryClient.invalidateQueries({ queryKey: ["pastor-obreiros"] });
    await queryClient.invalidateQueries({ queryKey: ["pastor-metrics"] });
  }

  function openNew() {
    setForm(initialForm);
    setPendingAvatarFile(null);
    setOpenModal(true);
  }

  function openEdit(worker: UserListItem) {
    setForm({
      id: String(worker.id),
      cpf: worker.cpf || "",
      full_name: worker.full_name,
      minister_role: worker.minister_role || "",
      phone: worker.phone || "",
      email: worker.email || "",
      birth_date: "",
      avatar_url: "",
      cep: "",
      address_street: "",
      address_number: "",
      address_complement: "",
      address_neighborhood: "",
      address_city: "",
      address_state: "",
      is_active: worker.is_active !== false,
    });
    setPendingAvatarFile(null);
    setOpenModal(true);
  }

  function openResetPassword(worker: UserListItem) {
    setSelectedWorker(worker);
    setNewPassword("");
    setOpenResetModal(true);
  }

  async function lookupCep() {
    const cep = form.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      toast.error("CEP invalido.");
      return;
    }
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data?.erro) throw new Error("cep-not-found");
      setForm((prev) => ({
        ...prev,
        address_street: data.logradouro || prev.address_street,
        address_neighborhood: data.bairro || prev.address_neighborhood,
        address_city: data.localidade || prev.address_city,
        address_state: data.uf || prev.address_state,
      }));
      toast.success("Endereco preenchido.");
    } catch {
      toast.error("Nao foi possivel buscar o CEP.");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!activeTotvsId) {
      toast.error("Igreja ativa nao encontrada.");
      return;
    }
    if (normalizeCpf(form.cpf).length !== 11) {
      toast.error("CPF invalido.");
      return;
    }
    if (!form.full_name.trim()) {
      toast.error("Nome completo e obrigatorio.");
      return;
    }
    if (!form.minister_role.trim()) {
      toast.error("Cargo ministerial e obrigatorio.");
      return;
    }

    setSaving(true);
    try {
      let avatarUrlToSave = form.avatar_url || undefined;
      if (pendingAvatarFile) {
        if (!supabase) throw new Error("supabase_not_configured");
        const ext = (pendingAvatarFile.name.split(".").pop() || "png").toLowerCase();
        const path = `users/${normalizeCpf(form.cpf)}.${ext}`;
        const { error } = await supabase.storage.from("avatars").upload(path, pendingAvatarFile, {
          upsert: true,
          contentType: pendingAvatarFile.type || undefined,
          cacheControl: "3600",
        });
        if (error) {
          const msg = [error.message, (error as any)?.statusCode, (error as any)?.error].filter(Boolean).join(" | ");
          throw new Error(msg || "avatar_upload_failed");
        }
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrlToSave = data?.publicUrl || undefined;
      }

      await upsertWorkerByPastor({
        id: form.id,
        active_totvs_id: activeTotvsId,
        cpf: form.cpf,
        full_name: form.full_name,
        minister_role: form.minister_role,
        phone: form.phone || undefined,
        email: form.email || undefined,
        birth_date: form.birth_date || undefined,
        avatar_url: avatarUrlToSave,
        cep: form.cep || undefined,
        address_street: form.address_street || undefined,
        address_number: form.address_number || undefined,
        address_complement: form.address_complement || undefined,
        address_neighborhood: form.address_neighborhood || undefined,
        address_city: form.address_city || undefined,
        address_state: form.address_state || undefined,
        is_active: form.is_active,
        password: null,
      });
      toast.success(form.id ? "Obreiro atualizado." : "Obreiro cadastrado.");
      addAuditLog("worker_toggled", { worker_id: form.id || null, action: form.id ? "updated" : "created" });
      setPendingAvatarFile(null);
      setOpenModal(false);
      await refresh();
    } catch (err: any) {
      toast.error(getFriendlyError(err, "workers"));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(worker: UserListItem) {
    const next = worker.is_active === false;
    if (!window.confirm(next ? "Tem certeza que deseja ativar este obreiro?" : "Tem certeza que deseja desativar este obreiro?")) return;
    try {
      await setWorkerActive(String(worker.id), next);
      toast.success(next ? "Obreiro ativado." : "Obreiro desativado.");
      addAuditLog("worker_toggled", { worker_id: String(worker.id), is_active: next });
      await refresh();
    } catch (err: any) {
      toast.error(getFriendlyError(err, "workers"));
    }
  }

  async function confirmResetPassword() {
    if (!selectedWorker) return;
    if (newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setResetting(true);
    try {
      await resetWorkerPassword({
        cpf: normalizeCpf(selectedWorker.cpf || ""),
        user_id: String(selectedWorker.id),
        new_password: newPassword,
      });
      toast.success("Senha resetada com sucesso.");
      addAuditLog("worker_reset_password", { worker_id: String(selectedWorker.id) });
      try {
        await navigator.clipboard.writeText(newPassword);
        toast.success("Senha copiada para a area de transferencia.");
      } catch {
        // optional
      }
      setOpenResetModal(false);
      setSelectedWorker(null);
      setNewPassword("");
    } catch (err: any) {
      toast.error(getFriendlyError(err, "workers"));
    } finally {
      setResetting(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setMinisterRole("all");
    setActiveFilter("all");
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Membros cadastrados</CardTitle>
          <Button onClick={openNew}><PlusCircle className="mr-2 h-4 w-4" /> Novo Obreiro</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="w-full bg-transparent py-2 text-sm outline-none"
                placeholder="Buscar nome/cpf..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select value={ministerRole} onValueChange={(v) => { setMinisterRole(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos cargos</SelectItem>
                {roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v as "all" | "active" | "inactive"); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Ativo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={resetFilters}>Resetar filtros</Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-[220px_150px_160px_160px_130px_100px_1fr] border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <span>Nome</span>
                <span>CPF</span>
                <span>Telefone</span>
                <span>Cargo</span>
                <span>Tipo</span>
                <span>Ativo</span>
                <span>Acoes</span>
              </div>
              {isLoading ? <div className="px-4 py-4 text-sm text-slate-500">Carregando...</div> : null}
              {!isLoading && workers.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">Nenhum membro encontrado.</div> : null}
              {workers.map((w) => (
                <div key={w.id} className="grid grid-cols-[220px_150px_160px_160px_130px_100px_1fr] items-center border-b px-4 py-3 text-sm">
                  <span className="truncate">{w.full_name}</span>
                  <span>{maskCpf(w.cpf || "")}</span>
                  <span>{w.phone || "-"}</span>
                  <span>{w.minister_role || "-"}</span>
                  <span className="capitalize">{w.role || "-"}</span>
                  <span>
                    <span className={`rounded-full px-2 py-1 text-xs ${w.is_active === false ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {w.is_active === false ? "Nao" : "Sim"}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {w.role === "obreiro" ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openEdit(w)}>Editar</Button>
                        <Button size="sm" variant="secondary" onClick={() => openResetPassword(w)}>Resetar senha</Button>
                        <Button size="sm" variant={w.is_active === false ? "default" : "destructive"} onClick={() => toggle(w)}>
                          {w.is_active === false ? "Ativar" : "Excluir"}
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Somente visualizacao</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Total: {total}</p>
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="text-sm">Pagina {page} / {totalPages}</span>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Proxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Obreiro" : "Novo Obreiro"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={save}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>CPF *</Label>
                <Input value={maskCpf(form.cpf)} onChange={(e) => setForm((p) => ({ ...p, cpf: normalizeCpf(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Nome completo *</Label>
                <Input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Cargo ministerial *</Label>
                <Select value={form.minister_role || ""} onValueChange={(v) => setForm((p) => ({ ...p, minister_role: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ministerRoleOptions.map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Nascimento</Label>
                <Input type="date" value={form.birth_date} onChange={(e) => setForm((p) => ({ ...p, birth_date: e.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Foto</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("avatar-upload-input")?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" /> Adicionar foto
                  </Button>
                  <input
                    id="avatar-upload-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const inputEl = e.currentTarget;
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!file.type.startsWith("image/")) {
                        toast.error("Selecione um arquivo de imagem.");
                        if (inputEl) inputEl.value = "";
                        return;
                      }
                      setPendingAvatarFile(file);
                      setForm((p) => ({ ...p, avatar_url: "" }));
                      toast.success("Foto selecionada. Clique em Salvar para cadastrar.");
                      if (inputEl) inputEl.value = "";
                    }}
                  />
                  {pendingAvatarFile ? (
                    <span className="text-xs text-emerald-700">Arquivo pronto: {pendingAvatarFile.name}</span>
                  ) : null}
                  {form.avatar_url ? (
                    <a href={form.avatar_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                      Ver foto atual
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">Nenhuma foto enviada.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input value={form.cep} onChange={(e) => setForm((p) => ({ ...p, cep: e.target.value }))} />
              </div>
              <Button type="button" variant="outline" className="self-end" onClick={lookupCep}>Buscar CEP</Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Rua</Label><Input value={form.address_street} onChange={(e) => setForm((p) => ({ ...p, address_street: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Numero</Label><Input value={form.address_number} onChange={(e) => setForm((p) => ({ ...p, address_number: e.target.value }))} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Complemento</Label><Input value={form.address_complement} onChange={(e) => setForm((p) => ({ ...p, address_complement: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Bairro</Label><Input value={form.address_neighborhood} onChange={(e) => setForm((p) => ({ ...p, address_neighborhood: e.target.value }))} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Cidade</Label><Input value={form.address_city} onChange={(e) => setForm((p) => ({ ...p, address_city: e.target.value }))} /></div>
              <div className="space-y-1"><Label>UF</Label><Input value={form.address_state} onChange={(e) => setForm((p) => ({ ...p, address_state: e.target.value }))} /></div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              <Label htmlFor="is-active">Ativo</Label>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>Cancelar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openResetModal}
        onOpenChange={(next) => {
          setOpenResetModal(next);
          if (!next) {
            setSelectedWorker(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resetar senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p><span className="font-semibold">Nome:</span> {selectedWorker?.full_name || "-"}</p>
              <p><span className="font-semibold">CPF:</span> {selectedWorker?.cpf ? maskCpf(selectedWorker.cpf) : "-"}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimo 8 caracteres"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setOpenResetModal(false);
                  setSelectedWorker(null);
                  setNewPassword("");
                }}
                disabled={resetting}
              >
                Cancelar
              </Button>
              <Button onClick={confirmResetPassword} disabled={resetting}>
                {resetting ? "Resetando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
