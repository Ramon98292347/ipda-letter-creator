
import React, { useMemo, useState, useEffect } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { BarChart3, Calendar, FileText, TrendingUp, TrendingDown, History, Wallet } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import RelatorioFinanceiroMensal from '@/components/Relatorios/RelatorioFinanceiroMensal';
import { toast } from '@/components/ui/use-toast';
import { apiListFechamentos, ApiFechamento, apiListFichasDiarias, ApiFichaDiaria } from '@/lib/financeiroApi';
import { useUser } from '@/context/UserContext';

const Relatorios: React.FC = () => {
  const { transactions, categories, cashCounts } = useFinance();
  const { usuario, session } = useUser();
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);

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

  const filteredTransactions = useMemo(() => transactions, [transactions]);
  
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
    const total = transactions
      .filter(t => t.type === 'entrada')
      .reduce((sum, t) => sum + t.amount, 0);
    return total + totalEntradasDiarias;
  }, [transactions, totalEntradasDiarias]);

  const totalExits = useMemo(() => {
    return transactions
      .filter(t => t.type === 'saida')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const totalDizimos = useMemo(() => {
    const now = new Date();
    return cashCounts
      .filter((c) => {
        const [ano, mes] = c.date.split('-').map(Number);
        return ano === now.getFullYear() && mes === (now.getMonth() + 1) && c.tipo_coleta === 'dizimos';
      })
      .reduce((sum, c) => sum + Number(c.valor_dinheiro || 0) + Number(c.valor_pix || 0) + Number(c.valor_cartao || 0), 0);
  }, [cashCounts]);

  const totalOfertasMissionarias = useMemo(() => {
    const now = new Date();
    return cashCounts
      .filter((c) => {
        const [ano, mes] = c.date.split('-').map(Number);
        return ano === now.getFullYear() && mes === (now.getMonth() + 1) && c.tipo_coleta === 'ofertas-missionarias';
      })
      .reduce((sum, c) => sum + Number(c.valor_dinheiro || 0) + Number(c.valor_pix || 0) + Number(c.valor_cartao || 0), 0);
  }, [cashCounts]);

  const totalOfertas = useMemo(() => {
    const now = new Date();
    return cashCounts
      .filter((c) => {
        const [ano, mes] = c.date.split('-').map(Number);
        return ano === now.getFullYear() && mes === (now.getMonth() + 1) && c.tipo_coleta === 'ofertas';
      })
      .reduce((sum, c) => sum + Number(c.valor_dinheiro || 0) + Number(c.valor_pix || 0) + Number(c.valor_cartao || 0), 0);
  }, [cashCounts]);

  const balance = useMemo(() => totalEntries - totalExits, [totalEntries, totalExits]);
  const saldoPositivo = useMemo(() => balance, [balance]);

  const transactionsByCategory = useMemo(() => {
    return categories.map(category => {
      const categoryTransactions = transactions.filter(t => t.category === category.name);
      const categoryTotal = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);

      return {
        category: category.name,
        color: category.color,
        total: categoryTotal,
        count: categoryTransactions.length,
        transactions: categoryTransactions
      };
    }).filter(c => c.total > 0);
  }, [categories, transactions]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [transactions]);

  const handleGerarDocumentoRelatorio = async () => {
    setIsGeneratingDoc(true);
    try {
      const now = new Date();
      const payload = {
        origem: 'ipda-letter-creator',
        tipo_documento: 'relatorio-financeiro-mensal',
        gerado_em: now.toISOString(),
        referencia: {
          mes: now.getMonth() + 1,
          ano: now.getFullYear(),
        },
        igreja: {
          totvs_id: session?.totvs_id || usuario?.default_totvs_id || usuario?.totvs || null,
          nome: session?.church_name || usuario?.church_name || usuario?.igreja_nome || null,
          classificacao: session?.church_class || usuario?.church_class || null,
        },
        usuario: {
          id: usuario?.id || null,
          nome: usuario?.nome || usuario?.full_name || null,
          role: usuario?.role || session?.role || null,
        },
        totais: {
          total_entradas: totalEntries,
          total_saidas: totalExits,
          saldo: balance,
          total_transacoes: transactions.length,
        },
        movimentos: {
          transacoes: transactions,
          contagens_caixa: cashCounts,
          fichas_diarias: fichasDiarias,
          fechamentos,
        },
      };

      const response = await fetch('https://n8n-n8n.ynlng8.easypanel.host/webhook/financeiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Webhook retornou ${response.status}`);

      setReportGenerated(true);
      toast({
        title: 'Documento gerado',
        description: 'Relatório enviado ao n8n com sucesso.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({
        title: 'Erro ao gerar documento',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingDoc(false);
    }
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
            onClick={handleGerarDocumentoRelatorio}
            disabled={isGeneratingDoc}
            className="flex items-center px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] disabled:opacity-50 transition-colors"
          >
            <FileText className="w-4 h-4 mr-2" />
            {isGeneratingDoc ? 'Gerando...' : 'Gerar documento'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 rounded-xl shadow-md border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">Total Entradas</p>
              <p className="text-2xl font-bold text-white">
                R$ {totalEntries.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-white/20 p-2">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-red-500 to-red-700 p-6 rounded-xl shadow-md border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">Total Saídas</p>
              <p className="text-2xl font-bold text-white">
                R$ {totalExits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-white/20 p-2">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-xl shadow-md border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">Dízimos</p>
              <p className="text-2xl font-bold text-white">
                R$ {totalDizimos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-white/20 p-2">
              <FileText className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-500 to-orange-700 p-6 rounded-xl shadow-md border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">Total Ofertas Missionárias</p>
              <p className="text-2xl font-bold text-white">
                R$ {totalOfertasMissionarias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-white/20 p-2">
              <History className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-cyan-700 p-6 rounded-xl shadow-md border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">Total Ofertas</p>
              <p className="text-2xl font-bold text-white">
                R$ {totalOfertas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-white/20 p-2">
              <Wallet className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-6 rounded-xl shadow-md border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">Saldo Positivo</p>
              <p className="text-2xl font-bold text-white">
                R$ {saldoPositivo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg bg-white/20 p-2">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Relatório Financeiro Mensal */}
      <RelatorioFinanceiroMensal
        onBack={() => {}}
        transactions={filteredTransactions}
        cashCounts={cashCounts}
        canPrint={reportGenerated}
      />

      {/* Charts and Analysis */}
      <div className="grid grid-cols-1 gap-6">
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
          <>
          <div className="space-y-3 p-4 md:hidden">
            {fichasDiarias.map((f) => {
              const saldoFinal = Number(f.saldo_final) || 0;
              return (
                <div key={`mobile-ficha-${f.id}`} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(f.data_ficha + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-gray-600">Saldo inicial: <span className="font-medium">R$ {Number(f.saldo_inicial).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                    <p className="text-green-600">Entradas: <span className="font-semibold">R$ {Number(f.total_entradas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                    <p className="text-red-600">Saídas: <span className="font-semibold">R$ {Number(f.total_saidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                    <p className={`${saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Saldo final: <span className="font-bold">R$ {saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                  </div>
                  <span className={`mt-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    f.status === 'fechada' ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {f.status}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
          </>
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
          <>
          <div className="space-y-3 p-4 md:hidden">
            {fechamentos.map((f) => {
              const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
              const saldoFinal = Number(f.saldo_final_mes) || 0;
              return (
                <div key={`mobile-fechamento-${f.id}`} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-sm font-semibold text-gray-900">{meses[f.mes - 1]} / {f.ano}</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-green-600">Entradas: <span className="font-semibold">R$ {Number(f.total_receitas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                    <p className="text-red-600">Saídas: <span className="font-semibold">R$ {Number(f.total_despesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                    <p className={`${saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Saldo final: <span className="font-bold">R$ {saldoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                    <p className="text-gray-600">Responsável: {f.responsavel_atual || '—'}</p>
                    <p className="text-gray-500">Fechado em: {f.fechado_em ? new Date(f.fechado_em).toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <span className="mt-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    {f.status}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
          </>
        )}
      </div>

    </div>
    </ManagementShell>
  );
};

export default Relatorios;
