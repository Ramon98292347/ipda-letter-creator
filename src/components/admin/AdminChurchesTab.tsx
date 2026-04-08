import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Church, LayoutGrid, List, MoreHorizontal } from "lucide-react";
import { ImageCaptureInput } from "@/components/shared/ImageCaptureInput";
import { ModalTrocarPastor } from "@/components/admin/ModalTrocarPastor";
import { ChurchDocsDialog } from "@/components/admin/ChurchDocsDialog";
import { useUser } from "@/context/UserContext";
import { createChurch, deactivateChurch, type ChurchInScopeItem } from "@/services/saasService";
import { getFriendlyError } from "@/lib/error-map";
import { addAuditLog } from "@/lib/audit";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import { formatCepBr, formatPhoneBr } from "@/lib/br-format";
import { supabase } from "@/lib/supabase";
import { BRAZIL_UF_OPTIONS } from "@/lib/brazil-ufs";

type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local" | "casa_oracao";

type NewChurchForm = {
  totvs_id: string;
  church_name: string;
  class: ChurchClass;
  parent_totvs_id: string;
  image_url: string;
  stamp_church_url: string;
  contact_email: string;
  contact_phone: string;
  cep: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_country: string;
  is_active: boolean;
};

type ChurchTab = "lista" | "remanejamento" | "contrato";
type ChurchView = "lista" | "grid";

const initialForm: NewChurchForm = {
  totvs_id: "",
  church_name: "",
  class: "local",
  parent_totvs_id: "",
  image_url: "",
  stamp_church_url: "",
  contact_email: "",
  contact_phone: "",
  cep: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
  address_country: "BR",
  is_active: true,
};

const classOptions: ChurchClass[] = ["estadual", "setorial", "central", "regional", "local", "casa_oracao"];

const childClassMap: Record<ChurchClass, ChurchClass[]> = {
  estadual: ["setorial", "central", "regional", "local", "casa_oracao"],
  setorial: ["central", "regional", "local", "casa_oracao"],
  central: ["regional", "local", "casa_oracao"],
  regional: ["local", "casa_oracao"],
  local: ["casa_oracao"],
  casa_oracao: [],
};

function normalizeChurchClass(value: string | null | undefined): ChurchClass | null {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "estadual" || safe === "setorial" || safe === "central" || safe === "regional" || safe === "local" || safe === "casa_oracao") {
    return safe;
  }
  return null;
}

function classLabel(value: ChurchClass | string) {
  if (String(value) === "casa_oracao") return "casa de oração";
  return String(value || "");
}

function viewValue(value: unknown) {
  const safe = String(value || "").trim();
  return safe || "\u2014";
}

const DEFAULT_CHURCH_IMAGE =
  "https://idipilrcaqittmnapmbq.supabase.co/storage/v1/object/public/banner/logo/imagem-geral/imagem-igreja-geral.png";

function getChurchImage(church: ChurchInScopeItem): string {
  return String(church.image_url || "").trim() || DEFAULT_CHURCH_IMAGE;
}

function ChurchAvatar({ church, compact = false }: { church: ChurchInScopeItem; compact?: boolean }) {
  const imageUrl = getChurchImage(church);
  const cls = compact ? "h-12 w-16" : "h-[220px] w-full max-w-[220px]";

  return (
    <img
      src={imageUrl}
      alt={`Imagem da igreja ${church.church_name}`}
      className={
        compact
          ? `${cls} rounded-xl border border-slate-200 object-cover object-center`
          : `${cls} rounded-xl border border-slate-200 bg-white object-contain object-center`
      }
    />
  );
}

