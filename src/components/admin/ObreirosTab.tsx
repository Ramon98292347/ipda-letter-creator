import { FormEvent, useEffect, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, PlusCircle, MoreHorizontal, User } from "lucide-react";
import { AvatarCapture } from "@/components/shared/AvatarCapture";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import {
  listMembers,
  listChurchesInScope,
  resetWorkerPassword,
  setUserRegistrationStatus,
  setUserPaymentStatus,
  setWorkerActive,
  setMemberRoleAccess,
  setMemberChurchAccess,
  setWorkerDirectRelease,
  deleteUserPermanently,
  upsertWorkerByPastor,
  type UserListItem,
} from "@/services/saasService";
import { getFriendlyError } from "@/lib/error-map";
import { addAuditLog } from "@/lib/audit";
import { supabase } from "@/lib/supabase";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import { isValidCpf } from "@/lib/cpf";

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

function viewValue(v: unknown) {
  const s = String(v || "").trim();
  return s || "—";
}

function formatPhoneBr(v: unknown) {
  const digits = String(v || "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return String(v || "?");
}

function formatDateBr(v: unknown) {
  const s = String(v || "").trim();
  if (!s) return "—";
  const dateInput = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
  const dt = new Date(dateInput);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString("pt-BR");
}

function getAttendanceLabel(worker: UserListItem) {
  const status = String(worker.attendance_status || "SEM_REGISTRO").trim().toUpperCase();
  if (status === "PRESENTE") return "Presente";
  if (status === "FALTA") return "Falta";
  if (status === "FALTA_JUSTIFICADA") return "Falta justificada";
  return "Sem registro";
}

function getAttendanceTone(worker: UserListItem) {
  const status = String(worker.attendance_status || "SEM_REGISTRO").trim().toUpperCase();
  if (status === "PRESENTE") return "bg-emerald-100 text-emerald-700";
  if (status === "FALTA") return "bg-rose-100 text-rose-700";
  if (status === "FALTA_JUSTIFICADA") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function getAttendanceTitle(worker: UserListItem) {
  const meetingDate = worker.attendance_meeting_date ? formatDateBr(worker.attendance_meeting_date) : "sem reuniao";
  const absences = Number(worker.attendance_absences_180_days || 0);
  return `Ultima reuniao: ${meetingDate}. Faltas em 180 dias: ${absences}.`;
}

type WorkerForm = {
  id?: string;
  cpf: string;
  full_name: string;
  minister_role: string;
  profession: string;
  phone: string;
  email: string;
  birth_date: string;
  ordination_date: string;
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
  profession: "",
  phone: "",
  email: "",
  birth_date: "",
  ordination_date: "",
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

// Comentario: value = valor salvo no banco; label = texto exibido ao usuário.
const ministerRoleOptions = [
  { value: "Pastor",     label: "Pastor" },
  { value: "Presbítero", label: "Presbítero" },
  { value: "Diácono",    label: "Diácono" },
  { value: "Obreiro",    label: "Obreiro" },
  { value: "Membro",     label: "Membro" },
];
const FAILED_AVATAR_URLS = new Set<string>();

function resolveAvatarUrl(src?: string | null) {
  const url = String(src || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (FAILED_AVATAR_URLS.has(url)) return null;
  return url;
}

function AvatarWithFallback({ src, alt, className }: { src?: string | null; alt: string; className: string }) {
  const resolved = resolveAvatarUrl(src);
  const [failed, setFailed] = useState(false);
  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={className}
        onError={() => {
          FAILED_AVATAR_URLS.add(resolved);
          setFailed(true);
        }}
      />
    );
  }
  return (
    <div className={`${className} flex items-center justify-center border border-slate-200 bg-white text-slate-400`}>
      <User className="h-5 w-5" />
    </div>
  );
}

export function ObreirosTab({
  activeTotvsId,
  churchTotvsFilter,
  forceSingleChurchFilter = false,
  filterMinisterRole,
  initialActiveFilter,
}: {
  activeTotvsId: string;
  churchTotvsFilter?: string;
  forceSingleChurchFilter?: boolean;
  // Comentario: filterMinisterRole permite que a pagina pai pre-filtre o cargo exibido na tabela.
  filterMinisterRole?: string;
  // Comentario: permite que a pagina pai force o filtro de ativo/inativo (ex: card de inativos)
  initialActiveFilter?: "all" | "active" | "inactive";
}) {
  const { session, usuario } = useUser();
  const roleLower = String(usuario?.role || session?.role || "").toLowerCase();
  const churchClass = String(session?.church_class || "").toLowerCase();
  const selectedChurchFilter = String(churchTotvsFilter || "").trim();
  const useScopeList = !selectedChurchFilter && !forceSingleChurchFilter && churchClass === "estadual";
  const isAdminUser = roleLower === "admin";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // Comentario: debounce de 400ms evita disparar chamadas a API a cada tecla pressionada no campo de busca.
  const debouncedSearch = useDebounce(search, 400);
  // Comentario: se filterMinisterRole vier de fora (pagina pai), usa ele como valor inicial do filtro de cargo.
  const [ministerRole, setMinisterRole] = useState(filterMinisterRole ?? "all");

  // Comentario: sincroniza o estado interno com a prop externa quando ela mudar.
  useEffect(() => {
    setMinisterRole(filterMinisterRole ?? "all");
  }, [filterMinisterRole]);

  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">(initialActiveFilter || "all");

  // Comentario: sincroniza o filtro de ativo/inativo com a prop externa (ex: clique no card de inativos)
  useEffect(() => {
    setActiveFilter(initialActiveFilter || "all");
    setPage(1);
  }, [initialActiveFilter]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WorkerForm>(initialForm);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState("");

  const [openResetModal, setOpenResetModal] = useState(false);
  const [openViewModal, setOpenViewModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<UserListItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [openChurchModal, setOpenChurchModal] = useState(false);
  const [openAccessModal, setOpenAccessModal] = useState(false);
  const [actionWorker, setActionWorker] = useState<UserListItem | null>(null);
  const [churchSearch, setChurchSearch] = useState("");
  const [selectedChurchTotvs, setSelectedChurchTotvs] = useState("");
  const [accessRole, setAccessRole] = useState<"obreiro" | "secretario" | "financeiro">("obreiro");
  const [savingChurch, setSavingChurch] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["workers", activeTotvsId, debouncedSearch, ministerRole, activeFilter, page, pageSize],
    queryFn: () =>
      listMembers({
        search: debouncedSearch || undefined,
        // Comentario: sempre filtra pelo minister_role para todos os cargos (inclusive pastor).
        // O campo minister_role = "pastor" é o cargo ministerial, diferente do role do sistema.
        minister_role: ministerRole === "all" ? undefined : ministerRole,
        is_active: activeFilter === "all" ? undefined : activeFilter === "active",
        // Comentario: secretario e financeiro filtram pelo role do sistema; demais trazem pastor+obreiro.
        roles: ministerRole === "all"
          ? ["pastor", "obreiro", "secretario", "financeiro"]
          : ["pastor", "obreiro"],
        church_totvs_id: selectedChurchFilter || (useScopeList ? undefined : activeTotvsId || undefined),
        page,
        page_size: pageSize,
      }),
    refetchInterval: 10000,
  });

  const { data: churchesInScope = [], isLoading: loadingChurchesInScope } = useQuery({
    queryKey: ["members-transfer-churches", activeTotvsId, roleLower],
    queryFn: () => listChurchesInScope(1, 1000, activeTotvsId || undefined),
    enabled: Boolean(activeTotvsId && (openChurchModal || openAccessModal) && (roleLower === "admin" || roleLower === "pastor")),
    staleTime: 60_000,
  });

  const workers = useMemo(() => data?.workers || [], [data?.workers]);
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => w.minister_role && set.add(w.minister_role));
    return Array.from(set.values()).sort();
  }, [workers]);

  useEffect(() => {
    const cepDigits = onlyDigits(form.cep);
    if (!openModal || cepDigits.length !== 8) return;
    void lookupCep();
  }, [form.cep, openModal]);

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
      profession: worker.profession || "",
      phone: worker.phone || "",
      email: worker.email || "",
      birth_date: worker.birth_date || "",
      ordination_date: worker.ordination_date || "",
      avatar_url: worker.avatar_url || "",
      cep: worker.cep || "",
      address_street: worker.address_street || "",
      address_number: worker.address_number || "",
      address_complement: worker.address_complement || "",
      address_neighborhood: worker.address_neighborhood || "",
      address_city: worker.address_city || "",
      address_state: worker.address_state || "",
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

  function openView(worker: UserListItem) {
    setSelectedWorker(worker);
    setOpenViewModal(true);
  }

  function openChangeChurch(worker: UserListItem) {
    setActionWorker(worker);
    setChurchSearch("");
    const current = String(worker.default_totvs_id || "").trim();
    setSelectedChurchTotvs(current);
    setOpenChurchModal(true);
  }

  function openChangeAccess(worker: UserListItem) {
    setActionWorker(worker);
    const currentRole = String(worker.role || "").toLowerCase();
    if (currentRole === "secretario" || currentRole === "financeiro") {
      setAccessRole(currentRole);
    } else {
      setAccessRole("obreiro");
    }
    setOpenAccessModal(true);
  }

  const filteredChurches = useMemo(() => {
    const q = churchSearch.trim().toLowerCase();
    if (!q) return churchesInScope;
    return churchesInScope.filter((c) => {
      const name = String(c.church_name || "").toLowerCase();
      const totvs = String(c.totvs_id || "").toLowerCase();
      return name.includes(q) || totvs.includes(q);
    });
  }, [churchesInScope, churchSearch]);

  const currentWorkerChurchName = useMemo(() => {
    if (!actionWorker) return "";
    const current = String(actionWorker.default_totvs_id || "").trim();
    const found = churchesInScope.find((c) => String(c.totvs_id) === current);
    return found?.church_name || current;
  }, [actionWorker, churchesInScope]);

  async function lookupCep(force = false) {
    const cep = onlyDigits(form.cep);
    if (cep.length !== 8) return;
    if (!force && (cepLookupLoading || lastCepLookup === cep)) return;

    setCepLookupLoading(true);
    try {
      const data = await fetchAddressByCep(cep);
      setForm((prev) => ({
        ...prev,
        address_street: data.logradouro || prev.address_street,
        address_neighborhood: data.bairro || prev.address_neighborhood,
        address_city: data.localidade || prev.address_city,
        address_state: data.uf || prev.address_state,
        cep: maskCep(cep),
      }));
      setLastCepLookup(cep);
    } catch (err) {
      if (force) {
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP não encontrado." : "Não foi possível buscar o CEP.");
      }
    } finally {
      setCepLookupLoading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!activeTotvsId) {
      toast.error("Igreja ativa não encontrada.");
      return;
    }
    if (!isValidCpf(form.cpf)) {
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
    // Comentario: foto 3x4 é obrigatória
    if (!pendingAvatarFile && !form.avatar_url) {
      toast.error("A foto 3x4 é obrigatória.");
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
        if (error) throw new Error(error.message || "avatar_upload_failed");
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrlToSave = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : undefined;
      }

      await upsertWorkerByPastor({
        id: form.id,
        active_totvs_id: activeTotvsId,
        cpf: form.cpf,
        full_name: form.full_name,
        minister_role: form.minister_role,
        profession: form.profession || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        birth_date: form.birth_date || undefined,
        ordination_date: form.ordination_date || undefined,
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
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(worker: UserListItem) {
    const isSelf = String(worker.id || "") === String(usuario?.id || "");
    if (isSelf) {
      toast.error("Você não pode desativar o seu próprio cadastro.");
      return;
    }
    if (worker.can_manage === false) {
      toast.error("Sem permissao para alterar este usuario.");
      return;
    }
    const next = worker.is_active === false;
    if (!window.confirm(next ? "Tem certeza que deseja ativar este membro?" : "Tem certeza que deseja desativar este membro?")) return;
    try {
      await setWorkerActive(String(worker.id), next);
      toast.success(next ? "Membro ativado." : "Membro desativado e bloqueado para login.");
      addAuditLog("worker_toggled", { worker_id: String(worker.id), is_active: next });
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    }
  }

  async function toggleDirectRelease(worker: UserListItem) {
    const isSelf = String(worker.id || "") === String(usuario?.id || "");
    if (isSelf) {
      toast.error("Você não pode liberar o seu próprio cadastro. Peça para a igreja acima liberar.");
      return;
    }
    if (String(worker.role || "").toLowerCase() !== "obreiro") {
      toast.error("Liberação direta é permitida somente para obreiro.");
      return;
    }
    if (worker.can_manage === false) {
      toast.error("Sem permissao para alterar este usuario.");
      return;
    }
    const next = !(worker.can_create_released_letter === true);
    const msg = next
      ? "Ativar liberação direta para este obreiro?"
      : "Remover liberação direta deste obreiro?";
    if (!window.confirm(msg)) return;
    try {
      await setWorkerDirectRelease(String(worker.id), next);
      toast.success(next ? "Obreiro liberado para criar carta já liberada." : "Liberação direta removida.");
      addAuditLog("worker_direct_release_toggled", { worker_id: String(worker.id), enabled: next });
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    }
  }

  async function toggleRegistration(worker: UserListItem) {
    if (worker.can_manage === false) {
      toast.error("Sem permissao para alterar este usuario.");
      return;
    }
    const current = worker.registration_status === "PENDENTE" ? "PENDENTE" : "APROVADO";
    const next = current === "PENDENTE" ? "APROVADO" : "PENDENTE";
    const msg = next === "APROVADO"
      ? "Liberar cadastro deste membro?"
      : "Voltar este cadastro para pendente?";
    if (!window.confirm(msg)) return;

    try {
      await setUserRegistrationStatus(String(worker.id), next);
      // Comentario: ao liberar o cadastro, ativa o usuario para que ele possa entrar no sistema
      if (next === "APROVADO" && worker.is_active === false) {
        await setWorkerActive(String(worker.id), true);
      }
      toast.success(next === "APROVADO" ? "Cadastro liberado e usuário ativado." : "Cadastro marcado como pendente.");
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    }
  }

  async function togglePaymentBlock(worker: UserListItem) {
    const isSelf = String(worker.id || "") === String(usuario?.id || "");
    if (isSelf) {
      toast.error("Você não pode bloquear o seu próprio cadastro por pagamento.");
      return;
    }
    if (roleLower !== "admin") {
      toast.error("Somente admin pode bloquear por pagamento.");
      return;
    }

    const current = String(worker.payment_status || "ATIVO").toUpperCase();
    const next = current === "BLOQUEADO_PAGAMENTO" ? "ATIVO" : "BLOQUEADO_PAGAMENTO";

    let reason = "";
    if (next === "BLOQUEADO_PAGAMENTO") {
      reason = window.prompt("Motivo do bloqueio por pagamento:")?.trim() || "";
      if (!reason) {
        toast.error("Informe o motivo do bloqueio.");
        return;
      }
    }

    const confirmMessage =
      next === "BLOQUEADO_PAGAMENTO"
        ? `Bloquear ${worker.full_name || "este usuário"} por falta de pagamento?`
        : `Desbloquear ${worker.full_name || "este usuário"} por pagamento?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      await setUserPaymentStatus({
        user_id: String(worker.id),
        payment_status: next as "ATIVO" | "BLOQUEADO_PAGAMENTO",
        reason: next === "BLOQUEADO_PAGAMENTO" ? reason : null,
      });
      toast.success(next === "BLOQUEADO_PAGAMENTO" ? "Usuário bloqueado por pagamento." : "Usuário liberado por pagamento.");
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    }
  }

  async function deleteWorker(worker: UserListItem) {
    const isSelf = String(worker.id || "") === String(usuario?.id || "");
    if (isSelf) {
      toast.error("Você não pode deletar o seu próprio cadastro.");
      return;
    }
    if (worker.can_manage === false) {
      toast.error("Sem permissao para excluir este usuario.");
      return;
    }
    const ok = window.confirm(`Tem certeza que deseja deletar ${worker.full_name || "este usuario"}? Esta acao apaga o cadastro do banco.`);
    if (!ok) return;
    try {
      await deleteUserPermanently(String(worker.id));
      toast.success("Usuario deletado.");
      addAuditLog("worker_deleted", { worker_id: String(worker.id) });
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    }
  }

  async function confirmChangeChurch() {
    if (!actionWorker) return;
    if (!selectedChurchTotvs) {
      toast.error("Selecione a igreja de destino.");
      return;
    }
    if (String(actionWorker.id || "") === String(usuario?.id || "")) {
      toast.error("Você não pode mover o seu próprio cadastro.");
      return;
    }
    if (String(actionWorker.default_totvs_id || "") === selectedChurchTotvs) {
      toast.message("O membro já está nessa igreja.");
      return;
    }

    setSavingChurch(true);
    try {
      await setMemberChurchAccess(String(actionWorker.id), selectedChurchTotvs);
      toast.success("Igreja do membro atualizada com sucesso.");
      addAuditLog("member_church_changed", {
        user_id: String(actionWorker.id || ""),
        from_totvs: String(actionWorker.default_totvs_id || ""),
        to_totvs: selectedChurchTotvs,
      });
      setOpenChurchModal(false);
      setActionWorker(null);
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    } finally {
      setSavingChurch(false);
    }
  }

  async function confirmChangeAccess() {
    if (!actionWorker) return;
    if (!accessRole) {
      toast.error("Selecione o nível de acesso.");
      return;
    }
    if (String(actionWorker.id || "") === String(usuario?.id || "")) {
      toast.error("Você não pode alterar o seu próprio acesso.");
      return;
    }
    const currentRole = String(actionWorker.role || "").toLowerCase();
    if (currentRole === "pastor") {
      toast.error("Pastor é definido pela troca de pastor da igreja.");
      return;
    }
    if (currentRole === accessRole) {
      toast.message("Este membro já está com esse acesso.");
      return;
    }

    setSavingAccess(true);
    try {
      await setMemberRoleAccess(String(actionWorker.id), accessRole);
      toast.success("Acesso do membro atualizado.");
      addAuditLog("member_access_changed", {
        user_id: String(actionWorker.id || ""),
        from_role: currentRole,
        to_role: accessRole,
      });
      setOpenAccessModal(false);
      setActionWorker(null);
      await refresh();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "workers"));
    } finally {
      setSavingAccess(false);
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
    } catch (err: unknown) {
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

  function renderWorkerActions(worker: UserListItem) {
    const isSelf = String(worker.id || "") === String(usuario?.id || "");
    const isObreiroTarget = String(worker.role || "").toLowerCase() === "obreiro";
    const blockDangerActions = worker.can_manage === false || isSelf;
    const blockDirectRelease = blockDangerActions || !isObreiroTarget;
    const blockMemberManagement = blockDangerActions || !["admin", "pastor"].includes(roleLower);
    const targetRole = String(worker.role || "").toLowerCase();
    const blockAccessChange = blockMemberManagement || targetRole === "pastor" || targetRole === "admin";
    const canPaymentAction = isAdminUser && !isSelf;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <MoreHorizontal className="mr-2 h-4 w-4" />
            Acoes
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEdit(worker)} disabled={worker.can_manage === false}>
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggle(worker)} disabled={blockDangerActions}>
            {worker.is_active === false ? "Ativar" : "Desativar"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleDirectRelease(worker)} disabled={blockDirectRelease}>
            {worker.can_create_released_letter ? "Remover liberação direta" : "Liberar direto"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleRegistration(worker)} disabled={blockDangerActions}>
            {worker.registration_status === "PENDENTE" ? "Liberar cadastro" : "Bloquear cadastro"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => togglePaymentBlock(worker)} disabled={!canPaymentAction}>
            {String(worker.payment_status || "ATIVO").toUpperCase() === "BLOQUEADO_PAGAMENTO"
              ? "Liberar por pagamento"
              : "Bloquear por pagamento"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openResetPassword(worker)} disabled={blockDangerActions}>
            Resetar senha
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openChangeChurch(worker)} disabled={blockMemberManagement}>
            Trocar de igreja
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openChangeAccess(worker)} disabled={blockAccessChange}>
            Mudar acesso
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => deleteWorker(worker)} disabled={blockDangerActions} className="text-rose-600 focus:text-rose-700">
            Deletar usuario
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Membros cadastrados</CardTitle>
          <Button onClick={openNew}><PlusCircle className="mr-2 h-4 w-4" /> Novo Obreiro</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3">
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
              <SelectTrigger className="min-w-[160px]"><SelectValue placeholder="Cargo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cargos</SelectItem>
                {roleOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v as "all" | "active" | "inactive"); setPage(1); }}>
              <SelectTrigger className="min-w-[140px]"><SelectValue placeholder="Ativo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Button className="shrink-0" variant="outline" onClick={resetFilters}>Limpar</Button>
          </div>

          {/* Comentario: overflow-x-auto no wrapper externo = scroll horizontal em mobile/tablet */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            {/* Comentario: overflow-y-auto + max-h aqui = scroll vertical com header fixo */}
            <div className="min-w-[1420px] overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {/* Comentario: sticky top-0 mantém o cabeçalho visível ao rolar verticalmente */}
              <div className="sticky top-0 z-10 grid grid-cols-[92px_200px_150px_140px_140px_120px_120px_140px_120px_140px_120px_140px] border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <span>Avatar</span>
                <span>Nome</span>
                <span>CPF</span>
                <span>Telefone</span>
                <span>Cargo</span>
                <span>Tipo</span>
                <span>Status</span>
                <span>Presença</span>
                <span>Carta direta</span>
                <span>Pagamento</span>
                <span>Ver</span>
                <span>Acoes</span>
              </div>
              {isLoading ? <div className="px-4 py-4 text-sm text-slate-500">Carregando...</div> : null}
              {!isLoading && workers.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">Nenhum membro encontrado.</div> : null}
              {workers.map((w) => (
                <div key={w.id} className="grid grid-cols-[92px_200px_150px_140px_140px_120px_120px_140px_120px_140px_120px_140px] items-center border-b px-4 py-3 text-sm">
                  <span>
                    <AvatarWithFallback
                      src={w.avatar_url || null}
                      alt={`Avatar de ${w.full_name}`}
                      className="h-10 w-10 rounded-full object-cover object-[center_top]"
                    />
                  </span>
                  <span className="truncate">{w.full_name}</span>
                  <span>{maskCpf(w.cpf || "")}</span>
                  <span>{w.phone || "-"}</span>
                  <span>{w.minister_role || "-"}</span>
                  <span className="capitalize">{w.role || "-"}</span>
                  <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs ${w.is_active === false ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {w.is_active === false ? "Inativo" : "Ativo"}
                  </span>
                  <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs ${getAttendanceTone(w)}`} title={getAttendanceTitle(w)}>
                    {getAttendanceLabel(w)}
                  </span>
                  <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs ${w.can_create_released_letter ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700"}`}>
                    {w.can_create_released_letter ? "Liberado" : "Bloqueado"}
                  </span>
                  <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs ${String(w.payment_status || "ATIVO").toUpperCase() === "BLOQUEADO_PAGAMENTO" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {String(w.payment_status || "ATIVO").toUpperCase() === "BLOQUEADO_PAGAMENTO" ? "Bloqueado" : "Ativo"}
                  </span>
                  <div><Button size="sm" variant="outline" onClick={() => openView(w)}>Visualizar</Button></div>
                  <div>{renderWorkerActions(w)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Carregando...</div> : null}
            {!isLoading && workers.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Nenhum membro encontrado.</div> : null}
            {workers.map((w) => (
              <Card key={`mobile-${w.id}`} className="border border-slate-200">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <AvatarWithFallback
                      src={w.avatar_url || null}
                      alt={`Avatar de ${w.full_name}`}
                      className="h-16 w-16 rounded-full object-cover object-[center_top]"
                    />
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="truncate font-semibold text-slate-900">{w.full_name}</p>
                      <p className="text-slate-600">CPF: {maskCpf(w.cpf || "")}</p>
                      <p className="text-slate-600">Telefone: {w.phone || "-"}</p>
                      <p className="text-slate-600">Cargo: {w.minister_role || "-"}</p>
                      <p className="text-slate-600" title={getAttendanceTitle(w)}>Presença: {getAttendanceLabel(w)}</p>
                      <p className="text-slate-600">
                        Carta direta: {w.can_create_released_letter ? "Liberado" : "Bloqueado"}
                      </p>
                      <p className="text-slate-600">
                        Pagamento: {String(w.payment_status || "ATIVO").toUpperCase() === "BLOQUEADO_PAGAMENTO" ? "Bloqueado" : "Ativo"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={() => openView(w)}>Visualizar</Button>
                    {renderWorkerActions(w)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Total: {total}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
              <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="text-sm whitespace-nowrap">Pagina {page} / {totalPages}</span>
              <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Proxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
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

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Cargo ministerial *</Label>
                <Select value={form.minister_role || ""} onValueChange={(v) => setForm((p) => ({ ...p, minister_role: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ministerRoleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
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
              <div className="space-y-1">
                <Label>Profissao</Label>
                <Input value={form.profession} onChange={(e) => setForm((p) => ({ ...p, profession: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Nascimento</Label>
                <Input type="date" value={form.birth_date} onChange={(e) => setForm((p) => ({ ...p, birth_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Ordenação</Label>
                <Input type="date" value={form.ordination_date} onChange={(e) => setForm((p) => ({ ...p, ordination_date: e.target.value }))} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Foto 3x4</Label>
                {/* AvatarCapture: inclui câmera/galeria, remoção de fundo por IA e preview 3x4 */}
                {/* Comentario: currentUrl mostra a foto ja cadastrada ao editar */}
                <AvatarCapture
                  onFileReady={(file) => {
                    setPendingAvatarFile(file);
                    if (file) setForm((p) => ({ ...p, avatar_url: "" }));
                  }}
                  disabled={saving}
                  currentUrl={!pendingAvatarFile && form.avatar_url ? form.avatar_url : undefined}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input
                  value={maskCep(form.cep)}
                  onChange={(e) => setForm((p) => ({ ...p, cep: e.target.value }))}
                  onBlur={() => void lookupCep(true)}
                  placeholder="00000-000"
                />
                <p className="text-xs text-slate-500">{cepLookupLoading ? "Buscando endereco..." : "Endereco preenchido automaticamente pelo CEP."}</p>
              </div>
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
        open={openViewModal}
        onOpenChange={(next) => {
          setOpenViewModal(next);
          if (!next) setSelectedWorker(null);
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle>Dados do Membro</DialogTitle>
                <DialogDescription>Visualização completa do cadastro do membro selecionado.</DialogDescription>
              </div>
              {selectedWorker ? (
                <div className="mr-10 flex items-center gap-2 md:mr-12">
                  <Button size="sm" variant="outline" onClick={() => openEdit(selectedWorker)}>Editar</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">Ações ▾</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openResetPassword(selectedWorker)} disabled={selectedWorker.can_manage === false}>
                        Resetar senha
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggle(selectedWorker)} disabled={selectedWorker.can_manage === false}>
                        {selectedWorker.is_active === false ? "Ativar" : "Desativar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleDirectRelease(selectedWorker)} disabled={selectedWorker.can_manage === false}>
                        {selectedWorker.can_create_released_letter ? "Desativar liberação direta" : "Ativar liberação direta"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openChangeChurch(selectedWorker)}
                        disabled={selectedWorker.can_manage === false || String(selectedWorker.id || "") === String(usuario?.id || "")}
                      >
                        Trocar de igreja
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openChangeAccess(selectedWorker)}
                        disabled={
                          selectedWorker.can_manage === false ||
                          String(selectedWorker.id || "") === String(usuario?.id || "") ||
                          ["pastor", "admin"].includes(String(selectedWorker.role || "").toLowerCase())
                        }
                      >
                        Mudar acesso
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
          </DialogHeader>

          {selectedWorker ? (
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="space-y-6 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="h-[140px] w-[140px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <AvatarWithFallback
                      src={selectedWorker.avatar_url || null}
                      alt="Avatar do membro"
                      className="h-full w-full rounded-none object-cover"
                    />
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-3xl font-extrabold text-slate-900">{viewValue(selectedWorker.full_name)}</h3>
                    <p className="text-sm text-slate-600">
                      CPF: {selectedWorker.cpf ? maskCpf(selectedWorker.cpf) : "—"} • Nascimento: {formatDateBr(selectedWorker.birth_date)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        Cargo: {viewValue(selectedWorker.minister_role)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={selectedWorker.is_active === false ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}
                      >
                        Status: {selectedWorker.is_active === false ? "Inativo" : "Ativo"}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        Igreja: {viewValue(selectedWorker.church_name || selectedWorker.default_totvs_id)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Identificação</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">CPF</p>
                      <p className="text-base font-semibold text-slate-900">{selectedWorker.cpf ? maskCpf(selectedWorker.cpf) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">RG</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.rg)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Data de nascimento</p>
                      <p className="text-base font-semibold text-slate-900">{formatDateBr(selectedWorker.birth_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Matrícula</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.matricula)}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Contato</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">Telefone</p>
                      <p className="text-base font-semibold text-slate-900">{formatPhoneBr(selectedWorker.phone)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">E-mail</p>
                      <p className="text-base font-semibold text-slate-900 break-all">{viewValue(selectedWorker.email)}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Endereço</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">CEP</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.cep)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Rua</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.address_street)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Número</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.address_number)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Complemento</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.address_complement)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Bairro</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.address_neighborhood)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Cidade / UF</p>
                      <p className="text-base font-semibold text-slate-900">
                        {viewValue(selectedWorker.address_city) === "—" && viewValue(selectedWorker.address_state) === "—"
                          ? "—"
                          : `${viewValue(selectedWorker.address_city)} / ${viewValue(selectedWorker.address_state)}`}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Ministério</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">Cargo ministerial</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.minister_role)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Data de ordenação</p>
                      <p className="text-base font-semibold text-slate-900">{formatDateBr(selectedWorker.ordination_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Data de batismo</p>
                      <p className="text-base font-semibold text-slate-900">{formatDateBr(selectedWorker.baptism_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Status do cadastro</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(selectedWorker.registration_status)}</p>
                    </div>
                  </div>
                </section>
              </CardContent>
            </Card>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={openChurchModal}
        onOpenChange={(next) => {
          setOpenChurchModal(next);
          if (!next) {
            setActionWorker(null);
            setChurchSearch("");
            setSelectedChurchTotvs("");
          }
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Trocar membro de igreja</DialogTitle>
            <DialogDescription>Selecione a igreja de destino para mover o membro.</DialogDescription>
          </DialogHeader>

          {actionWorker ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{actionWorker.full_name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Igreja atual: <span className="font-medium">{currentWorkerChurchName || viewValue(actionWorker.default_totvs_id)}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Buscar igreja</Label>
                <Input
                  value={churchSearch}
                  onChange={(e) => setChurchSearch(e.target.value)}
                  placeholder="Digite nome da igreja ou TOTVS..."
                />
              </div>

              <div className="max-h-72 overflow-auto rounded-xl border">
                {loadingChurchesInScope ? <div className="p-4 text-sm text-slate-500">Carregando igrejas...</div> : null}
                {!loadingChurchesInScope && filteredChurches.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500">Nenhuma igreja encontrada para selecionar.</div>
                ) : null}
                {!loadingChurchesInScope && filteredChurches.length > 0 ? (
                  <ul className="divide-y">
                    {filteredChurches.map((church) => {
                      const selected = selectedChurchTotvs === String(church.totvs_id);
                      return (
                        <li key={String(church.totvs_id)}>
                          <button
                            type="button"
                            className={`w-full px-4 py-3 text-left transition ${
                              selected
                                ? "border-l-4 border-emerald-500 bg-emerald-50 text-emerald-900"
                                : "border-l-4 border-transparent hover:bg-slate-50"
                            }`}
                            onClick={() => setSelectedChurchTotvs(String(church.totvs_id))}
                          >
                            <div className="text-sm font-semibold text-slate-900">
                              {church.church_name || "-"} (TOTVS {church.totvs_id})
                            </div>
                            <div className="mt-0.5 text-xs text-slate-600 capitalize">Classe: {church.church_class || "-"}</div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpenChurchModal(false);
                    setActionWorker(null);
                  }}
                  disabled={savingChurch}
                >
                  Cancelar
                </Button>
                <Button onClick={confirmChangeChurch} disabled={savingChurch || !selectedChurchTotvs}>
                  {savingChurch ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={openAccessModal}
        onOpenChange={(next) => {
          setOpenAccessModal(next);
          if (!next) {
            setActionWorker(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mudar acesso do membro</DialogTitle>
            <DialogDescription>Defina o tipo de acesso do membro no sistema.</DialogDescription>
          </DialogHeader>

          {actionWorker ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-900">{actionWorker.full_name}</p>
                <p className="mt-1 text-slate-600">
                  Acesso atual: <span className="font-medium capitalize">{String(actionWorker.role || "obreiro")}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Novo acesso</Label>
                <Select value={accessRole} onValueChange={(value) => setAccessRole(value as "obreiro" | "secretario" | "financeiro")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="obreiro">Obreiro</SelectItem>
                    <SelectItem value="secretario">Secretário</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">Observação: acesso de pastor é definido na troca de pastor da igreja.</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpenAccessModal(false);
                    setActionWorker(null);
                  }}
                  disabled={savingAccess}
                >
                  Cancelar
                </Button>
                <Button onClick={confirmChangeAccess} disabled={savingAccess}>
                  {savingAccess ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          ) : null}
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


