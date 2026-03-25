import { PropsWithChildren } from "react";

export function Table({
  children,
  minWidth = "980px",
  maxHeight,
}: PropsWithChildren<{ minWidth?: string; maxHeight?: string }>) {
  return (
    // Comentario: overflow-x-auto = scroll horizontal em mobile
    // overflow-y-auto + maxHeight = scroll vertical quando a tabela tem muitas linhas
    <div
      className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white"
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
