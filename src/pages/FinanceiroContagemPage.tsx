import React, { useState, useEffect } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Calculator, Save, RefreshCw, Plus, CreditCard, Smartphone, Banknote } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import EntradaSalvaCard from '@/components/ContagemDia/EntradaSalvaCard';
import FichaDiariaModal from '@/components/ContagemDia/FichaDiariaModal';
import { getCurrentDateBrazil } from '@/lib/dateUtils';
import { apiSaveFichaDiaria } from '@/lib/financeiroApi';

interface CashDenomination {
  value: number;
  type: 'nota' | 'moeda';
  label: string;
  color: string;
}

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
  missionaryOffering?: number;
  missionaryResponsible?: string;
}

interface PaymentData {
  dinheiro: number;
  pix: number;
  cartao: number;
}

const ContagemDia: React.FC = () => {
  const { saveCashCount } = useFinance();
  
  // Denominações de dinheiro brasileiro
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

  // Estados para abas
  const [activeTab, setActiveTab] = useState<'dizimos' | 'ofertas' | 'ofertas-missionarias'>('dizimos');
  
  // Estados para dízimos
  const [dizimosQuantities, setDizimosQuantities] = useState<{ [key: number]: number }>({});
  const [dizimosTotals, setDizimosTotals] = useState<{ [key: number]: number }>({});
  const [dizimosGrandTotal, setDizimosGrandTotal] = useState(0);
  const [dizimosPayment, setDizimosPayment] = useState<PaymentData>({ dinheiro: 0, pix: 0, cartao: 0 });
  
  // Estados para ofertas
  const [ofertasQuantities, setOfertasQuantities] = useState<{ [key: number]: number }>({});
  const [ofertasTotals, setOfertasTotals] = useState<{ [key: number]: number }>({});
  const [ofertasGrandTotal, setOfertasGrandTotal] = useState(0);
  const [ofertasPayment, setOfertasPayment] = useState<PaymentData>({ dinheiro: 0, pix: 0, cartao: 0 });
  
  // Estados para ofertas missionárias
  const [ofertasMissionariasQuantities, setOfertasMissionariasQuantities] = useState<{ [key: number]: number }>({});
  const [ofertasMissionariasTotals, setOfertasMissionariasTotals] = useState<{ [key: number]: number }>({});
  const [ofertasMissionariasGrandTotal, setOfertasMissionariasGrandTotal] = useState(0);
  const [ofertasMissionariasPayment, setOfertasMissionariasPayment] = useState<PaymentData>({ dinheiro: 0, pix: 0, cartao: 0 });
  
  // Estados gerais
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [entradasSalvas, setEntradasSalvas] = useState<EntradaSalva[]>([]);
  const [showFichaDiariaModal, setShowFichaDiariaModal] = useState(false);

  // Carregar entradas salvas do localStorage
  useEffect(() => {
    const saved = localStorage.getItem('entradasSalvas');
    if (saved) {
      setEntradasSalvas(JSON.parse(saved));
    }
  }, []);

  // Calcular totais para dízimos
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

  // Calcular totais para ofertas
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

  // Calcular totais para ofertas missionárias
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

  const handleQuantityChange = (value: number, quantity: string) => {
    const numQuantity = parseInt(quantity) || 0;
    if (numQuantity >= 0) {
      if (activeTab === 'dizimos') {
        setDizimosQuantities(prev => ({
          ...prev,
          [value]: numQuantity
        }));
      } else if (activeTab === 'ofertas') {
        setOfertasQuantities(prev => ({
          ...prev,
          [value]: numQuantity
        }));
      } else {
        setOfertasMissionariasQuantities(prev => ({
          ...prev,
          [value]: numQuantity
        }));
      }
    }
  };

  const handlePaymentChange = (type: keyof PaymentData, value: string) => {
    const numValue = parseFloat(value) || 0;
    if (numValue >= 0) {
      if (activeTab === 'dizimos') {
        setDizimosPayment(prev => ({
          ...prev,
          [type]: numValue
        }));
      } else if (activeTab === 'ofertas') {
        setOfertasPayment(prev => ({
          ...prev,
          [type]: numValue
        }));
      } else {
        setOfertasMissionariasPayment(prev => ({
          ...prev,
          [type]: numValue
        }));
      }
    }
  };

  const handleSave = () => {
    const currentTotal = activeTab === 'dizimos' ? dizimosGrandTotal : 
                        activeTab === 'ofertas' ? ofertasGrandTotal : ofertasMissionariasGrandTotal;
    if (currentTotal === 0) return;
    setShowFichaDiariaModal(true);
  };

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

  const handleFichaDiariaSave = async (fichaDiariaData: any) => {
    setIsSaving(true);
    try {
      const today = getCurrentDateBrazil();
      const currentQuantities = getCurrentQuantities();
      const currentTotal = getCurrentGrandTotal();
      const currentPayment = getCurrentPayment();
      
      // Preparar dados para salvar
      const notes: { [key: string]: number } = {};
      denominations.forEach(denom => {
        if (currentQuantities[denom.value] > 0) {
          // Comentario: chave no formato "nota_100" ou "moeda_0_50" esperado pelo FinanceContext
          const key = `${denom.type}_${String(denom.value).replace('.', '_')}`;
          notes[key] = currentQuantities[denom.value];
        }
      });

      await saveCashCount({
        date: today,
        notes,
        total: currentTotal,
        // Comentario: responsáveis/testemunhas da contagem
        responsavel_1: fichaDiariaData.responsible1 || undefined,
        responsavel_2: fichaDiariaData.responsible2 || undefined,
        responsavel_3: fichaDiariaData.responsible3 || undefined,
        // Comentario: tipo da coleta (Dízimos, Ofertas ou Ofertas Missionárias)
        tipo_coleta: activeTab,
        // Comentario: valores por forma de pagamento para o relatório financeiro
        valor_dinheiro: currentPayment.dinheiro,
        valor_pix: currentPayment.pix,
        valor_cartao: currentPayment.cartao,
      });

      // Comentario: salva (ou incrementa) a ficha diária do dia no banco.
      // Cada contagem do dia soma ao total_entradas da ficha daquele dia.
      await apiSaveFichaDiaria({
        data_ficha: today,
        valor_entrada: currentTotal,
      });

      // Criar entrada salva
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
        missionaryOffering: fichaDiariaData.missionaryOffering,
        missionaryResponsible: fichaDiariaData.missionaryResponsible
      };

      const novasEntradas = [...entradasSalvas, novaEntrada];
      setEntradasSalvas(novasEntradas);
      localStorage.setItem('entradasSalvas', JSON.stringify(novasEntradas));

      // Salvar também na ficha diária
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
                    missionaryOffering: fichaDiariaData.missionaryOffering,
              missionaryResponsible: fichaDiariaData.missionaryResponsible
            };
            
            // Adicionar valores específicos por tipo
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
      setSaveMessage(`${tabName} salvos com sucesso na ficha diária!`);
      setTimeout(() => setSaveMessage(''), 3000);
      
      // Limpar contagem atual
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

  const handleDeleteEntrada = (id: string) => {
    const novasEntradas = entradasSalvas.filter(entrada => entrada.id !== id);
    setEntradasSalvas(novasEntradas);
    localStorage.setItem('entradasSalvas', JSON.stringify(novasEntradas));
  };

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

  const handleCreateEntry = () => {
    const currentTotal = getCurrentGrandTotal();
    if (currentTotal > 0) {
      setShowFichaDiariaModal(true);
    }
  };

  return (
    <ManagementShell roleMode="financeiro">
    <div className="space-y-6">
      {/* Header */}
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

      {/* Save Message */}
      {saveMessage && (
        <div className={`p-4 rounded-lg ${
          saveMessage.includes('sucesso') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {saveMessage}
        </div>
      )}

      {/* Entradas Salvas */}
      {entradasSalvas.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Entradas Salvas</h2>
          <div className="relative">
            <div className="overflow-x-auto scrollbar-hide">
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
            {/* Gradient overlay para indicar scroll */}
            <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none"></div>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
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

      {/* Payment Methods */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CreditCard className="w-5 h-5 mr-2 text-[#1A237E]" />
          Formas de Pagamento - {activeTab === 'dizimos' ? 'Dízimos' : 
                                 activeTab === 'ofertas' ? 'Ofertas' : 'Ofertas Missionárias'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PIX/OCT */}
          <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Smartphone className="w-5 h-5 mr-2 text-blue-600" />
                <span className="font-medium text-gray-900">PIX/OCT</span>
              </div>
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
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <CreditCard className="w-5 h-5 mr-2 text-purple-600" />
                <span className="font-medium text-gray-900">Cartão</span>
              </div>
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

      {/* Counting Grid - Dinheiro */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Notas */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
            Notas - Dinheiro
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
                  <span className="text-sm text-gray-500">
                    × {denom.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Moedas */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <div className="w-4 h-4 bg-yellow-500 rounded-full mr-2"></div>
            Moedas - Dinheiro
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
                  <span className="text-sm text-gray-500">
                    × {denom.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Total Summary */}
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
        
        {/* Payment Breakdown */}
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

      {/* Modal da Ficha Diária */}
      <FichaDiariaModal
        isOpen={showFichaDiariaModal}
        onClose={() => setShowFichaDiariaModal(false)}
        onSave={handleFichaDiariaSave}
        total={getCurrentGrandTotal()}
        activeTab={activeTab}
      />
    </div>
    </ManagementShell>
  );
};

export default ContagemDia;
