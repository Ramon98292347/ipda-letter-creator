import { PropsWithChildren } from "react";

export function Table({ children, minWidth = "980px" }: PropsWithChildren<{ minWidth?: string }>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}
