import { PropsWithChildren } from "react";
import { Card } from "@/components/ui/card";

export function FiltersBar({ children }: PropsWithChildren) {
  return <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">{children}</Card>;
}
