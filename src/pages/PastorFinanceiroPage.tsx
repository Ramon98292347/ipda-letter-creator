/**
 * PastorFinanceiroPage
 * ====================
 * O que faz: Página financeira para o pastor/secretario.
 *            Visualização somente leitura dos dados financeiros da sua igreja.
 * Quem acessa: pastor e secretario
 */
import { useMemo, useState } from "react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { useUser } from "@/context/UserContext";
import { getDashboard, listTransacoes, listContagens, listFechamentos } from "@/services/financeiroService";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, DollarSign, Loader2, AlertCircle, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";

// Comentario: formata um valor numérico como moeda brasileira
function formatarMoeda(valor: string | number): string {
  const numero = typeof valor === "string" ? parseFloat(valor) : valor;
  if (isNaN(numero)) return "R$ 0,00";
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Comentario: nomes dos meses em português
const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Comentario: formata uma data ISO para o padrão brasileiro (dd/mm/aaaa)
function formatarData(dataIso: string): string {
  if (!dataIso) return "";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function PastorFinanceiroPage() {
  const { usuario } = useUser();
  // Determina o roleMode com base no role do usuário logado
  const roleMode = usuario?.role === "secretario" ? "secretario" : "pastor";

  // Comentario: busca o resumo do mês atual
  const { data: dashboard, isLoading: loadingDash, isError: errDash } = useQuery({
    queryKey: ["pastor-financeiro-dashboard"],
    queryFn: getDashboard,
  });

  // Comentario: busca as últimas transações do mês atual
  const agora = new Date();
  const { data: transacoes, isLoading: loadingTrans } = useQuery({
    queryKey: ["pastor-financeiro-transacoes", agora.getMonth() + 1, agora.getFullYear()],
    queryFn: () => listTransacoes(agora.getMonth() + 1, agora.getFullYear()),
  });

  // Comentario: busca as últimas contagens de caixa
  const { data: contagens, isLoading: loadingContagens } = useQuery({
    queryKey: ["pastor-financeiro-contagens"],
    queryFn: listContagens,
  });

  const labelMes = dashboard
    ? `${NOMES_MESES[(dashboard.mes ?? 1) - 1]} de ${dashboard.ano}`
    : "";

  // Comentario: Total Entradas = soma de todos os saldo_contado das contagens de caixa do mes
  const totalEntradas = useMemo(() => {
    if (!contagens || contagens.length === 0) return 0;
    return contagens.reduce((soma, c) => soma + Number(c.saldo_contado || 0), 0);
  }, [contagens]);

  // Comentario: busca fechamentos para os graficos anuais
  const { data: fechamentos = [] } = useQuery({
    queryKey: ["pastor-financeiro-fechamentos"],
    queryFn: listFechamentos,
    staleTime: 2 * 60 * 1000,
  });

  // Comentario: ano selecionado para os graficos
  const [anoGrafico, setAnoGrafico] = useState(agora.getFullYear());

  // Comentario: dados mensais do ano para os graficos
  const dadosMensais = useMemo(() => {
    return NOMES_MESES.map((nomeMes, i) => {
      const mes = i + 1;
      const prefix = `${anoGrafico}-${String(mes).padStart(2, "0")}`;
      const entradas = (contagens || [])
        .filter((c) => c.data_contagem?.startsWith(prefix))
        .reduce((sum, c) => sum + Number(c.saldo_contado || 0), 0);
      const fech = fechamentos.find((f) => f.ano === anoGrafico && f.mes === mes);
      const saidas = Number(fech?.total_despesas || 0);
      return { mes: nomeMes.slice(0, 3), entradas, saidas, saldo: entradas - saidas };
    });
  }, [anoGrafico, contagens, fechamentos]);

  // Comentario: saldo acumulado ao longo do ano
  const dadosAcumulados = useMemo(() => {
    let acumulado = 0;
    return dadosMensais.map((d) => {
      acumulado += d.saldo;
      return { ...d, acumulado };
    });
  }, [dadosMensais]);

  const isLoading = loadingDash || loadingTrans || loadingContagens;

  return (
    <ManagementShell roleMode={roleMode}>
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
          <p className="text-slate-500">
            {isLoading ? "Carregando..." : labelMes ? `Resumo de ${labelMes} — somente leitura` : "Dados financeiros da sua igreja"}
          </p>
        </div>

        {/* Comentario: exibe erro se não conseguir carregar */}
        {errDash && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>Erro ao carregar dados financeiros. Tente novamente.</span>
          </div>
        )}

        {/* Cards de resumo */}
        {/* Comentario: 2 colunas no celular, 4 no desktop */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                {/* Comentario: Total Entradas agora é a soma das contagens de caixa */}
                <p className="text-sm text-slate-500">Total Entradas</p>
                {loadingContagens ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin text-slate-400" />
                ) : (
                  <p className="truncate text-xl font-bold text-green-700">
                    {formatarMoeda(totalEntradas)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">Total Saídas</p>
                {loadingDash ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin text-slate-400" />
                ) : (
                  <p className="truncate text-xl font-bold text-red-700">
                    {formatarMoeda(dashboard?.total_despesas ?? "0")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Wallet className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">Saldo</p>
                {loadingDash ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin text-slate-400" />
                ) : (
                  <p className={`truncate text-xl font-bold ${parseFloat(String(dashboard?.saldo ?? "0")) >= 0 ? "text-blue-700" : "text-red-700"}`}>
                    {formatarMoeda(dashboard?.saldo ?? "0")}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">Transações</p>
                {loadingDash ? (
                  <Loader2 className="mt-1 h-5 w-5 animate-spin text-slate-400" />
                ) : (
                  <p className="text-xl font-bold text-slate-900">
                    {dashboard?.total_transacoes ?? 0}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Duas colunas: Transações recentes + Contagens recentes */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Transações recentes */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Transações do Mês</h2>
            {loadingTrans ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : !transacoes || transacoes.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nenhuma transação registrada este mês.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {transacoes.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.descricao}</p>
                      <p className="text-xs text-slate-500">{formatarData(t.data_transacao)}</p>
                    </div>
                    <span className={`ml-3 text-sm font-semibold ${t.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                      {t.tipo === "receita" ? "+" : "-"}{formatarMoeda(t.valor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contagens de caixa recentes */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Contagens de Caixa</h2>
            {loadingContagens ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : !contagens || contagens.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nenhuma contagem registrada.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {contagens.slice(0, 8).map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatarData(c.data_contagem)}</p>
                        <p className="text-xs text-slate-500">{c.status}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatarMoeda(c.saldo_contado)}</p>
                      {/* Comentario: mostra diferença em vermelho se negativa */}
                      {Number(c.diferenca) !== 0 && (
                        <p className={`text-xs font-medium ${Number(c.diferenca) > 0 ? "text-green-600" : "text-red-600"}`}>
                          {Number(c.diferenca) > 0 ? "+" : ""}{formatarMoeda(c.diferenca)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* ── Gráficos Anuais ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Movimentações de {anoGrafico}</h3>
            <Select value={String(anoGrafico)} onValueChange={(v) => setAnoGrafico(Number(v))}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => agora.getFullYear() - i).map((ano) => (
                  <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Comentario: grafico de barras — entradas vs saidas por mes */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-semibold text-slate-700">Entradas vs Saídas</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dadosMensais} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => [`${formatarMoeda(value)}`, ""]}
                    labelStyle={{ fontWeight: 600 }}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="entradas" name="Entradas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Comentario: grafico de area — saldo acumulado ao longo do ano */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-sm font-semibold text-slate-700">Saldo Acumulado</h4>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dadosAcumulados} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => [`${formatarMoeda(value)}`, ""]}
                    labelStyle={{ fontWeight: 600 }}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="acumulado"
                    name="Saldo Acumulado"
                    stroke="#1A237E"
                    fill="#1A237E"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </ManagementShell>
  );
}
