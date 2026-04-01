import { ChangeEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ClipboardList,
  Clock,
  Copy,
  DollarSign,
  Edit,
  Eye,
  Megaphone,
  Plus,
  Search,
  Shirt,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { useUser } from "@/context/UserContext";
import { post } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type DashboardOrder = {
  id: string;
  order_number?: string | null;
  full_name?: string | null;
  phone?: string | null;
  church_name?: string | null;
  payment_method?: string | null;
  total_amount?: number | null;
  status?: string | null;
  created_at?: string | null;
  notes?: string | null;
  estadual_totvs_id?: string | null;
  payment_installments?: number | null;
  items?: Array<{
    product_name?: string | null;
    size?: string | null;
    quantity?: number | null;
    total_price?: number | null;
  }>;
};

type ProductRow = {
  id: string;
  name?: string | null;
  description?: string | null;
  image_url?: string | null;
  price?: number | null;
  is_active?: boolean | null;
};

type ProductSizeRow = {
  id: string;
  product_id: string;
  size?: string | null;
  stock?: number | null;
  is_active?: boolean | null;
};

type EventRow = {
  id: string;
  title?: string | null;
  body_text?: string | null;
  media_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  position?: number | null;
  link_url?: string | null;
  is_active?: boolean | null;
};

type AnnouncementRow = {
  id: string;
  title?: string | null;
  body_text?: string | null;
  media_url?: string | null;
  link_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  type?: string | null;
  position?: number | null;
  is_active?: boolean | null;
};

type ChurchRow = {
  totvs_id: string;
  church_name?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  NOVO: "Novo",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  PAGO: "Pago",
  EM_SEPARACAO: "Em separação",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const SIZE_OPTIONS = ["PP", "P", "M", "G", "GG", "XG"];

const TAB_ITEMS = [
  { value: "dashboard", label: "Painel" },
  { value: "informativos", label: "Informativos" },
  { value: "camisetas", label: "Camisetas" },
  { value: "tamanhos", label: "Tamanhos" },
  { value: "pedidos", label: "Pedidos" },
  { value: "links", label: "Publicação" },
] as const;

const EVENT_MARKER = "event://internal";

const STATUS_BADGE: Record<string, string> = {
  NOVO: "bg-sky-100 text-sky-800",
  AGUARDANDO_PAGAMENTO: "bg-amber-100 text-amber-800",
  PAGO: "bg-emerald-100 text-emerald-700",
  EM_SEPARACAO: "bg-orange-100 text-orange-700",
  ENTREGUE: "bg-green-100 text-green-700",
  CANCELADO: "bg-rose-100 text-rose-700",
};

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("pt-BR");
}

function badgeByStatus(status?: string | null) {
  const key = String(status || "");
  return STATUS_BADGE[key] || "bg-slate-100 text-slate-600";
}

export default function DivulgacaoPage() {
  const { usuario, session } = useUser();
  const queryClient = useQueryClient();
  const roleMode = usuario?.role === "admin" ? "admin" : "pastor";

  const [tab, setTab] = useState("dashboard");
  const [churchForLink, setChurchForLink] = useState(session?.totvs_id || "");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderDetail, setOrderDetail] = useState<DashboardOrder | null>(null);
  const [orderNewStatus, setOrderNewStatus] = useState("NOVO");

  const [openProdutoModal, setOpenProdutoModal] = useState(false);
  const [openTamanhoModal, setOpenTamanhoModal] = useState(false);
  const [openEventoModal, setOpenEventoModal] = useState(false);
  const [openInformativoModal, setOpenInformativoModal] = useState(false);
  const [editingProdutoId, setEditingProdutoId] = useState<string | null>(null);
  const [editingTamanhoId, setEditingTamanhoId] = useState<string | null>(null);
  const [editingEventoId, setEditingEventoId] = useState<string | null>(null);
  const [editingInformativoId, setEditingInformativoId] = useState<string | null>(null);
  const [uploadingProduto, setUploadingProduto] = useState(false);
  const [uploadingEvento, setUploadingEvento] = useState(false);
  const [uploadingInformativo, setUploadingInformativo] = useState(false);

  const [produtoForm, setProdutoForm] = useState({ name: "", description: "", image_url: "", price: "" });
  const [tamanhoForm, setTamanhoForm] = useState({ product_id: "", size: "", stock: "0" });
  const [eventoForm, setEventoForm] = useState({ title: "", description: "", banner_url: "", start_date: "", end_date: "", sort_order: "0" });
  const [informativoForm, setInformativoForm] = useState({
    title: "",
    body_text: "",
    media_url: "",
    position: "1",
    start_date: "",
    end_date: "",
  });

  const { data: orders = [] } = useQuery<DashboardOrder[]>({
    queryKey: ["div-orders", session?.totvs_id],
    enabled: !!session?.totvs_id,
    queryFn: async () => (await post<any>("list-orders", { limit: 300 })).orders || [],
  });

  const { data: products = [] } = useQuery<ProductRow[]>({
    queryKey: ["div-products", session?.totvs_id],
    enabled: !!session?.totvs_id,
    queryFn: async () => (await post<any>("list-products", {})).products || [],
  });

  const { data: sizes = [] } = useQuery<ProductSizeRow[]>({
    queryKey: ["div-sizes", session?.totvs_id],
    enabled: !!session?.totvs_id,
    queryFn: async () => (await post<any>("list-product-sizes", {})).product_sizes || [],
  });

  const { data: announcements = [] } = useQuery<AnnouncementRow[]>({
    queryKey: ["div-ann", session?.totvs_id, roleMode],
    // Comentario: habilita query para admin (mesmo sem session.totvs_id) e pastor (com session.totvs_id)
    enabled: roleMode === "admin" || !!session?.totvs_id,
    // Comentario: admin ve TODAS as divulgacoes (sem filtro por church_totvs_id)
    // Pastor ve apenas divulgacoes da sua igreja
    queryFn: async () => (await post<any>("announcements-api", { action: "list-admin", church_totvs_id: roleMode === "admin" ? undefined : session?.totvs_id })).announcements || [],
  });

  const events = useMemo<EventRow[]>(
    () => announcements.filter((item) => String(item.link_url || "") === EVENT_MARKER),
    [announcements],
  );

  const infoItems = useMemo<AnnouncementRow[]>(
    () => announcements.filter((item) => String(item.link_url || "") !== EVENT_MARKER),
    [announcements],
  );

  const { data: churches = [] } = useQuery<ChurchRow[]>({
    queryKey: ["div-churches", session?.totvs_id],
    enabled: !!session?.totvs_id,
    queryFn: async () => (await post<any>("churches-api", { action: "list-in-scope", page: 1, page_size: 300 })).churches || [],
  });

  const updateStatus = useMutation({
    mutationFn: async ({ order_id, status }: { order_id: string; status: string }) =>
      post("update-order-status", { order_id, status }),
    onSuccess: async () => {
      toast.success("Status atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["div-orders"] });
    },
    onError: () => toast.error("Não foi possível atualizar o status."),
  });

  const createProduto = useMutation({
    mutationFn: async () =>
      post("upsert-product", {
        id: editingProdutoId || undefined,
        name: produtoForm.name.trim(),
        description: produtoForm.description.trim() || null,
        event_id: null,
        event_title: null,
        image_url: produtoForm.image_url.trim() || null,
        price: Number(produtoForm.price || 0),
        is_active: true,
      }),
    onSuccess: async () => {
      toast.success(editingProdutoId ? "Camiseta atualizada." : "Camiseta cadastrada.");
      setOpenProdutoModal(false);
      setEditingProdutoId(null);
      setProdutoForm({ name: "", description: "", image_url: "", price: "" });
      await queryClient.invalidateQueries({ queryKey: ["div-products"] });
    },
    onError: () => toast.error("Falha ao cadastrar camiseta."),
  });

  const createTamanho = useMutation({
    mutationFn: async () =>
      post("upsert-product-size", {
        id: editingTamanhoId || undefined,
        product_id: tamanhoForm.product_id,
        size: tamanhoForm.size,
        stock: Number(tamanhoForm.stock || 0),
        is_active: true,
      }),
    onSuccess: async () => {
      toast.success(editingTamanhoId ? "Tamanho atualizado." : "Tamanho cadastrado.");
      setOpenTamanhoModal(false);
      setEditingTamanhoId(null);
      setTamanhoForm({ product_id: "", size: "", stock: "0" });
      await queryClient.invalidateQueries({ queryKey: ["div-sizes"] });
    },
    onError: () => toast.error("Falha ao cadastrar tamanho."),
  });

  const createEvento = useMutation({
    mutationFn: async () =>
      post("announcements-api", {
        action: "upsert",
        id: editingEventoId || undefined,
        church_totvs_id: session?.totvs_id,
        title: eventoForm.title.trim(),
        type: eventoForm.banner_url.trim() ? "image" : "text",
        body_text: eventoForm.description.trim() || null,
        media_url: eventoForm.banner_url.trim() || null,
        starts_at: eventoForm.start_date ? `${eventoForm.start_date}T00:00:00Z` : null,
        ends_at: eventoForm.end_date ? `${eventoForm.end_date}T23:59:59Z` : null,
        position: Number(eventoForm.sort_order || 0),
        link_url: EVENT_MARKER,
        is_active: true,
      }),
    onSuccess: async () => {
      toast.success(editingEventoId ? "Evento atualizado." : "Evento cadastrado.");
      setOpenEventoModal(false);
      setEditingEventoId(null);
      setEventoForm({ title: "", description: "", banner_url: "", start_date: "", end_date: "", sort_order: "0" });
      await queryClient.invalidateQueries({ queryKey: ["div-ann"] });
    },
    onError: () => toast.error("Falha ao cadastrar evento."),
  });

  const createInformativo = useMutation({
    mutationFn: async () =>
      post("announcements-api", {
        action: "upsert",
        id: editingInformativoId || undefined,
        church_totvs_id: session?.totvs_id,
        title: informativoForm.title.trim(),
        type: informativoForm.media_url.trim() ? "image" : "text",
        body_text: informativoForm.body_text.trim() || null,
        media_url: informativoForm.media_url.trim() || null,
        starts_at: informativoForm.start_date ? `${informativoForm.start_date}T00:00:00Z` : null,
        ends_at: informativoForm.end_date ? `${informativoForm.end_date}T23:59:59Z` : null,
        position: Number(informativoForm.position || 1),
        link_url: null,
        is_active: true,
      }),
    onSuccess: async () => {
      toast.success(editingInformativoId ? "Informativo atualizado." : "Informativo cadastrado.");
      setOpenInformativoModal(false);
      setEditingInformativoId(null);
      setInformativoForm({ title: "", body_text: "", media_url: "", position: "1", start_date: "", end_date: "" });
      await queryClient.invalidateQueries({ queryKey: ["div-ann"] });
    },
    onError: () => toast.error("Falha ao cadastrar informativo."),
  });

  const deleteEvento = useMutation({
    mutationFn: async (id: string) => post("announcements-api", { action: "delete", id }),
    onSuccess: async () => {
      toast.success("Evento excluído.");
      await queryClient.invalidateQueries({ queryKey: ["div-ann"] });
    },
    onError: () => toast.error("Falha ao excluir evento."),
  });

  const deleteInformativo = useMutation({
    mutationFn: async (id: string) => post("announcements-api", { action: "delete", id }),
    onSuccess: async () => {
      toast.success("Informativo excluído.");
      await queryClient.invalidateQueries({ queryKey: ["div-ann"] });
    },
    onError: () => toast.error("Falha ao excluir informativo."),
  });

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesStatus = orderStatusFilter === "all" || o.status === orderStatusFilter;
      const matchesSearch =
        !q ||
        String(o.order_number || "").toLowerCase().includes(q) ||
        String(o.full_name || "").toLowerCase().includes(q) ||
        String(o.church_name || "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [orders, orderSearch, orderStatusFilter]);

  const stats = useMemo(() => {
    const total = orders.length;
    const novos = orders.filter((o) => o.status === "NOVO").length;
    const aguardando = orders.filter((o) => o.status === "AGUARDANDO_PAGAMENTO").length;
    const pagos = orders.filter((o) => o.status === "PAGO").length;
    const entregues = orders.filter((o) => o.status === "ENTREGUE").length;
    const cancelados = orders.filter((o) => o.status === "CANCELADO").length;
    const totalStock = sizes.reduce((acc, s) => acc + Number(s.stock || 0), 0);
    const produtosAtivos = products.filter((p) => p.is_active !== false).length;
    return { total, novos, aguardando, pagos, entregues, cancelados, totalStock, produtosAtivos };
  }, [orders, sizes, products]);

  const uploadToAvatars = async (file: File, folder: "produtos" | "eventos") => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    const path = `camisas/${session?.totvs_id || "global"}/${folder}/${Date.now()}-${baseName || "arquivo"}.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  };

  const onSelectProdutoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingProduto(true);
      const url = await uploadToAvatars(file, "produtos");
      setProdutoForm((prev) => ({ ...prev, image_url: url }));
      toast.success("Imagem enviada com sucesso.");
    } catch {
      toast.error("Não foi possível enviar a imagem.");
    } finally {
      setUploadingProduto(false);
      e.target.value = "";
    }
  };

  const onSelectEventoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingEvento(true);
      const url = await uploadToAvatars(file, "eventos");
      setEventoForm((prev) => ({ ...prev, banner_url: url }));
      toast.success("Banner enviado com sucesso.");
    } catch {
      toast.error("Não foi possível enviar o banner.");
    } finally {
      setUploadingEvento(false);
      e.target.value = "";
    }
  };

  const onSelectInformativoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingInformativo(true);
      const url = await uploadToAvatars(file, "eventos");
      setInformativoForm((prev) => ({ ...prev, media_url: url }));
      toast.success("Imagem enviada com sucesso.");
    } catch {
      toast.error("Não foi possível enviar a imagem.");
    } finally {
      setUploadingInformativo(false);
      e.target.value = "";
    }
  };

  const linkBase = typeof window !== "undefined" ? window.location.origin : "";
  const activeTotvs = churchForLink || session?.totvs_id || "";
  const vitrineUrl = activeTotvs ? `${linkBase}/camisas/${activeTotvs}` : "";

  async function copyLink(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  const openOrderDetail = (order: DashboardOrder) => {
    setOrderDetail(order);
    setOrderNewStatus(order.status || "NOVO");
  };

  const saveOrderStatus = (status: string) => {
    if (!orderDetail) return;
    updateStatus.mutate(
      { order_id: orderDetail.id, status },
      {
        onSuccess: () => {
          setOrderDetail(null);
        },
      },
    );
  };

  return (
    <ManagementShell roleMode={roleMode as "admin" | "pastor"}>
      <div className="space-y-4">
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl text-slate-900">
              <Megaphone className="h-6 w-6 text-blue-600" />
              Divulgação e Camisetas
            </CardTitle>
            <p className="text-sm text-slate-600">Painel com o mesmo visual do sistema original de camisetas.</p>
          </CardHeader>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="md:hidden">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a aba" />
              </SelectTrigger>
              <SelectContent>
                {TAB_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TabsList className="hidden h-auto w-full flex-wrap justify-start gap-2 rounded-xl border border-slate-200 bg-white p-2 md:flex">
            {TAB_ITEMS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="data-[state=active]:bg-[#232b7a] data-[state=active]:text-white"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">Painel</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {[
                { label: "Total de Pedidos", value: stats.total, icon: ClipboardList, iconClass: "bg-indigo-100 text-indigo-700", footer: "Total de pedidos" },
                { label: "Novos", value: stats.novos, icon: Clock, iconClass: "bg-sky-100 text-sky-700", footer: "Novos" },
                { label: "Aguardando Pgto", value: stats.aguardando, icon: DollarSign, iconClass: "bg-amber-100 text-amber-700", footer: "Aguardando pgto" },
                { label: "Pagos", value: stats.pagos, icon: DollarSign, iconClass: "bg-emerald-100 text-emerald-700", footer: "Pagos" },
                { label: "Entregues", value: stats.entregues, icon: Truck, iconClass: "bg-green-100 text-green-700", footer: "Entregues" },
                { label: "Cancelados", value: stats.cancelados, icon: XCircle, iconClass: "bg-rose-100 text-rose-700", footer: "Cancelados" },
                { label: "Estoque", value: stats.totalStock, icon: Boxes, iconClass: "bg-orange-100 text-orange-700", footer: `Estoque (${stats.produtosAtivos} produtos)` },
              ].map((card) => (
                <Card key={card.label} className="rounded-xl border border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.iconClass}`}>
                      <card.icon className="h-5 w-5" />
                    </div>
                    <p className="text-4xl font-bold leading-none text-slate-900">{card.value}</p>
                    <p className="mt-2 text-sm text-slate-600">{card.footer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="rounded-xl border border-slate-200 bg-white">
              <CardHeader className="border-b border-slate-200 pb-4">
                <CardTitle className="text-xl text-slate-900">Pedidos Recentes</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">Pedido</th>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Igreja</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 10).map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-semibold text-slate-900">{order.order_number || "-"}</td>
                        <td className="px-4 py-3 text-slate-800">{order.full_name || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{order.church_name || "-"}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(order.total_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeByStatus(order.status)}`}>
                            {STATUS_LABEL[String(order.status || "")] || order.status || "-"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pedidos" className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900">Gestão de Pedidos</h2>
            <div className="grid gap-3 md:grid-cols-[1fr_260px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome ou nº do pedido..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                />
              </div>
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Todos os status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="rounded-xl border">
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">Pedido</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Telefone</th>
                      <th className="px-4 py-3">Igreja</th>
                      <th className="px-4 py-3">Pagamento</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="px-4 py-3 font-semibold">{order.order_number || "-"}</td>
                        <td className="px-4 py-3">{formatDate(order.created_at)}</td>
                        <td className="px-4 py-3">{order.full_name || "-"}</td>
                        <td className="px-4 py-3">{order.phone || "-"}</td>
                        <td className="px-4 py-3">{order.church_name || "-"}</td>
                        <td className="px-4 py-3">{order.payment_method || "-"}</td>
                        <td className="px-4 py-3 font-semibold">{formatMoney(order.total_amount)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeByStatus(order.status)}`}>
                            {STATUS_LABEL[String(order.status || "")] || order.status || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button className="text-blue-700 hover:opacity-80" onClick={() => openOrderDetail(order)}>
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="camisetas" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Gestão de Camisetas</h3>
              {/* Comentario: apenas pastor pode criar camisetas, admin so pode visualizar */}
              {roleMode !== "admin" && (
                <Button
                  className="bg-[#232b7a] text-white hover:bg-[#1b2367]"
                  onClick={() => {
                    setEditingProdutoId(null);
                    setProdutoForm({ name: "", description: "", image_url: "", price: "" });
                    setOpenProdutoModal(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova camiseta
                </Button>
              )}
            </div>
            <Card><CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Preço</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ações</th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 overflow-hidden rounded-md bg-slate-100">
                            {product.image_url ? <img src={product.image_url} alt={product.name || "Produto"} className="h-full w-full object-cover" /> : null}
                          </div>
                          <div>
                            <p className="font-semibold">{product.name || "Sem nome"}</p>
                            <p className="text-xs text-slate-500">{product.description || "Sem descrição"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold">{formatMoney(product.price)}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${product.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{product.is_active ? "Ativo" : "Inativo"}</span></td>
                      <td className="px-4 py-3">
                        {/* Comentario: apenas pastor pode editar/deletar camisetas */}
                        {roleMode !== "admin" && (
                          <div className="flex items-center gap-3">
                            <button className="text-blue-700" onClick={() => { setEditingProdutoId(product.id); setProdutoForm({ name: product.name || "", description: product.description || "", image_url: product.image_url || "", price: String(product.price || "") }); setOpenProdutoModal(true); }}><Edit className="h-4 w-4" /></button>
                            <button className="text-slate-500" onClick={() => post("upsert-product", { id: product.id, is_active: !product.is_active }).then(() => queryClient.invalidateQueries({ queryKey: ["div-products"] }))}>{product.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}</button>
                            <button className="text-rose-600" onClick={() => post("upsert-product", { id: product.id, is_active: false }).then(() => { toast.success("Camiseta inativada."); queryClient.invalidateQueries({ queryKey: ["div-products"] }); })}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="tamanhos" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Gestão de Tamanhos</h3>
              {/* Comentario: apenas pastor pode criar tamanhos, admin so pode visualizar */}
              {roleMode !== "admin" && (
                <Button
                  className="bg-[#232b7a] text-white hover:bg-[#1b2367]"
                  onClick={() => {
                    setEditingTamanhoId(null);
                    setTamanhoForm({ product_id: "", size: "", stock: "0" });
                    setOpenTamanhoModal(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo tamanho
                </Button>
              )}
            </div>
            <Card><CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Tamanho</th><th className="px-4 py-3">Estoque</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ações</th></tr></thead>
                <tbody>
                  {sizes.map((size) => {
                    const productName = products.find((p) => p.id === size.product_id)?.name || "-";
                    return (
                      <tr key={size.id} className="border-b last:border-0">
                        <td className="px-4 py-3">{productName}</td>
                        <td className="px-4 py-3 font-semibold">{size.size || "-"}</td>
                        <td className="px-4 py-3">{size.stock || 0}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${size.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{size.is_active ? "Ativo" : "Inativo"}</span></td>
                        <td className="px-4 py-3">
                          {/* Comentario: apenas pastor pode editar/deletar tamanhos */}
                          {roleMode !== "admin" && (
                            <div className="flex items-center gap-3">
                              <button className="text-blue-700" onClick={() => { setEditingTamanhoId(size.id); setTamanhoForm({ product_id: size.product_id, size: size.size || "", stock: String(size.stock || 0) }); setOpenTamanhoModal(true); }}><Edit className="h-4 w-4" /></button>
                              <button className="text-slate-500" onClick={() => post("upsert-product-size", { id: size.id, is_active: !size.is_active }).then(() => queryClient.invalidateQueries({ queryKey: ["div-sizes"] }))}>{size.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}</button>
                              <button className="text-rose-600" onClick={() => post("upsert-product-size", { id: size.id, is_active: false }).then(() => { toast.success("Tamanho inativado."); queryClient.invalidateQueries({ queryKey: ["div-sizes"] }); })}><Trash2 className="h-4 w-4" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="eventos" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Gestão de Eventos</h3>
              {/* Comentario: apenas pastor pode criar eventos, admin so pode visualizar */}
              {roleMode !== "admin" && (
                <Button
                  className="bg-[#232b7a] text-white hover:bg-[#1b2367]"
                  onClick={() => {
                    setEditingEventoId(null);
                    setEventoForm({ title: "", description: "", banner_url: "", start_date: "", end_date: "", sort_order: "0" });
                    setOpenEventoModal(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo evento
                </Button>
              )}
            </div>
            <Card><CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Período</th><th className="px-4 py-3">Ordem</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ações</th></tr></thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{event.title || "Sem título"}</p>
                        <p className="text-xs text-slate-500">{event.body_text || "Sem descrição"}</p>
                      </td>
                      <td className="px-4 py-3">{formatDate(event.starts_at)} - {formatDate(event.ends_at)}</td>
                      <td className="px-4 py-3">{event.position || 0}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{event.is_active ? "Ativo" : "Inativo"}</span></td>
                      <td className="px-4 py-3">
                        {/* Comentario: apenas pastor pode editar/deletar eventos */}
                        {roleMode !== "admin" && (
                          <div className="flex items-center gap-3">
                            <button className="text-blue-700" onClick={() => { setEditingEventoId(event.id); setEventoForm({ title: event.title || "", description: event.body_text || "", banner_url: event.media_url || "", start_date: String(event.starts_at || "").slice(0, 10), end_date: String(event.ends_at || "").slice(0, 10), sort_order: String(event.position || 0) }); setOpenEventoModal(true); }}><Edit className="h-4 w-4" /></button>
                            <button className="text-slate-500" onClick={() => post("announcements-api", { action: "upsert", id: event.id, church_totvs_id: session?.totvs_id, is_active: !event.is_active }).then(() => queryClient.invalidateQueries({ queryKey: ["div-ann"] }))}>{event.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}</button>
                            <button className="text-rose-600" onClick={() => deleteEvento.mutate(event.id)}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="informativos" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Gestão de Informativos</h3>
              {/* Comentario: apenas pastor pode criar informativos, admin so pode visualizar */}
              {roleMode !== "admin" && (
                <Button
                  className="bg-[#232b7a] text-white hover:bg-[#1b2367]"
                  onClick={() => {
                    setEditingInformativoId(null);
                    setInformativoForm({ title: "", body_text: "", media_url: "", position: "1", start_date: "", end_date: "" });
                    setOpenInformativoModal(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo informativo
                </Button>
              )}
            </div>
            <Card><CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="px-4 py-3">Título</th><th className="px-4 py-3">Conteúdo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ações</th></tr></thead>
                <tbody>
                  {infoItems.map((ann) => (
                    <tr key={ann.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-semibold">{ann.title || "Sem título"}</td>
                      <td className="px-4 py-3">{ann.body_text || "-"}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${ann.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ann.is_active ? "Ativo" : "Inativo"}</span></td>
                      <td className="px-4 py-3">
                        {/* Comentario: apenas pastor pode editar/deletar informativos */}
                        {roleMode !== "admin" && (
                          <div className="flex items-center gap-3">
                            <button className="text-blue-700" onClick={() => { setEditingInformativoId(ann.id); setInformativoForm({ title: ann.title || "", body_text: ann.body_text || "", media_url: ann.media_url || "", position: String(ann.position || 1), start_date: String(ann.starts_at || "").slice(0, 10), end_date: String(ann.ends_at || "").slice(0, 10) }); setOpenInformativoModal(true); }}><Edit className="h-4 w-4" /></button>
                            <button className="text-slate-500" onClick={() => post("announcements-api", { action: "upsert", id: ann.id, church_totvs_id: session?.totvs_id, is_active: !ann.is_active }).then(() => queryClient.invalidateQueries({ queryKey: ["div-ann"] }))}>{ann.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}</button>
                            <button className="text-rose-600" onClick={() => deleteInformativo.mutate(ann.id)}><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="links" className="space-y-3">
            <h3 className="text-xl font-bold text-slate-900">Publicação dos links</h3>
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="space-y-1">
                  <Label>Igreja do link público</Label>
                  <Select value={activeTotvs} onValueChange={setChurchForLink}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {churches.map((church) => (
                        <SelectItem key={church.totvs_id} value={church.totvs_id}>
                          {church.totvs_id} - {church.church_name || "Sem nome"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="mb-1 text-xs text-slate-500">Vitrine pública</p>
                  <div className="flex gap-2">
                    <Input value={vitrineUrl} readOnly />
                    <Button variant="outline" onClick={() => copyLink(vitrineUrl)} disabled={!vitrineUrl}><Copy className="mr-1 h-4 w-4" />Copiar</Button>
                    <Button
                      variant="outline"
                      onClick={() => vitrineUrl && window.open(vitrineUrl, "_blank", "noopener,noreferrer")}
                      disabled={!vitrineUrl}
                    >
                      Abrir
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-slate-500">A página pública carrega diretamente pelo TOTVS da URL.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={openProdutoModal} onOpenChange={setOpenProdutoModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingProdutoId ? "Editar Camiseta" : "Nova Camiseta"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome *</Label><Input value={produtoForm.name} onChange={(e) => setProdutoForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea value={produtoForm.description} onChange={(e) => setProdutoForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>URL da imagem</Label>
              <Input value={produtoForm.image_url} onChange={(e) => setProdutoForm((p) => ({ ...p, image_url: e.target.value }))} />
              {produtoForm.image_url ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <img src={produtoForm.image_url} alt="Pré-visualização da camiseta" className="max-h-56 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs text-rose-600"
                    onClick={() => setProdutoForm((p) => ({ ...p, image_url: "" }))}
                  >
                    Remover
                  </button>
                </div>
              ) : null}
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center">
                <Label htmlFor="produto-file" className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm hover:bg-slate-50">
                  Adicionar arquivo
                </Label>
                <input id="produto-file" type="file" accept="image/*" className="hidden" onChange={onSelectProdutoFile} />
                <span className="mt-2 block text-xs text-slate-500">{uploadingProduto ? "Enviando..." : "JPG, PNG ou WEBP"}</span>
              </div>
            </div>
            <div className="space-y-1"><Label>Preço *</Label><Input type="number" value={produtoForm.price} onChange={(e) => setProdutoForm((p) => ({ ...p, price: e.target.value }))} /></div>
            <Button className="w-full bg-[#232b7a] text-white hover:bg-[#1b2367]" onClick={() => createProduto.mutate()} disabled={createProduto.isPending || !produtoForm.name.trim()}>
              {createProduto.isPending ? "Salvando..." : editingProdutoId ? "Salvar alterações" : "Criar Camiseta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openTamanhoModal} onOpenChange={setOpenTamanhoModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editingTamanhoId ? "Editar Tamanho" : "Novo Tamanho"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Produto *</Label>
              <Select value={tamanhoForm.product_id} onValueChange={(v) => setTamanhoForm((p) => ({ ...p, product_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name || "Sem nome"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Tamanho *</Label>
                <Select value={tamanhoForm.size} onValueChange={(v) => setTamanhoForm((p) => ({ ...p, size: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{SIZE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Estoque</Label><Input type="number" value={tamanhoForm.stock} onChange={(e) => setTamanhoForm((p) => ({ ...p, stock: e.target.value }))} /></div>
            </div>
            <Button className="w-full bg-[#232b7a] text-white hover:bg-[#1b2367]" onClick={() => createTamanho.mutate()} disabled={createTamanho.isPending || !tamanhoForm.product_id || !tamanhoForm.size}>
              {createTamanho.isPending ? "Salvando..." : editingTamanhoId ? "Salvar alterações" : "Criar Tamanho"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openEventoModal} onOpenChange={setOpenEventoModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingEventoId ? "Editar Evento" : "Novo Evento"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título *</Label><Input value={eventoForm.title} onChange={(e) => setEventoForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea value={eventoForm.description} onChange={(e) => setEventoForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>URL do banner</Label>
              <Input value={eventoForm.banner_url} onChange={(e) => setEventoForm((p) => ({ ...p, banner_url: e.target.value }))} />
              {eventoForm.banner_url ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <img src={eventoForm.banner_url} alt="Pré-visualização do evento" className="max-h-72 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs text-rose-600"
                    onClick={() => setEventoForm((p) => ({ ...p, banner_url: "" }))}
                  >
                    Remover
                  </button>
                </div>
              ) : null}
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center">
                <Label htmlFor="evento-file" className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm hover:bg-slate-50">
                  Adicionar arquivo
                </Label>
                <input id="evento-file" type="file" accept="image/*" className="hidden" onChange={onSelectEventoFile} />
                <span className="mt-2 block text-xs text-slate-500">{uploadingEvento ? "Enviando..." : "JPG, PNG ou WEBP"}</span>
              </div>
            </div>
            <div className="max-w-xs space-y-1"><Label>Ordem</Label><Input type="number" value={eventoForm.sort_order} onChange={(e) => setEventoForm((p) => ({ ...p, sort_order: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Início</Label><Input type="date" value={eventoForm.start_date} onChange={(e) => setEventoForm((p) => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Fim</Label><Input type="date" value={eventoForm.end_date} onChange={(e) => setEventoForm((p) => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <Button className="w-full bg-[#232b7a] text-white hover:bg-[#1b2367]" onClick={() => createEvento.mutate()} disabled={createEvento.isPending || !eventoForm.title.trim()}>
              {createEvento.isPending ? "Salvando..." : editingEventoId ? "Salvar alterações" : "Criar Evento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openInformativoModal} onOpenChange={setOpenInformativoModal}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingInformativoId ? "Editar Informativo" : "Novo Informativo"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Título *</Label><Input value={informativoForm.title} onChange={(e) => setInformativoForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea value={informativoForm.body_text} onChange={(e) => setInformativoForm((p) => ({ ...p, body_text: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Imagem / Banner</Label>
              <Input value={informativoForm.media_url} onChange={(e) => setInformativoForm((p) => ({ ...p, media_url: e.target.value }))} />
              {informativoForm.media_url ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <img src={informativoForm.media_url} alt="Pré-visualização do informativo" className="max-h-72 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs text-rose-600"
                    onClick={() => setInformativoForm((p) => ({ ...p, media_url: "" }))}
                  >
                    Remover
                  </button>
                </div>
              ) : null}
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center">
                <Label htmlFor="informativo-file" className="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm hover:bg-slate-50">
                  Adicionar arquivo
                </Label>
                <input id="informativo-file" type="file" accept="image/*" className="hidden" onChange={onSelectInformativoFile} />
                <span className="mt-2 block text-xs text-slate-500">{uploadingInformativo ? "Enviando..." : "JPG, PNG ou WEBP"}</span>
              </div>
            </div>
            <div className="space-y-1"><Label>Posição</Label><Input type="number" value={informativoForm.position} onChange={(e) => setInformativoForm((p) => ({ ...p, position: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Início</Label><Input type="date" value={informativoForm.start_date} onChange={(e) => setInformativoForm((p) => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Fim</Label><Input type="date" value={informativoForm.end_date} onChange={(e) => setInformativoForm((p) => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <Button className="w-full bg-[#232b7a] text-white hover:bg-[#1b2367]" onClick={() => createInformativo.mutate()} disabled={createInformativo.isPending || !informativoForm.title.trim()}>
              {createInformativo.isPending ? "Salvando..." : editingInformativoId ? "Salvar alterações" : "Criar Informativo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!orderDetail} onOpenChange={(open) => !open && setOrderDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Pedido {orderDetail?.order_number || ""}</DialogTitle></DialogHeader>
          {orderDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Nome</span><p className="font-semibold text-slate-900">{orderDetail.full_name || "-"}</p></div>
                <div><span className="text-slate-500">Telefone</span><p className="font-semibold text-slate-900">{orderDetail.phone || "-"}</p></div>
                <div><span className="text-slate-500">Igreja</span><p className="font-semibold text-slate-900">{orderDetail.church_name || "-"}</p></div>
                <div><span className="text-slate-500">Estadual</span><p className="font-semibold text-slate-900">{orderDetail.estadual_totvs_id || session?.totvs_id || "-"}</p></div>
                <div><span className="text-slate-500">Data</span><p className="font-semibold text-slate-900">{orderDetail.created_at ? new Date(orderDetail.created_at).toLocaleString("pt-BR") : "-"}</p></div>
                <div><span className="text-slate-500">Status Atual</span><div className="mt-1"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeByStatus(orderDetail.status)}`}>{STATUS_LABEL[String(orderDetail.status || "")] || orderDetail.status || "-"}</span></div></div>
              </div>

              {orderDetail.items?.length ? (
                <div className="border-t pt-3">
                  <h3 className="mb-2 text-sm font-bold text-slate-900">Itens</h3>
                  <div className="space-y-2">
                    {orderDetail.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-md bg-slate-100 p-2 text-sm">
                        <div className="flex items-center gap-2 text-slate-800">
                          <Shirt className="h-4 w-4 text-slate-500" />
                          <span>{item.product_name || "Produto"} ({item.size || "-"}) x{item.quantity || 0}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{formatMoney(item.total_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="border-t pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-lg font-bold text-slate-900">Total</span>
                  <span className="text-3xl font-bold text-red-600">{formatMoney(orderDetail.total_amount)}</span>
                </div>
                {orderDetail.notes ? <p className="text-sm text-slate-700">Observação: {orderDetail.notes}</p> : null}
              </div>

              <div className="border-t pt-3">
                <h3 className="mb-2 text-sm font-bold text-slate-900">Alterar Status</h3>
                <div className="flex gap-2">
                  <Select value={orderNewStatus} onValueChange={setOrderNewStatus}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button className="bg-[#232b7a] text-white hover:bg-[#1b2367]" onClick={() => saveOrderStatus(orderNewStatus)}>Salvar</Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <Button key={value} variant="outline" onClick={() => saveOrderStatus(value)} className="justify-center">{label}</Button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}



