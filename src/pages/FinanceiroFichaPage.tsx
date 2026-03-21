/**
 * FinanceiroFichaPage.tsx
 * ========================
 * O que faz: Página da Ficha Diária Mensal.
 *            Exibe os registros diários agrupados por mês, com totais consolidados.
 *            Permite ao financeiro registrar informações da ficha mensal da igreja:
 *            código PDA, tipo de unidade, cofre, sustentabilidade.
 *
 * Quem acessa: Usuários com role "financeiro"
 * Layout: ManagementShell do sistema principal
 *
 * Adaptado do financeiro-novo/src/pages/FichaDiaria.tsx.
 * Removido: import Layout, import AuthContext, componentes RegistrarEntradaModal/RegistroDiarioCard
 *           que eram do pacote próprio — substituídos pela versão local.
 * Mantido: toda a lógica de carregamento dos registros e cálculo de totais.
 */

import React, { useState, useEffect } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { FileText, Download, Mail, PlusCircle, Save } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import RegistroDiarioCard from '@/components/financeiro/RegistroDiarioCard';
import { toast } from '@/components/ui/use-toast';

// =============================================================================
// TIPOS LOCAIS
// =============================================================================

/** Informações gerais da ficha mensal da igreja */
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

/** Registro de entradas de um dia específico */
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
  detalhes?: {
    dizimos: { total: number; dinheiro: number; pix: number; cartao: number };
    ofertas: { total: number; dinheiro: number; pix: number; cartao: number };
    ofertasMissionarias: { total: number; dinheiro: number; pix: number; cartao: number };
  };
}

// Nomes dos meses em português
const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Retorna a data atual no formato YYYY-MM-DD no fuso local.
 */