export function AdminChurchesTab({
  rows,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  roleMode,
}: {
  rows: ChurchInScopeItem[];
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  roleMode?: "admin" | "pastor";
}) {
  const { session, usuario } = useUser();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState<ChurchInScopeItem | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState<NewChurchForm>(initialForm);
  const [savingNew, setSavingNew] = useState(false);
  const [busyChurchId, setBusyChurchId] = useState<string | null>(null);

  const [docsOpen, setDocsOpen] = useState(false);
  const [docsInitialTab, setDocsInitialTab] = useState<"remanejamento" | "contrato" | "laudo">("remanejamento");
  const [docsChurch, setDocsChurch] = useState<ChurchInScopeItem | null>(null);

  const [editingChurch, setEditingChurch] = useState<ChurchInScopeItem | null>(null);
  const [editForm, setEditForm] = useState<NewChurchForm>(initialForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [viewChurch, setViewChurch] = useState<ChurchInScopeItem | null>(null);
  const [newCepLoading, setNewCepLoading] = useState(false);
  const [editCepLoading, setEditCepLoading] = useState(false);
  const [lastNewCep, setLastNewCep] = useState("");
  const [lastEditCep, setLastEditCep] = useState("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string>("");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string>("");
  const [newStampFile, setNewStampFile] = useState<File | null>(null);
  const [editStampFile, setEditStampFile] = useState<File | null>(null);

  const [tab, setTab] = useState<ChurchTab>("lista");
  const [view, setView] = useState<ChurchView>("lista");
  const roleLower = String(session?.role || usuario?.role || "").toLowerCase();
  const isAdmin = roleMode === "admin" || roleLower.includes("admin");
  const userChurchClass = normalizeChurchClass(session?.church_class);
  const parentTotvsFromSession = String(session?.totvs_id || "").trim();
  const newChurchNeedsParent = !isAdmin && newForm.class !== "estadual";

  const allowedCreateClasses = useMemo<ChurchClass[]>(() => {
    if (!roleLower || isAdmin) return classOptions;
    if (!userChurchClass) return classOptions;
    return childClassMap[userChurchClass];
  }, [roleLower, isAdmin, userChurchClass]);
  const canCreateChurch = allowedCreateClasses.length > 0;

  // Comentario: ordena pela hierarquia (estadual > setorial > central > regional > local)
  // e dentro de cada nível, pelo TOTVS numérico crescente — mesmo formato do obreiro.
  const sortedRows = useMemo(() => {
    const classOrder: Record<string, number> = { estadual: 0, setorial: 1, central: 2, regional: 3, local: 4, casa_oracao: 5 };
    return [...rows].sort((a, b) => {
      const oA = classOrder[String(a.church_class || "").toLowerCase().trim()] ?? 99;
      const oB = classOrder[String(b.church_class || "").toLowerCase().trim()] ?? 99;
      if (oA !== oB) return oA - oB;
      return Number(a.totvs_id || 0) - Number(b.totvs_id || 0);
    });
  }, [rows]);

  async function uploadChurchImage(file: File, totvsId: string) {
    if (!supabase) throw new Error("Supabase não configurado.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const path = `igreja/${fileName}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadChurchStamp(file: File) {
    if (!supabase) throw new Error("Supabase não configurado.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const path = `users/carimbos/igreja/${fileName}`;
    const { error } = await supabase.storage
      .from("assinat_carimbo")
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("assinat_carimbo").getPublicUrl(path);
    return data.publicUrl;
  }

  async function autofillNewCep(force = false) {
    const cep = onlyDigits(newForm.cep);
    if (cep.length !== 8) return;
    if (!force && (newCepLoading || lastNewCep === cep)) return;

    setNewCepLoading(true);
    try {
      const data = await fetchAddressByCep(cep);
      setNewForm((prev) => ({
        ...prev,
        cep: maskCep(cep),
        address_street: prev.address_street || data.logradouro,
        address_neighborhood: prev.address_neighborhood || data.bairro,
        address_city: prev.address_city || data.localidade,
        address_state: prev.address_state || data.uf,
      }));
      setLastNewCep(cep);
    } catch (err) {
      if (force) {
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP não encontrado." : "Falha ao buscar CEP.");
      }
    } finally {
      setNewCepLoading(false);
    }
  }

  async function autofillEditCep(force = false) {
    const cep = onlyDigits(editForm.cep);
    if (cep.length !== 8) return;
    if (!force && (editCepLoading || lastEditCep === cep)) return;

    setEditCepLoading(true);
    try {
      const data = await fetchAddressByCep(cep);
      setEditForm((prev) => ({
        ...prev,
        cep: maskCep(cep),
        address_street: prev.address_street || data.logradouro,
        address_neighborhood: prev.address_neighborhood || data.bairro,
        address_city: prev.address_city || data.localidade,
        address_state: prev.address_state || data.uf,
      }));
      setLastEditCep(cep);
    } catch (err) {
      if (force) {
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP não encontrado." : "Falha ao buscar CEP.");
      }
    } finally {
      setEditCepLoading(false);
    }
  }

  useEffect(() => {
    const cep = onlyDigits(newForm.cep);
    if (!newOpen || cep.length !== 8) return;
    void autofillNewCep();
  }, [newForm.cep, newOpen]);

  useEffect(() => {
    const cep = onlyDigits(editForm.cep);
    if (!editingChurch || cep.length !== 8) return;
    void autofillEditCep();
  }, [editForm.cep, editingChurch]);

  function openPastorModal(church: ChurchInScopeItem) {
    setSelectedChurch(church);
    setModalOpen(true);
  }

  function pastorActionLabel(church: ChurchInScopeItem) {
    return church.pastor?.id || church.pastor_user_id ? "Trocar pastor" : "Cadastrar pastor";
  }

  async function refetchChurches() {
    await queryClient.invalidateQueries({ queryKey: ["churches-in-scope"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-church-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["pastor-igrejas-page"] });
  }

  function updateChurchImageCache(totvsId: string, imageUrl: string) {
    if (!totvsId || !imageUrl) return;
    queryClient.setQueriesData({ queryKey: ["churches-in-scope"] }, (oldData: unknown) => {
      if (!oldData) return oldData;
      const data = oldData as { churches?: ChurchInScopeItem[] } | ChurchInScopeItem[];
      if (Array.isArray(data)) {
        return data.map((row) => (row.totvs_id === totvsId ? { ...row, image_url: imageUrl } : row));
      }
      const rows = Array.isArray(data.churches) ? data.churches : [];
      return { ...data, churches: rows.map((row) => (row.totvs_id === totvsId ? { ...row, image_url: imageUrl } : row)) };
    });
  }

  async function onCreateChurch(e: FormEvent) {
    e.preventDefault();
    if (!newForm.totvs_id.trim()) {
      toast.error("TOTVS é obrigatório.");
      return;
    }
    if (!newForm.church_name.trim()) {
      toast.error("Nome da igreja é obrigatório.");
      return;
    }

    if (newChurchNeedsParent && !newForm.parent_totvs_id.trim()) {
      toast.error("Igreja mãe obrigatória para cadastro.");
      return;
    }

    if (!allowedCreateClasses.includes(newForm.class)) {
      toast.error("Classe da nova igreja inválida para seu nível de acesso.");
      return;
    }

    setSavingNew(true);
    try {
      let imageUrl = newForm.image_url;
      if (newImageFile) {
        imageUrl = await uploadChurchImage(newImageFile, newForm.totvs_id.trim());
      }
      let stampChurchUrl = newForm.stamp_church_url;
      if (newStampFile) {
        stampChurchUrl = await uploadChurchStamp(newStampFile);
      }
      await createChurch({
        totvs_id: newForm.totvs_id.trim(),
        church_name: newForm.church_name.trim(),
        class: newForm.class,
        parent_totvs_id: isAdmin ? undefined : newChurchNeedsParent ? newForm.parent_totvs_id.trim() || undefined : undefined,
        image_url: imageUrl,
        stamp_church_url: stampChurchUrl,
        contact_email: newForm.contact_email,
        contact_phone: newForm.contact_phone,
        cep: newForm.cep,
        address_street: newForm.address_street,
        address_number: newForm.address_number,
        address_complement: newForm.address_complement,
        address_neighborhood: newForm.address_neighborhood,
        address_city: newForm.address_city,
        address_state: newForm.address_state,
        address_country: newForm.address_country,
        is_active: newForm.is_active,
      });
      if (imageUrl) updateChurchImageCache(newForm.totvs_id.trim(), imageUrl);
      toast.success("Igreja criada com sucesso.");
      addAuditLog("church_created", { church_totvs_id: newForm.totvs_id.trim() });
      setNewOpen(false);
      setNewForm(initialForm);
      setNewImageFile(null);
      setNewImagePreview("");
      setNewStampFile(null);
      await refetchChurches();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "churches"));
    } finally {
      setSavingNew(false);
    }
  }

  async function onDeleteChurch(church: ChurchInScopeItem) {
    if (!window.confirm(`Tem certeza que deseja desativar a igreja ${church.church_name}?`)) return;
    setBusyChurchId(church.totvs_id);
    try {
      await deactivateChurch(church.totvs_id);
      toast.success("Igreja desativada.");
      addAuditLog("church_deactivated", { church_totvs_id: church.totvs_id });
      await refetchChurches();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "churches"));
    } finally {
      setBusyChurchId(null);
    }
  }

  function openEditModal(church: ChurchInScopeItem) {
    setEditingChurch(church);
    setEditForm({
      totvs_id: church.totvs_id,
      church_name: church.church_name,
      class: (church.church_class || "local") as NewChurchForm["class"],
      parent_totvs_id: String(church.parent_totvs_id || ""),
      image_url: String(church.image_url || ""),
      stamp_church_url: String(church.stamp_church_url || ""),
      contact_email: String(church.contact_email || ""),
      contact_phone: String(church.contact_phone || ""),
      cep: String(church.cep || ""),
      address_street: String(church.address_street || ""),
      address_number: String(church.address_number || ""),
      address_complement: String(church.address_complement || ""),
      address_neighborhood: String(church.address_neighborhood || ""),
      address_city: String(church.address_city || ""),
      address_state: String(church.address_state || ""),
      address_country: String(church.address_country || "BR"),
      is_active: church.is_active !== false,
    });
  }

  function openViewModal(church: ChurchInScopeItem) {
    setViewChurch(church);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingChurch) return;

    setSavingEdit(true);
    try {
      let imageUrl = editForm.image_url;
      if (editImageFile) {
        imageUrl = await uploadChurchImage(editImageFile, editForm.totvs_id.trim());
      }
      let stampChurchUrl = editForm.stamp_church_url;
      if (editStampFile && !editForm.stamp_church_url) {
        stampChurchUrl = await uploadChurchStamp(editStampFile);
      }
      // Comentario: usa a mesma function para manter um unico fluxo de gravacao.
      await createChurch({
        totvs_id: editForm.totvs_id.trim(),
        church_name: editForm.church_name.trim(),
        class: editForm.class,
        parent_totvs_id: editForm.parent_totvs_id.trim() || undefined,
        image_url: imageUrl,
        stamp_church_url: stampChurchUrl,
        contact_email: editForm.contact_email,
        contact_phone: editForm.contact_phone,
        cep: editForm.cep,
        address_street: editForm.address_street,
        address_number: editForm.address_number,
        address_complement: editForm.address_complement,
        address_neighborhood: editForm.address_neighborhood,
        address_city: editForm.address_city,
        address_state: editForm.address_state,
        address_country: editForm.address_country,
        is_active: editForm.is_active,
      });
      if (imageUrl) updateChurchImageCache(editForm.totvs_id.trim(), imageUrl);
      toast.success("Igreja atualizada com sucesso.");
      setEditingChurch(null);
      setEditImageFile(null);
      setEditImagePreview("");
      setEditStampFile(null);
      await refetchChurches();
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "churches"));
    } finally {
      setSavingEdit(false);
    }
  }

  function openChurchDocs(church: ChurchInScopeItem, initial: "remanejamento" | "contrato") {
    setDocsChurch(church);
    setDocsInitialTab(initial);
    setDocsOpen(true);
  }

  function openNewChurchModal() {
    if (!canCreateChurch) {
      toast.error("Seu nivel atual nao permite cadastrar igrejas filhas.");
      return;
    }
    const nextClass = allowedCreateClasses[0] || "local";
    setNewForm({
      ...initialForm,
      class: nextClass,
      parent_totvs_id: isAdmin ? "" : parentTotvsFromSession,
      address_country: "BR",
      is_active: true,
    });
    setNewOpen(true);
  }

  function renderCommonInfo(church: ChurchInScopeItem) {
    return (
      <>
        <p className="truncate text-base font-semibold text-slate-900">{church.church_name}</p>
        <p className="text-sm text-slate-500">TOTVS {church.totvs_id}</p>
        <p className="text-sm text-slate-600 capitalize">Classe: {church.church_class || "-"}</p>
        <p className="text-sm text-slate-600">Pastor: {church.pastor?.full_name || "Não definido"}</p>
        <p className="text-sm text-slate-600">Obreiros: {church.workers_count ?? 0}</p>
      </>
    );
  }

  function renderGridInfo(church: ChurchInScopeItem) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="truncate text-base font-semibold text-slate-900">{viewValue(church.church_name)}</p>
        <p className="text-sm text-slate-500">
          TOTVS: {viewValue(church.totvs_id)} • {viewValue(church.address_city)} / {viewValue(church.address_state)}
        </p>
        <p className="text-sm text-slate-600">Pastor: {viewValue(church.pastor?.full_name || "Não definido")}</p>
        <p className="text-sm text-slate-600">Obreiros: {church.workers_count ?? 0}</p>
      </div>
    );
  }

  function renderActionMenu(church: ChurchInScopeItem) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <MoreHorizontal className="mr-2 h-4 w-4" />
            Acoes
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openPastorModal(church)}>
            {pastorActionLabel(church)}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEditModal(church)}>Editar</DropdownMenuItem>
          <DropdownMenuItem
            className="text-rose-600 focus:text-rose-700"
            onClick={() => onDeleteChurch(church)}
          >
            Desativar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Igrejas cadastradas</CardTitle>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:w-auto lg:items-center">
              <Button className="w-full lg:w-auto" variant={view === "lista" ? "default" : "outline"} size="sm" onClick={() => setView("lista")}>
                <List className="mr-2 h-4 w-4" /> Lista
              </Button>
              <Button className="w-full lg:w-auto" variant={view === "grid" ? "default" : "outline"} size="sm" onClick={() => setView("grid")}>
                <LayoutGrid className="mr-2 h-4 w-4" /> Grid
              </Button>
              <Button className="w-full lg:w-auto" onClick={openNewChurchModal}>Nova Igreja</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant={tab === "lista" ? "default" : "outline"} onClick={() => setTab("lista")}>Lista</Button>
            <Button
              variant={tab === "remanejamento" ? "default" : "outline"}
              onClick={() => {
                setTab("remanejamento");
                if (sortedRows.length === 1) openChurchDocs(sortedRows[0], "remanejamento");
              }}
            >
              Remanejamento
            </Button>
            <Button variant="outline" disabled>Contratos (implantacao em breve)</Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {tab === "lista" && view === "lista" ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[1080px]">
                  <div className="grid grid-cols-[100px_92px_1fr_130px_200px_110px_1fr] border-y border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
                    <span>TOTVS</span>
                    <span>Imagem</span>
                    <span>Nome</span>
                    <span>Classe</span>
                    <span>Pastor</span>
                    <span>Status</span>
                    <span>Acoes</span>
                  </div>

                  {sortedRows.map((church) => (
                    <div key={church.totvs_id} className="grid grid-cols-[100px_92px_1fr_130px_200px_110px_1fr] items-center border-b border-slate-200 px-5 py-3 text-sm">
                      <span>{church.totvs_id}</span>
                      <div className="pr-2">
                        <ChurchAvatar church={church} compact />
                      </div>
                      <span className="truncate">{church.church_name}</span>
                      <span className="capitalize">{church.church_class || "-"}</span>
                      <span className="truncate">{church.pastor?.full_name || "Não definido"}</span>
                      <span>
                        <Badge
                          variant="outline"
                          className={church.is_active === false ? "border-rose-200 bg-rose-100 text-rose-700" : "border-emerald-200 bg-emerald-100 text-emerald-700"}
                        >
                          {church.is_active === false ? "Inativa" : "Ativa"}
                        </Badge>
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openViewModal(church)}>
                          Ver
                        </Button>
                        {renderActionMenu(church)}
                      </div>
                    </div>
                  ))}

                  {sortedRows.length === 0 ? <div className="px-5 py-4 text-sm text-slate-500">Nenhuma igreja encontrada no escopo.</div> : null}
                </div>
              </div>

              <div className="grid gap-3 p-4 md:hidden">
                {sortedRows.map((church) => (
                  <Card key={`mobile-${church.totvs_id}`} className="border border-slate-200 shadow-sm">
                    <CardContent className="space-y-3 p-4">
                      <ChurchAvatar church={church} />
                      {renderCommonInfo(church)}
                      <Badge
                        variant="outline"
                        className={church.is_active === false ? "border-rose-200 bg-rose-100 text-rose-700" : "border-emerald-200 bg-emerald-100 text-emerald-700"}
                      >
                        {church.is_active === false ? "Inativa" : "Ativa"}
                      </Badge>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" variant="outline" onClick={() => openViewModal(church)}>
                          Ver
                        </Button>
                        {renderActionMenu(church)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {sortedRows.length === 0 ? <p className="text-sm text-slate-500">Nenhuma igreja encontrada no escopo.</p> : null}
              </div>
            </>
          ) : null}

          {tab === "lista" && view === "grid" ? (
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
              {sortedRows.map((church) => (
                <Card key={church.totvs_id} className="border border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-4">
                    <div className="mx-auto">
                      <ChurchAvatar church={church} />
                    </div>
                    {renderGridInfo(church)}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 capitalize">
                        Classe: {viewValue(church.church_class)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={church.is_active === false ? "border-rose-200 bg-rose-100 text-rose-700" : "border-emerald-200 bg-emerald-100 text-emerald-700"}
                      >
                        {church.is_active === false ? "Inativa" : "Ativa"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openViewModal(church)}>
                        Ver
                      </Button>
                      {renderActionMenu(church)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          {tab === "remanejamento" ? (
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedRows.map((church) => (
                <Card key={`${tab}-${church.totvs_id}`} className="border border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-4">
                    <div className="mx-auto">
                      <ChurchAvatar church={church} />
                    </div>
                    {renderGridInfo(church)}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 capitalize">
                        Classe: {viewValue(church.church_class)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={church.is_active === false ? "border-rose-200 bg-rose-100 text-rose-700" : "border-emerald-200 bg-emerald-100 text-emerald-700"}
                      >
                        {church.is_active === false ? "Inativa" : "Ativa"}
                      </Badge>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => openChurchDocs(church, "remanejamento")}
                    >
                      Abrir remanejamento
                    </Button>
                  </CardContent>
                </Card>
              ))}

              {sortedRows.length === 0 ? <p className="text-sm text-slate-500">Nenhuma igreja encontrada no escopo.</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <span className="text-sm text-slate-600">Pagina {page} / {totalPages}</span>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Proxima
        </Button>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Igreja</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onCreateChurch}>
            <div className="space-y-1">
              <Label>TOTVS *</Label>
              <Input value={newForm.totvs_id} onChange={(e) => setNewForm((p) => ({ ...p, totvs_id: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Nome da igreja *</Label>
              <Input value={newForm.church_name} onChange={(e) => setNewForm((p) => ({ ...p, church_name: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Classe *</Label>
              <Select
                value={newForm.class}
                onValueChange={(v) =>
                  setNewForm((p) => ({
                    ...p,
                    class: v as NewChurchForm["class"],
                    parent_totvs_id: isAdmin ? "" : v === "estadual" ? "" : parentTotvsFromSession,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedCreateClasses.map((item) => (
                    <SelectItem key={item} value={item}>
                      {classLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!canCreateChurch ? <p className="text-xs text-amber-700">Seu nível atual não permite criar novas igrejas.</p> : null}
            </div>

            {newChurchNeedsParent ? (
              <div className="space-y-1">
                <Label>Igreja mãe (TOTVS)</Label>
                <Input
                  value={newForm.parent_totvs_id}
                  onChange={(e) => setNewForm((p) => ({ ...p, parent_totvs_id: e.target.value }))}
                  readOnly={!isAdmin && Boolean(parentTotvsFromSession)}
                  placeholder="TOTVS da igreja mãe"
                />
                {!isAdmin && parentTotvsFromSession ? (
                  <p className="text-xs text-slate-500">Igreja mãe definida automaticamente pelo login atual.</p>
                ) : null}
              </div>
            ) : isAdmin ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Como administrador, você pode cadastrar qualquer classe sem informar TOTVS mãe.
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Igreja estadual não possui igreja mãe.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label>Imagem da igreja (arquivo)</Label>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <ImageCaptureInput
                    accept="image/*"
                    capture="environment"
                    onChange={(file) => {
                      setNewImageFile(file);
                      setNewImagePreview(file ? URL.createObjectURL(file) : "");
                    }}
                  />
                  {newImagePreview ? (
                    <img
                      src={newImagePreview}
                      alt="Preview da imagem da igreja"
                      className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : null}
                </div>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Foto da igreja (URL)</Label>
                <Input
                  value={newForm.image_url}
                  onChange={(e) => setNewForm((p) => ({ ...p, image_url: e.target.value }))}
                  placeholder="https://.../imagem-da-igreja.jpg"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Carimbo da igreja (arquivo)</Label>
                <ImageCaptureInput
                  accept="image/*"
                  capture="environment"
                  allowWhiteBg
                  defaultRatio={1}
                  editorTitle="Editar carimbo da igreja"
                  onChange={(file) => setNewStampFile(file)}
                />
                <p className="text-xs text-slate-500">O carimbo sera salvo junto com o cadastro da igreja.</p>
              </div>
              <div className="space-y-1">
                <Label>Email de contato</Label>
                <Input value={newForm.contact_email} onChange={(e) => setNewForm((p) => ({ ...p, contact_email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Telefone de contato</Label>
                <Input
                  value={newForm.contact_phone}
                  onChange={(e) => setNewForm((p) => ({ ...p, contact_phone: formatPhoneBr(e.target.value) }))}
                  placeholder="(27) 99999-9999"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input
                  value={maskCep(newForm.cep)}
                  onChange={(e) => setNewForm((p) => ({ ...p, cep: e.target.value }))}
                  onBlur={() => void autofillNewCep(true)}
                  placeholder="00000-000"
                />
                <p className="text-xs text-slate-500">{newCepLoading ? "Buscando endereco..." : "Endereco preenchido automaticamente pelo CEP."}</p>
              </div>
              <div className="space-y-1">
                <Label>Pais</Label>
                <Input value={newForm.address_country} onChange={(e) => setNewForm((p) => ({ ...p, address_country: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Rua</Label>
                <Input value={newForm.address_street} onChange={(e) => setNewForm((p) => ({ ...p, address_street: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Numero</Label>
                <Input value={newForm.address_number} onChange={(e) => setNewForm((p) => ({ ...p, address_number: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Complemento</Label>
                <Input value={newForm.address_complement} onChange={(e) => setNewForm((p) => ({ ...p, address_complement: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={newForm.address_neighborhood} onChange={(e) => setNewForm((p) => ({ ...p, address_neighborhood: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Cidade</Label>
                <Input value={newForm.address_city} onChange={(e) => setNewForm((p) => ({ ...p, address_city: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Select value={newForm.address_state || ""} onValueChange={(value) => setNewForm((p) => ({ ...p, address_state: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZIL_UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="church-is-active"
                type="checkbox"
                checked={newForm.is_active}
                onChange={(e) => setNewForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              <Label htmlFor="church-is-active">Igreja ativa</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)} disabled={savingNew}>Cancelar</Button>
              <Button type="submit" disabled={savingNew || !canCreateChurch}>{savingNew ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingChurch)} onOpenChange={(open) => !open && setEditingChurch(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar igreja</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSaveEdit}>
            <div className="space-y-1">
              <Label>TOTVS *</Label>
              <Input value={editForm.totvs_id} disabled />
            </div>

            <div className="space-y-1">
              <Label>Nome da igreja *</Label>
              <Input value={editForm.church_name} onChange={(e) => setEditForm((p) => ({ ...p, church_name: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Classe *</Label>
              <Select value={editForm.class} onValueChange={(v) => setEditForm((p) => ({ ...p, class: v as NewChurchForm["class"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="estadual">estadual</SelectItem>
                  <SelectItem value="setorial">setorial</SelectItem>
                  <SelectItem value="central">central</SelectItem>
                  <SelectItem value="regional">regional</SelectItem>
                  <SelectItem value="local">local</SelectItem>
                  <SelectItem value="casa_oracao">casa de oração</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Parent TOTVS (opcional)</Label>
              <Input value={editForm.parent_totvs_id} onChange={(e) => setEditForm((p) => ({ ...p, parent_totvs_id: e.target.value }))} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label>Imagem da igreja (arquivo)</Label>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <ImageCaptureInput
                    accept="image/*"
                    capture="environment"
                    onChange={(file) => {
                      setEditImageFile(file);
                      setEditImagePreview(file ? URL.createObjectURL(file) : "");
                    }}
                  />
                  {editImagePreview ? (
                    <img
                      src={editImagePreview}
                      alt="Preview da imagem da igreja"
                      className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : null}
                </div>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Foto da igreja (URL)</Label>
                <Input
                  value={editForm.image_url}
                  onChange={(e) => setEditForm((p) => ({ ...p, image_url: e.target.value }))}
                  placeholder="https://.../imagem-da-igreja.jpg"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Carimbo da igreja</Label>
                <ImageCaptureInput
                  accept="image/*"
                  capture="environment"
                  allowWhiteBg
                  defaultRatio={1}
                  editorTitle="Editar carimbo da igreja"
                  disabled={Boolean(editForm.stamp_church_url)}
                  onChange={(file) => setEditStampFile(file)}
                />
                {editForm.stamp_church_url ? (
                  <p className="text-xs text-emerald-700">Carimbo já cadastrado. Caso precise trocar, fale com a secretaria.</p>
                ) : (
                  <p className="text-xs text-slate-500">Envie o carimbo apenas se a igreja ainda nao tiver.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Email de contato</Label>
                <Input value={editForm.contact_email} onChange={(e) => setEditForm((p) => ({ ...p, contact_email: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Telefone de contato</Label>
                <Input
                  value={editForm.contact_phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, contact_phone: formatPhoneBr(e.target.value) }))}
                  placeholder="(27) 99999-9999"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input
                  value={maskCep(editForm.cep)}
                  onChange={(e) => setEditForm((p) => ({ ...p, cep: e.target.value }))}
                  onBlur={() => void autofillEditCep(true)}
                  placeholder="00000-000"
                />
                <p className="text-xs text-slate-500">{editCepLoading ? "Buscando endereco..." : "Endereco preenchido automaticamente pelo CEP."}</p>
              </div>
              <div className="space-y-1">
                <Label>Pais</Label>
                <Input value={editForm.address_country} onChange={(e) => setEditForm((p) => ({ ...p, address_country: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Rua</Label>
                <Input value={editForm.address_street} onChange={(e) => setEditForm((p) => ({ ...p, address_street: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Numero</Label>
                <Input value={editForm.address_number} onChange={(e) => setEditForm((p) => ({ ...p, address_number: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Complemento</Label>
                <Input value={editForm.address_complement} onChange={(e) => setEditForm((p) => ({ ...p, address_complement: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={editForm.address_neighborhood} onChange={(e) => setEditForm((p) => ({ ...p, address_neighborhood: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Cidade</Label>
                <Input value={editForm.address_city} onChange={(e) => setEditForm((p) => ({ ...p, address_city: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Select value={editForm.address_state || ""} onValueChange={(value) => setEditForm((p) => ({ ...p, address_state: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZIL_UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="church-edit-is-active"
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              <Label htmlFor="church-edit-is-active">Igreja ativa</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingChurch(null)} disabled={savingEdit}>Cancelar</Button>
              <Button type="submit" disabled={savingEdit}>{savingEdit ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewChurch)} onOpenChange={(open) => !open && setViewChurch(null)}>
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle>Dados da igreja</DialogTitle>
                <DialogDescription>Resumo completo da igreja selecionada.</DialogDescription>
              </div>
              {viewChurch ? (
                <div className="mr-10 flex items-center gap-2 md:mr-12">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openEditModal(viewChurch);
                      setViewChurch(null);
                    }}
                  >
                    Editar
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">Acoes</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        openPastorModal(viewChurch);
                        setViewChurch(null);
                      }}>
                        {pastorActionLabel(viewChurch)}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openChurchDocs(viewChurch, "remanejamento")}>Remanejamento</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openChurchDocs(viewChurch, "contrato")}>Contrato</DropdownMenuItem>
                      <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={() => {
                        onDeleteChurch(viewChurch);
                        setViewChurch(null);
                      }}>
                        Desativar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
          </DialogHeader>

          {viewChurch ? (
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="space-y-6 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="h-36 w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <img
                      src={getChurchImage(viewChurch)}
                      alt={`Foto da igreja ${viewChurch.church_name}`}
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-2xl font-bold text-slate-900">{viewValue(viewChurch.church_name)}</h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 capitalize">
                        Classe: {viewValue(viewChurch.church_class)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={viewChurch.is_active === false ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}
                      >
                        Status: {viewChurch.is_active === false ? "Inativa" : "Ativa"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <section className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Identificacao</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">TOTVS</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.totvs_id)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Igreja mãe</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.parent_totvs_id)}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contato</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">Pastor responsável</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.pastor?.full_name)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Obreiros cadastrados</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.workers_count)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">E-mail</p>
                      <p className="text-base font-semibold text-slate-900 break-all">{viewValue(viewChurch.contact_email)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Telefone</p>
                      <p className="text-base font-semibold text-slate-900">{formatPhoneBr(viewChurch.contact_phone)}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Endereco</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">CEP</p>
                      <p className="text-base font-semibold text-slate-900">{formatCepBr(viewChurch.cep) || "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Rua</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.address_street)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Numero</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.address_number)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Complemento</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.address_complement)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Bairro</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.address_neighborhood)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Cidade / UF</p>
                      <p className="text-base font-semibold text-slate-900">{`${viewValue(viewChurch.address_city)} / ${viewValue(viewChurch.address_state)}`}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ministerio</h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">Tipo de igreja</p>
                      <p className="text-base font-semibold text-slate-900 capitalize">{viewValue(viewChurch.church_class)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Pais</p>
                      <p className="text-base font-semibold text-slate-900">{viewValue(viewChurch.address_country)}</p>
                    </div>
                  </div>
                </section>
              </CardContent>
            </Card>
          ) : null}
        </DialogContent>
      </Dialog>

      <ModalTrocarPastor
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        church={selectedChurch}
        onSaved={refetchChurches}
      />

      <ChurchDocsDialog
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        church={docsChurch}
        initialTab={docsInitialTab}
      />
    </>
  );
}



