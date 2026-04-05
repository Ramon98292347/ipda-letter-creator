import { useMemo, useState } from "react";
import { User } from "lucide-react";

interface AvatarImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

const FAILED_URLS = new Set<string>();

function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (FAILED_URLS.has(trimmed)) return false;
  return true;
}

export function AvatarImage({ src, alt, className = "h-10 w-10 rounded-full object-cover" }: AvatarImageProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = useMemo(() => (src && isValidUrl(src) ? src.trim() : null), [src]);

  if (!resolvedSrc || failed) {
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
        setFailed(true);
      }}
    />
  );
}
