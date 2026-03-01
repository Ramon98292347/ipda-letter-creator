import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

type StatItem = {
  label: string;
  value: number;
  icon: LucideIcon;
  gradient: string;
};

export function StatCards({ items }: { items: StatItem[] }) {
  return (
    <section className="grid gap-3 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className={`overflow-hidden border-0 text-white shadow-md ${item.gradient}`}>
          <CardContent className="p-5">
            <p className="flex items-center gap-2 text-lg font-semibold"><item.icon className="h-4 w-4" /> {item.label}</p>
            <p className="mt-3 text-5xl font-bold">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