function getCurrentDateBrazil(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function FinanceiroFichaPage() {
  const { transactions } = useFinance();
  const currentDate = new Date();

  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [registrosDiarios, setRegistrosDiarios] = useState<RegistroDiario[]>([]);
  const [transferenciaMesAnterior, setTransferenciaMesAnterior] = useState(0);

  // Estado da ficha mensal da igreja
  const [monthlySheet, setMonthlySheet] = useState<MonthlySheet>({
    pdaCode: '',
    unitType: 'local',
    month: currentDate.getMonth(),
    year: currentDate.getFullYear(),
    hasSafeBox: null,
    selfSustaining: null,
    reasonIfNot: '',
    closingDate: getCurrentDateBrazil()
  });

  /**
   * Carrega os registros diários do localStorage.
   * Consolida as entradas da contagem do dia agrupadas por data.
   */
  useEffect(() => {
    const savedRegistros = localStorage.getItem('registrosDiarios');
    const entradasSalvas = localStorage.getItem('entradasSalvas');

    let registros: RegistroDiario[] = [];

    if (savedRegistros) {
      try {
        registros = JSON.parse(savedRegistros);
      } catch {
        registros = [];
      }
    }

    // Processa entradas da contagem do dia (dízimos/ofertas/missionárias)
    if (entradasSalvas) {
      try {
        const entradas = JSON.parse(entradasSalvas);

        // Agrupa as entradas por data para criar um card por dia
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

          // Soma os valores pelo tipo de entrada
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

          // Coleta os responsáveis de todas as entradas do dia
          if (entrada.responsible1) acc[data].responsaveis.add(entrada.responsible1);
          if (entrada.responsible2) acc[data].responsaveis.add(entrada.responsible2);
          if (entrada.responsible3) acc[data].responsaveis.add(entrada.responsible3);

          return acc;
        }, {});

        // Cria um registro consolidado por data
        const registrosFromContagem = Object.entries(entradasPorData).map(([data, totais]: [string, any]) => {
          const totalGeral = totais.dizimos.total + totais.ofertas.total + totais.ofertasMissionarias.total;
          const responsaveisArray = Array.from(totais.responsaveis);

          const totalTransferencias = entradas
            .filter((entrada: any) => entrada.date === data)
            .reduce((sum: number, entrada: any) => sum + (entrada.transfer || 0), 0);

          return {
            id: `contagem-consolidado-${data}`,
            date: data,
            cashAmount: totalGeral,
            responsible1: responsaveisArray[0] as string || '',
            responsible2: responsaveisArray[1] as string || '',
            responsible3: responsaveisArray[2] as string || '',
            transfer: totalTransferencias,
            missionaryOffering: totais.ofertasMissionarias.total,
            missionaryResponsible: '',
            detalhes: {
              dizimos: totais.dizimos,
              ofertas: totais.ofertas,
              ofertasMissionarias: totais.ofertasMissionarias
            }
          };
        });

        // Combina e remove duplicatas por data (prioriza registros manuais)
        const todosRegistros = [...registros, ...registrosFromContagem];
        const registrosUnicos = todosRegistros.filter((registro, index, self) =>
          index === self.findIndex((r) => r.date === registro.date)
        );

        setRegistrosDiarios(registrosUnicos);
      } catch {
        setRegistrosDiarios(registros);
      }
    } else {
      setRegistrosDiarios(registros);
    }
  }, []);

  // Carrega a transferência do mês anterior salva
  useEffect(() => {
    const savedTransferencia = localStorage.getItem('transferenciaMesAnterior');
    if (savedTransferencia) {
      setTransferenciaMesAnterior(parseFloat(savedTransferencia) || 0);
    }
  }, []);

  // Calcula os totais consolidados dos registros
  const totals = {
    totalCash: registrosDiarios.reduce((sum, r) => sum + r.cashAmount, 0),
    totalTransfer: registrosDiarios.reduce((sum, r) => sum + (r.transfer || 0), 0),
    totalMissionary: registrosDiarios.reduce((sum, r) => sum + (r.missionaryOffering || 0), 0),
    transferenciaMesAnterior
  };

  // Total geral = entradas + transferências - missionárias + transferência do mês anterior
  const grandTotal = totals.totalCash + totals.totalTransfer - totals.totalMissionary + totals.transferenciaMesAnterior;

  /** Remove um registro diário pelo ID */
  const handleDeleteRegistro = (id: string) => {
    const novosRegistros = registrosDiarios.filter(r => r.id !== id);
    setRegistrosDiarios(novosRegistros);
    // Só salva registros manuais (não os consolidados da contagem)
    const registrosManuais = novosRegistros.filter(r => !r.id.startsWith('contagem-'));
    localStorage.setItem('registrosDiarios', JSON.stringify(registrosManuais));
  };

  /** Simula exportação de PDF (funcionalidade futura) */
  const handleExportPDF = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'A exportação de PDF está em desenvolvimento.'
    });
  };

  /** Simula envio por email (funcionalidade futura) */
  const handleSendEmail = () => {
    toast({
      title: 'Em desenvolvimento',
      description: 'O envio por email está em desenvolvimento.'
    });
  };

  /** Salva a transferência do mês anterior no localStorage */
  const handleSaveTransferencia = () => {
    localStorage.setItem('transferenciaMesAnterior', transferenciaMesAnterior.toString());
    toast({
      title: 'Transferência salva',
      description: 'Transferência do mês anterior salva com sucesso!'
    });
  };

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Cabeçalho com seletor de mês e botões */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <FileText className="w-6 h-6 mr-2 text-[#1A237E]" />
              Ficha Diária — {monthNames[selectedMonth]} {selectedYear}
            </h1>
            <p className="text-gray-600">Controle de entradas financeiras mensais</p>
          </div>

          <div className="flex space-x-3 mt-4 sm:mt-0">
            {/* Seletor de mês */}
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
              onClick={handleExportPDF}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              PDF
            </button>

            <button
              onClick={handleSendEmail}
              className="flex items-center px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] transition-colors"
            >
              <Mail className="w-4 h-4 mr-2" />
              Enviar
            </button>
          </div>
        </div>

        {/* Informações gerais da ficha */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações Gerais</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código PDA
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
                Tipo de Unidade
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

        {/* Transferência do mês anterior */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Transferência do Mês Anterior</h2>
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor da Transferência Recebida
              </label>
              <input
                type="number"
                step="0.01"
                value={transferenciaMesAnterior}
                onChange={(e) => setTransferenciaMesAnterior(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
                placeholder="0,00"
              />
            </div>
            <button
              onClick={handleSaveTransferencia}
              className="flex items-center px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              Salvar
            </button>
          </div>
        </div>

        {/* Registros diários do mês */}
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
              <p className="text-sm mt-1">Faça a contagem do dia na página "Contagem do Dia".</p>
            </div>
          )}
        </div>

        {/* Cards de totais consolidados */}
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
            <h3 className="text-sm font-medium text-gray-600">Total Geral Consolidado</h3>
            <p className="text-2xl font-bold text-[#1A237E]">
              R$ {grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Parte Financeira — perguntas obrigatórias da ficha */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Parte Financeira</h2>
          <div className="space-y-4">
            {/* Pergunta sobre o cofre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                A livraria dessa igreja possui cofre modelo boca de lobo?
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="hasSafeBox"
                    value="true"
                    checked={monthlySheet.hasSafeBox === true}
                    onChange={() => setMonthlySheet(prev => ({ ...prev, hasSafeBox: true }))}
                    className="mr-2"
                  />
                  Sim
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="hasSafeBox"
                    value="false"
                    checked={monthlySheet.hasSafeBox === false}
                    onChange={() => setMonthlySheet(prev => ({ ...prev, hasSafeBox: false }))}
                    className="mr-2"
                  />
                  Não
                </label>
              </div>
            </div>

            {/* Pergunta sobre sustentabilidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                A igreja consegue se manter financeiramente com as ofertas?
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="selfSustaining"
                    value="sim"
                    checked={monthlySheet.selfSustaining === 'sim'}
                    onChange={() => setMonthlySheet(prev => ({ ...prev, selfSustaining: 'sim' }))}
                    className="mr-2"
                  />
                  Sim
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="selfSustaining"
                    value="nao"
                    checked={monthlySheet.selfSustaining === 'nao'}
                    onChange={() => setMonthlySheet(prev => ({ ...prev, selfSustaining: 'nao' }))}
                    className="mr-2"
                  />
                  Não
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="selfSustaining"
                    value="as-vezes"
                    checked={monthlySheet.selfSustaining === 'as-vezes'}
                    onChange={() => setMonthlySheet(prev => ({ ...prev, selfSustaining: 'as-vezes' }))}
                    className="mr-2"
                  />
                  Às vezes
                </label>
              </div>
            </div>

            {/* Campo de motivo — aparece apenas se respondeu "não" */}
            {monthlySheet.selfSustaining === 'nao' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Se não, qual o motivo?
                </label>
                <textarea
                  value={monthlySheet.reasonIfNot}
                  onChange={(e) => setMonthlySheet(prev => ({ ...prev, reasonIfNot: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
                  rows={3}
                  placeholder="Descreva o motivo..."
                />
              </div>
            )}
          </div>
        </div>

        {/* Botão de salvar a ficha */}
        <div className="flex justify-end space-x-3 pb-6">
          <button
            onClick={() => {
              localStorage.setItem('monthlySheet', JSON.stringify(monthlySheet));
              toast({
                title: 'Ficha salva',
                description: 'A ficha foi salva com sucesso.'
              });
            }}
            className="flex items-center px-6 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            Salvar Ficha
          </button>
        </div>
      </div>
    </ManagementShell>
  );
}
