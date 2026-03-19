/**
 * FinanceiroDashboardPage
 * =======================
 * O que faz: Página principal do módulo financeiro.
 *            Mostra os totais do mês atual e botões de acesso rápido.
 * Quem acessa: Usuários com role "financeiro"
 * Layout: cards com fundo colorido, igual ao sistema financeiro original.
 */
import { ManagementShell } from "@/components/layout/ManagementShell";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Calculator, Loader2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getDashboard } from "@/services/financeiroService";
import { useNavigate } from "react-router-dom";

// Comentario: formata um valor string como moeda brasileira (ex: "1234.50" → "R$ 1.234,50")
function formatarMoeda(valor: string | number): string {
  const numero = typeof valor === "string" ? parseFloat(valor) : valor;
  if (isNaN(numero)) return "R$ 0,00";
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Comentario: nomes dos meses em portugues para exibir no cabeçalho
const NOMES_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function FinanceiroDashboardPage() {
  const nav = useNavigate();

  // Comentario: busca os dados do dashboard — refaz automaticamente a cada 30s
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["financeiro-dashboard"],
    queryFn: getDashboard,
  });

  // Comentario: monta o label do mes para exibir no subtítulo
  const labelMes = data
    ? `${NOMES_MESES[(data.mes ?? 1) - 1]} de ${data.ano}`
    : "";

  // Comentario: saldo positivo ou negativo para cor do card
  const saldo = parseFloat(String(data?.saldo ?? "0"));
  const saldoPositivo = saldo >= 0;

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">

        {/* Cabeçalho da página */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Financeiro</h1>
          <p className="text-slate-500">
            {isLoading ? "Carregando dados..." : labelMes ? `Resumo de ${labelMes}` : "Gestão financeira da sua igreja"}
          </p>
        </div>

        {/* Comentario: mostra mensagem de erro se a busca falhar */}
        {isError && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>
              Erro ao carregar dados financeiros:{" "}
              {error instanceof Error ? error.message : "Tente novamente."}
            </span>
          </div>
        )}

        {/* Cards de resumo do mês — com fundo colorido */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

          {/* Card: Total Entradas — fundo verde */}
          <div className="rounded-xl bg-green-500 p-5 shadow-md text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-100">Total Entradas</p>
                {isLoading ? (
                  <Loader2 className="mt-2 h-6 w-6 animate-spin text-green-100" />
                ) : (
                  <p className="mt-1 text-2xl font-bold">
                    {formatarMoeda(data?.total_receitas ?? "0")}
                  </p>
                )}
              </div>
              <div className="rounded-full bg-green-400 bg-opacity-50 p-3">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="mt-3 text-xs text-green-100">Entradas do mês atual</p>
          </div>

          {/* Card: Total Saídas — fundo vermelho */}
          <div className="rounded-xl bg-red-500 p-5 shadow-md text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-100">Total Saídas</p>
                {isLoading ? (
                  <Loader2 className="mt-2 h-6 w-6 animate-spin text-red-100" />
                ) : (
                  <p className="mt-1 text-2xl font-bold">
                    {formatarMoeda(data?.total_despesas ?? "0")}
                  </p>
                )}
              </div>
              <div className="rounded-full bg-red-400 bg-opacity-50 p-3">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="mt-3 text-xs text-red-100">Saídas do mês atual</p>
          </div>

          {/* Card: Saldo — fundo azul escuro (positivo) ou vermelho escuro (negativo) */}
          <div
            className={`rounded-xl p-5 shadow-md text-white ${
              saldoPositivo ? "bg-[#1A237E]" : "bg-red-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${saldoPositivo ? "text-blue-200" : "text-red-200"}`}>
                  Saldo do Mês
                </p>
                {isLoading ? (
                  <Loader2 className="mt-2 h-6 w-6 animate-spin text-blue-200" />
                ) : (
                  <p className="mt-1 text-2xl font-bold">
                    {formatarMoeda(data?.saldo ?? "0")}
                  </p>
                )}
              </div>
              <div className={`rounded-full bg-opacity-30 p-3 ${saldoPositivo ? "bg-blue-300" : "bg-red-400"}`}>
                <Wallet className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className={`mt-3 text-xs ${saldoPositivo ? "text-blue-200" : "text-red-200"}`}>
              {saldoPositivo ? "Saldo positivo ✓" : "Saldo negativo ✗"}
            </p>
          </div>

          {/* Card: Total de Transações — fundo roxo */}
          <div className="rounded-xl bg-purple-600 p-5 shadow-md text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-100">Transações</p>
                {isLoading ? (
                  <Loader2 className="mt-2 h-6 w-6 animate-spin text-purple-100" />
                ) : (
                  <p className="mt-1 text-2xl font-bold">
                    {data?.total_transacoes ?? 0}
                  </p>
                )}
              </div>
              <div className="rounded-full bg-purple-400 bg-opacity-50 p-3">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="mt-3 text-xs text-purple-100">Total de lançamentos</p>
          </div>
        </div>

        {/* Ações rápidas — botões com cores sólidas */}
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-700">Ações Rápidas</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Botão: Contagem de Caixa — azul escuro #1A237E */}
            <button
              onClick={() => nav("/financeiro/contagem")}
              className="flex items-center gap-4 rounded-xl bg-[#1A237E] p-5 text-white shadow-md transition-all hover:bg-[#0D47A1] hover:shadow-lg text-left"
            >
              <div className="rounded-full bg-white bg-opacity-20 p-3">
                <Calculator className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white">Contagem de Caixa</p>
                <p className="text-sm text-blue-200">Registrar notas e moedas</p>
              </div>
            </button>

            {/* Botão: Cadastro de Saídas — vermelho */}
            <button
              onClick={() => nav("/financeiro/saidas")}
              className="flex items-center gap-4 rounded-xl bg-red-500 p-5 text-white shadow-md transition-all hover:bg-red-600 hover:shadow-lg text-left"
            >
              <div className="rounded-full bg-white bg-opacity-20 p-3">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white">Saídas</p>
                <p className="text-sm text-red-100">Registrar e gerenciar despesas</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </ManagementShell>
  );
}
