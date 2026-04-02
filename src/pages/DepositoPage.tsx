// Comentario: pagina principal do modulo Deposito — controle de estoque
// de materiais evangelisticos, livraria e mercadorias internas da igreja.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import {
  depositListStock,
  depositGetSummary,
  depositListProducts,
  depositCreateProduct,
  depositUpdateProduct,
  depositCreateMovement,
  depositCreateTransfer,
  depositListMovements,
  type DepositStockItem,
  type DepositSummary,
  type DepositProduct,
  type DepositMovement,
} from "@/services/saasService";
import { getFriendlyError } from "@/lib/error-map";
import {
  Archive,
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  Box,
  ClipboardList,
  Package,
  PackagePlus,
  Search,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Loader2,
  Plus,
  Pencil,
} from "lucide-react";

// Comentario: grupos disponiveis para o cadastro de produtos
const ALL_GROUPS = [
  "VOTOS", "FOLHETOS", "FICHAS", "MANUAL", "CERTIFICADOS", "CARTÃO",
  "CARTA", "CARNÊS", "LIVRO", "CDs", "BÍBLIAS", "HINÁRIO",
  "REVISTAS", "VESTUÁRIO", "ACESSÓRIOS", "MANUAIS BÍBLICOS", "OUTROS",
];

// Comentario: tipos de movimentacao disponiveis
const MOVEMENT_TYPES = [
  { value: "ENTRADA", label: "Entrada", color: "text-emerald-600" },
  { value: "SAIDA", label: "Saída", color: "text-rose-600" },
  { value: "AJUSTE", label: "Ajuste", color: "text-amber-600" },
  { value: "PERDA", label: "Perda / Extravio", color: "text-red-700" },
];

// Comentario: abas do modulo
type TabKey = "estoque" | "movimentacoes" | "transferencias" | "cadastro";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number) {
  return value.toLocaleString("pt-BR");
}

