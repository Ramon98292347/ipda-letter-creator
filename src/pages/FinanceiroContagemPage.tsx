/**
 * FinanceiroContagemPage.tsx
 * ==========================
 * O que faz: Página de contagem do dia.
 *            O usuário conta as notas e moedas do caixa por tipo:
 *            dízimos, ofertas ou ofertas missionárias.
 *            Cada tipo tem separação por forma de pagamento (dinheiro, PIX, cartão).
 *
 * Quem acessa: Usuários com role "financeiro"
 * Layout: ManagementShell do sistema principal
 *
 * Adaptado do financeiro-novo/src/pages/ContagemDia.tsx.
 * Removido: import do Layout próprio, import do AuthContext.
 * Mantido: toda a lógica de contagem, abas, modal da ficha diária.
 */

import React, { useState, useEffect } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Calculator, Save, RefreshCw, Plus, CreditCard, Smartphone, Banknote } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import EntradaSalvaCard from '@/components/financeiro/EntradaSalvaCard';
import FichaDiariaModal from '@/components/financeiro/FichaDiariaModal';

// =============================================================================
// TIPOS LOCAIS
// =============================================================================

interface CashDenomination {
  value: number;
  type: 'nota' | 'moeda';
  label: string;
  color: string;
}

/** Representa uma entrada de contagem já salva */
interface EntradaSalva {
  id: string;
  date: string;
  total: number;
  responsible1?: string;
  responsible2?: string;
  responsible3?: string;
  type?: 'dizimos' | 'ofertas' | 'ofertas-missionarias';
  paymentMethod?: 'dinheiro' | 'pix' | 'cartao';
  dinheiro?: number;
  pix?: number;
  cartao?: number;
  transfer?: number;
  missionaryOffering?: number;
  missionaryResponsible?: string;
}

/** Valores por forma de pagamento para uma aba */
interface PaymentData {
  dinheiro: number;
  pix: number;
  cartao: number;
}

// =============================================================================
// UTILITÁRIOS
// =============================================================================

