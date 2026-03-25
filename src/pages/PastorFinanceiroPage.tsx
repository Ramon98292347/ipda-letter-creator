/**
 * PastorFinanceiroPage
 * ====================
 * O que faz: Página financeira para o pastor/secretario.
 *            Visualização somente leitura dos dados financeiros da sua igreja.
 * Quem acessa: pastor e secretario
 */
import { useMemo } from "react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { useUser } from "@/context/UserContext";
import { getDashboard, listTransacoes, listContagens } from "@/services/financeiroService";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, DollarSign, Loader2, AlertCircle, Calendar } from "lucide-react";

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
      </div>
    </ManagementShell>
  );
}
