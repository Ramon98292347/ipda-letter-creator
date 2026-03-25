import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, Loader2, Mail, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { MobileFiltersCard } from "@/components/shared/MobileFiltersCard";
import { listCategorias, listTransacoes, type Categoria, type Transacao } from "@/services/financeiroService";
import { toast } from "@/components/ui/use-toast";

type PeriodFilter = "current-month" | "last-month" | "current-year" | "last-year";
type ReportType = "summary" | "detailed" | "category";

function buildMonthsForPeriod(period: PeriodFilter) {
  const now = new Date();
  if (period === "current-month") return [{ mes: now.getMonth() + 1, ano: now.getFullYear() }];
  if (period === "last-month") {
    const base = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [{ mes: base.getMonth() + 1, ano: base.getFullYear() }];
  }

  const year = period === "current-year" ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 12 }, (_, index) => ({ mes: index + 1, ano: year }));
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateIso: string) {
  if (!dateIso) return "";
  const [ano, mes, dia] = dateIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function FinanceiroRelatoriosPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("current-month");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [reportType, setReportType] = useState<ReportType>("summary");

  const months = useMemo(() => buildMonthsForPeriod(selectedPeriod), [selectedPeriod]);

  const { data: categories = [] } = useQuery({
    queryKey: ["fin-relatorios-categorias"],
    queryFn: listCategorias,
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["fin-relatorios-transacoes", months.map((item) => `${item.mes}-${item.ano}`).join("|")],
    queryFn: async () => {
      const groups = await Promise.all(months.map(({ mes, ano }) => listTransacoes(mes, ano)));
      const merged = groups.flat();
      const deduped = new Map<string, Transacao>();
      for (const item of merged) deduped.set(item.id, item);
      return Array.from(deduped.values());
    },
  });

  const categoryById = useMemo(() => {
    const map = new Map<string, Categoria>();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (selectedCategory === "all") return true;
      return String(transaction.categoria_id || "") === selectedCategory;
    });
  }, [transactions, selectedCategory]);

  const totalEntries = useMemo(() => {
    return filteredTransactions
      .filter((transaction) => transaction.tipo === "receita")
      .reduce((sum, transaction) => sum + Number(transaction.valor || 0), 0);
  }, [filteredTransactions]);

  const totalExits = useMemo(() => {
    return filteredTransactions
      .filter((transaction) => transaction.tipo === "despesa")
      .reduce((sum, transaction) => sum + Number(transaction.valor || 0), 0);
  }, [filteredTransactions]);

  const balance = totalEntries - totalExits;

  const transactionsByCategory = useMemo(() => {
    return categories
      .map((category) => {
        const categoryTransactions = filteredTransactions.filter(
          (transaction) => String(transaction.categoria_id || "") === category.id,
        );
        const total = categoryTransactions.reduce((sum, transaction) => sum + Number(transaction.valor || 0), 0);
        return {
          id: category.id,
          category: category.nome,
          color: category.cor,
          total,
          count: categoryTransactions.length,
        };
      })
      .filter((item) => item.total > 0);
  }, [categories, filteredTransactions]);

  const recentTransactions = useMemo(() => {
    return [...filteredTransactions]
      .sort((a, b) => new Date(b.data_transacao).getTime() - new Date(a.data_transacao).getTime())
      .slice(0, 10);
  }, [filteredTransactions]);

  const generatePDF = () => {
    toast({
      title: "Em desenvolvimento",
      description: "A geração de PDF será implementada em uma próxima etapa.",
    });
  };

  const sendByEmail = () => {
    toast({
      title: "Em desenvolvimento",
      description: "O envio por email será implementado no backend.",
    });
  };

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center text-2xl font-bold text-gray-900">
              <BarChart3 className="mr-2 h-6 w-6 text-[#1A237E]" />
              Relatórios
            </h1>
            <p className="text-gray-600">Análise e exportação de dados financeiros</p>
          </div>

          <div className="mt-4 flex space-x-3 sm:mt-0">
            <button
              onClick={generatePDF}
              className="flex items-center rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
            >
              <Download className="mr-2 h-4 w-4" />
              Gerar PDF
            </button>
            <button
              onClick={sendByEmail}
              className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
            >
              <Mail className="mr-2 h-4 w-4" />
              Enviar por Email
            </button>
          </div>
        </div>

        <MobileFiltersCard
          title="Filtros"
          description="Defina o período, a categoria e o tipo do relatório."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Período</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value as PeriodFilter)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition-colors focus:border-[#1A237E] focus:ring-2 focus:ring-[#1A237E]"
              >
                <option value="current-month">Mês Atual</option>
                <option value="last-month">Mês Anterior</option>
                <option value="current-year">Ano Atual</option>
                <option value="last-year">Ano Anterior</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Categoria</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition-colors focus:border-[#1A237E] focus:ring-2 focus:ring-[#1A237E]"
              >
                <option value="all">Todas as Categorias</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de Relatório</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition-colors focus:border-[#1A237E] focus:ring-2 focus:ring-[#1A237E]"
              >
                <option value="summary">Resumo Geral</option>
                <option value="detailed">Detalhado</option>
                <option value="category">Por Categoria</option>
              </select>
            </div>
          </div>
        </MobileFiltersCard>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Entradas</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalEntries)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Saídas</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalExits)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saldo</p>
                <p className={`text-2xl font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(balance)}
                </p>
              </div>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${balance >= 0 ? "bg-green-100" : "bg-red-100"}`}>
                <span className={`text-lg font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {balance >= 0 ? "+" : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Transações</p>
                <p className="text-2xl font-bold text-[#1A237E]">{filteredTransactions.length}</p>
              </div>
              {isLoading ? <Loader2 className="h-8 w-8 animate-spin text-[#1A237E]" /> : <FileText className="h-8 w-8 text-[#1A237E]" />}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Análise por Categoria</h3>

            {transactionsByCategory.length > 0 ? (
              <div className="space-y-4">
                {transactionsByCategory.map((item) => {
                  const percentage = totalExits > 0 ? (item.total / totalExits) * 100 : 0;
                  return (
                    <div key={item.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="h-4 w-4 rounded" style={{ backgroundColor: item.color }} />
                          <span className="font-medium text-gray-900">{item.category}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-600">{formatCurrency(item.total)}</span>
                      </div>

                      <div className="h-2 w-full rounded-full bg-gray-200">
                        <div className="h-2 rounded-full" style={{ backgroundColor: item.color, width: `${percentage}%` }} />
                      </div>

                      <div className="flex justify-between text-sm text-gray-500">
                        <span>{item.count} transações</span>
                        <span>{percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-gray-500">Nenhuma transação categorizada no período.</p>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Transações Recentes</h3>

            <div className="max-h-96 space-y-3 overflow-y-auto">
              {recentTransactions.length > 0 ? (
                recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between border-b border-gray-100 py-2 last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${transaction.tipo === "receita" ? "bg-green-100" : "bg-red-100"}`}>
                        {transaction.tipo === "receita" ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{transaction.descricao}</p>
                        <p className="text-xs text-gray-500">{categoryById.get(String(transaction.categoria_id || ""))?.nome || "Sem categoria"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${transaction.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                        {transaction.tipo === "receita" ? "+" : "-"}{formatCurrency(Number(transaction.valor || 0))}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(transaction.data_transacao)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-gray-500">Nenhuma transação no período selecionado.</p>
              )}
            </div>
          </div>
        </div>

        {reportType === "detailed" ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900">Relatório Detalhado</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Data</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Descrição</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Categoria</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{formatDate(transaction.data_transacao)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{transaction.descricao}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{categoryById.get(String(transaction.categoria_id || ""))?.nome || "Sem categoria"}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${transaction.tipo === "receita" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {transaction.tipo === "receita" ? "Entrada" : "Saída"}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-6 py-4 text-sm font-semibold ${transaction.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(Number(transaction.valor || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </ManagementShell>
  );
}
