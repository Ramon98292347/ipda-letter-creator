import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, Banknote, CreditCard, Smartphone, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getDashboard, listCategorias, listContagens, listTransacoes } from "@/services/financeiroService";

function getCurrentDateBrazil(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export default function FinanceiroDashboardPage() {
  const navigate = useNavigate();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const today = getCurrentDateBrazil();

  const { data: dashboard, isLoading: loadingDashboard } = useQuery({
    queryKey: ["financeiro-dashboard"],
    queryFn: getDashboard,
  });

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ["financeiro-dashboard-transacoes", currentMonth, currentYear],
    queryFn: () => listTransacoes(currentMonth, currentYear),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["financeiro-dashboard-categorias"],
    queryFn: listCategorias,
  });

  const { data: contagens = [], isLoading: loadingContagens } = useQuery({
    queryKey: ["financeiro-dashboard-contagens"],
    queryFn: listContagens,
  });

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => map.set(category.id, category.nome));
    return map;
  }, [categories]);

  const totalEntries = Number(dashboard?.total_receitas || 0);
  const totalExits = Number(dashboard?.total_despesas || 0);
  const balance = Number(dashboard?.saldo || 0);

  const totalEntradasHoje = useMemo(() => {
    const receitasHoje = transactions
      .filter((transaction) => transaction.tipo === "receita" && transaction.data_transacao === today)
      .reduce((sum, transaction) => sum + Number(transaction.valor || 0), 0);

    const contagensHoje = contagens
      .filter((contagem) => contagem.data_contagem === today)
      .reduce((sum, contagem) => sum + Number(contagem.saldo_contado || 0), 0);

    return receitasHoje || contagensHoje;
  }, [contagens, today, transactions]);

  const groupedEntries = useMemo(() => {
    const empty = {
      dinheiro: 0,
      pix: 0,
      cartao: 0,
      total: 0,
    };

    const data = {
      dizimos: { ...empty },
      ofertas: { ...empty },
      ofertasMissionarias: { ...empty },
    };

    for (const transaction of transactions) {
      if (transaction.tipo !== "receita") continue;
      const categoryName = String(categoryById.get(String(transaction.categoria_id || "")) || "").toLowerCase();
      const value = Number(transaction.valor || 0);

      if (categoryName.includes("diz")) {
        data.dizimos.total += value;
        data.dizimos.pix += value;
      } else if (categoryName.includes("mission")) {
        data.ofertasMissionarias.total += value;
        data.ofertasMissionarias.pix += value;
      } else if (categoryName.includes("ofert")) {
        data.ofertas.total += value;
        data.ofertas.pix += value;
      }
    }

    return data;
  }, [categoryById, transactions]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.data_transacao).getTime() - new Date(a.data_transacao).getTime())
      .slice(0, 5);
  }, [transactions]);

  const loading = loadingDashboard || loadingTransactions || loadingContagens;

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h1>
          <p className="text-gray-600">Visão geral das finanças da sua igreja</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Entradas do Mês</p>
                <p className="text-2xl font-bold text-green-600">R$ {formatCurrency(totalEntries)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <ArrowUpRight className="mr-1 h-4 w-4 text-green-500" />
              <span className="text-green-600">Receitas registradas</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saídas do Mês</p>
                <p className="text-2xl font-bold text-red-600">R$ {formatCurrency(totalExits)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <ArrowDownRight className="mr-1 h-4 w-4 text-red-500" />
              <span className="text-red-600">Despesas registradas</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saldo do Mês</p>
                <p className={`text-2xl font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>R$ {formatCurrency(balance)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <DollarSign className="h-6 w-6 text-[#1A237E]" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className={balance >= 0 ? "text-green-600" : "text-red-600"}>
                {balance >= 0 ? "Saldo positivo" : "Saldo negativo"}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Caixa Hoje</p>
                <p className="text-2xl font-bold text-[#1A237E]">R$ {formatCurrency(totalEntradasHoje)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <Calendar className="h-6 w-6 text-[#1A237E]" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-gray-600">{totalEntradasHoje > 0 ? "Entradas registradas" : "Nenhuma entrada hoje"}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Dízimos do Mês", color: "blue", icon: <Banknote className="h-6 w-6 text-blue-600" />, data: groupedEntries.dizimos },
            { title: "Ofertas do Mês", color: "green", icon: <Banknote className="h-6 w-6 text-green-600" />, data: groupedEntries.ofertas },
            { title: "Ofertas Missionárias do Mês", color: "orange", icon: <Banknote className="h-6 w-6 text-orange-600" />, data: groupedEntries.ofertasMissionarias },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{item.title}</p>
                  <p className={`text-2xl font-bold ${item.color === "blue" ? "text-blue-600" : item.color === "green" ? "text-green-600" : "text-orange-600"}`}>
                    R$ {formatCurrency(item.data.total)}
                  </p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${item.color === "blue" ? "bg-blue-100" : item.color === "green" ? "bg-green-100" : "bg-orange-100"}`}>
                  {item.icon}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Banknote className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">Dinheiro</span>
                  </div>
                  <span className="font-medium text-gray-900">R$ {formatCurrency(item.data.dinheiro)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <Smartphone className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">PIX/OCT</span>
                  </div>
                  <span className="font-medium text-gray-900">R$ {formatCurrency(item.data.pix)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">Cartão</span>
                  </div>
                  <span className="font-medium text-gray-900">R$ {formatCurrency(item.data.cartao)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Transações Recentes</h3>
            <div className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : recentTransactions.length > 0 ? (
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
                        <p className="font-medium text-gray-900">{transaction.descricao}</p>
                        <p className="text-sm text-gray-500">{categoryById.get(String(transaction.categoria_id || "")) || "Sem categoria"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${transaction.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                        {transaction.tipo === "receita" ? "+" : "-"}R$ {formatCurrency(Number(transaction.valor || 0))}
                      </p>
                      <p className="text-sm text-gray-500">{transaction.data_transacao.split("-").reverse().join("/")}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-gray-500">Nenhuma transação registrada</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => navigate("/financeiro/contagem")}
                className="rounded-lg bg-[#1A237E] p-4 text-white transition-colors hover:bg-[#0D47A1]"
              >
                <Calendar className="mx-auto mb-2 h-6 w-6" />
                <span className="text-sm font-medium">Contagem do Dia</span>
              </button>
              <button
                onClick={() => navigate("/financeiro/saidas")}
                className="rounded-lg bg-red-600 p-4 text-white transition-colors hover:bg-red-700"
              >
                <TrendingDown className="mx-auto mb-2 h-6 w-6" />
                <span className="text-sm font-medium">Nova Saída</span>
              </button>
              <button
                onClick={() => navigate("/financeiro/ficha")}
                className="rounded-lg bg-green-600 p-4 text-white transition-colors hover:bg-green-700"
              >
                <DollarSign className="mx-auto mb-2 h-6 w-6" />
                <span className="text-sm font-medium">Ficha Diária</span>
              </button>
              <button
                onClick={() => navigate("/financeiro/relatorios")}
                className="rounded-lg bg-gray-600 p-4 text-white transition-colors hover:bg-gray-700"
              >
                <TrendingUp className="mx-auto mb-2 h-6 w-6" />
                <span className="text-sm font-medium">Relatórios</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ManagementShell>
  );
}
