
import React, { useMemo, useState } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import { useNavigate } from 'react-router-dom';
import { getCurrentDateBrazil } from '@/lib/dateUtils';

const Dashboard: React.FC = () => {
  const { transactions, cashCounts } = useFinance();
  const navigate = useNavigate();

  // Calcular m?tricas
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedWeek, setSelectedWeek] = useState('all');

  const monthInputValue = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const monthRange = useMemo(() => {
    const start = new Date(selectedYear, selectedMonth, 1);
    const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }, [selectedYear, selectedMonth]);

  const weekOptions = useMemo(() => {
    const start = new Date(selectedYear, selectedMonth, 1);
    const end = new Date(selectedYear, selectedMonth + 1, 0);

    const options: Array<{ value: string; label: string }> = [];
    const dayIndex = (start.getDay() + 6) % 7; // Monday=0
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() - dayIndex);

    let cursor = new Date(weekStart);
    while (cursor <= end) {
      const ws = new Date(cursor);
      const we = new Date(cursor);
      we.setDate(we.getDate() + 6);
      const value = `${ws.toISOString().slice(0, 10)}_${we.toISOString().slice(0, 10)}`;
      const label = `${ws.toLocaleDateString('pt-BR')} - ${we.toLocaleDateString('pt-BR')}`;
      options.push({ value, label });
      cursor.setDate(cursor.getDate() + 7);
    }
    return options;
  }, [selectedYear, selectedMonth]);

  const selectedRange = useMemo(() => {
    if (selectedWeek === 'all') {
      return monthRange;
    }
    const [startStr, endStr] = selectedWeek.split('_');
    return {
      start: new Date(startStr + 'T00:00:00'),
      end: new Date(endStr + 'T23:59:59')
    };
  }, [selectedWeek, monthRange]);

  const isWithinRange = (dateStr: string) => {
    const d = new Date(dateStr);
    return d >= selectedRange.start && d <= selectedRange.end;
  };

  const registrosDiariosRaw = localStorage.getItem('registrosDiarios') || '[]';
  const entradasSalvasRaw = localStorage.getItem('entradasSalvas') || '[]';

  const registrosDiarios = useMemo(() => {
    try {
      return JSON.parse(registrosDiariosRaw);
    } catch {
      return [];
    }
  }, [registrosDiariosRaw]);

  const entradasSalvas = useMemo(() => {
    try {
      return JSON.parse(entradasSalvasRaw);
    } catch {
      return [];
    }
  }, [entradasSalvasRaw]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => isWithinRange(t.date));
  }, [transactions, selectedRange]);

  const totalEntradasDiarias = useMemo(() => {
    const registrosDoPeriodo = registrosDiarios.filter((registro: any) => isWithinRange(registro.date));
    const entradasDoPeriodo = entradasSalvas.filter((entrada: any) => isWithinRange(entrada.date));

    const totalRegistros = registrosDoPeriodo.reduce((sum: number, registro: any) => {
      return sum + (registro.cashAmount || 0) + (registro.transfer || 0) + (registro.missionaryOffering || 0);
    }, 0);

    const totalEntradas = entradasDoPeriodo.reduce((sum: number, entrada: any) => {
      return sum + (entrada.total || 0);
    }, 0);

    return totalRegistros + totalEntradas;
  }, [registrosDiarios, entradasSalvas, selectedRange]);

  const totalEntries = useMemo(() => {
    const totalMensal = filteredTransactions
      .filter(t => t.type === 'entrada')
      .reduce((sum, t) => sum + t.amount, 0);

    return totalMensal + totalEntradasDiarias;
  }, [filteredTransactions, totalEntradasDiarias]);

  const totalGeralTodasEntradas = useMemo(() => {
    const totalGeralEntradas = transactions
      .filter(t => t.type === 'entrada')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalRegistros = registrosDiarios.reduce((sum: number, registro: any) => {
      return sum + (registro.cashAmount || 0) + (registro.transfer || 0) + (registro.missionaryOffering || 0);
    }, 0);

    const totalEntradas = entradasSalvas.reduce((sum: number, entrada: any) => {
      return sum + (entrada.total || 0);
    }, 0);

    return totalGeralEntradas + totalRegistros + totalEntradas;
  }, [transactions, registrosDiarios, entradasSalvas]);

  const totalYearEntries = useMemo(() => {
    const yearEntriesFromTransactions = transactions
      .filter(t => t.type === 'entrada' && new Date(t.date).getFullYear() === selectedYear)
      .reduce((sum, t) => sum + t.amount, 0);

    const yearEntriesFromCashCounts = cashCounts
      .filter((c) => new Date(c.date).getFullYear() === selectedYear)
      .reduce((sum, c) => sum + (c.valor_dinheiro || 0) + (c.valor_pix || 0) + (c.valor_cartao || 0), 0);

    const yearEntriesFromRegistros = registrosDiarios
      .filter((registro: any) => new Date(registro.date).getFullYear() === selectedYear)
      .reduce((sum: number, registro: any) => {
        return sum + (registro.cashAmount || 0) + (registro.transfer || 0) + (registro.missionaryOffering || 0);
      }, 0);

    const yearEntriesFromEntradas = entradasSalvas
      .filter((entrada: any) => new Date(entrada.date).getFullYear() === selectedYear)
      .reduce((sum: number, entrada: any) => sum + (entrada.total || 0), 0);

    return yearEntriesFromTransactions + yearEntriesFromCashCounts + yearEntriesFromRegistros + yearEntriesFromEntradas;
  }, [transactions, cashCounts, registrosDiarios, entradasSalvas, selectedYear]);

  const totalYearExits = useMemo(() => {
    return transactions
      .filter(t => t.type === 'saida' && new Date(t.date).getFullYear() === selectedYear)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, selectedYear]);

  const yearTotalsFromReports = useMemo(() => {
    let entries = 0;
    let exits = 0;

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('monthly-report-')) {
        continue;
      }
      const parts = key.split('-');
      const year = parseInt(parts[2] || '', 10);
      if (Number.isNaN(year) || year !== selectedYear) {
        continue;
      }
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        const totals = data?.totals;
        if (totals) {
          entries += Number(totals.totalEntries || 0);
          exits += Number(totals.totalExits || 0);
        }
      } catch {
        // ignore invalid report
      }
    }

    return { entries, exits };
  }, [selectedYear]);

  const yearEntriesFinal = yearTotalsFromReports.entries > 0 ? yearTotalsFromReports.entries : totalYearEntries;
  const yearExitsFinal = yearTotalsFromReports.exits > 0 ? yearTotalsFromReports.exits : totalYearExits;
  const yearBalance = useMemo(() => yearEntriesFinal - yearExitsFinal, [yearEntriesFinal, yearExitsFinal]);

  const { dizimos, ofertas, ofertasMissionarias } = useMemo(() => {
    const dizimos = { dinheiro: 0, pix: 0, cartao: 0, total: 0 };
    const ofertas = { dinheiro: 0, pix: 0, cartao: 0, total: 0 };
    const ofertasMissionarias = { dinheiro: 0, pix: 0, cartao: 0, total: 0 };

    const entradasDoPeriodo = entradasSalvas.filter((entrada: any) => isWithinRange(entrada.date));

    entradasDoPeriodo.forEach((entrada: any) => {
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
  }, [entradasSalvas, selectedRange]);

  const totalExits = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'saida')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const balance = useMemo(() => totalEntries - totalExits, [totalEntries, totalExits]);

  const todayCashCount = useMemo(() => {
    const today = getCurrentDateBrazil();
    return cashCounts.find(c => c.date === today);
  }, [cashCounts]);

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

  const recentTransactions = useMemo(() => {
    return [...filteredTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [filteredTransactions]);

  const handleContagemDia = () => {
    navigate('/contagem-dia');
  };

  const handleNovaEntrada = () => {
    navigate('/contagem-dia');
  };

  const handleNovaSaida = () => {
    navigate('/saidas');
  };

  const handleRelatorios = () => {
    navigate('/relatorios');
  };

  return (
    <ManagementShell roleMode="financeiro">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Visao geral das suas financas</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
            <input
              type="month"
              value={monthInputValue}
              onChange={(e) => {
                const [yearStr, monthStr] = e.target.value.split('-');
                const year = parseInt(yearStr, 10);
                const month = parseInt(monthStr, 10) - 1;
                if (!Number.isNaN(year) && !Number.isNaN(month)) {
                  setSelectedYear(year);
                  setSelectedMonth(month);
                  setSelectedWeek('all');
                }
              }}
              className="w-full sm:w-56 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Semana</label>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            >
              <option value="all">Todas as semanas</option>
              {weekOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Entradas */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Entradas do Mes</p>
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
            <span className="text-green-600">+12% vs mes anterior</span>
          </div>
        </div>

        {/* Total Saidas */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Saidas do Mes</p>
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
            <span className="text-red-600">+5% vs mes anterior</span>
          </div>
        </div>

        {/* Saldo */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Saldo do Mes</p>
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

        {/* Caixa Hoje */}
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

      {/* Acompanhamento do Ano */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Acompanhamento do Ano</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Entradas do Ano</h3>
            <p className="text-2xl font-bold text-green-600">
              R$ {yearEntriesFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Saidas do Ano</h3>
            <p className="text-2xl font-bold text-red-600">
              R$ {yearExitsFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className={`${yearBalance >= 0 ? 'bg-blue-50' : 'bg-orange-50'} p-4 rounded-lg`}>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Saldo do Ano</h3>
            <p className={`${yearBalance >= 0 ? 'text-blue-600' : 'text-orange-600'} text-2xl font-bold`}>
              R$ {yearBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Dizimos, Ofertas e Ofertas Missionarias Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Dizimos */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-600">Dizimos do Mes</p>
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

        {/* Ofertas */}
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

        {/* Ofertas Missionárias */}
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

      {/* Charts and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
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
              <p className="text-gray-500 text-center py-4">Nenhuma transação encontrada</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h3>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleContagemDia}
              className="p-4 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] transition-colors"
            >
              <Calendar className="w-6 h-6 mx-auto mb-2" />
              <span className="text-sm font-medium">Contagem do Dia</span>
            </button>
            <button 
              onClick={handleNovaEntrada}
              className="p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <TrendingUp className="w-6 h-6 mx-auto mb-2" />
              <span className="text-sm font-medium">Nova Entrada</span>
            </button>
            <button 
              onClick={handleNovaSaida}
              className="p-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <TrendingDown className="w-6 h-6 mx-auto mb-2" />
              <span className="text-sm font-medium">Nova Saída</span>
            </button>
            <button 
              onClick={handleRelatorios}
              className="p-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <DollarSign className="w-6 h-6 mx-auto mb-2" />
              <span className="text-sm font-medium">Relatórios</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </ManagementShell>
  );
};

export default Dashboard;
