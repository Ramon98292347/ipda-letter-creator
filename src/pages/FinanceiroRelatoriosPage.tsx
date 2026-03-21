/**
 * FinanceiroRelatoriosPage.tsx
 * =============================
 * O que faz: Página de relatórios financeiros.
 *            Permite filtrar por período (mês atual, mês anterior, ano) e categoria.
 *            Exibe resumo de entradas/saídas/saldo e análise por categoria.
 *
 * Quem acessa: Usuários com role "financeiro"
 * Layout: ManagementShell do sistema principal
 *
 * Adaptado do financeiro-novo/src/pages/Relatorios.tsx.
 * Removido: import Layout, import AuthContext.
 *           Removido o componente RelatorioFinanceiroMensal (componente externo do financeiro-novo).
 * Mantido: filtros, cálculos e tabela detalhada.
 */

import { useMemo, useState } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { BarChart3, Download, Filter, TrendingUp, TrendingDown, Mail, FileText } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import { toast } from '@/components/ui/use-toast';

export default function FinanceiroRelatoriosPage() {
  const { transactions, categories } = useFinance();

  // Filtros de período, categoria e tipo de relatório
  const [selectedPeriod, setSelectedPeriod] = useState('current-month');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportType, setReportType] = useState('summary');

  /**
   * Filtra as transações com base no período e categoria selecionados.
   */
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date();

    // Define as datas de início e fim conforme o período selecionado
    switch (selectedPeriod) {
      case 'current-month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last-month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'current-year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'last-year':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return transactions.filter(t => {
      const transactionDate = new Date(t.date);
      const matchesPeriod = transactionDate >= startDate && transactionDate <= endDate;
      const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
      return matchesPeriod && matchesCategory;
    });
  }, [transactions, selectedPeriod, selectedCategory]);

  // Lê registros diários do localStorage para incluir no total de entradas
  const entradasSalvasRaw = localStorage.getItem('registrosDiarios') || '[]';
  const registrosDiarios = useMemo(() => {
    try {
      return JSON.parse(entradasSalvasRaw);
    } catch {
      return [];
    }
  }, [entradasSalvasRaw]);

  /**
   * Total de entradas dos registros diários do mês atual.
   */
  const totalEntradasDiarias = useMemo(() => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const registrosDoMes = registrosDiarios.filter((registro: any) => {
      const registroDate = new Date(registro.date);
      return registroDate.getMonth() === currentMonth && registroDate.getFullYear() === currentYear;
    });

    return registrosDoMes.reduce((sum: number, registro: any) => {
      return sum + (registro.cashAmount || 0) + (registro.transfer || 0) + (registro.missionaryOffering || 0);
    }, 0);
  }, [registrosDiarios]);

  // Total geral de entradas (transações + registros diários)
  const totalEntries = useMemo(() => {
    const total = filteredTransactions
      .filter(t => t.type === 'entrada')
      .reduce((sum, t) => sum + t.amount, 0);
    return total + totalEntradasDiarias;
  }, [filteredTransactions, totalEntradasDiarias]);

  // Total de saídas no período
  const totalExits = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'saida')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  // Saldo = entradas - saídas
  const balance = useMemo(() => totalEntries - totalExits, [totalEntries, totalExits]);

  /**
   * Agrupa as transações por categoria para o gráfico de barras.
   */
  const transactionsByCategory = useMemo(() => {
    return categories.map(category => {
      const categoryTransactions = filteredTransactions.filter(t => t.category === category.name);
      const categoryTotal = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);

      return {
        category: category.name,
        color: category.color,
        total: categoryTotal,
        count: categoryTransactions.length,
        transactions: categoryTransactions
      };
    }).filter(c => c.total > 0);
  }, [categories, filteredTransactions]);

  // Últimas 10 transações do período para o histórico
  const recentTransactions = useMemo(() => {
    return [...filteredTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [filteredTransactions]);

  /** Simula geração de PDF (funcionalidade futura) */
  const generatePDF = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'A geração de PDF será implementada com bibliotecas como jsPDF ou pdfmake.'
    });
  };

  /** Simula envio por email (funcionalidade futura) */
  const sendByEmail = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'O envio por email será implementado no backend.'
    });
  };

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <BarChart3 className="w-6 h-6 mr-2 text-[#1A237E]" />
              Relatórios
            </h1>
            <p className="text-gray-600">Análise e exportação de dados financeiros</p>
          </div>

          <div className="flex space-x-3 mt-4 sm:mt-0">
            <button
              onClick={generatePDF}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Gerar PDF
            </button>
            <button
              onClick={sendByEmail}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Mail className="w-4 h-4 mr-2" />
              Enviar por Email
            </button>
          </div>
        </div>

        {/* Filtros de período, categoria e tipo de relatório */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filtros
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Período
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
              >
                <option value="current-month">Mês Atual</option>
                <option value="last-month">Mês Anterior</option>
                <option value="current-year">Ano Atual</option>
                <option value="last-year">Ano Anterior</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
              >
                <option value="all">Todas as Categorias</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Relatório
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
              >
                <option value="summary">Resumo Geral</option>
                <option value="detailed">Detalhado</option>
                <option value="category">Por Categoria</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cards de resumo do período */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Entradas</p>
                <p className="text-2xl font-bold text-green-600">
                  R$ {totalEntries.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Saídas</p>
                <p className="text-2xl font-bold text-red-600">
                  R$ {totalExits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-600" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saldo</p>
                <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                balance >= 0 ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <span className={`text-lg font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {balance >= 0 ? '+' : '-'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Transações</p>
                <p className="text-2xl font-bold text-[#1A237E]">
                  {filteredTransactions.length}
                </p>
              </div>
              <FileText className="w-8 h-8 text-[#1A237E]" />
            </div>
          </div>
        </div>

        {/* Gráficos e análises */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Análise por categoria — barras de progresso */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Análise por Categoria</h3>

            {transactionsByCategory.length > 0 ? (
              <div className="space-y-4">
                {transactionsByCategory.map((item, index) => {
                  const percentage = totalExits > 0 ? (item.total / totalExits) * 100 : 0;

                  return (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: item.color }}
                          ></div>
                          <span className="font-medium text-gray-900">{item.category}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-600">
                          R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Barra de progresso proporcional ao total de saídas */}
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            backgroundColor: item.color,
                            width: `${percentage}%`
                          }}
                        ></div>
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
              <p className="text-gray-500 text-center py-4">
                Nenhuma transação categorizada no período.
              </p>
            )}
          </div>

          {/* Histórico recente de transações */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Transações Recentes</h3>

            <div className="space-y-3 max-h-96 overflow-y-auto">
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
                        <p className="font-medium text-gray-900 text-sm">{transaction.description}</p>
                        <p className="text-xs text-gray-500">{transaction.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${
                        transaction.type === 'entrada' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaction.type === 'entrada' ? '+' : '-'}R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(transaction.date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Nenhuma transação no período selecionado.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabela detalhada — só aparece quando tipo = "detailed" */}
        {reportType === 'detailed' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Relatório Detalhado</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categoria
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(transaction.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {transaction.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.category}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          transaction.type === 'entrada' ?
                            'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                        }`}>
                          {transaction.type === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-semibold ${
                          transaction.type === 'entrada' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ManagementShell>
  );
}
