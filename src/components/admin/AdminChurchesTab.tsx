import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AdminChurchSummary } from "@/services/saasService";

export function AdminChurchesTab({ rows }: { rows: AdminChurchSummary[] }) {
  return (
    <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle>Igrejas Cadastradas</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[120px_260px_260px_120px_120px_120px_120px] border-y border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
              <span>TOTVS</span>
              <span>Igreja</span>
              <span>Pastor</span>
              <span>Obreiros</span>
              <span>Cartas</span>
              <span>Liberadas</span>
              <span>Pendentes</span>
            </div>

            {rows.map((r) => (
              <div key={r.totvs_id} className="grid grid-cols-[120px_260px_260px_120px_120px_120px_120px] items-center border-b border-slate-200 px-5 py-3 text-sm">
                <span className="whitespace-nowrap">{r.totvs_id}</span>
                <span className="whitespace-nowrap">{r.church_name}</span>
                <span className="whitespace-nowrap">{r.pastor_name || "-"}</span>
                <span className="whitespace-nowrap">{r.total_obreiros}</span>
                <span className="whitespace-nowrap">{r.total_cartas}</span>
                <span className="whitespace-nowrap">
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">{r.cartas_liberadas}</Badge>
                </span>
                <span className="whitespace-nowrap">
                  <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200">{r.pendentes_liberacao}</Badge>
                </span>
              </div>
            ))}

            {rows.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-500">Nenhuma igreja encontrada no escopo.</div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
