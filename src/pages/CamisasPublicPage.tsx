import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Megaphone, Shirt } from "lucide-react";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoading } from "@/components/shared/PageLoading";

type ChurchRow = {
  totvs_id: string;
  church_name: string;
};

type ProductRow = {
  id: string;
  name?: string | null;
  description?: string | null;
  image_url?: string | null;
  price?: number | null;
};

type AnnouncementRow = {
  id: string;
  title?: string | null;
  body_text?: string | null;
  media_url?: string | null;
  type?: string | null;
};

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CamisasPublicPage() {
  const { churchTotvsId = "" } = useParams();

  const { data: churchRes, isLoading: loadingChurch } = useQuery({
    queryKey: ["camisas-public-church", churchTotvsId],
    enabled: Boolean(churchTotvsId),
    queryFn: () =>
      post<{ ok: boolean; churches: ChurchRow[] }>(
        "list-churches-public",
        { include_all: true, query: churchTotvsId, limit: 20 },
        { skipAuth: true },
      ),
  });

  const church = useMemo(
    () => (churchRes?.churches || []).find((c) => String(c.totvs_id) === String(churchTotvsId)) || null,
    [churchRes?.churches, churchTotvsId],
  );

  const { data: productsRes, isLoading: loadingProducts } = useQuery({
    queryKey: ["camisas-public-products", churchTotvsId],
    enabled: Boolean(churchTotvsId),
    queryFn: () =>
      post<{ ok: boolean; products: ProductRow[] }>(
        "list-products-public",
        { church_totvs_id: churchTotvsId },
        { skipAuth: true },
      ),
  });

  const { data: announcementsRes } = useQuery({
    queryKey: ["camisas-public-ann", churchTotvsId],
    enabled: Boolean(churchTotvsId),
    queryFn: () =>
      post<{ ok: boolean; announcements: AnnouncementRow[] }>(
        "announcements-api",
        { action: "list-public", church_totvs_id: churchTotvsId, limit: 10 },
        { skipAuth: true },
      ),
  });

  const products = productsRes?.products || [];
  const announcements = announcementsRes?.announcements || [];

  if (loadingChurch || loadingProducts) {
    return <PageLoading title="Carregando vitrine" description="Buscando produtos da igreja..." />;
  }

  if (!church) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Card className="rounded-2xl border border-slate-200">
          <CardContent className="p-6 text-center">
            <p className="text-lg font-semibold text-slate-900">Igreja não encontrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <img src="/app-icon.png" alt="Logo" className="h-12 w-12 rounded" />
            <div>
              <p className="text-2xl font-bold text-[#232b7a]">Igreja Pentecostal</p>
              <p className="text-sm text-slate-600">Deus é Amor</p>
            </div>
          </div>
          <nav className="hidden items-center gap-4 text-lg text-slate-700 md:flex">
            <a href="#inicio" className="rounded-xl bg-[#232b7a] px-4 py-2 font-semibold text-white">Início</a>
            <a href="#camisetas" className="font-medium hover:text-[#232b7a]">Camisetas</a>
            <Link to={`/camisas/${churchTotvsId}/pedido`} className="font-medium hover:text-[#232b7a]">Pedir</Link>
            <a href="/divulgacao" className="font-medium text-slate-500 hover:text-[#232b7a]">Admin</a>
          </nav>
        </div>
      </header>

      <section id="inicio" className="relative overflow-hidden bg-[linear-gradient(135deg,#1f2a78_0%,#3c1f62_45%,#7a214f_100%)] py-16">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,transparent_20%,rgba(255,255,255,0.08)_20%,rgba(255,255,255,0.08)_30%,transparent_30%,transparent_45%,rgba(255,255,255,0.06)_45%,rgba(255,255,255,0.06)_55%,transparent_55%,transparent_100%)]" />
        <div className="relative mx-auto max-w-5xl px-4 text-center text-white md:px-6">
          <h1 className="text-4xl font-extrabold md:text-6xl">Camisetas de Eventos</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90">
            Garanta sua camiseta oficial dos eventos da igreja. Pedidos abertos para {church.church_name}.
          </p>
          <Button asChild className="mt-8 h-12 rounded-2xl bg-red-600 px-8 text-lg font-bold hover:bg-red-700">
            <a href="#camisetas">
              <Shirt className="mr-2 h-5 w-5" />
              Ver camisetas
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
        {announcements.length > 0 ? (
          <section className="space-y-3 rounded-2xl border border-[#e5d38b] bg-[#fff8df] p-4">
            {announcements.slice(0, 3).map((announcement) => (
              <div key={announcement.id} className="rounded-xl border border-[#f1e3b5] bg-[#fff5d1] p-4">
                <div className="mb-2 flex items-center gap-2 text-[#d98900]">
                  <Megaphone className="h-4 w-4" />
                  <p className="font-semibold text-slate-900">{announcement.title || "Informativo"}</p>
                </div>
                <p className="text-slate-700">{announcement.body_text || "Aviso da igreja."}</p>
                {announcement.media_url ? (
                  <img
                    src={announcement.media_url}
                    alt={announcement.title || "Informativo"}
                    className="mt-3 max-h-[320px] w-full rounded-xl object-contain"
                  />
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <section id="camisetas" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-slate-900">Camisetas Disponíveis</h2>
            <Link to={`/camisas/${churchTotvsId}/pedido`} className="font-semibold text-[#232b7a] hover:underline">
              Ver todas →
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="overflow-hidden rounded-2xl border border-slate-300 bg-white">
                <div className="relative aspect-[4/5] overflow-hidden bg-slate-200">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name || "Produto"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-500">Sem imagem</div>
                  )}
                  <span className="absolute right-3 top-3 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
                    {formatMoney(product.price)}
                  </span>
                </div>
                <CardContent className="space-y-3 p-5">
                  <p className="text-2xl font-bold text-slate-900">{product.name || "Sem nome"}</p>
                  <p className="text-slate-600">{product.description || "Produto oficial da igreja."}</p>
                  <Button asChild className="w-full rounded-xl bg-[#232b7a] text-lg hover:bg-[#1b2367]">
                    <Link to={`/camisas/${churchTotvsId}/pedido?product=${product.id}`}>Fazer pedido</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {products.length === 0 ? (
            <Card className="rounded-2xl border border-slate-200">
              <CardContent className="p-6 text-center text-slate-600">
                Nenhuma camiseta disponível para esta igreja no momento.
              </CardContent>
            </Card>
          ) : null}
        </section>
      </main>

      <footer className="mt-10 bg-[#232b7a]">
        <div className="h-1 w-full bg-[linear-gradient(90deg,#ef4444,#f59e0b,#22c55e)]" />
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-8 text-white md:px-6">
          <img src="/app-icon.png" alt="Logo" className="h-12 w-12 rounded" />
          <div>
            <p className="text-lg font-bold">Igreja Pentecostal Deus e Amor</p>
            <p className="text-sm text-white/80">Sistema de Pedidos de Camisetas</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
