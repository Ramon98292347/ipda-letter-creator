import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { post } from "@/lib/api";
import { toast } from "sonner";
import { PageLoading } from "@/components/shared/PageLoading";

const ORDER_WEBHOOK_URL =
  (import.meta.env.VITE_N8N_WEBHOOK_PEDIDO_CAMISAS as string) ||
  "https://n8n-n8n.ynlng8.easypanel.host/webhook/pedido-camisas";

type ChurchRow = { totvs_id: string; church_name: string };
type ProductRow = { id: string; name: string; price?: number | null };
type ProductSizeRow = { id: string; product_id: string; size: string; stock?: number | null };

function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

export default function CamisasPedidoPage() {
  const { churchTotvsId = "" } = useParams();
  const [params] = useSearchParams();
  const initialProduct = String(params.get("product") || "");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [quantity, setQuantity] = useState(1);
  const [productId, setProductId] = useState(initialProduct);
  const [size, setSize] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: churchRes, isLoading: loadingChurch } = useQuery({
    queryKey: ["camisas-pedido-church", churchTotvsId],
    queryFn: () =>
      post<{ ok: boolean; churches: ChurchRow[] }>(
        "list-churches-public",
        { include_all: true, query: churchTotvsId, limit: 20 },
        { skipAuth: true },
      ),
    enabled: Boolean(churchTotvsId),
  });
  const church = useMemo(
    () => (churchRes?.churches || []).find((c) => String(c.totvs_id) === String(churchTotvsId)) || null,
    [churchRes?.churches, churchTotvsId],
  );

  const { data: productsRes, isLoading: loadingProducts } = useQuery({
    queryKey: ["camisas-pedido-products", churchTotvsId],
    queryFn: () => post<{ ok: boolean; products: ProductRow[] }>("list-products-public", { church_totvs_id: churchTotvsId }, { skipAuth: true }),
    enabled: Boolean(churchTotvsId),
  });
  const products = productsRes?.products || [];

  const { data: sizesRes } = useQuery({
    queryKey: ["camisas-pedido-sizes", productId],
    queryFn: () => post<{ ok: boolean; product_sizes: ProductSizeRow[] }>("list-product-sizes-public", { product_id: productId }, { skipAuth: true }),
    enabled: Boolean(productId),
  });
  const sizes = sizesRes?.product_sizes || [];

  useEffect(() => {
    if (!productId && products.length) setProductId(String(products[0].id));
  }, [products, productId]);

  useEffect(() => {
    if (!size && sizes.length) setSize(String(sizes[0].size));
  }, [sizes, size]);

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(productId)) || null,
    [products, productId],
  );

  const totalAmount = Number(selectedProduct?.price || 0) * quantity;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!church) return toast.error("Igreja inválida.");
    if (!fullName.trim()) return toast.error("Informe seu nome.");
    if (onlyDigits(phone).length < 10) return toast.error("Informe um telefone válido.");
    if (!selectedProduct) return toast.error("Selecione o produto.");
    if (!size) return toast.error("Selecione o tamanho.");

    const orderNumber = `PED-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0")}`;
    const payload = {
      action: "new_tshirt_order",
      order_id: crypto.randomUUID(),
      order_number: orderNumber,
      full_name: fullName.trim(),
      phone: onlyDigits(phone),
      estadual_totvs_id: church.totvs_id,
      church_totvs_id: church.totvs_id,
      church_name: church.church_name,
      items: [
        {
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          size,
          quantity,
          unit_price: Number(selectedProduct.price || 0),
          total_price: totalAmount,
        },
      ],
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_installments: null,
      status: "NOVO",
      notes: notes.trim() || null,
      created_at: new Date().toISOString(),
    };

    setSubmitting(true);
    try {
      await post("create-order-public", payload, { skipAuth: true });
      await fetch(ORDER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success("Pedido enviado com sucesso.");
      setFullName("");
      setPhone("");
      setNotes("");
      setQuantity(1);
    } catch {
      toast.error("Não foi possível enviar o pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingChurch || loadingProducts) {
    return <PageLoading title="Carregando pedido" description="Buscando produtos da igreja..." />;
  }

  if (!church) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card className="rounded-2xl border border-slate-200">
          <CardContent className="p-6 text-center">
            <p className="text-lg font-semibold text-slate-900">Igreja não encontrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Card className="rounded-2xl border border-slate-200">
        <CardHeader>
          <CardTitle>Pedido de camisa</CardTitle>
          <p className="text-sm text-slate-600">
            {church.church_name} - TOTVS {church.totvs_id}
          </p>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl border border-slate-200">
        <CardContent className="p-4 md:p-6">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome completo</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Produto</Label>
                <Select value={productId} onValueChange={(v) => { setProductId(v); setSize(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tamanho</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {sizes.map((s) => (
                      <SelectItem key={s.id} value={s.size}>{s.size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                    <SelectItem value="CARTAO_DEBITO">Cartão débito</SelectItem>
                    <SelectItem value="CARTAO_CREDITO">Cartão crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Total</Label>
                <Input value={`R$ ${totalAmount.toFixed(2)}`} readOnly />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Enviando..." : "Enviar pedido"}
              </Button>
              <Button asChild variant="outline">
                <Link to={`/camisas/${churchTotvsId}`}>Voltar para vitrine</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

