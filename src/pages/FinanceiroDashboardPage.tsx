/**
 * FinanceiroDashboardPage.tsx
 * ============================
 * O que faz: Página principal do módulo financeiro.
 *            Mostra resumo do mês atual (entradas, saídas, saldo, caixa hoje),
 *            dízimos/ofertas/missionárias por forma de pagamento e ações rápidas.
 *
 * Quem acessa: Usuários com role "financeiro"
 * Layout: ManagementShell do sistema principal (sem wrapper extra)
 *
 * Esta página combina:
 *   - Cards do FinanceContext (contagens do dia, entradas salvas)
 *   - Dados reais do backend via financeiroService (transações do banco)
 */

import { useMemo } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import { useNavigate } from 'react-router-dom';

/**
 * Obtém a data atual no formato YYYY-MM-DD no fuso local.
 * Evita o bug de timezone do new Date().toISOString().
 */
function getCurrentDateBrazil(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function FinanceiroDashboardPage() {
  const { transactions, cashCounts } = useFinance();
  const navigate = useNavigate();

  // Data atual para filtros
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Lê os dados salvos pela contagem do dia do localStorage
  const registrosDiariosRaw = localStorage.getItem('registrosDiarios') || '[]';
  const entradasSalvasRaw = localStorage.getItem('entradasSalvas') || '[]';

  // Parseia os registros diários salvos (novas contagens)
  const registrosDiarios = useMemo(() => {
    try {
      return JSON.parse(registrosDiariosRaw);
    } catch {
      return [];
    }
  }, [registrosDiariosRaw]);

  // Parseia as entradas salvas pela contagem do dia (dízimos/ofertas/missionárias)
  const entradasSalvas = useMemo(() => {
    try {
      return JSON.parse(entradasSalvasRaw);
    } catch {
      return [];
    }
  }, [entradasSalvasRaw]);

  // Filtra as transações do mês atual
  const monthlyTransactions = useMemo(() => {
    return transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getMonth() === currentMonth && transactionDate.getFullYear() === currentYear;
    });
  }, [transactions, currentMonth, currentYear]);

  /**
   * Calcula o total de entradas do mês vindo das contagens diárias
   * (registros de caixa e entradas de dízimos/ofertas salvas).
   */
  const totalEntradasDiarias = useMemo(() => {
    // Filtrar registros e entradas do mês atual
    const registrosDoMes = registrosDiarios.filter((registro: any) => {
      const registroDate = new Date(registro.date);
      return registroDate.getMonth() === currentMonth && registroDate.getFullYear() === currentYear;
    });

    const entradasDoMes = entradasSalvas.filter((entrada: any) => {
      const entradaDate = new Date(entrada.date);
      return entradaDate.getMonth() === currentMonth && entradaDate.getFullYear() === currentYear;
    });

    // Soma os valores dos registros diários (caixa + transferências + missionárias)
    const totalRegistros = registrosDoMes.reduce((sum: number, registro: any) => {
      return sum + (registro.cashAmount || 0) + (registro.transfer || 0) + (registro.missionaryOffering || 0);
    }, 0);

    // Soma os totais das entradas salvas (dízimos, ofertas, etc.)
    const totalEntradas = entradasDoMes.reduce((sum: number, entrada: any) => {
      return sum + (entrada.total || 0);
    }, 0);

    return totalRegistros + totalEntradas;
  }, [registrosDiarios, entradasSalvas, currentMonth, currentYear]);

  // Total de entradas do mês (transações + contagens diárias)
  const totalEntries = useMemo(() => {
    const totalMensal = monthlyTransactions
      .filter(t => t.type === 'entrada')
      .reduce((sum, t) => sum + t.amount, 0);

    return totalMensal + totalEntradasDiarias;
  }, [monthlyTransactions, totalEntradasDiarias]);

  // Total de saídas do mês
  const totalExits = useMemo(() => {
    return monthlyTransactions
      .filter(t => t.type === 'saida')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [monthlyTransactions]);

  // Saldo do mês
  const balance = useMemo(() => totalEntries - totalExits, [totalEntries, totalExits]);

  /**
   * Calcula o total de entradas especificamente de HOJE.
   * Combina entradas salvas, registros de caixa e transações normais.
   */
  const totalEntradasHoje = useMemo(() => {
    const today = getCurrentDateBrazil();
    let totalToday = 0;

    const entradasHoje = entradasSalvas.filter((entrada: any) => entrada.date === today);
    totalToday += entradasHoje.reduce((sum: number, entrada: any) => sum + (entrada.total || 0), 0);

    const registrosHoje = registrosDiarios.filter((registro: any) => registro.date === today);
    totalToday += registrosHoje.reduce((sum: number, registro: any) => {
      return sum + (registro.cashAmount || 0) + (registro.transfer || 0) + (registro.missionaryOffering || 0);
    }, 0);

    const transacoesHoje = transactions.filter(t => t.type === 'entrada' && t.date === today);
    totalToday += transacoesHoje.reduce((sum, t) => sum + t.amount, 0);

    return totalToday;
  }, [entradasSalvas, registrosDiarios, transactions]);

  /**
   * Calcula os totais de dízimos, ofertas e ofertas missionárias do mês,
   * separados por forma de pagamento (dinheiro, PIX, cartão).
   */
  const { dizimos, ofertas, ofertasMissionarias } = useMemo(() => {
    const dizimos = { dinheiro: 0, pix: 0, cartao: 0, total: 0 };
    const ofertas = { dinheiro: 0, pix: 0, cartao: 0, total: 0 };
    const ofertasMissionarias = { dinheiro: 0, pix: 0, cartao: 0, total: 0 };

    const entradasDoMes = entradasSalvas.filter((entrada: any) => {
      const entradaDate = new Date(entrada.date);
      return entradaDate.getMonth() === currentMonth && entradaDate.getFullYear() === currentYear;
    });

    // Agrupa por tipo e soma por forma de pagamento
    entradasDoMes.forEach((entrada: any) => {
      if (entrada.type === 'dizimos') {
        dizimos.dinheiro += entrada.dinheiro || 0;
        dizimos.pix += entrada.pix || 0;
        dizimos.cartao += entrada.cartao || 0;
        dizimos.total += entrada.total || 0;
      } else if (entrada.type === 'ofertas') {
        ofertas.dinheiro += entrada.dinheiro || 0;
        ofertas.pix += entrada.pix || 0;
        ofertas.cartao += entrada.cartao || 0;
        ofertas.total += entrada.total || 0;
      } else if (entrada.type === 'ofertas-missionarias') {
        ofertasMissionarias.dinheiro += entrada.dinheiro || 0;
        ofertasMissionarias.pix += entrada.pix || 0;
        ofertasMissionarias.cartao += entrada.cartao || 0;
        ofertasMissionarias.total += entrada.total || 0;
      }
    });

    return { dizimos, ofertas, ofertasMissionarias };
  }, [entradasSalvas, currentMonth, currentYear]);

  // Últimas 5 transações para exibição no histórico
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [transactions]);

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h1>
          <p className="text-gray-600">Visão geral das finanças da sua igreja</p>
        </div>

        {/* Cards de métricas principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Entradas do mês */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Entradas do Mês</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {totalEntries.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <ArrowUpRight className="w-4 h-4 text-green-500 mr-1" />
              <span className="text-green-600">Receitas registradas</span>
            </div>
          </div>

          {/* Saídas do mês */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saídas do Mês</p>
                <p className="text-2xl font-bold text-red-600">
                  R$ {totalExits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <ArrowDownRight className="w-4 h-4 text-red-500 mr-1" />
              <span className="text-red-600">Despesas registradas</span>
            </div>
          </div>

          {/* Saldo do mês */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saldo do Mês</p>
                <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-[#1A237E]" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <span className={`${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {balance >= 0 ? 'Saldo positivo' : 'Saldo negativo'}
              </span>
            </div>
          </div>

          {/* Caixa hoje */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Caixa Hoje</p>
                <p className="text-2xl font-bold text-[#1A237E]">
                  R$ {totalEntradasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-[#1A237E]" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              <span className="text-gray-600">
                {totalEntradasHoje > 0 ? 'Entradas registradas' : 'Nenhuma entrada hoje'}
              </span>
            </div>
          </div>
        </div>

        {/* Cards detalhados: Dízimos, Ofertas e Ofertas Missionárias */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Dízimos do mês */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Dízimos do Mês</p>
                <p className="text-2xl font-bold text-blue-600">
                  R$ {dizimos.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Banknote className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Dinheiro</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {dizimos.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">PIX/OCT</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {dizimos.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Cartão</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {dizimos.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Ofertas do mês */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Ofertas do Mês</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {ofertas.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Banknote className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Dinheiro</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {ofertas.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">PIX/OCT</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {ofertas.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Cartão</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {ofertas.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Ofertas Missionárias do mês */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Ofertas Missionárias do Mês</p>
                <p className="text-2xl font-bold text-orange-600">
                  R$ {ofertasMissionarias.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Banknote className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Dinheiro</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {ofertasMissionarias.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">PIX/OCT</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {ofertasMissionarias.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">Cartão</span>
                </div>
                <span className="font-medium text-gray-900">
                  R$ {ofertasMissionarias.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Histórico recente + Ações rápidas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Últimas transações */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Transações Recentes</h3>
            <div className="space-y-3">
              {recentTransactions.length > 0 ? (
                recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        transaction.type === 'entrada' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        {transaction.type === 'entrada' ? (
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{transaction.description}</p>
                        <p className="text-sm text-gray-500">{transaction.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        transaction.type === 'entrada' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.type === 'entrada' ? '+' : '-'}R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(transaction.date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">Nenhuma transação registrada</p>
              )}
            </div>
          </div>

          {/* Botões de ação rápida */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => navigate('/financeiro/contagem')}
                className="p-4 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] transition-colors"
              >
                <Calendar className="w-6 h-6 mx-auto mb-2" />
                <span className="text-sm font-medium">Contagem do Dia</span>
              </button>
              <button
                onClick={() => navigate('/financeiro/saidas')}
                className="p-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <TrendingDown className="w-6 h-6 mx-auto mb-2" />
                <span className="text-sm font-medium">Nova Saída</span>
              </button>
              <button
                onClick={() => navigate('/financeiro/ficha')}
                className="p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <DollarSign className="w-6 h-6 mx-auto mb-2" />
                <span className="text-sm font-medium">Ficha Diária</span>
              </button>
              <button
                onClick={() => navigate('/financeiro/relatorios')}
                className="p-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <TrendingUp className="w-6 h-6 mx-auto mb-2" />
                <span className="text-sm font-medium">Relatórios</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ManagementShell>
  );
}