// Máscara de moeda brasileira: 1.234,56
function maskCurrency(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = Number(digits) / 100;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function unmaskCurrency(masked: string): number {
  const clean = masked.replace(/\./g, "").replace(",", ".");
  return Number(clean) || 0;
}

// Máscara de quantidade: 1.000, 10.000
function maskQuantity(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("pt-BR");
}

function unmaskQuantity(masked: string): number {
  return Number(masked.replace(/\./g, "")) || 0;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function movementBadge(type: string) {
  switch (type) {
    case "ENTRADA": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "SAIDA": return "bg-rose-100 text-rose-700 border-rose-200";
    case "TRANSFERENCIA": return "bg-blue-100 text-blue-700 border-blue-200";
    case "AJUSTE": return "bg-amber-100 text-amber-700 border-amber-200";
    case "PERDA": return "bg-red-100 text-red-800 border-red-200";
    default: return "bg-slate-100 text-slate-600";
  }
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function DepositoPage() {
  const { session } = useUser();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("estoque");

  // Comentario: filtros compartilhados
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterLowStock, setFilterLowStock] = useState(false);

  // Comentario: modais
  const [productModal, setProductModal] = useState(false);
  const [movementModal, setMovementModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<DepositProduct | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");

  // Comentario: query dos KPIs/resumo
  const { data: summary } = useQuery({
    queryKey: ["deposit-summary"],
    queryFn: depositGetSummary,
    refetchInterval: 30_000,
  });

  // Comentario: query do estoque consolidado
  const { data: stockData, isLoading: loadingStock } = useQuery({
    queryKey: ["deposit-stock", search, filterGroup, filterLowStock],
    queryFn: () => depositListStock({
      search: search || undefined,
      group_name: filterGroup !== "all" ? filterGroup : undefined,
      low_stock: filterLowStock || undefined,
      is_active: true,
    }),
    refetchInterval: 15_000,
  });

  // Comentario: query dos produtos para selects e cadastro
  const { data: products } = useQuery({
    queryKey: ["deposit-products"],
    queryFn: () => depositListProducts(),
    refetchInterval: 30_000,
  });

  // Comentario: query das movimentacoes
  const { data: movementsData, isLoading: loadingMovements } = useQuery({
    queryKey: ["deposit-movements"],
    queryFn: () => depositListMovements({ page: 1, page_size: 100 }),
    refetchInterval: 15_000,
    enabled: tab === "movimentacoes" || tab === "transferencias",
  });

  // Comentario: funcao para invalidar todas as queries do deposito
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["deposit-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["deposit-stock"] }),
      queryClient.invalidateQueries({ queryKey: ["deposit-products"] }),
      queryClient.invalidateQueries({ queryKey: ["deposit-movements"] }),
    ]);
  }

  const stock = stockData?.stock || [];
  const movements = movementsData?.movements || [];
  const transfers = movements.filter((m) => m.type === "TRANSFERENCIA");

  // Comentario: lista de grupos existentes nos produtos (para filtro dinamico)
  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    (products || []).forEach((p) => groups.add(p.group_name));
    return Array.from(groups).sort();
  }, [products]);

  // Comentario: determina roleMode para o shell (admin ou pastor)
  const roleMode = String(session?.role || "").toLowerCase() === "admin" ? "admin" : "pastor";

  return (
    <ManagementShell roleMode={roleMode as "admin" | "pastor"}>
      <div className="space-y-5 bg-[#F6F8FC] px-2 py-2 sm:px-4 sm:py-3">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Depósito</h2>
              <p className="mt-1 text-sm text-slate-600">Controle de estoque, movimentações, transferências e relatórios</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setEditingProduct(null); setProductModal(true); }}>
                <PackagePlus className="mr-2 h-4 w-4" /> Novo produto
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSelectedProductId(""); setMovementModal(true); }}>
                <ArrowDownCircle className="mr-2 h-4 w-4 text-emerald-600" /> Entrada / Saída
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTransferModal(true)}>
                <ArrowRightLeft className="mr-2 h-4 w-4 text-blue-600" /> Transferência
              </Button>
            </div>
          </div>
        </section>

        {/* ── Cards de resumo ─────────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          <SummaryCard title="Itens cadastrados" value={formatNumber(summary?.total_products ?? 0)} icon={Package} gradient="from-blue-600 to-blue-500" />
          <SummaryCard title="Total em estoque" value={formatNumber(summary?.total_stock ?? 0)} icon={Box} gradient="from-indigo-600 to-indigo-500" />
          <SummaryCard title="Estoque baixo" value={formatNumber(summary?.low_stock_count ?? 0)} icon={AlertTriangle} gradient="from-rose-600 to-rose-500" />
          <SummaryCard title="Entradas (mês)" value={formatNumber(summary?.entries_month ?? 0)} icon={ArrowUpCircle} gradient="from-emerald-600 to-emerald-500" />
          <SummaryCard title="Saídas (mês)" value={formatNumber(summary?.exits_month ?? 0)} icon={TrendingDown} gradient="from-amber-600 to-amber-500" />
          <SummaryCard title="Transferências" value={formatNumber(summary?.transfers_month ?? 0)} icon={ArrowRightLeft} gradient="from-sky-600 to-sky-500" />
          <SummaryCard title="Valor estoque" value={formatCurrency(summary?.total_value ?? 0)} icon={DollarSign} gradient="from-violet-600 to-violet-500" />
        </section>

        {/* ── Abas ────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
            {([
              { key: "estoque", label: "Estoque Atual", icon: Archive },
              { key: "movimentacoes", label: "Movimentações", icon: ClipboardList },
              { key: "transferencias", label: "Transferências", icon: ArrowRightLeft },
              { key: "cadastro", label: "Cadastro", icon: Package },
            ] as { key: TabKey; label: string; icon: typeof Archive }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "border-b-2 border-blue-600 bg-blue-50 text-blue-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "estoque" && (
              <EstoqueTab
                stock={stock}
                loading={loadingStock}
                search={search}
                onSearchChange={setSearch}
                filterGroup={filterGroup}
                onFilterGroupChange={setFilterGroup}
                filterLowStock={filterLowStock}
                onFilterLowStockChange={setFilterLowStock}
                existingGroups={existingGroups}
                onEdit={(p) => { setEditingProduct(p); setProductModal(true); }}
                onMovement={(pid) => { setSelectedProductId(pid); setMovementModal(true); }}
              />
            )}
            {tab === "movimentacoes" && (
              <MovimentacoesTab movements={movements} loading={loadingMovements} />
            )}
            {tab === "transferencias" && (
              <TransferenciasTab transfers={transfers} loading={loadingMovements} />
            )}
            {tab === "cadastro" && (
              <CadastroTab
                products={products || []}
                onEdit={(p) => { setEditingProduct(p); setProductModal(true); }}
                onNew={() => { setEditingProduct(null); setProductModal(true); }}
              />
            )}
          </div>
        </section>
      </div>

      {/* ── Modal: Novo/Editar Produto ────────────────────────────── */}
      <ProductModal
        open={productModal}
        onClose={() => { setProductModal(false); setEditingProduct(null); }}
        product={editingProduct}
        onSaved={refresh}
      />

      {/* ── Modal: Entrada / Saída ────────────────────────────────── */}
      <MovementModal
        open={movementModal}
        onClose={() => { setMovementModal(false); setSelectedProductId(""); }}
        products={products || []}
        initialProductId={selectedProductId}
        activeTotvs={String(session?.totvs_id || "")}
        onSaved={refresh}
      />

      {/* ── Modal: Transferência ──────────────────────────────────── */}
      <TransferModal
        open={transferModal}
        onClose={() => setTransferModal(false)}
        products={products || []}
        activeTotvs={String(session?.totvs_id || "")}
        onSaved={refresh}
      />
    </ManagementShell>
  );
}

