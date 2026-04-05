import { useMemo, useState } from "react";
import { User } from "lucide-react";

const FAILED_AVATAR_URLS = new Set<string>();

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
  const resolved = useMemo(() => resolveAvatarUrl(src), [src]);

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={className}
        onError={() => {
          FAILED_AVATAR_URLS.add(resolved);
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
