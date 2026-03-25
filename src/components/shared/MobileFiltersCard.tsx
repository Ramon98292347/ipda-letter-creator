import { PropsWithChildren, ReactNode, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type MobileFiltersCardProps = PropsWithChildren<{
  title?: string;
  description?: string;
  headerRight?: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpenMobile?: boolean;
}>;

export function MobileFiltersCard({
  title = "Filtros",
  description,
  headerRight,
  className = "",
  contentClassName = "",
  defaultOpenMobile = false,
  children,
}: MobileFiltersCardProps) {
  const [openMobile, setOpenMobile] = useState(defaultOpenMobile);

  return (
    <Card className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      <CardContent className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-900">
              <SlidersHorizontal className="h-4 w-4 text-[#2f63d4]" />
              <p className="text-sm font-semibold md:text-base">{title}</p>
            </div>
            {description ? <p className="mt-1 text-xs text-slate-500 md:text-sm">{description}</p> : null}
          </div>

          {headerRight ? <div className="hidden md:block">{headerRight}</div> : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 md:hidden"
            onClick={() => setOpenMobile((current) => !current)}
          >
            {openMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="ml-2">{openMobile ? "Recolher" : "Mostrar"}</span>
          </Button>
        </div>

        <div className={`hidden md:block ${contentClassName}`.trim()}>{children}</div>
        {openMobile ? <div className={`space-y-3 md:hidden ${contentClassName}`.trim()}>{children}</div> : null}
      </CardContent>
    </Card>
  );
}