// ============================================================================
// CARD DE RESUMO
// ============================================================================
function SummaryCard({ title, value, icon: Icon, gradient }: {
  title: string;
  value: number | string;
  icon: typeof Package;
  gradient: string;
}) {
  return (
    <Card className={`rounded-xl shadow-md bg-gradient-to-br ${gradient}`}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-white/80">{title}</p>
          <Icon className="h-4 w-4 text-white/70" />
        </div>
        <p className="text-2xl font-extrabold text-white">{value}</p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ABA: ESTOQUE ATUAL
// ============================================================================
function EstoqueTab({
  stock, loading, search, onSearchChange, filterGroup, onFilterGroupChange,
  filterLowStock, onFilterLowStockChange, existingGroups, onEdit, onMovement,
}: {
  stock: DepositStockItem[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  filterGroup: string;
  onFilterGroupChange: (v: string) => void;
  filterLowStock: boolean;
  onFilterLowStockChange: (v: boolean) => void;
  existingGroups: string[];
  onEdit: (p: DepositStockItem) => void;
  onMovement: (pid: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Comentario: barra de filtros do estoque */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Buscar por código ou descrição..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterGroup} onValueChange={onFilterGroupChange}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {existingGroups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={filterLowStock ? "default" : "outline"}
          onClick={() => onFilterLowStockChange(!filterLowStock)}
          className={filterLowStock ? "bg-rose-600 hover:bg-rose-700" : ""}
        >
          <AlertTriangle className="mr-1 h-4 w-4" /> Estoque baixo
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : stock.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nenhum item encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Descrição</th>
                <th className="px-3 py-3">Grupo</th>
                <th className="px-3 py-3 text-right">Estoque</th>
                <th className="px-3 py-3 text-right">Mínimo</th>
                <th className="px-3 py-3 text-right">Valor un.</th>
                <th className="px-3 py-3 text-right">Valor total</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stock.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-mono text-xs">{item.code}</td>
                  <td className="px-3 py-2.5 font-medium">{item.description}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline" className="text-xs">{item.group_name}</Badge></td>
                  <td className="px-3 py-2.5 text-right font-semibold">{formatNumber(item.total_quantity)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{formatNumber(item.min_stock)}</td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(item.unit_price)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(item.total_quantity * item.unit_price)}</td>
                  <td className="px-3 py-2.5">
                    {item.is_low_stock ? (
                      <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">Baixo</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Normal</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onMovement(item.id)}>
                        <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ABA: MOVIMENTACOES
// ============================================================================
function MovimentacoesTab({ movements, loading }: { movements: DepositMovement[]; loading: boolean }) {
  // Comentario: filtra apenas movimentacoes que nao sao transferencias (tem aba propria)
  const filtered = movements.filter((m) => m.type !== "TRANSFERENCIA");
  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nenhuma movimentação registrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3 text-right">Qtd</th>
                <th className="px-3 py-3">Responsável</th>
                <th className="px-3 py-3">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 text-xs">{formatDate(m.created_at)}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline" className={`text-xs ${movementBadge(m.type)}`}>{m.type}</Badge></td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.deposit_products?.code || "-"}</td>
                  <td className="px-3 py-2.5">{m.deposit_products?.description || "-"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{formatNumber(m.quantity)}</td>
                  <td className="px-3 py-2.5 text-xs">{m.responsible_name || "-"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 truncate max-w-[200px]">{m.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ABA: TRANSFERENCIAS
// ============================================================================
function TransferenciasTab({ transfers, loading }: { transfers: DepositMovement[]; loading: boolean }) {
  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : transfers.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Nenhuma transferência registrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3 text-right">Qtd</th>
                <th className="px-3 py-3">Origem</th>
                <th className="px-3 py-3">Destino</th>
                <th className="px-3 py-3">Responsável</th>
                <th className="px-3 py-3">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 text-xs">{formatDate(m.created_at)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{m.deposit_products?.code || "-"}</td>
                  <td className="px-3 py-2.5">{m.deposit_products?.description || "-"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{formatNumber(m.quantity)}</td>
                  <td className="px-3 py-2.5 text-xs">{m.church_origin_totvs || "-"}</td>
                  <td className="px-3 py-2.5 text-xs">{m.church_destination_totvs || "-"}</td>
                  <td className="px-3 py-2.5 text-xs">{m.responsible_name || "-"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 truncate max-w-[200px]">{m.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ABA: CADASTRO DE MERCADORIAS
// ============================================================================
function CadastroTab({ products, onEdit, onNew }: {
  products: DepositProduct[];
  onEdit: (p: DepositProduct) => void;
  onNew: () => void;
}) {
  const [searchCadastro, setSearchCadastro] = useState("");
  const filtered = products.filter((p) => {
    if (!searchCadastro) return true;
    const s = searchCadastro.toLowerCase();
    return p.description.toLowerCase().includes(s) || p.code.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Buscar produto..." value={searchCadastro} onChange={(e) => setSearchCadastro(e.target.value)} className="pl-9" />
        </div>
        <Button size="sm" onClick={onNew}><Plus className="mr-1 h-4 w-4" /> Novo produto</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-3 py-3">Código</th>
              <th className="px-3 py-3">Descrição</th>
              <th className="px-3 py-3">Grupo</th>
              <th className="px-3 py-3">Unidade</th>
              <th className="px-3 py-3 text-right">Valor un.</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-3 py-2.5 font-mono text-xs">{p.code}</td>
                <td className="px-3 py-2.5 font-medium">{p.description}</td>
                <td className="px-3 py-2.5"><Badge variant="outline" className="text-xs">{p.group_name}</Badge></td>
                <td className="px-3 py-2.5">{p.unit}</td>
                <td className="px-3 py-2.5 text-right">{formatCurrency(p.unit_price)}</td>
                <td className="px-3 py-2.5">
                  <Badge className={`text-xs ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {p.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: NOVO / EDITAR PRODUTO
// ============================================================================
function ProductModal({ open, onClose, product, onSaved }: {
  open: boolean;
  onClose: () => void;
  product: DepositProduct | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", group_name: "", subgroup: "", unit: "UN", unit_price: "0", min_stock: "0", notes: "" });

  // Comentario: preenche formulario ao abrir para edicao
  useEffect(() => {
    if (product) {
      setForm({
        code: product.code,
        description: product.description,
        group_name: product.group_name,
        subgroup: product.subgroup || "",
        unit: product.unit,
        unit_price: product.unit_price ? maskCurrency(String(Math.round(product.unit_price * 100))) : "0,00",
        min_stock: product.min_stock ? maskQuantity(String(product.min_stock)) : "0",
        notes: product.notes || "",
      });
    } else {
      setForm({ code: "", description: "", group_name: "", subgroup: "", unit: "UN", unit_price: "0,00", min_stock: "0", notes: "" });
    }
  }, [product, open]);

  async function save() {
    if (!form.code.trim()) { toast.error("Informe o código."); return; }
    if (!form.description.trim()) { toast.error("Informe a descrição."); return; }
    if (!form.group_name.trim()) { toast.error("Selecione o grupo."); return; }
    setSaving(true);
    try {
      if (product) {
        await depositUpdateProduct({
          id: product.id,
          description: form.description,
          group_name: form.group_name,
          subgroup: form.subgroup || null,
          unit: form.unit,
          unit_price: unmaskCurrency(form.unit_price),
          min_stock: unmaskQuantity(form.min_stock),
          notes: form.notes || null,
        });
        toast.success("Produto atualizado.");
      } else {
        await depositCreateProduct({
          code: form.code,
          description: form.description,
          group_name: form.group_name,
          subgroup: form.subgroup || null,
          unit: form.unit,
          unit_price: unmaskCurrency(form.unit_price),
          min_stock: unmaskQuantity(form.min_stock),
          notes: form.notes || null,
        });
        toast.success("Produto cadastrado.");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(getFriendlyError(err, "deposit"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>Preencha os dados da mercadoria.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Código</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!product} placeholder="Ex: 3560" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: VOTO DO DÍZIMO" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Grupo</Label>
              <Select value={form.group_name} onValueChange={(v) => setForm({ ...form, group_name: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {ALL_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subgrupo</Label>
              <Input value={form.subgroup} onChange={(e) => setForm({ ...form, subgroup: e.target.value })} placeholder="Opcional" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Unidade</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="UN" />
            </div>
            <div>
              <Label>Valor unitário (R$)</Label>
              <Input
                inputMode="numeric"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: maskCurrency(e.target.value) })}
                placeholder="0,00 = Grátis"
              />
              {unmaskCurrency(form.unit_price) === 0 && <p className="text-xs text-slate-500 mt-1">Grátis</p>}
            </div>
            <div>
              <Label>Estoque mínimo</Label>
              <Input
                inputMode="numeric"
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: maskQuantity(e.target.value) })}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {product ? "Salvar alterações" : "Cadastrar produto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MODAL: ENTRADA / SAIDA / AJUSTE / PERDA
// ============================================================================
function MovementModal({ open, onClose, products, initialProductId, activeTotvs, onSaved }: {
  open: boolean;
  onClose: () => void;
  products: DepositProduct[];
  initialProductId: string;
  activeTotvs: string;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ product_id: "", type: "ENTRADA", quantity: "", church_totvs_id: "", notes: "" });

  useEffect(() => {
    setForm({ product_id: initialProductId, type: "ENTRADA", quantity: "", church_totvs_id: activeTotvs, notes: "" });
  }, [initialProductId, activeTotvs, open]);

  async function save() {
    if (!form.product_id) { toast.error("Selecione o produto."); return; }
    if (!unmaskQuantity(form.quantity) || unmaskQuantity(form.quantity) <= 0) { toast.error("Informe a quantidade."); return; }
    setSaving(true);
    try {
      await depositCreateMovement({
        product_id: form.product_id,
        type: form.type,
        quantity: unmaskQuantity(form.quantity),
        church_totvs_id: form.church_totvs_id || activeTotvs,
        notes: form.notes || undefined,
      });
      toast.success("Movimentação registrada.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(getFriendlyError(err, "deposit"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimentação</DialogTitle>
          <DialogDescription>Entrada, saída, ajuste ou perda de estoque.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Produto</Label>
            <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {products.filter((p) => p.is_active).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantidade</Label>
              <Input inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: maskQuantity(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <Label>Igreja (TOTVS)</Label>
              <Input value={form.church_totvs_id} onChange={(e) => setForm({ ...form, church_totvs_id: e.target.value })} placeholder={activeTotvs} />
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MODAL: TRANSFERENCIA
// ============================================================================
function TransferModal({ open, onClose, products, activeTotvs, onSaved }: {
  open: boolean;
  onClose: () => void;
  products: DepositProduct[];
  activeTotvs: string;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ product_id: "", quantity: "", origin: "", destination: "", notes: "" });

  useEffect(() => {
    setForm({ product_id: "", quantity: "", origin: activeTotvs, destination: "", notes: "" });
  }, [activeTotvs, open]);

  async function save() {
    if (!form.product_id) { toast.error("Selecione o produto."); return; }
    if (!unmaskQuantity(form.quantity) || unmaskQuantity(form.quantity) <= 0) { toast.error("Informe a quantidade."); return; }
    if (!form.origin.trim()) { toast.error("Informe a igreja de origem."); return; }
    if (!form.destination.trim()) { toast.error("Informe a igreja de destino."); return; }
    setSaving(true);
    try {
      await depositCreateTransfer({
        product_id: form.product_id,
        quantity: unmaskQuantity(form.quantity),
        church_origin_totvs: form.origin,
        church_destination_totvs: form.destination,
        notes: form.notes || undefined,
      });
      toast.success("Transferência realizada.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(getFriendlyError(err, "deposit"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferência entre igrejas</DialogTitle>
          <DialogDescription>Transfira mercadoria de uma igreja para outra.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Produto</Label>
            <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {products.filter((p) => p.is_active).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} — {p.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: maskQuantity(e.target.value) })} placeholder="0" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Igreja origem (TOTVS)</Label>
              <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
            </div>
            <div>
              <Label>Igreja destino (TOTVS)</Label>
              <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Observação</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Opcional" />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirmar transferência
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
