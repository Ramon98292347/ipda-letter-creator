import { useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";

interface AvatarImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

const FAILED_URLS = new Set<string>();
const URL_PROBE_CACHE = new Map<string, boolean>();

function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (FAILED_URLS.has(trimmed)) return false;
  return true;
}

export function AvatarImage({ src, alt, className = "h-10 w-10 rounded-full object-cover" }: AvatarImageProps) {
  const [failed, setFailed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [canRender, setCanRender] = useState(false);
  const resolvedSrc = useMemo(() => (src && isValidUrl(src) ? src.trim() : null), [src]);

  useEffect(() => {
    setFailed(false);
    if (!resolvedSrc) {
      setCanRender(false);
      setChecked(true);
      return;
    }

    const cached = URL_PROBE_CACHE.get(resolvedSrc);
    if (typeof cached === "boolean") {
      setCanRender(cached);
      setChecked(true);
      return;
    }

    let cancelled = false;
    setChecked(false);
    fetch(resolvedSrc, { method: "HEAD", cache: "force-cache" })
      .then((resp) => {
        if (cancelled) return;
        const ok = resp.ok;
        URL_PROBE_CACHE.set(resolvedSrc, ok);
        if (!ok) FAILED_URLS.add(resolvedSrc);
        setCanRender(ok);
      })
      .catch(() => {
        if (cancelled) return;
        URL_PROBE_CACHE.set(resolvedSrc, false);
        FAILED_URLS.add(resolvedSrc);
        setCanRender(false);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedSrc]);

  // Show placeholder when no valid src, still checking, or failed.
  if (!resolvedSrc || failed || !checked || !canRender) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-100`}>
        <User className="h-5 w-5 text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => {
        FAILED_URLS.add(resolvedSrc);
        URL_PROBE_CACHE.set(resolvedSrc, false);
        setFailed(true);
      }}
    />
  );
}