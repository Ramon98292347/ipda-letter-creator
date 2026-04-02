import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Minus, Trash2, ShoppingBag, Shirt, CreditCard, QrCode, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { post } from "@/lib/api";
import { PageLoading } from "@/components/shared/PageLoading";

type ChurchRow = {
  totvs_id: string;
  church_name: string;
  class?: string | null;
  parent_totvs_id?: string | null;
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
  size: string;
  stock?: number | null;
  is_active?: boolean | null;
};

type OrderItem = {
  product_id: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};

const ORDER_DRAFT_KEY = "pedidoDraft";
const ORDER_WEBHOOK_URL = "https://n8n-n8n.ynlng8.easypanel.host/webhook/pedido-camisas";

type OrderDraft = {
  fullName?: string;
  phone?: string;
  estadualId?: string;
  churchId?: string;
  notes?: string;
  items?: OrderItem[];
  paymentMethod?: "CARTAO_CREDITO" | "PIX" | "CARTAO_DEBITO";
  installments?: number;
};

const maskPhone = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const isScopeRoot = (church: ChurchRow, allChurches: ChurchRow[]) => {
  if (church.class === "estadual") return true;
  if (church.class !== "setorial") return false;
  if (!church.parent_totvs_id) return true;
  const parent = allChurches.find((item) => item.totvs_id === church.parent_totvs_id);
  return !parent || parent.class !== "estadual";
};

const computeScopeIds = (rootTotvs: string, allChurches: ChurchRow[]) => {
  const children = new Map<string, string[]>();
  for (const c of allChurches) {
    const parent = c.parent_totvs_id ? String(c.parent_totvs_id) : "";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(c.totvs_id));
  }
  const scope = new Set<string>();
  const queue = [rootTotvs];
  while (queue.length) {
    const current = queue.shift()!;
    if (scope.has(current)) continue;
    scope.add(current);
    for (const child of children.get(current) || []) queue.push(child);
  }
  return scope;
};

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const parseImageUrls = (val: string | null | undefined): string[] => {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    return [val];
  } catch {
    return [val];
  }
};

