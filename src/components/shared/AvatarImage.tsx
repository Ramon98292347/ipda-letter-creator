import { useState } from "react";
import { User } from "lucide-react";

interface AvatarImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export function AvatarImage({ src, alt, className = "h-10 w-10 rounded-full object-cover" }: AvatarImageProps) {
  const [failed, setFailed] = useState(false);

  // Se não tem src ou falhou ao carregar, mostra placeholder
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-slate-100`}>
        <User className="h-5 w-5 text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
