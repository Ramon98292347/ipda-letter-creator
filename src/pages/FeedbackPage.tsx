import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/context/UserContext";
import {
  listChurchesInScope,
  listMembers,
  listUserFeedback,
  sendAdminCommunication,
  submitUserFeedback,
  updateUserFeedbackStatus,
  type ChurchInScopeItem,
  type UserListItem,
  type UserFeedbackStatus,
} from "@/services/saasService";

type RecommendLevel = "SIM" | "TALVEZ" | "NAO";

type FeedbackFormState = {
  usability_rating: string;
  speed_rating: string;
  stability_rating: string;
  overall_rating: string;
  recommend_level: RecommendLevel | "";
  primary_need: string;
  improvement_notes: string;
  contact_allowed: boolean;
};

type CommFormState = {
  title: string;
  body: string;
  url: string;
};

const emptyForm: FeedbackFormState = {
  usability_rating: "",
  speed_rating: "",
  stability_rating: "",
  overall_rating: "",
  recommend_level: "",
  primary_need: "",
  improvement_notes: "",
  contact_allowed: false,
};

const emptyCommForm: CommFormState = {
  title: "",
  body: "",
  url: "/",
};

const statusOptions: Array<{ value: UserFeedbackStatus; label: string }> = [
  { value: "NOVO", label: "Novo" },
  { value: "EM_ANALISE", label: "Em analise" },
  { value: "CONCLUIDO", label: "Concluido" },
  { value: "ARQUIVADO", label: "Arquivado" },
];

function parseRoleMode(role: string | null | undefined): "admin" | "pastor" | "obreiro" | "secretario" | "financeiro" {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "admin";
  if (value === "pastor") return "pastor";
  if (value === "secretario") return "secretario";
  if (value === "financeiro") return "financeiro";
  return "obreiro";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("pt-BR");
}

function dashboardRouteByRole(role: string | null | undefined) {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "/admin/dashboard";
  if (value === "pastor" || value === "secretario") return "/pastor/dashboard";
  if (value === "financeiro") return "/financeiro/dashboard";
  return "/obreiro";
}

