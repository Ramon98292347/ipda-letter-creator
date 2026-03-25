import { PropsWithChildren, ReactNode, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type FiltersBarProps = PropsWithChildren<{
  title?: string;
  headerRight?: ReactNode;
  defaultOpenMobile?: boolean;
}>;

export function FiltersBar({
  children,
  title = "Filtros",
  headerRight,
  defaultOpenMobile = false,
}: FiltersBarProps) {
  const [openMobile, setOpenMobile] = useState(defaultOpenMobile);

  return (
    <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <div className="flex items-center gap-2 text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-[#2f63d4]" />
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpenMobile((value) => !value)}>
          {openMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="ml-2">{openMobile ? "Recolher" : "Mostrar"}</span>
        </Button>
      </div>
      {headerRight ? <div className="mb-4 hidden md:block">{headerRight}</div> : null}
      <div className="hidden md:block">{children}</div>
      {openMobile ? <div className="md:hidden">{children}</div> : null}
    </Card>
  );
}