export default function CamisasPedidoPage() {
  const { churchTotvsId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedProduct = searchParams.get("produto") || "";
  const autoAdd = searchParams.get("auto") === "1";

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [estadualId, setEstadualId] = useState("");
  const [churchId, setChurchId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [churchValidated, setChurchValidated] = useState(false);
  const [churchSearch, setChurchSearch] = useState("");
  const [availableChurches, setAvailableChurches] = useState<ChurchRow[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"CARTAO_CREDITO" | "PIX" | "CARTAO_DEBITO">("PIX");
  const [installments, setInstallments] = useState(1);

  // Product selection
  const [selectedProduct, setSelectedProduct] = useState(preselectedProduct);
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [autoAdded, setAutoAdded] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [autoSelectionSync, setAutoSelectionSync] = useState(false);
  const [autoSyncItemKey, setAutoSyncItemKey] = useState("");
  const quantityRef = useRef(1);

  const { data: churchCatalogRes, isLoading: loadingScopeCatalog } = useQuery({
    queryKey: ["camisas-pedido-church-catalog"],
    queryFn: () =>
      post<{ ok: boolean; churches: ChurchRow[] }>(
        "list-churches-public",
        { include_all: true, limit: 5000 },
        { skipAuth: true },
      ),
    enabled: true,
  });

  const churchCatalog = churchCatalogRes?.churches || [];

  const { data: productsRes, isLoading: loadingProducts } = useQuery({
    queryKey: ["camisas-pedido-products", estadualId || churchTotvsId],
    enabled: Boolean(estadualId || churchTotvsId),
    queryFn: () =>
      post<{ ok: boolean; products: ProductRow[] }>(
        "list-products-public",
        { church_totvs_id: estadualId || churchTotvsId },
        { skipAuth: true },
      ),
  });

  const products = productsRes?.products || [];

  const { data: sizesRes } = useQuery({
    queryKey: ["camisas-pedido-sizes", selectedProduct],
    enabled: Boolean(selectedProduct),
    queryFn: () =>
      post<{ ok: boolean; product_sizes: ProductSizeRow[] }>(
        "list-product-sizes-public",
        { product_id: selectedProduct },
        { skipAuth: true },
      ),
  });

  const currentSizes = sizesRes?.product_sizes || [];

  const activeProducts = products.filter((p) => p.is_active !== false);
  const currentProduct = products.find((p) => p.id === selectedProduct);
  const scopeOptions = churchCatalog.filter((church) => isScopeRoot(church, churchCatalog));
  const baseChurch = useMemo(
    () => churchCatalog.find((church) => String(church.totvs_id) === String(churchTotvsId)) || null,
    [churchCatalog, churchTotvsId],
  );
  const lockBase = Boolean(churchTotvsId);
  const baseOption = useMemo(() => {
    if (!churchTotvsId) return null;
    if (baseChurch) return baseChurch;
    return {
      totvs_id: String(churchTotvsId),
      church_name: "Igreja selecionada",
      class: "",
      parent_totvs_id: null,
    } as ChurchRow;
  }, [baseChurch, churchTotvsId]);
  const churchSearchDigits = churchSearch.replace(/\D/g, "");
  const filteredChurches = availableChurches.filter((church) => {
    const raw = churchSearch.trim().toLowerCase();
    if (!raw && !churchSearchDigits) return true;
    return church.church_name.toLowerCase().includes(raw) || church.totvs_id.includes(churchSearchDigits);
  });
  const selectedChurch = availableChurches.find((church) => church.totvs_id === churchId) || null;

  // Quando estadualId muda, computa as igrejas do escopo
  const scopeChurches = useMemo(() => {
    if (!estadualId || !churchCatalog.length) return [];
    const ids = computeScopeIds(estadualId, churchCatalog);
    return churchCatalog.filter(
      (c) => ids.has(String(c.totvs_id)) && String(c.totvs_id) !== estadualId,
    );
  }, [estadualId, churchCatalog]);

  useEffect(() => {
    setAvailableChurches(scopeChurches);
    if (churchId && !scopeChurches.some((c) => c.totvs_id === churchId)) {
      setChurchId("");
      setChurchValidated(false);
    }
  }, [scopeChurches]);

  useEffect(() => {
    const stored = localStorage.getItem(ORDER_DRAFT_KEY);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as OrderDraft;
      setFullName(String(draft.fullName || ""));
      setPhone(String(draft.phone || ""));
      setEstadualId(String(draft.estadualId || ""));
      setChurchId(String(draft.churchId || ""));
      setNotes(String(draft.notes || ""));
      setItems(Array.isArray(draft.items) ? draft.items : []);
      if (draft.paymentMethod === "CARTAO_CREDITO" || draft.paymentMethod === "PIX" || draft.paymentMethod === "CARTAO_DEBITO") {
        setPaymentMethod(draft.paymentMethod);
      }
      if (Number.isFinite(draft.installments) && Number(draft.installments) > 0) {
        setInstallments(Number(draft.installments));
      }
    } catch (err) {
      console.error("Erro ao restaurar rascunho do pedido:", err);
    }
  }, []);

  useEffect(() => {
    const draft: OrderDraft = {
      fullName,
      phone,
      estadualId,
      churchId,
      notes,
      items,
      paymentMethod,
      installments,
    };
    localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(draft));
  }, [churchId, estadualId, fullName, installments, items, notes, paymentMethod, phone]);

  useEffect(() => {
    quantityRef.current = quantity;
  }, [quantity]);

  // Resolve a estadual/setorial dona do link
  useEffect(() => {
    if (!churchTotvsId || !churchCatalog.length) {
      if (!estadualId && scopeOptions.length) {
        setEstadualId(String(scopeOptions[0].totvs_id));
      }
      return;
    }
    // Se o churchTotvsId já é uma estadual/setorial, usar diretamente
    const direct = churchCatalog.find((c) => String(c.totvs_id) === String(churchTotvsId));
    if (direct && isScopeRoot(direct, churchCatalog)) {
      if (estadualId !== churchTotvsId) setEstadualId(churchTotvsId);
      return;
    }
    // Senão, subir na hierarquia até achar a estadual/setorial pai
    if (direct) {
      let current = direct;
      while (current.parent_totvs_id) {
        const parent = churchCatalog.find((c) => String(c.totvs_id) === String(current.parent_totvs_id));
        if (!parent) break;
        if (isScopeRoot(parent, churchCatalog)) {
          if (estadualId !== parent.totvs_id) setEstadualId(String(parent.totvs_id));
          return;
        }
        current = parent;
      }
    }
    // Fallback: usar o próprio churchTotvsId
    if (estadualId !== churchTotvsId) setEstadualId(churchTotvsId);
  }, [churchTotvsId, churchCatalog, scopeOptions]);

  const addItemWithParams = (productId: string, size: string, qty: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const safeQty = Math.max(1, Number(qty) || 1);
    const unitPrice = Number(product.price || 0);
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.product_id === productId && item.size === size);
      if (idx >= 0) {
        const updated = [...prev];
        const existing = updated[idx];
        const newQty = Number(existing.quantity || 0) + safeQty;
        updated[idx] = {
          ...existing,
          quantity: newQty,
          total_price: newQty * Number(existing.unit_price || 0),
        };
        return updated;
      }
      const newItem: OrderItem = {
        product_id: product.id,
        product_name: product.name,
        size,
        quantity: safeQty,
        unit_price: unitPrice,
        total_price: unitPrice * safeQty,
        image_url: parseImageUrls(product.image_url)[0] || undefined,
      };
      return [...prev, newItem];
    });
  };

  const addItem = () => {
    if (!selectedProduct || !selectedSize) {
      toast.error("Selecione o produto e o tamanho.");
      return;
    }
    setAutoSelectionSync(false);
    setAutoSyncItemKey("");
    addItemWithParams(selectedProduct, selectedSize, quantityRef.current);
    setSelectedSize("");
    setQuantity(1);
    toast.success("Item adicionado!");
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0),
    0,
  );

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!churchValidated) return toast.error("Igreja não validada. Selecione novamente.");
    if (!fullName.trim()) return toast.error("Informe seu nome completo.");
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) return toast.error("Informe seu telefone com DDD.");
    if (!estadualId) return toast.error("Selecione a estadual.");
    if (!churchId) return toast.error("Selecione a igreja.");
    if (items.length === 0) return toast.error("Adicione ao menos 1 item.");

    setSubmitting(true);

    const church = availableChurches.find((c) => c.totvs_id === churchId);
    const orderNumber = `PED-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0")}`;

    const order = {
      action: "new_tshirt_order",
      order_id: crypto.randomUUID(),
      order_number: orderNumber,
      full_name: fullName,
      phone: phoneDigits,
      estadual_totvs_id: estadualId,
      church_totvs_id: churchId,
      church_name: church?.church_name || "",
      items: items.map(({ product_id, product_name, size, quantity, unit_price, total_price, image_url }) => ({
        product_id,
        product_name,
        size,
        quantity,
        unit_price,
        total_price: unit_price * quantity,
        image_url: image_url || null,
      })),
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_installments: paymentMethod === "CARTAO_CREDITO" ? installments : null,
      status: "NOVO",
      notes,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem("lastOrder", JSON.stringify(order));
    localStorage.setItem("activeChurchTotvsId", churchId);

    try {
      await post("create-order-public", order, { skipAuth: true });
    } catch (err) {
      console.error("Erro ao salvar pedido no banco:", err);
    }

    try {
      await fetch(ORDER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
    } catch (err) {
      console.error("Erro ao enviar para webhook:", err);
    }

    setSubmitting(false);
    localStorage.removeItem(ORDER_DRAFT_KEY);
    toast.success("Pedido enviado com sucesso.");
    setCompletedOrder(order);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    // Filtrar igrejas disponíveis baseado na busca (dentro do escopo já definido)
    const raw = churchSearch.trim().toLowerCase();
    const digits = churchSearch.replace(/\D/g, "");

    if (!raw && !digits) {
      setChurchValidated(false);
      if (churchId) setChurchId("");
      return;
    }

    // Auto-select se encontrar exatamente o TOTVS com 4+ dígitos
    if (digits.length >= 4) {
      const exact = filteredChurches.find((item) => String(item.totvs_id) === String(digits));
      if (exact) {
        setChurchId(exact.totvs_id);
        setChurchValidated(true);
        return;
      }
    }

    setChurchId("");
    setChurchValidated(false);
  }, [churchSearch, filteredChurches]);

  useEffect(() => {
    if (!preselectedProduct) return;
    setSelectedProduct(preselectedProduct);
  }, [preselectedProduct]);

  useEffect(() => {
    if (!autoAdd) return;
    if (autoAdded) return;
    if (!currentProduct) return;
    const activeSizes = currentSizes.filter((s) => s.is_active !== false);
    if (activeSizes.length === 0) return;
    const firstSize = activeSizes[0].size;
    const alreadyExists = items.some((item) => item.product_id === currentProduct.id && item.size === firstSize);
    setSelectedSize(firstSize);
    setQuantity(1);
    addItemWithParams(currentProduct.id, firstSize, 1);
    setAutoSyncItemKey(alreadyExists ? "" : `${currentProduct.id}::${firstSize}`);
    setAutoSelectionSync(!alreadyExists);
    setAutoAdded(true);
  }, [autoAdd, autoAdded, currentProduct, currentSizes, items]);

  useEffect(() => {
    if (!autoSelectionSync) return;
    if (!currentProduct || !selectedSize) return;

    setItems((prev) => {
      const unitPrice = Number(currentProduct.price || 0);
      const nextQty = Math.max(1, Number(quantity) || 1);
      const previousKey = autoSyncItemKey;
      const nextKey = `${currentProduct.id}::${selectedSize}`;
      const existingIndex = prev.findIndex((item) => item.product_id === currentProduct.id && item.size === selectedSize);
      const autoTrackedIndex = previousKey
        ? prev.findIndex((item) => `${item.product_id}::${item.size}` === previousKey)
        : -1;

      if (existingIndex >= 0) {
        setAutoSyncItemKey(nextKey);
        return prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: nextQty, total_price: unitPrice * nextQty, image_url: parseImageUrls(currentProduct.image_url)[0] || undefined }
            : item,
        );
      }

      const syncedItem: OrderItem = {
        product_id: currentProduct.id,
        product_name: currentProduct.name,
        size: selectedSize,
        quantity: nextQty,
        unit_price: unitPrice,
        total_price: unitPrice * nextQty,
        image_url: parseImageUrls(currentProduct.image_url)[0] || undefined,
      };

      if (autoTrackedIndex >= 0) {
        setAutoSyncItemKey(nextKey);
        return prev.map((item, index) => (index === autoTrackedIndex ? syncedItem : item));
      }

      setAutoSyncItemKey(nextKey);
      return [...prev, syncedItem];
    });
  }, [autoSelectionSync, autoSyncItemKey, currentProduct, selectedSize, quantity]);

  const currentSelectionTotal = currentProduct
    ? (Number(currentProduct.price || 0) * Number(quantity || 0))
    : 0;

  if (loadingScopeCatalog || loadingProducts) {
    return <PageLoading title="Carregando pedido" description="Buscando produtos da igreja..." />;
  }

  if (completedOrder) {
    const paymentLabel = completedOrder.payment_method === "CARTAO_CREDITO"
      ? `Cartão de Crédito (${completedOrder.payment_installments || 1}x)`
      : completedOrder.payment_method === "PIX"
        ? "Pix"
        : "Cartão de Débito";

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 flex items-center justify-center">
        <div className="max-w-xl w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-4">
              <BadgeCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2 font-heading tracking-tight">Pedido Registrado!</h1>
            <p className="text-slate-600">Seu pedido foi registrado com sucesso.</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm mb-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
              <span className="text-slate-500 font-medium">Nº do Pedido</span>
              <span className="font-bold text-slate-900 text-lg tracking-tight">{completedOrder.order_number}</span>
            </div>

            <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-8">
              <div>
                <p className="text-sm text-slate-500 mb-1">Nome</p>
                <p className="font-medium text-slate-900 truncate">{completedOrder.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Telefone</p>
                <p className="font-medium text-slate-900">{maskPhone(completedOrder.phone)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Igreja</p>
                <p className="font-medium text-slate-900 truncate">{completedOrder.church_name || completedOrder.church_totvs_id}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 mb-1">Estadual</p>
                <p className="font-medium text-slate-900 truncate">{completedOrder.estadual_totvs_id}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-slate-500 mb-1">Pagamento</p>
                <p className="font-medium text-slate-900">{paymentLabel}</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="font-bold text-slate-900 mb-4 font-heading">Itens</p>
              <div className="space-y-3">
                {completedOrder.items.map((it: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Shirt className="w-4 h-4 text-slate-400" />
                      <span>{it.product_name} ({it.size}) x{it.quantity}</span>
                    </div>
                    <span className="font-medium text-slate-900">
                      {formatMoney(it.total_price)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-5 border-t border-slate-100 bg-slate-50/50 -mx-6 -mb-6 p-6 rounded-b-xl">
              <span className="font-bold text-slate-900 font-heading text-lg">Total</span>
              <span className="font-bold text-red-600 text-xl tracking-tight">
                {formatMoney(completedOrder.total_amount)}
              </span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
            <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2 text-sm">
              <span role="img" aria-label="money bag">💰</span> Sobre o Pagamento
            </h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Pedido registrado com sucesso. O pagamento será realizado manualmente conforme orientação da administração.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              to={`/camisas/${churchTotvsId || estadualId}`}
              className="flex items-center justify-center gap-2 py-3 px-4 border border-slate-200 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm text-center"
            >
              Voltar ao Início
            </Link>
            <button
              onClick={() => {
                setItems([]);
                setCompletedOrder(null);
                setNotes("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="flex items-center justify-center py-3 px-4 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors font-medium text-sm"
            >
              Novo Pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="container mx-auto py-8 max-w-3xl">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-2">Fazer Pedido</h1>
        <p className="text-muted-foreground text-sm mb-8">Preencha seus dados e selecione as camisetas desejadas.</p>

        {/* Personal info */}
        <div className="bg-card rounded-lg border p-6 mb-6 space-y-4">
          <h2 className="font-heading font-bold text-foreground">Dados Pessoais</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Nome Completo *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Seu nome completo"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Telefone / WhatsApp *</label>
              <input
                type="text"
                value={maskPhone(phone)}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="(27) 99999-9999"
              />
            </div>
          </div>
        </div>

        {/* Church selection */}
        <div className="bg-card rounded-lg border p-6 mb-6 space-y-4">
          <h2 className="font-heading font-bold text-foreground">Identificação da Igreja</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">TOTVS da Estadual / Setorial *</label>
              <select
                value={estadualId}
                onChange={(e) => {
                  setEstadualId(e.target.value);
                  setChurchId("");
                  setChurchSearch("");
                }}
                disabled={lockBase}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">{loadingScopeCatalog ? "Carregando..." : "Selecione a estadual ou setorial..."}</option>
                {baseOption && !scopeOptions.some((item) => item.totvs_id === baseOption.totvs_id) ? (
                  <option value={baseOption.totvs_id}>
                    {baseOption.totvs_id} - {baseOption.church_name}
                    {baseOption.class ? ` (${String(baseOption.class || "").toLowerCase()})` : ""}
                  </option>
                ) : null}
                {scopeOptions.map((e) => (
                  <option key={e.totvs_id} value={e.totvs_id}>
                    {e.totvs_id} - {e.church_name} ({e.class})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Igreja *</label>
              <input
                type="text"
                value={churchSearch}
                onChange={(e) => {
                  setChurchSearch(e.target.value);
                  if (churchId) setChurchId("");
                }}
                disabled={!estadualId}
                placeholder={!estadualId ? "Selecione a estadual/setorial primeiro" : "Buscar por TOTVS ou nome"}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 mb-2"
              />
              <select
                value={churchId}
                onChange={(e) => {
                  const nextChurchId = e.target.value;
                  setChurchId(nextChurchId);
                  const nextChurch = availableChurches.find((church) => church.totvs_id === nextChurchId);
                  if (nextChurch) {
                    setChurchSearch(String(nextChurch.totvs_id));
                    setChurchValidated(true);
                  }
                }}
                disabled={!estadualId || filteredChurches.length === 0}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="">
                  {!estadualId
                    ? "Selecione a estadual/setorial..."
                    : selectedChurch
                      ? `${selectedChurch.totvs_id} - ${selectedChurch.church_name} (${selectedChurch.class || ""})`
                      : "Selecione a igreja..."}
                </option>
                {filteredChurches.map((c) => (
                  <option key={c.totvs_id} value={c.totvs_id}>
                    {c.totvs_id} - {c.church_name} ({c.class})
                  </option>
                ))}
              </select>
              {estadualId && (
                <p className="text-xs text-muted-foreground mt-2">
                  {filteredChurches.length} igreja(s) no escopo
                </p>
              )}
            </div>
          </div>
          {!churchValidated && churchId && (
            <p className="text-xs text-destructive mt-2">Igreja inválida. Escolha novamente.</p>
          )}
        </div>

        {/* Add items */}
        <div className="bg-card rounded-lg border p-6 mb-6 shadow-sm">
          <h2 className="font-heading font-bold text-foreground mb-4">Adicionar Camiseta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-2 md:col-span-5">
              <label className="text-sm font-medium text-foreground mb-1 block uppercase tracking-wider text-[10px]">Produto</label>
              <select
                value={selectedProduct}
                onChange={(e) => { setSelectedProduct(e.target.value); setSelectedSize(""); }}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              >
                <option value="">Selecione o modelo...</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {formatMoney(Number(p.price || 0))}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-foreground mb-1 block uppercase tracking-wider text-[10px]">Tamanho</label>
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                disabled={!selectedProduct}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-all"
              >
                <option value="">Escolha...</option>
                {currentSizes.filter((s) => s.is_active !== false).map((s) => (
                  <option key={s.id} value={s.size}>{s.size}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-foreground mb-1 block uppercase tracking-wider text-[10px]">Qtd</label>
              <div className="flex items-center border rounded-md h-10">
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                  className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="flex-1 text-center text-sm font-bold text-foreground">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => prev + 1)}
                  className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={addItem}
                className="w-full bg-primary text-primary-foreground h-10 px-4 rounded-md text-sm font-bold hover:bg-primary/90 transition-all shadow-sm active:scale-95"
              >
                Adicionar
              </button>
            </div>
          </div>

          {currentProduct && (
            <div className="flex items-center gap-3 mt-2 p-3 bg-secondary rounded-lg">
              <div className="w-12 h-12 bg-muted rounded overflow-hidden flex items-center justify-center shrink-0">
                {parseImageUrls(currentProduct.image_url)[0] ? (
                  <img src={parseImageUrls(currentProduct.image_url)[0]} alt={currentProduct.name} className="w-full h-full object-cover" />
                ) : (
                  <Shirt className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{currentProduct.name}</p>
                <p className="text-xs text-muted-foreground">{currentProduct.description}</p>
                <p className="text-xs font-semibold text-primary mt-1">
                  Seleção atual: {quantity} x R$ {Number(currentProduct.price || 0).toFixed(2).replace(".", ",")} = R$ {currentSelectionTotal.toFixed(2).replace(".", ",")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="bg-card rounded-lg border p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading font-bold text-foreground">Itens do Pedido</h2>
            <Link
              to={`/camisas/${churchTotvsId || estadualId}#camisetas`}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Comprar mais
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item adicionado ainda.</p>
          ) : (
            <>
              <div className="divide-y">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-secondary rounded overflow-hidden flex items-center justify-center shrink-0">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                        ) : (
                          <Shirt className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">Tam: {item.size} | Qtd: {item.quantity}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        R$ {(Number(item.unit_price || 0) * Number(item.quantity || 0)).toFixed(2).replace(".", ",")}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (`${item.product_id}::${item.size}` === autoSyncItemKey) {
                            setAutoSelectionSync(false);
                            setAutoSyncItemKey("");
                          }
                          removeItem(idx);
                        }}
                        className="text-destructive hover:opacity-70"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t">
                <span className="font-heading font-bold text-foreground">Total</span>
                <span className="text-lg font-bold text-accent">R$ {totalAmount.toFixed(2).replace(".", ",")}</span>
              </div>
            </>
          )}
        </div>

        {/* Payment */}
        <div className="bg-card rounded-lg border p-6 mb-6 space-y-4">
          <h2 className="font-heading font-bold text-foreground">Forma de Pagamento</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod("CARTAO_CREDITO")}
              className={`flex items-center gap-3 border rounded-lg p-3 text-left transition-colors ${
                paymentMethod === "CARTAO_CREDITO" ? "border-primary bg-primary/10" : "hover:bg-secondary"
              }`}
            >
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Cartão de Crédito</p>
                <p className="text-xs text-muted-foreground">Com parcelamento</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("PIX")}
              className={`flex items-center gap-3 border rounded-lg p-3 text-left transition-colors ${
                paymentMethod === "PIX" ? "border-primary bg-primary/10" : "hover:bg-secondary"
              }`}
            >
              <QrCode className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Pix</p>
                <p className="text-xs text-muted-foreground">Pagamento rápido</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("CARTAO_DEBITO")}
              className={`flex items-center gap-3 border rounded-lg p-3 text-left transition-colors ${
                paymentMethod === "CARTAO_DEBITO" ? "border-primary bg-primary/10" : "hover:bg-secondary"
              }`}
            >
              <BadgeCheck className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Cartão de Débito</p>
                <p className="text-xs text-muted-foreground">Sem parcelas</p>
              </div>
            </button>
          </div>

          {paymentMethod === "CARTAO_CREDITO" && (
            <div className="max-w-xs">
              <label className="text-sm font-medium text-foreground mb-1 block">Parcelas</label>
              <select
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <label className="text-sm font-medium text-foreground mb-1 block">Observação (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Alguma observação sobre o pedido..."
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-accent text-accent-foreground py-3 rounded-lg font-heading font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <ShoppingBag className="h-5 w-5" />
          {submitting ? "Enviando..." : "Finalizar Pedido"}
        </button>
      </div>
    </div>
  );
}