export default function FeedbackPage() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { usuario } = useUser();
  const roleMode = parseRoleMode(usuario?.role);
  const isAdmin = roleMode === "admin";
  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState<FeedbackFormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<"ALL" | UserFeedbackStatus>("ALL");
  const [search, setSearch] = useState("");
  const [commForm, setCommForm] = useState<CommFormState>(emptyCommForm);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserListItem[]>([]);
  const [churchTotvsFilter, setChurchTotvsFilter] = useState("");
  const [churchClassFilter, setChurchClassFilter] = useState("all");
  const [selectedChurches, setSelectedChurches] = useState<ChurchInScopeItem[]>([]);

  useEffect(() => {
    if (searchParams.get("open") !== "1") return;
    setOpenForm(true);
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const feedbackQuery = useQuery({
    queryKey: ["admin-feedback", statusFilter, search],
    queryFn: () =>
      listUserFeedback({
        page: 1,
        page_size: 50,
        status: statusFilter,
        search: search.trim() || undefined,
      }),
    enabled: isAdmin,
  });

  const userSuggestionsQuery = useQuery({
    queryKey: ["admin-feedback-user-suggestions", userSearch],
    queryFn: async () => {
      const data = await listMembers({ page: 1, page_size: 15, search: userSearch.trim() });
      return data.workers || [];
    },
    enabled: isAdmin && userSearch.trim().length >= 2,
  });

  const churchesQuery = useQuery({
    queryKey: ["admin-feedback-churches"],
    queryFn: () => listChurchesInScope(1, 3000),
    enabled: isAdmin,
  });

  const submitMutation = useMutation({
    mutationFn: submitUserFeedback,
    onSuccess: () => {
      toast.success("Feedback enviado. Obrigado pela sugestao.");
      setForm(emptyForm);
      setOpenForm(false);
      void queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
      nav(dashboardRouteByRole(usuario?.role), { replace: true });
    },
    onError: (err) => {
      toast.error(String((err as Error)?.message || "Nao foi possivel enviar seu feedback."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateUserFeedbackStatus,
    onSuccess: () => {
      toast.success("Status atualizado.");
      void queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
    onError: () => toast.error("Nao foi possivel atualizar o status."),
  });

  const sendCommMutation = useMutation({
    mutationFn: sendAdminCommunication,
    onSuccess: (res) => {
      toast.success(`Comunicado enviado. Entregues: ${Number(res.sent || 0)} | Falhas: ${Number(res.failed || 0)}`);
      setCommForm(emptyCommForm);
      setSelectedUsers([]);
      setSelectedChurches([]);
      setUserSearch("");
    },
    onError: (err) => toast.error(String((err as Error)?.message || "Nao foi possivel enviar a comunicacao.")),
  });

  const averageRating = useMemo(() => {
    const items = feedbackQuery.data?.feedback || [];
    if (!items.length) return 0;
    const total = items.reduce((acc, item) => acc + Number(item.overall_rating || 0), 0);
    return Math.round((total / items.length) * 10) / 10;
  }, [feedbackQuery.data?.feedback]);

  const selectedUserIds = useMemo(() => selectedUsers.map((u) => String(u.id || "")).filter(Boolean), [selectedUsers]);
  const selectedChurchIds = useMemo(() => selectedChurches.map((c) => String(c.totvs_id || "")).filter(Boolean), [selectedChurches]);
  const churchClassOptions = useMemo(() => {
    const set = new Set<string>();
    for (const church of churchesQuery.data || []) {
      const value = String(church.church_class || "").trim().toLowerCase();
      if (value) set.add(value);
    }
    return Array.from(set.values()).sort();
  }, [churchesQuery.data]);
  const filteredChurches = useMemo(() => {
    const q = churchTotvsFilter.trim().toLowerCase();
    return (churchesQuery.data || []).filter((church) => {
      const totvs = String(church.totvs_id || "").toLowerCase();
      const cls = String(church.church_class || "").toLowerCase();
      if (churchClassFilter !== "all" && cls !== churchClassFilter) return false;
      if (q && !totvs.includes(q)) return false;
      return true;
    });
  }, [churchesQuery.data, churchTotvsFilter, churchClassFilter]);

  function submitForm() {
    if (!form.usability_rating || !form.speed_rating || !form.stability_rating || !form.overall_rating || !form.recommend_level) {
      toast.error("Preencha todas as perguntas obrigatorias.");
      return;
    }
    submitMutation.mutate({
      usability_rating: Number(form.usability_rating),
      speed_rating: Number(form.speed_rating),
      stability_rating: Number(form.stability_rating),
      overall_rating: Number(form.overall_rating),
      recommend_level: form.recommend_level,
      primary_need: form.primary_need.trim() || undefined,
      improvement_notes: form.improvement_notes.trim() || undefined,
      contact_allowed: form.contact_allowed,
    });
  }

  function addSelectedUser(user: UserListItem) {
    const id = String(user.id || "").trim();
    if (!id) return;
    setSelectedUsers((prev) => (prev.some((item) => String(item.id) === id) ? prev : [...prev, user]));
  }

  function removeSelectedUser(id: string) {
    setSelectedUsers((prev) => prev.filter((item) => String(item.id) !== String(id)));
  }

  function addSelectedChurch(church: ChurchInScopeItem) {
    const id = String(church.totvs_id || "").trim();
    if (!id) return;
    setSelectedChurches((prev) => (prev.some((item) => String(item.totvs_id) === id) ? prev : [...prev, church]));
  }

  function removeSelectedChurch(totvsId: string) {
    setSelectedChurches((prev) => prev.filter((item) => String(item.totvs_id) !== String(totvsId)));
  }

  function submitCommunication() {
    const title = commForm.title.trim();
    const body = commForm.body.trim();
    const totvs_ids = selectedChurchIds;

    if (!title || !body) {
      toast.error("Informe titulo e mensagem do comunicado.");
      return;
    }
    if (selectedUserIds.length === 0 && totvs_ids.length === 0) {
      toast.error("Selecione usuarios ou igrejas para enviar.");
      return;
    }

    sendCommMutation.mutate({
      title,
      body,
      url: commForm.url.trim() || "/",
      user_ids: selectedUserIds,
      totvs_ids,
      data: { source: "feedback-page-admin" },
    });
  }

  return (
    <ManagementShell roleMode={roleMode}>
      <div className="space-y-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Pesquisa e Feedback
            </CardTitle>
            <Dialog open={openForm} onOpenChange={setOpenForm}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Send className="h-4 w-4" />
                  Enviar Feedback
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Formulario de feedback</DialogTitle>
                  <DialogDescription>
                    Responda rapido e conte suas sugestoes para melhorarmos o sistema.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Facilidade de uso (1-5)</Label>
                    <Select value={form.usability_rating} onValueChange={(v) => setForm((p) => ({ ...p, usability_rating: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={`u-${n}`} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Velocidade do sistema (1-5)</Label>
                    <Select value={form.speed_rating} onValueChange={(v) => setForm((p) => ({ ...p, speed_rating: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={`s-${n}`} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Estabilidade (1-5)</Label>
                    <Select value={form.stability_rating} onValueChange={(v) => setForm((p) => ({ ...p, stability_rating: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={`st-${n}`} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Satisfacao geral (1-5)</Label>
                    <Select value={form.overall_rating} onValueChange={(v) => setForm((p) => ({ ...p, overall_rating: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={`o-${n}`} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Voce recomendaria o sistema?</Label>
                  <Select value={form.recommend_level} onValueChange={(v: RecommendLevel) => setForm((p) => ({ ...p, recommend_level: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SIM">Sim</SelectItem>
                      <SelectItem value="TALVEZ">Talvez</SelectItem>
                      <SelectItem value="NAO">Nao</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Qual parte voce mais usa?</Label>
                  <Input
                    value={form.primary_need}
                    onChange={(e) => setForm((p) => ({ ...p, primary_need: e.target.value }))}
                    placeholder="Ex.: Cartas, Membros, Financeiro..."
                  />
                </div>

                <div className="space-y-1">
                  <Label>Observacoes e melhorias</Label>
                  <Textarea
                    rows={5}
                    value={form.improvement_notes}
                    onChange={(e) => setForm((p) => ({ ...p, improvement_notes: e.target.value }))}
                    placeholder="Descreva sua sugestao, dificuldade ou melhoria."
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.contact_allowed}
                    onChange={(e) => setForm((p) => ({ ...p, contact_allowed: e.target.checked }))}
                  />
                  Pode entrar em contato comigo para detalhes
                </label>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
                  <Button onClick={submitForm} disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? "Enviando..." : "Enviar Feedback"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              Sempre que quiser, abra o formulario e mande sugestoes de melhoria. O time admin recebe para acompanhamento.
            </p>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Comunicado aos Usuarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Titulo do comunicado</Label>
                  <Input
                    value={commForm.title}
                    onChange={(e) => setCommForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Ex.: Nova atualizacao do sistema"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    rows={4}
                    value={commForm.body}
                    onChange={(e) => setCommForm((p) => ({ ...p, body: e.target.value }))}
                    placeholder="Mensagem que o usuario recebera na notificacao."
                  />
                </div>
                <div className="space-y-1">
                  <Label>URL ao clicar</Label>
                  <Input
                    value={commForm.url}
                    onChange={(e) => setCommForm((p) => ({ ...p, url: e.target.value }))}
                    placeholder="/"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Classificacao da igreja</Label>
                  <Select value={churchClassFilter} onValueChange={setChurchClassFilter}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {churchClassOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Buscar igrejas destino por TOTVS</Label>
                <Input
                  value={churchTotvsFilter}
                  onChange={(e) => setChurchTotvsFilter(e.target.value)}
                  placeholder="Digite o codigo TOTVS"
                />
                <div className="max-h-48 overflow-auto rounded-md border">
                  {filteredChurches.map((church) => (
                    <button
                      key={`church-${church.totvs_id}`}
                      type="button"
                      className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => addSelectedChurch(church)}
                    >
                      <span className="text-sm">{church.totvs_id} - {church.church_name}</span>
                      <span className="text-xs text-slate-500">{church.church_class || "-"}</span>
                    </button>
                  ))}
                  {!churchesQuery.isLoading && filteredChurches.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-500">Nenhuma igreja encontrada.</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Buscar usuarios por sugestao</Label>
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Digite nome, cpf ou telefone"
                />
                {userSearch.trim().length >= 2 ? (
                  <div className="max-h-48 overflow-auto rounded-md border">
                    {(userSuggestionsQuery.data || []).map((user) => (
                      <button
                        key={String(user.id)}
                        type="button"
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => addSelectedUser(user)}
                      >
                        <span className="text-sm">
                          {user.full_name} {user.cpf ? `- ${user.cpf}` : ""}
                        </span>
                        <span className="text-xs text-slate-500">{user.default_totvs_id || "-"}</span>
                      </button>
                    ))}
                    {!userSuggestionsQuery.isLoading && (userSuggestionsQuery.data || []).length === 0 ? (
                      <p className="px-3 py-2 text-sm text-slate-500">Nenhum usuario encontrado.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {selectedUsers.length > 0 ? (
                <div className="rounded-md border p-2">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Usuarios selecionados</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedUsers.map((user) => (
                      <Button
                        key={`sel-${user.id}`}
                        variant="outline"
                        size="sm"
                        onClick={() => removeSelectedUser(String(user.id))}
                      >
                        {user.full_name}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedChurches.length > 0 ? (
                <div className="rounded-md border p-2">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Igrejas selecionadas</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedChurches.map((church) => (
                      <Button
                        key={`sel-church-${church.totvs_id}`}
                        variant="outline"
                        size="sm"
                        onClick={() => removeSelectedChurch(String(church.totvs_id))}
                      >
                        {church.totvs_id} - {church.church_name}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button onClick={submitCommunication} disabled={sendCommMutation.isPending}>
                  {sendCommMutation.isPending ? "Enviando..." : "Enviar Comunicado"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {isAdmin ? (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Feedbacks Recebidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por usuario ou observacao" />
                <Select value={statusFilter} onValueChange={(v: "ALL" | UserFeedbackStatus) => setStatusFilter(v)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Media geral: <strong>{averageRating || 0}</strong>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Usuario</th>
                      <th className="px-3 py-2 text-left">Notas</th>
                      <th className="px-3 py-2 text-left">Recomenda</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(feedbackQuery.data?.feedback || []).map((item) => (
                      <tr key={item.id} className="border-t align-top">
                        <td className="px-3 py-2">{formatDateTime(item.created_at)}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.user_name || "-"}</p>
                          <p className="text-xs text-slate-500">{item.user_role || "-"} / {item.church_totvs_id || "-"}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p>U:{item.usability_rating} V:{item.speed_rating} E:{item.stability_rating} G:{item.overall_rating}</p>
                          <p className="max-w-md whitespace-pre-wrap text-xs text-slate-600">{item.improvement_notes || "-"}</p>
                        </td>
                        <td className="px-3 py-2">{item.recommend_level}</td>
                        <td className="px-3 py-2">{item.status}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {statusOptions.map((opt) => (
                              <Button
                                key={`${item.id}-${opt.value}`}
                                size="sm"
                                variant={item.status === opt.value ? "default" : "outline"}
                                onClick={() => updateMutation.mutate({ id: item.id, status: opt.value })}
                                disabled={updateMutation.isPending}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!feedbackQuery.isLoading && (feedbackQuery.data?.feedback || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Nenhum feedback encontrado.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </ManagementShell>
  );
}
