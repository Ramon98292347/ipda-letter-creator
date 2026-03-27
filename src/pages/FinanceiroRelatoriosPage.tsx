
import React, { useMemo, useState, useEffect } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { BarChart3, Download, Calendar, Filter, FileText, TrendingUp, TrendingDown, Mail, Save, Printer, History } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import RelatorioFinanceiroMensal from '@/components/Relatorios/RelatorioFinanceiroMensal';
import { toast } from '@/components/ui/use-toast';
import { apiListFechamentos, ApiFechamento, apiListFichasDiarias, ApiFichaDiaria } from '@/lib/financeiroApi';

const Relatorios: React.FC = () => {
  const { transactions, categories, cashCounts } = useFinance();
  const [selectedPeriod, setSelectedPeriod] = useState('current-month');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportType, setReportType] = useState('summary');

  // ── Fichas diárias do mês vigente ───────────────────────────────────────
  const [fichasDiarias, setFichasDiarias] = useState<ApiFichaDiaria[]>([]);
  const [loadingFichas, setLoadingFichas] = useState(false);

  // ── Histórico de fechamentos mensais ────────────────────────────────────
  const [fechamentos, setFechamentos] = useState<ApiFechamento[]>([]);
  const [loadingFechamentos, setLoadingFechamentos] = useState(false);

  // Comentario: busca fichas do mês atual e fechamentos ao abrir a tela
  useEffect(() => {
    setLoadingFichas(true);
    apiListFichasDiarias()
      .then(setFichasDiarias)
      .catch(() => setFichasDiarias([]))
      .finally(() => setLoadingFichas(false));

    setLoadingFechamentos(true);
    apiListFechamentos()
      .then(setFechamentos)
      .catch(() => setFechamentos([]))
      .finally(() => setLoadingFechamentos(false));
  }, []);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date();

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
  
  // Carregar entradas diárias salvas
  const entradasSalvasRaw = localStorage.getItem('registrosDiarios') || '[]';
  const registrosDiarios = useMemo(() => {
    try {
      return JSON.parse(entradasSalvasRaw);
    } catch {
      return [];
    }
  }, [entradasSalvasRaw]);

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

  const totalEntries = useMemo(() => {
    const total = filteredTransactions
      .filter(t => t.type === 'entrada')
      .reduce((sum, t) => sum + t.amount, 0);
    return total + totalEntradasDiarias;
  }, [filteredTransactions, totalEntradasDiarias]);

  const totalExits = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'saida')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const balance = useMemo(() => totalEntries - totalExits, [totalEntries, totalExits]);

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

  const recentTransactions = useMemo(() => {
    return [...filteredTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [filteredTransactions]);

  const generatePDF = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'A geração de PDF será implementada com bibliotecas como jsPDF ou pdfmake.'
    });
  };

  const sendByEmail = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'O envio por email será implementado no backend.'
    });
  };

  return (
    <ManagementShell roleMode="financeiro">
    <div className="space-y-6">
      {/* Header */}
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

      {/* Filters */}
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

      {/* Summary Cards */}
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

      {/* Relatório Financeiro Mensal */}
      <RelatorioFinanceiroMensal
        onBack={() => {}}
        transactions={filteredTransactions}
        cashCounts={cashCounts}
      />

      {/* Charts and Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Analysis */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Análise por Categoria</h3>
          
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
        </div>

        {/* Recent Transactions */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transações Recentes</h3>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentTransactions
              .map((transaction) => (
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
              ))}
          </div>
        </div>
      </div>

      {/* ── Fichas Diárias do Mês Vigente ────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-[#1A237E]" />
            Fichas Diárias — {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </h2>
          {loadingFichas && <span className="text-sm text-gray-400">Carregando...</span>}
        </div>

        {fichasDiarias.length === 0 && !loadingFichas ? (
          <p className="p-6 text-sm text-gray-500 italic">
            Nenhuma ficha registrada este mês. As fichas são criadas automaticamente ao salvar contagens na tela Contagem do Dia.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Inicial</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Entradas</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Saídas</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Final</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fichasDiarias.map((f) => {
                  const saldoFinal = Number(f.saldo_final) || 0;
                  return (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {new Date(f.data_ficha + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                        R$ {Number(f.saldo_inicial).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-semibold">
                        R$ {Number(f.total_entradas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 font-semibold">
                        R$ {Number(f.total_saidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        R$ {saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          f.status === 'fechada' ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {f.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totais do mês */}
              <tfoot className="bg-blue-50">
                <tr>
                  <td className="px-6 py-3 text-sm font-bold text-gray-900">Total do Mês</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">—</td>
                  <td className="px-6 py-3 text-sm text-right font-bold text-green-600">
                    R$ {fichasDiarias.reduce((s, f) => s + Number(f.total_entradas), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-bold text-red-600">
                    R$ {fichasDiarias.reduce((s, f) => s + Number(f.total_saidas), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-bold text-blue-700">
                    R$ {fichasDiarias.reduce((s, f) => s + Number(f.saldo_final), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Histórico de Fechamentos Mensais ──────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <History className="w-5 h-5 mr-2 text-[#1A237E]" />
            Histórico de Fechamentos
          </h2>
          {loadingFechamentos && (
            <span className="text-sm text-gray-400">Carregando...</span>
          )}
        </div>

        {fechamentos.length === 0 && !loadingFechamentos ? (
          <p className="p-6 text-sm text-gray-500 italic">
            Nenhum fechamento salvo ainda. Ao clicar em &quot;Salvar&quot; no Relatório Financeiro Mensal, o fechamento aparecerá aqui.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mês / Ano</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Entradas</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saídas</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Final</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responsável</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fechado em</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fechamentos.map((f) => {
                  // Comentario: nomes dos meses em português para exibição
                  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                  const saldoFinal = Number(f.saldo_final_mes) || 0;
                  return (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {meses[f.mes - 1]} / {f.ano}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-semibold">
                        R$ {Number(f.total_receitas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 font-semibold">
                        R$ {Number(f.total_despesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                        R$ {saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {f.responsavel_atual || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {f.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {f.fechado_em ? new Date(f.fechado_em).toLocaleDateString('pt-BR') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Report Table */}
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
};

export default Relatorios;
