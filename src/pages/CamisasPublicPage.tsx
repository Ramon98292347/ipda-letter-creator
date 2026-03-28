import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Megaphone, Shirt } from "lucide-react";
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
  position?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function inDateWindow(item: AnnouncementRow) {
  const now = Date.now();
  const startsOk = !item.starts_at || new Date(String(item.starts_at)).getTime() <= now;
  const endsOk = !item.ends_at || new Date(String(item.ends_at)).getTime() >= now;
  return startsOk && endsOk;
}

export default function CamisasPublicPage() {
  const { churchTotvsId = "" } = useParams();
  const [slide, setSlide] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? 1 : 2,
  );

  const { data: churchRes, isLoading: loadingChurch } = useQuery({
    queryKey: ["camisas-public-church", churchTotvsId],
    enabled: Boolean(churchTotvsId),
    queryFn: () =>
      post<{ ok: boolean; churches: ChurchRow[] }>(
        "list-churches-public",
        { include_all: true, query: churchTotvsId, limit: 30 },
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
        { action: "list-public", church_totvs_id: churchTotvsId, limit: 100 },
        { skipAuth: true },
      ),
  });

  const products = productsRes?.products || [];
  const carouselItems = useMemo(
    () =>
      (announcementsRes?.announcements || [])
        .filter(inDateWindow)
        .sort((a, b) => Number(a.position || 999) - Number(b.position || 999)),
    [announcementsRes?.announcements],
  );

  useEffect(() => {
    const onResize = () => {
      setItemsPerPage(window.innerWidth < 768 ? 1 : 2);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(carouselItems.length / Math.max(itemsPerPage, 1)));
  const visibleItems = useMemo(() => {
    const start = slide * itemsPerPage;
    return carouselItems.slice(start, start + itemsPerPage);
  }, [carouselItems, slide, itemsPerPage]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const timer = setInterval(() => {
      setSlide((prev) => (prev + 1) % totalPages);
    }, 6000);
    return () => clearInterval(timer);
  }, [totalPages]);

  useEffect(() => {
    if (slide >= totalPages) setSlide(0);
  }, [slide, totalPages]);

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
            </a>
          </Button>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Megaphone className="h-5 w-5 text-amber-600" />
              Informações e Eventos
            </h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSlide((prev) => (prev - 1 + totalPages) % totalPages)}
                disabled={totalPages <= 1}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSlide((prev) => (prev + 1) % totalPages)}
                disabled={totalPages <= 1}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {visibleItems.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {visibleItems.map((item) => (
                <Card key={item.id} className="overflow-hidden rounded-2xl border border-slate-200">
                  <CardContent className="p-0">
                    <div className="relative bg-slate-900">
                      {item.media_url ? (
                        <img
                          src={item.media_url}
                          alt={item.title || "Aviso"}
                          className="h-auto w-full object-contain"
                        />
                      ) : (
                        <div className="h-[320px] w-full bg-gradient-to-br from-[#1f2a78] to-[#7a214f]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                      <div className="absolute left-3 right-3 top-3 rounded-xl bg-black/50 p-3 text-white md:left-4 md:right-4 md:top-4">
                        <p className="text-xl font-bold">{item.title || "Comunicado da igreja"}</p>
                        {item.body_text ? <p className="mt-1 text-sm text-white/90">{item.body_text}</p> : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-600">Sem avisos no momento.</div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSlide(idx)}
                  className={`h-2.5 w-2.5 rounded-full ${idx === slide ? "bg-slate-900" : "bg-slate-300"}`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          ) : null}
        </section>

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
                    <Link to={`/camisas/${churchTotvsId}/pedido?produto=${product.id}&auto=1`}>Fazer pedido</Link>
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