/**
 * Retorna a data atual no formato YYYY-MM-DD no fuso local.
 * Evita o bug de timezone do toISOString().
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

export default function FinanceiroContagemPage() {
  const { saveCashCount } = useFinance();

  // Lista de denominações do Real Brasileiro (notas + moedas)
  const denominations: CashDenomination[] = [
    { value: 200, type: 'nota', label: 'R$ 200,00', color: 'bg-yellow-100 border-yellow-300' },
    { value: 100, type: 'nota', label: 'R$ 100,00', color: 'bg-blue-100 border-blue-300' },
    { value: 50, type: 'nota', label: 'R$ 50,00', color: 'bg-orange-100 border-orange-300' },
    { value: 20, type: 'nota', label: 'R$ 20,00', color: 'bg-yellow-100 border-yellow-300' },
    { value: 10, type: 'nota', label: 'R$ 10,00', color: 'bg-red-100 border-red-300' },
    { value: 5, type: 'nota', label: 'R$ 5,00', color: 'bg-purple-100 border-purple-300' },
    { value: 2, type: 'nota', label: 'R$ 2,00', color: 'bg-green-100 border-green-300' },
    { value: 1, type: 'moeda', label: 'R$ 1,00', color: 'bg-gray-100 border-gray-300' },
    { value: 0.50, type: 'moeda', label: 'R$ 0,50', color: 'bg-gray-100 border-gray-300' },
    { value: 0.25, type: 'moeda', label: 'R$ 0,25', color: 'bg-gray-100 border-gray-300' },
    { value: 0.10, type: 'moeda', label: 'R$ 0,10', color: 'bg-gray-100 border-gray-300' },
    { value: 0.05, type: 'moeda', label: 'R$ 0,05', color: 'bg-gray-100 border-gray-300' },
    { value: 0.01, type: 'moeda', label: 'R$ 0,01', color: 'bg-gray-100 border-gray-300' },
  ];

  // Aba ativa: dízimos, ofertas ou ofertas missionárias
  const [activeTab, setActiveTab] = useState<'dizimos' | 'ofertas' | 'ofertas-missionarias'>('dizimos');

  // Quantidades e totais para cada aba (separados para não misturar)
  const [dizimosQuantities, setDizimosQuantities] = useState<{ [key: number]: number }>({});
  const [dizimosTotals, setDizimosTotals] = useState<{ [key: number]: number }>({});
  const [dizimosGrandTotal, setDizimosGrandTotal] = useState(0);
  const [dizimosPayment, setDizimosPayment] = useState<PaymentData>({ dinheiro: 0, pix: 0, cartao: 0 });

  const [ofertasQuantities, setOfertasQuantities] = useState<{ [key: number]: number }>({});
  const [ofertasTotals, setOfertasTotals] = useState<{ [key: number]: number }>({});
  const [ofertasGrandTotal, setOfertasGrandTotal] = useState(0);
  const [ofertasPayment, setOfertasPayment] = useState<PaymentData>({ dinheiro: 0, pix: 0, cartao: 0 });

  const [ofertasMissionariasQuantities, setOfertasMissionariasQuantities] = useState<{ [key: number]: number }>({});
  const [ofertasMissionariasTotals, setOfertasMissionariasTotals] = useState<{ [key: number]: number }>({});
  const [ofertasMissionariasGrandTotal, setOfertasMissionariasGrandTotal] = useState(0);
  const [ofertasMissionariasPayment, setOfertasMissionariasPayment] = useState<PaymentData>({ dinheiro: 0, pix: 0, cartao: 0 });

  // Estados de controle geral
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [entradasSalvas, setEntradasSalvas] = useState<EntradaSalva[]>([]);
  const [showFichaDiariaModal, setShowFichaDiariaModal] = useState(false);

  // Carrega entradas salvas do localStorage ao montar
  useEffect(() => {
    const saved = localStorage.getItem('entradasSalvas');
    if (saved) {
      try {
        setEntradasSalvas(JSON.parse(saved));
      } catch {
        setEntradasSalvas([]);
      }
    }
  }, []);

  // Recalcula totais dos DÍZIMOS quando as quantidades ou pagamentos mudam
  useEffect(() => {
    const newTotals: { [key: number]: number } = {};
    let newGrandTotal = 0;

    denominations.forEach(denom => {
      const quantity = dizimosQuantities[denom.value] || 0;
      const total = quantity * denom.value;
      newTotals[denom.value] = total;
      newGrandTotal += total;
    });

    setDizimosTotals(newTotals);
    const totalDinheiro = newGrandTotal + dizimosPayment.pix + dizimosPayment.cartao;
    setDizimosGrandTotal(totalDinheiro);
    setDizimosPayment(prev => ({ ...prev, dinheiro: newGrandTotal }));
  }, [dizimosQuantities, dizimosPayment.pix, dizimosPayment.cartao]);

  // Recalcula totais das OFERTAS quando as quantidades ou pagamentos mudam
  useEffect(() => {
    const newTotals: { [key: number]: number } = {};
    let newGrandTotal = 0;

    denominations.forEach(denom => {
      const quantity = ofertasQuantities[denom.value] || 0;
      const total = quantity * denom.value;
      newTotals[denom.value] = total;
      newGrandTotal += total;
    });

    setOfertasTotals(newTotals);
    const totalDinheiro = newGrandTotal + ofertasPayment.pix + ofertasPayment.cartao;
    setOfertasGrandTotal(totalDinheiro);
    setOfertasPayment(prev => ({ ...prev, dinheiro: newGrandTotal }));
  }, [ofertasQuantities, ofertasPayment.pix, ofertasPayment.cartao]);

  // Recalcula totais das OFERTAS MISSIONÁRIAS quando as quantidades ou pagamentos mudam
  useEffect(() => {
    const newTotals: { [key: number]: number } = {};
    let newGrandTotal = 0;

    denominations.forEach(denom => {
      const quantity = ofertasMissionariasQuantities[denom.value] || 0;
      const total = quantity * denom.value;
      newTotals[denom.value] = total;
      newGrandTotal += total;
    });

    setOfertasMissionariasTotals(newTotals);
    const totalDinheiro = newGrandTotal + ofertasMissionariasPayment.pix + ofertasMissionariasPayment.cartao;
    setOfertasMissionariasGrandTotal(totalDinheiro);
    setOfertasMissionariasPayment(prev => ({ ...prev, dinheiro: newGrandTotal }));
  }, [ofertasMissionariasQuantities, ofertasMissionariasPayment.pix, ofertasMissionariasPayment.cartao]);

  // =============================================================================
  // HELPERS — retornam os dados da aba ativa
  // =============================================================================

  const getCurrentQuantities = () => {
    return activeTab === 'dizimos' ? dizimosQuantities :
           activeTab === 'ofertas' ? ofertasQuantities : ofertasMissionariasQuantities;
  };

  const getCurrentTotals = () => {
    return activeTab === 'dizimos' ? dizimosTotals :
           activeTab === 'ofertas' ? ofertasTotals : ofertasMissionariasTotals;
  };

  const getCurrentGrandTotal = () => {
    return activeTab === 'dizimos' ? dizimosGrandTotal :
           activeTab === 'ofertas' ? ofertasGrandTotal : ofertasMissionariasGrandTotal;
  };

  const getCurrentPayment = () => {
    return activeTab === 'dizimos' ? dizimosPayment :
           activeTab === 'ofertas' ? ofertasPayment : ofertasMissionariasPayment;
  };

  // =============================================================================
  // HANDLERS
  // =============================================================================

  /** Atualiza a quantidade de uma denominação na aba ativa */
  const handleQuantityChange = (value: number, quantity: string) => {
    const numQuantity = parseInt(quantity) || 0;
    if (numQuantity >= 0) {
      if (activeTab === 'dizimos') {
        setDizimosQuantities(prev => ({ ...prev, [value]: numQuantity }));
      } else if (activeTab === 'ofertas') {
        setOfertasQuantities(prev => ({ ...prev, [value]: numQuantity }));
      } else {
        setOfertasMissionariasQuantities(prev => ({ ...prev, [value]: numQuantity }));
      }
    }
  };

  /** Atualiza o valor de uma forma de pagamento (PIX ou cartão) na aba ativa */
  const handlePaymentChange = (type: keyof PaymentData, value: string) => {
    const numValue = parseFloat(value) || 0;
    if (numValue >= 0) {
      if (activeTab === 'dizimos') {
        setDizimosPayment(prev => ({ ...prev, [type]: numValue }));
      } else if (activeTab === 'ofertas') {
        setOfertasPayment(prev => ({ ...prev, [type]: numValue }));
      } else {
        setOfertasMissionariasPayment(prev => ({ ...prev, [type]: numValue }));
      }
    }
  };

  /** Abre o modal da ficha diária para salvar a contagem */
  const handleSave = () => {
    const currentTotal = getCurrentGrandTotal();
    if (currentTotal === 0) return;
    setShowFichaDiariaModal(true);
  };

  /** Abre o modal quando o usuário clica em "Criar Entrada" */
  const handleCreateEntry = () => {
    const currentTotal = getCurrentGrandTotal();
    if (currentTotal > 0) {
      setShowFichaDiariaModal(true);
    }
  };

  /**
   * Salva a entrada com os dados da ficha diária preenchida no modal.
   * Persiste no localStorage e atualiza a lista de entradas salvas.
   */
  const handleFichaDiariaSave = async (fichaDiariaData: any) => {
    setIsSaving(true);
    try {
      const today = getCurrentDateBrazil();
      const currentQuantities = getCurrentQuantities();
      const currentTotal = getCurrentGrandTotal();
      const currentPayment = getCurrentPayment();

      // Monta o mapa de notas para salvar na contagem de caixa
      const notes: { [key: string]: number } = {};
      denominations.forEach(denom => {
        if (currentQuantities[denom.value] > 0) {
          notes[denom.label] = currentQuantities[denom.value];
        }
      });

      // Salva a contagem no contexto financeiro
      await saveCashCount({
        date: today,
        notes,
        total: currentTotal
      });

      // Cria o registro da entrada salva para exibição no card
      const novaEntrada: EntradaSalva = {
        id: Date.now().toString(),
        date: getCurrentDateBrazil(),
        total: currentTotal,
        responsible1: fichaDiariaData.responsible1,
        responsible2: fichaDiariaData.responsible2,
        responsible3: fichaDiariaData.responsible3,
        type: activeTab,
        paymentMethod: 'dinheiro',
        dinheiro: currentPayment.dinheiro,
        pix: currentPayment.pix,
        cartao: currentPayment.cartao,
        transfer: fichaDiariaData.transfer,
        missionaryOffering: fichaDiariaData.missionaryOffering,
        missionaryResponsible: fichaDiariaData.missionaryResponsible
      };

      // Salva a lista atualizada no localStorage
      const novasEntradas = [...entradasSalvas, novaEntrada];
      setEntradasSalvas(novasEntradas);
      localStorage.setItem('entradasSalvas', JSON.stringify(novasEntradas));

      // Atualiza a ficha mensal no localStorage (para a página FichaDiaria)
      const monthlySheet = JSON.parse(localStorage.getItem('monthlySheet') || '{}');
      if (monthlySheet.dailyEntries) {
        const dayOfMonth = new Date().getDate();
        const updatedEntries = monthlySheet.dailyEntries.map((entry: any) => {
          if (entry.day === dayOfMonth) {
            const updateData: any = {
              ...entry,
              responsible1: fichaDiariaData.responsible1,
              responsible2: fichaDiariaData.responsible2,
              responsible3: fichaDiariaData.responsible3,
              transfer: fichaDiariaData.transfer,
              missionaryOffering: fichaDiariaData.missionaryOffering,
              missionaryResponsible: fichaDiariaData.missionaryResponsible
            };

            // Adiciona os totais por tipo de entrada
            if (activeTab === 'dizimos') {
              updateData.dizimosTotal = currentTotal;
              updateData.dizimosDinheiro = currentPayment.dinheiro;
              updateData.dizimosPix = currentPayment.pix;
              updateData.dizimosCartao = currentPayment.cartao;
            } else if (activeTab === 'ofertas') {
              updateData.ofertasTotal = currentTotal;
              updateData.ofertasDinheiro = currentPayment.dinheiro;
              updateData.ofertasPix = currentPayment.pix;
              updateData.ofertasCartao = currentPayment.cartao;
            } else {
              updateData.ofertasMissionariasTotal = currentTotal;
              updateData.ofertasMissionariasDinheiro = currentPayment.dinheiro;
              updateData.ofertasMissionariasPix = currentPayment.pix;
              updateData.ofertasMissionariasCartao = currentPayment.cartao;
            }

            return updateData;
          }
          return entry;
        });

        localStorage.setItem('monthlySheet', JSON.stringify({
          ...monthlySheet,
          dailyEntries: updatedEntries
        }));
      }

      const tabName = activeTab === 'dizimos' ? 'Dízimos' :
                      activeTab === 'ofertas' ? 'Ofertas' : 'Ofertas Missionárias';
      setSaveMessage(`${tabName} salvos com sucesso!`);
      setTimeout(() => setSaveMessage(''), 3000);

      // Limpa a contagem atual após salvar
      if (activeTab === 'dizimos') {
        setDizimosQuantities({});
        setDizimosPayment({ dinheiro: 0, pix: 0, cartao: 0 });
      } else if (activeTab === 'ofertas') {
        setOfertasQuantities({});
        setOfertasPayment({ dinheiro: 0, pix: 0, cartao: 0 });
      } else {
        setOfertasMissionariasQuantities({});
        setOfertasMissionariasPayment({ dinheiro: 0, pix: 0, cartao: 0 });
      }

    } catch (error) {
      setSaveMessage('Erro ao salvar contagem');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  /** Remove uma entrada salva pelo ID */
  const handleDeleteEntrada = (id: string) => {
    const novasEntradas = entradasSalvas.filter(entrada => entrada.id !== id);
    setEntradasSalvas(novasEntradas);
    localStorage.setItem('entradasSalvas', JSON.stringify(novasEntradas));
  };

  /** Limpa a contagem da aba ativa */
  const handleReset = () => {
    if (activeTab === 'dizimos') {
      setDizimosQuantities({});
      setDizimosPayment({ dinheiro: 0, pix: 0, cartao: 0 });
    } else if (activeTab === 'ofertas') {
      setOfertasQuantities({});
      setOfertasPayment({ dinheiro: 0, pix: 0, cartao: 0 });
    } else {
      setOfertasMissionariasQuantities({});
      setOfertasMissionariasPayment({ dinheiro: 0, pix: 0, cartao: 0 });
    }
    setSaveMessage('');
  };

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        {/* Cabeçalho com botões de ação */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Calculator className="w-6 h-6 mr-2 text-[#1A237E]" />
              Contagem do Dia
            </h1>
            <p className="text-gray-600">Registre dízimos e ofertas por forma de pagamento</p>
          </div>

          <div className="flex space-x-3 mt-4 sm:mt-0">
            <button
              onClick={handleReset}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Limpar
            </button>
            <button
              onClick={handleCreateEntry}
              disabled={getCurrentGrandTotal() === 0}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Entrada
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || getCurrentGrandTotal() === 0}
              className="flex items-center px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        {/* Mensagem de feedback após salvar */}
        {saveMessage && (
          <div className={`p-4 rounded-lg ${
            saveMessage.includes('sucesso') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {saveMessage}
          </div>
        )}

        {/* Lista horizontal de entradas já salvas no dia */}
        {entradasSalvas.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Entradas Salvas</h2>
            <div className="relative">
              <div className="overflow-x-auto">
                <div className="flex space-x-4 pb-4" style={{ minWidth: 'max-content' }}>
                  {entradasSalvas.map((entrada) => (
                    <div key={entrada.id} className="flex-shrink-0 w-72">
                      <EntradaSalvaCard
                        entrada={entrada}
                        onDelete={handleDeleteEntrada}
                        compact={true}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {/* Gradiente para indicar scroll horizontal */}
              <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none"></div>
            </div>
          </div>
        )}

        {/* Navegação por abas: Dízimos / Ofertas / Ofertas Missionárias */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('dizimos')}
              className={`flex-1 px-6 py-4 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === 'dizimos'
                  ? 'border-[#1A237E] text-[#1A237E] bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center">
                <Banknote className="w-5 h-5 mr-2" />
                Dízimos
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ofertas')}
              className={`flex-1 px-6 py-4 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === 'ofertas'
                  ? 'border-[#1A237E] text-[#1A237E] bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center">
                <Banknote className="w-5 h-5 mr-2" />
                Ofertas
              </div>
            </button>
            <button
              onClick={() => setActiveTab('ofertas-missionarias')}
              className={`flex-1 px-6 py-4 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === 'ofertas-missionarias'
                  ? 'border-orange-500 text-orange-600 bg-orange-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center">
                <Banknote className="w-5 h-5 mr-2" />
                Ofertas Missionárias
              </div>
            </button>
          </div>
        </div>

        {/* Formas de pagamento (PIX e Cartão) para a aba ativa */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <CreditCard className="w-5 h-5 mr-2 text-[#1A237E]" />
            Formas de Pagamento — {activeTab === 'dizimos' ? 'Dízimos' :
                                   activeTab === 'ofertas' ? 'Ofertas' : 'Ofertas Missionárias'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PIX / OCTe */}
            <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
              <div className="flex items-center mb-2">
                <Smartphone className="w-5 h-5 mr-2 text-blue-600" />
                <span className="font-medium text-gray-900">PIX/OCT</span>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={getCurrentPayment().pix || ''}
                onChange={(e) => handlePaymentChange('pix', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                placeholder="R$ 0,00"
              />
            </div>

            {/* Cartão */}
            <div className="p-4 rounded-lg border-2 border-purple-200 bg-purple-50">
              <div className="flex items-center mb-2">
                <CreditCard className="w-5 h-5 mr-2 text-purple-600" />
                <span className="font-medium text-gray-900">Cartão</span>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={getCurrentPayment().cartao || ''}
                onChange={(e) => handlePaymentChange('cartao', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                placeholder="R$ 0,00"
              />
            </div>
          </div>
        </div>

        {/* Grade de contagem: Notas e Moedas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Notas */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
              Notas — Dinheiro
            </h2>

            <div className="space-y-4">
              {denominations.filter(d => d.type === 'nota').map((denom) => (
                <div key={denom.value} className={`p-4 rounded-lg border-2 ${denom.color}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{denom.label}</span>
                    <span className="text-sm text-gray-600">
                      Total: R$ {getCurrentTotals()[denom.value]?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label htmlFor={`nota-${denom.value}`} className="text-sm font-medium text-gray-700">
                      Quantidade:
                    </label>
                    <input
                      id={`nota-${denom.value}`}
                      type="number"
                      min="0"
                      value={getCurrentQuantities()[denom.value] || ''}
                      onChange={(e) => handleQuantityChange(denom.value, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                      placeholder="0"
                    />
                    <span className="text-sm text-gray-500">× {denom.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Moedas */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <div className="w-4 h-4 bg-yellow-500 rounded-full mr-2"></div>
              Moedas — Dinheiro
            </h2>

            <div className="space-y-4">
              {denominations.filter(d => d.type === 'moeda').map((denom) => (
                <div key={denom.value} className={`p-4 rounded-lg border-2 ${denom.color}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{denom.label}</span>
                    <span className="text-sm text-gray-600">
                      Total: R$ {getCurrentTotals()[denom.value]?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label htmlFor={`moeda-${denom.value}`} className="text-sm font-medium text-gray-700">
                      Quantidade:
                    </label>
                    <input
                      id={`moeda-${denom.value}`}
                      type="number"
                      min="0"
                      value={getCurrentQuantities()[denom.value] || ''}
                      onChange={(e) => handleQuantityChange(denom.value, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                      placeholder="0"
                    />
                    <span className="text-sm text-gray-500">× {denom.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Resumo do total — fundo azul escuro */}
        <div className="bg-[#1A237E] text-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">
                Total {activeTab === 'dizimos' ? 'Dízimos' :
                       activeTab === 'ofertas' ? 'Ofertas' : 'Ofertas Missionárias'}
              </h3>
              <p className="text-blue-100">Valor total contabilizado hoje</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">
                R$ {getCurrentGrandTotal().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-blue-100 text-sm">
                {new Date().toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>

          {/* Detalhamento por forma de pagamento */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-blue-300">
            <div className="text-center">
              <p className="text-blue-100 text-sm">Dinheiro</p>
              <p className="text-lg font-semibold">
                R$ {getCurrentPayment().dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-blue-100 text-sm">PIX/OCT</p>
              <p className="text-lg font-semibold">
                R$ {getCurrentPayment().pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-blue-100 text-sm">Cartão</p>
              <p className="text-lg font-semibold">
                R$ {getCurrentPayment().cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Modal da Ficha Diária — aparece ao clicar em Salvar ou Criar Entrada */}
        <FichaDiariaModal
          isOpen={showFichaDiariaModal}
          onClose={() => setShowFichaDiariaModal(false)}
          onSave={handleFichaDiariaSave}
          total={getCurrentGrandTotal()}
        />
      </div>
    </ManagementShell>
  );
}
