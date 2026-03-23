import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AnnouncementItem } from "@/services/saasService";

type Announcement = Pick<AnnouncementItem, "id" | "title" | "type" | "body_text" | "media_url" | "link_url">;

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          <button className="rounded-lg border px-3 py-1 text-sm" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AnnouncementCarousel({
  items,
  birthdays = [],
  intervalMs = 7000,
  heightClass = "h-[520px]",
}: {
  items: Announcement[];
  birthdays?: string[];
  intervalMs?: number;
  heightClass?: string;
}) {
  const list = useMemo(() => items ?? [], [items]);
  const [idx, setIdx] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const [imageSizes, setImageSizes] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    if (idx >= list.length) setIdx(0);
  }, [list.length, idx]);

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => setIdx((v) => (v + 1) % list.length), intervalMs);
    return () => clearInterval(t);
  }, [list.length, intervalMs]);

  useEffect(() => {
    setVideoOpen(false);
  }, [idx]);

  const birthdaysText =
    birthdays.length > 0
      ? `Parabens: ${birthdays.slice(0, 3).join(", ")}${birthdays.length > 3 ? "..." : ""}`
      : null;

  if (!list.length) {
    return (
      <div className={`w-full ${heightClass}`}>
        <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">{birthdaysText || "Sem avisos no momento."}</div>
        <div className="mt-4 flex h-[calc(100%-64px)] items-center justify-center rounded-2xl border bg-white text-slate-400">
          Nenhum anuncio cadastrado.
        </div>
      </div>
    );
  }

  const cur = list[idx];
  const next = list.length > 1 ? list[(idx + 1) % list.length] : null;
  const dualImageMode = Boolean(
    list.length > 1 &&
      cur?.type === "image" &&
      cur?.media_url &&
      next?.type === "image" &&
      next?.media_url,
  );

  function saveImageSize(id: string, width: number, height: number) {
    if (!id || !width || !height) return;
    setImageSizes((prev) => {
      const current = prev[id];
      if (current?.width === width && current?.height === height) return prev;
      return { ...prev, [id]: { width, height } };
    });
  }

  function getMediaFrameClass(item?: Announcement | null) {
    if (!item?.id) return "aspect-video w-full max-w-full";
    const size = imageSizes[item.id];
    if (!size?.width || !size?.height) return "aspect-video w-full max-w-full";

    const ratio = size.width / size.height;
    if (ratio <= 0.8) return "aspect-[9/16] w-full max-w-[360px]";
    if (ratio <= 1.15) return "aspect-square w-full max-w-[460px]";
    if (ratio >= 1.7) return "aspect-[16/9] w-full max-w-full";
    return "aspect-[4/3] w-full max-w-[720px]";
  }

  return (
    <div className={`flex w-full flex-col ${heightClass}`}>
      <div className="rounded-xl border bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {dualImageMode ? "Divulgacao da Igreja" : cur.title}
            </div>
            <div className="mt-0.5 text-xs text-slate-600">{birthdaysText || "Avisos e comunicados da igreja"}</div>
          </div>

          {cur.link_url ? (
            <button className="shrink-0 rounded-lg border bg-white px-3 py-1 text-xs font-medium" onClick={() => window.open(cur.link_url!, "_blank")}>
              Abrir
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border bg-white p-3">
        {dualImageMode ? (
          <div className="flex h-full gap-3 overflow-x-auto overflow-y-hidden pb-1 snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
            <div className="flex min-h-0 min-w-full snap-center flex-col overflow-hidden rounded-xl border bg-slate-50 md:min-w-0">
              <div className="flex flex-1 items-center justify-center p-3">
                <div className={`overflow-hidden rounded-xl bg-white ${getMediaFrameClass(cur)}`}>
                  <img
                    src={cur.media_url!}
                    alt={cur.title}
                    className="h-full w-full object-contain object-center"
                    onLoad={(e) => saveImageSize(cur.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                  />
                </div>
              </div>
              <div className="truncate border-t bg-white px-3 py-2 text-xs font-medium text-slate-700">{cur.title}</div>
            </div>
            <div className="flex min-h-0 min-w-full snap-center flex-col overflow-hidden rounded-xl border bg-slate-50 md:min-w-0">
              <div className="flex flex-1 items-center justify-center p-3">
                <div className={`overflow-hidden rounded-xl bg-white ${getMediaFrameClass(next)}`}>
                  <img
                    src={next!.media_url!}
                    alt={next!.title}
                    className="h-full w-full object-contain object-center"
                    onLoad={(e) => saveImageSize(next!.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                  />
                </div>
              </div>
              <div className="truncate border-t bg-white px-3 py-2 text-xs font-medium text-slate-700">{next!.title}</div>
            </div>
          </div>
        ) : null}

        {!dualImageMode && cur.type === "text" ? <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-slate-800">{cur.body_text || ""}</div> : null}

        {!dualImageMode && cur.type === "image" && cur.media_url ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-slate-50 p-3">
            <div className={`overflow-hidden rounded-xl bg-white shadow-sm ${getMediaFrameClass(cur)}`}>
              <img
                src={cur.media_url}
                alt={cur.title}
                className="h-full w-full rounded-xl object-contain object-center"
                onLoad={(e) => saveImageSize(cur.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
              />
            </div>
          </div>
        ) : null}

        {!dualImageMode && cur.type === "video" && cur.media_url ? (
          <>
            <button className="flex min-h-0 flex-1 items-center justify-center rounded-xl border bg-slate-50" onClick={() => setVideoOpen(true)}>
              <div className="flex items-center gap-3 rounded-xl border bg-white px-5 py-3 shadow-sm">
                <span className="text-2xl">?</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-900">Reproduzir video</div>
                  <div className="text-xs text-slate-600">Clique para abrir</div>
                </div>
              </div>
            </button>

            <Modal open={videoOpen} onClose={() => setVideoOpen(false)} title={cur.title}>
              <video src={cur.media_url} className="w-full rounded-xl" controls playsInline />
            </Modal>
          </>
        ) : null}

        {list.length > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-2">
            {list.map((_, i) => (
              <button
                key={i}
                className={`h-2.5 w-2.5 rounded-full ${i === idx ? "bg-slate-900" : "bg-slate-300"}`}
                onClick={() => setIdx(i)}
                aria-label={`Ir para anuncio ${i + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
