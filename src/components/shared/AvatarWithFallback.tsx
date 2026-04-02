import { useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";

const FAILED_AVATAR_URLS = new Set<string>();
const URL_PROBE_CACHE = new Map<string, boolean>();

function resolveAvatarUrl(src?: string | null) {
  const url = String(src || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (FAILED_AVATAR_URLS.has(url)) return null;
  return url;
}

export function AvatarWithFallback({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [canRender, setCanRender] = useState(false);
  const resolved = useMemo(() => resolveAvatarUrl(src), [src]);

  useEffect(() => {
    setFailed(false);
    if (!resolved) {
      setCanRender(false);
      setChecked(true);
      return;
    }

    const cached = URL_PROBE_CACHE.get(resolved);
    if (typeof cached === "boolean") {
      setCanRender(cached);
      setChecked(true);
      return;
    }

    let cancelled = false;
    setChecked(false);
    fetch(resolved, { method: "HEAD", cache: "force-cache" })
      .then((resp) => {
        if (cancelled) return;
        const ok = resp.ok;
        URL_PROBE_CACHE.set(resolved, ok);
        if (!ok) FAILED_AVATAR_URLS.add(resolved);
        setCanRender(ok);
      })
      .catch(() => {
        if (cancelled) return;
        URL_PROBE_CACHE.set(resolved, false);
        FAILED_AVATAR_URLS.add(resolved);
        setCanRender(false);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [resolved]);

  if (resolved && !failed && checked && canRender) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={className}
        onError={() => {
          FAILED_AVATAR_URLS.add(resolved);
          URL_PROBE_CACHE.set(resolved, false);
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