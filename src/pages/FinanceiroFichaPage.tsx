import React, { useState, useEffect, useMemo } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { FileText, Save, PlusCircle, ArrowRight } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import RegistroDiarioCard from '@/components/FichaDiaria/RegistroDiarioCard';
import RegistrarEntradaModal from '@/components/FichaDiaria/RegistrarEntradaModal';
import { getCurrentDateBrazil } from '@/lib/dateUtils';
import { toast } from '@/components/ui/use-toast';
import { apiSaveFichasMes } from '@/lib/financeiroApi';
import { useUser } from '@/context/UserContext';

interface MonthlySheet {
  pdaCode: string;
  unitType: 'estadual' | 'setorial' | 'central' | 'regional' | 'local';
  month: number;
  year: number;
  hasSafeBox: boolean | null;
  selfSustaining: 'sim' | 'nao' | 'as-vezes' | null;
  reasonIfNot: string;
  closingDate: string;
}

interface RegistroDiario {
  id: string;
  date: string;
  cashAmount: number;
  responsible1?: string;
  responsible2?: string;
  responsible3?: string;
  transfer?: number;
  missionaryOffering?: number;
  missionaryResponsible?: string;
}

const FichaDiaria: React.FC = () => {
  const { transactions } = useFinance();
  const { usuario, session } = useUser();
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [showRegistrarEntradaModal, setShowRegistrarEntradaModal] = useState(false);
  const [registrosDiarios, setRegistrosDiarios] = useState<RegistroDiario[]>([]);
  const [transferenciaMesAnterior, setTransferenciaMesAnterior] = useState(0);
  // Comentario: valor a ser enviado para o próximo mês como transferência
  const [transferenciaProximoMes, setTransferenciaProximoMes] = useState(0);
  const [isSavingFicha, setIsSavingFicha] = useState(false);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  // Comentario: valor que será enviado para o próximo mês (lançado manualmente)
  
  const [monthlySheet, setMonthlySheet] = useState<MonthlySheet>({
    pdaCode: '',
    unitType: 'local',
    month: selectedMonth,
    year: selectedYear,
    hasSafeBox: null,
    selfSustaining: null,
    reasonIfNot: '',
    closingDate: getCurrentDateBrazil()
  });

  // Carregar registros diários e entradas salvas da contagem do dia
  useEffect(() => {
    const savedRegistros = localStorage.getItem('registrosDiarios');
    const entradasSalvas = localStorage.getItem('entradasSalvas');
    
    let registros: RegistroDiario[] = [];
    
    if (savedRegistros) {
      registros = JSON.parse(savedRegistros);
    }
    
    // Carregar entradas da contagem do dia e criar um card consolidado por dia
    if (entradasSalvas) {
      const entradas = JSON.parse(entradasSalvas);
      
      // Agrupar entradas por data
      const entradasPorData = entradas.reduce((acc: any, entrada: any) => {
        const data = entrada.date;
        if (!acc[data]) {
          acc[data] = {
            dizimos: { total: 0, dinheiro: 0, pix: 0, cartao: 0 },
            ofertas: { total: 0, dinheiro: 0, pix: 0, cartao: 0 },
            ofertasMissionarias: { total: 0, dinheiro: 0, pix: 0, cartao: 0 },
            responsaveis: new Set()
          };
        }
        
        if (entrada.type === 'dizimos') {
          acc[data].dizimos.total += entrada.total;
          acc[data].dizimos.dinheiro += entrada.dinheiro || 0;
          acc[data].dizimos.pix += entrada.pix || 0;
          acc[data].dizimos.cartao += entrada.cartao || 0;
        } else if (entrada.type === 'ofertas') {
          acc[data].ofertas.total += entrada.total;
          acc[data].ofertas.dinheiro += entrada.dinheiro || 0;
          acc[data].ofertas.pix += entrada.pix || 0;
          acc[data].ofertas.cartao += entrada.cartao || 0;
        } else if (entrada.type === 'ofertas-missionarias') {
          acc[data].ofertasMissionarias.total += entrada.total;
          acc[data].ofertasMissionarias.dinheiro += entrada.dinheiro || 0;
          acc[data].ofertasMissionarias.pix += entrada.pix || 0;
          acc[data].ofertasMissionarias.cartao += entrada.cartao || 0;
        }
        
        if (entrada.responsible1) acc[data].responsaveis.add(entrada.responsible1);
        if (entrada.responsible2) acc[data].responsaveis.add(entrada.responsible2);
        if (entrada.responsible3) acc[data].responsaveis.add(entrada.responsible3);
        
        return acc;
      }, {});
      
      // Criar registros consolidados por data
      const registrosFromContagem = Object.entries(entradasPorData).map(([data, totais]: [string, any]) => {
        const totalGeral = totais.dizimos.total + totais.ofertas.total + totais.ofertasMissionarias.total;
        const responsaveisArray = Array.from(totais.responsaveis);
        
        // Calcular total de transferências das entradas do dia
        const totalTransferencias = entradas
          .filter((entrada: any) => entrada.date === data)
          .reduce((sum: number, entrada: any) => sum + (entrada.transfer || 0), 0);
        
        return {
          id: `contagem-consolidado-${data}`,
          date: data,
          cashAmount: totalGeral,
          responsible1: responsaveisArray[0] || '',
          responsible2: responsaveisArray[1] || '',
          responsible3: responsaveisArray[2] || '',
          transfer: totalTransferencias,
          missionaryOffering: totais.ofertasMissionarias.total,
          missionaryResponsible: '',
          // Dados detalhados para exibição
          detalhes: {
            dizimos: totais.dizimos,
            ofertas: totais.ofertas,
            ofertasMissionarias: totais.ofertasMissionarias
          }
        };
      });
      
      // Combinar registros existentes com os da contagem do dia
      const todosRegistros = [...registros, ...registrosFromContagem];
      
      // Remover duplicatas baseado na data
      const registrosUnicos = todosRegistros.filter((registro, index, self) => 
        index === self.findIndex((r) => r.date === registro.date)
      );
      
      setRegistrosDiarios(registrosUnicos);
    } else {
      setRegistrosDiarios(registros);
    }
  }, []);

  // Carregar transferência do mês anterior salva
  useEffect(() => {
    const savedTransferencia = localStorage.getItem('transferenciaMesAnterior');
    if (savedTransferencia) {
      setTransferenciaMesAnterior(parseFloat(savedTransferencia));
    }
  }, []);

  // Calcular totais dos registros salvos incluindo transferência
  const totals = {
    totalCash: registrosDiarios.reduce((sum, registro) => sum + registro.cashAmount, 0),
    totalTransfer: registrosDiarios.reduce((sum, registro) => sum + (registro.transfer || 0), 0),
    totalMissionary: registrosDiarios.reduce((sum, registro) => sum + (registro.missionaryOffering || 0), 0),
    transferenciaMesAnterior: transferenciaMesAnterior
  };
  const grandTotal = totals.totalCash + totals.totalTransfer - totals.totalMissionary + totals.transferenciaMesAnterior;

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const registrosDoMes = useMemo(() => {
    return registrosDiarios.filter((registro) => {
      const data = new Date(`${registro.date}T00:00:00`);
      return data.getMonth() === selectedMonth && data.getFullYear() === selectedYear;
    });
  }, [registrosDiarios, selectedMonth, selectedYear]);
  const transacoesDoMes = useMemo(() => {
    return transactions.filter((transacao) => {
      const data = new Date(`${transacao.date}T00:00:00`);
      return data.getMonth() === selectedMonth && data.getFullYear() === selectedYear;
    });
  }, [transactions, selectedMonth, selectedYear]);

  const handleRegistrarEntrada = (data: any) => {
    const novoRegistro: RegistroDiario = {
      id: Date.now().toString(),
      date: getCurrentDateBrazil(),
      cashAmount: data.cashAmount,
      responsible1: data.responsible1,
      responsible2: data.responsible2,
      responsible3: data.responsible3,
      transfer: data.transfer,
      missionaryOffering: data.missionaryOffering,
      missionaryResponsible: data.missionaryResponsible
    };

    const novosRegistros = [...registrosDiarios, novoRegistro];
    setRegistrosDiarios(novosRegistros);
    localStorage.setItem('registrosDiarios', JSON.stringify(novosRegistros));
  };

  const handleDeleteRegistro = (id: string) => {
    const novosRegistros = registrosDiarios.filter(registro => registro.id !== id);
    setRegistrosDiarios(novosRegistros);
    localStorage.setItem('registrosDiarios', JSON.stringify(novosRegistros));
  };

  const handleGerarDocumento = async () => {
    setIsGeneratingDoc(true);
    try {
      const entradasSalvasRaw = localStorage.getItem('entradasSalvas');
      const entradasSalvas = entradasSalvasRaw ? JSON.parse(entradasSalvasRaw) : [];
      const entradasSalvasDoMes = Array.isArray(entradasSalvas)
        ? entradasSalvas.filter((entrada: any) => {
            const data = new Date(`${String(entrada.date || '')}T00:00:00`);
            return data.getMonth() === selectedMonth && data.getFullYear() === selectedYear;
          })
        : [];
      const totaisDocumento = {
        totalEntradasDinheiro: registrosDoMes.reduce((sum, registro) => sum + Number(registro.cashAmount || 0), 0),
        totalTransferencias: registrosDoMes.reduce((sum, registro) => sum + Number(registro.transfer || 0), 0),
        totalOfertasMissionarias: registrosDoMes.reduce((sum, registro) => sum + Number(registro.missionaryOffering || 0), 0),
        transferenciaMesAnterior: Number(transferenciaMesAnterior || 0),
      };
      const payload = {
        origem: 'ipda-letter-creator',
        tipo_documento: 'ficha-financeira-mensal',
        gerado_em: new Date().toISOString(),
        referencia: {
          mes: selectedMonth + 1,
          ano: selectedYear,
          mes_nome: monthNames[selectedMonth],
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
        ficha_mensal: {
          ...monthlySheet,
          month: selectedMonth + 1,
          year: selectedYear,
          transferencia_mes_anterior: Number(transferenciaMesAnterior || 0),
          transferencia_proximo_mes: Number(transferenciaProximoMes || 0),
        },
        totais: {
          ...totaisDocumento,
          totalGeral: totaisDocumento.totalEntradasDinheiro
            + totaisDocumento.totalTransferencias
            - totaisDocumento.totalOfertasMissionarias
            + totaisDocumento.transferenciaMesAnterior,
        },
        movimentos: {
          registros_diarios: registrosDoMes,
          transacoes_financeiras: transacoesDoMes,
          entradas_contagem: entradasSalvasDoMes,
        },
      };
      const response = await fetch('https://n8n-n8n.ynlng8.easypanel.host/webhook/financeiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Webhook retornou ${response.status}`);
      }
      toast({
        title: 'Documento enviado',
        description: `Movimentos de ${monthNames[selectedMonth]}/${selectedYear} enviados com sucesso.`,
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

  // Comentario: salva a ficha completa no banco (todas as entradas do mês + transferências)
  const handleSalvarFicha = async () => {
    setIsSavingFicha(true);
    try {
      // Comentario: monta a lista de entradas por dia a partir dos registros em tela
      const entradas = registrosDiarios.map((r) => ({
        data_ficha: r.date,
        total_entradas: r.cashAmount,
      }));

      await apiSaveFichasMes({
        mes: selectedMonth + 1, // selectedMonth é 0-11
        ano: selectedYear,
        entradas,
        transferencia_recebida: transferenciaMesAnterior,
        transferencia_enviada: transferenciaProximoMes,
      });

      // Comentario: mantém a última transferência para o próximo mês disponível
      // para outras telas (ex.: Relatórios > Resumo Financeiro).
      localStorage.setItem('transferenciaProximoMes', String(transferenciaProximoMes || 0));

      // Comentario: salva a transferência enviada no localStorage para o mês seguinte usar como "mês anterior"
      if (transferenciaProximoMes > 0) {
        localStorage.setItem('transferenciaMesAnterior', transferenciaProximoMes.toString());
      }

      // Comentario: salva as informações gerais da ficha no localStorage
      localStorage.setItem('monthlySheet', JSON.stringify(monthlySheet));

      toast({
        title: 'Ficha salva',
        description: `Ficha de ${monthNames[selectedMonth]}/${selectedYear} salva no banco com sucesso.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setIsSavingFicha(false);
    }
  };

  return (
    <ManagementShell roleMode="financeiro">
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <FileText className="w-6 h-6 mr-2 text-[#1A237E]" />
            Ficha Diária - {monthNames[selectedMonth]} {selectedYear}
          </h1>
          <p className="text-gray-600">Controle de entradas financeiras mensais</p>
        </div>
        
        <div className="flex space-x-3 mt-4 sm:mt-0">
          <select
            value={`${selectedMonth}-${selectedYear}`}
            onChange={(e) => {
              const [month, year] = e.target.value.split('-').map(Number);
              setSelectedMonth(month);
              setSelectedYear(year);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={`${i}-${selectedYear}`}>
                {monthNames[i]} {selectedYear}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowRegistrarEntradaModal(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Registrar Entrada
          </button>
          <button
            onClick={handleGerarDocumento}
            disabled={isGeneratingDoc}
            className="flex items-center px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] disabled:opacity-50 transition-colors"
          >
            <FileText className="w-4 h-4 mr-2" />
            {isGeneratingDoc ? 'Gerando...' : 'Gerar documento'}
          </button>
        </div>
      </div>

      {/* ── Transferência para o Próximo Mês ───────────────────────────────── */}
      <div className="bg-orange-50 rounded-lg shadow-sm border border-orange-200 p-6">
        <h2 className="text-lg font-semibold text-orange-800 mb-1 flex items-center">
          <ArrowRight className="w-5 h-5 mr-2" />
          Transferência para o Próximo Mês
        </h2>
        <p className="text-sm text-orange-600 mb-4">
          Informe o valor que será transferido para o próximo mês. Ele será salvo automaticamente como "Transferência Recebida" no mês seguinte.
        </p>
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-orange-700 mb-1">
              Valor a Transferir (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={transferenciaProximoMes || ''}
              onChange={(e) => setTransferenciaProximoMes(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none"
              placeholder="0,00"
            />
          </div>
          <div className="bg-white border border-orange-200 rounded-lg px-4 py-3 text-center min-w-[140px]">
            <p className="text-xs text-gray-500">Saldo após transferência</p>
            <p className="text-lg font-bold text-orange-700">
              R$ {(grandTotal - transferenciaProximoMes).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Campos Fixos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações Gerais</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código Totvs
            </label>
            <input
              type="text"
              value={monthlySheet.pdaCode}
              onChange={(e) => setMonthlySheet(prev => ({ ...prev, pdaCode: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="Ex: 1930"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Classificação
            </label>
            <select
              value={monthlySheet.unitType}
              onChange={(e) => setMonthlySheet(prev => ({ ...prev, unitType: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            >
              <option value="estadual">Estadual</option>
              <option value="setorial">Setorial</option>
              <option value="central">Central</option>
              <option value="regional">Regional</option>
              <option value="local">Local</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de Fechamento
            </label>
            <input
              type="date"
              value={monthlySheet.closingDate}
              onChange={(e) => setMonthlySheet(prev => ({ ...prev, closingDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Transferência do Mês Anterior ──────────────────────────────────── */}
      <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-6">
        <h2 className="text-lg font-semibold text-blue-800 mb-1">Transferência do Mês Anterior</h2>
        <p className="text-sm text-blue-600 mb-4">
          Valor recebido como transferência do mês anterior. Preenchido automaticamente — edite se necessário.
        </p>
        <div className="flex-1">
          <label className="block text-sm font-medium text-blue-700 mb-1">
            Valor da Transferência Recebida (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={transferenciaMesAnterior || ''}
            onChange={(e) => setTransferenciaMesAnterior(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
            placeholder="0,00"
          />
        </div>
      </div>

      {/* Registros Diários */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Entradas do Dia</h2>
        {registrosDiarios.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {registrosDiarios.map((registro) => (
              <RegistroDiarioCard
                key={registro.id}
                registro={registro}
                onDelete={handleDeleteRegistro}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>Nenhuma entrada registrada ainda.</p>
            <p className="text-sm mt-1">Use o botão "Registrar Entrada" para adicionar entradas.</p>
          </div>
        )}
      </div>

      {/* Resumo de Totais */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Total Entradas Dinheiro</h3>
          <p className="text-2xl font-bold text-green-600">
            R$ {totals.totalCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Total Transferências</h3>
          <p className="text-2xl font-bold text-blue-600">
            R$ {totals.totalTransfer.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Total Ofertas Missionárias</h3>
          <p className="text-2xl font-bold text-purple-600">
            R$ {totals.totalMissionary.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Transferência Mês Anterior</h3>
          <p className="text-2xl font-bold text-orange-600">
            R$ {totals.transferenciaMesAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Total Geral</h3>
          <p className="text-2xl font-bold text-[#1A237E]">
            R$ {grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Botoes de Acao */}
      <div className="flex justify-end space-x-3 pb-6">
        <button
          onClick={handleSalvarFicha}
          disabled={isSavingFicha}
          className="flex items-center px-6 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSavingFicha ? 'Salvando...' : 'Salvar Ficha'}
        </button>
      </div>

      {/* Modal de Registrar Entrada */}
      <RegistrarEntradaModal
        isOpen={showRegistrarEntradaModal}
        onClose={() => setShowRegistrarEntradaModal(false)}
        onSave={handleRegistrarEntrada}
      />
    </div>
    </ManagementShell>
  );
};

export default FichaDiaria;
