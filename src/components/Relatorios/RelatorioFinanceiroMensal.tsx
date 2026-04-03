
import React, { useState, useEffect, useRef } from 'react';
import { Search, Save, Printer, X } from 'lucide-react';
import { Transaction, CashCount } from '@/types/financeiro';
import { getCurrentDateBrazil } from '@/lib/dateUtils';
import { toast } from '@/components/ui/use-toast';
import { apiSearchChurches, ApiChurch, apiSaveFechamento } from '@/lib/financeiroApi';

interface RelatorioFinanceiroMensalProps {
  onBack: () => void;
  transactions: Transaction[];
  cashCounts: CashCount[];
  canPrint?: boolean;
}

interface ChurchInfo {
  pdaCode: string;
  churchType: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  churchName: string;
  email: string;
  reportClosingDate: string;
}

const RelatorioFinanceiroMensal: React.FC<RelatorioFinanceiroMensalProps> = ({
  onBack: _onBack,
  transactions,
  cashCounts,
  canPrint = false,
}) => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear();

  // ── Estado da pesquisa de igreja ────────────────────────────────────────
  const [churchSearch, setChurchSearch] = useState('');
  const [churchResults, setChurchResults] = useState<ApiChurch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Estado das informações da igreja ────────────────────────────────────
  const [churchInfo, setChurchInfo] = useState<ChurchInfo>({
    pdaCode: '',
    churchType: 'local',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
    churchName: '',
    email: '',
    reportClosingDate: getCurrentDateBrazil(),
  });

  // ── Campo de transferência do mês anterior ───────────────────────────────
  // Comentario: pré-preenche com o valor salvo na Contagem do Dia (aba Ofertas)
  const [previousMonthTransfer, setPreviousMonthTransfer] = useState(() => {
    const saved = localStorage.getItem('transferenciaMesAnterior');
    return saved ? parseFloat(saved) || 0 : 0;
  });
  const [nextMonthTransfer, setNextMonthTransfer] = useState(() => {
    const saved = localStorage.getItem('transferenciaProximoMes');
    return saved ? parseFloat(saved) || 0 : 0;
  });

  // ── Filtra contagens do mês vigente ─────────────────────────────────────
  const contagensDoMes = cashCounts.filter((c) => {
    const [ano, mes] = c.date.split('-');
    return parseInt(ano) === currentYear && parseInt(mes) === currentMonth;
  });

  // Comentario: soma por tipo de coleta e forma de pagamento
  const soma = (tipo: string, campo: 'valor_dinheiro' | 'valor_pix' | 'valor_cartao') =>
    contagensDoMes
      .filter((c) => c.tipo_coleta === tipo)
      .reduce((sum, c) => sum + (c[campo] ?? 0), 0);

  // Entradas automáticas vindas das contagens de caixa
  const dizimoDinheiro        = soma('dizimos',               'valor_dinheiro');
  const dizimoPix             = soma('dizimos',               'valor_pix');
  const dizimoCartao          = soma('dizimos',               'valor_cartao');
  const ofertaDinheiro        = soma('ofertas',               'valor_dinheiro');
  const ofertaPix             = soma('ofertas',               'valor_pix');
  const ofertaCartao          = soma('ofertas',               'valor_cartao');
  const missionariaDinheiro   = soma('ofertas-missionarias',  'valor_dinheiro');
  const missionariaPix        = soma('ofertas-missionarias',  'valor_pix');
  const missionariaCartao     = soma('ofertas-missionarias',  'valor_cartao');

  // Agrupamentos por linha do relatório
  const ofertasChequePix      = ofertaPix + ofertaCartao;
  const missionariasChequePix = missionariaPix + missionariaCartao;
  const dizimoChequePix       = dizimoPix + dizimoCartao;

  // ── Calcula as saídas das transações ─────────────────────────────────────
  const totalExits = transactions
    .filter((t) => t.type === 'saida')
    .reduce((sum, t) => sum + t.amount, 0);

  // ── Total Geral de Entradas ───────────────────────────────────────────────
  const totalEntries =
    dizimoDinheiro + dizimoChequePix +
    ofertaDinheiro + ofertasChequePix +
    missionariaDinheiro + missionariasChequePix +
    previousMonthTransfer;

  const monthBalance = totalEntries - totalExits;
  const cashEntriesTotal = dizimoDinheiro + ofertaDinheiro + missionariaDinheiro;
  const nonCashEntriesTotal = dizimoChequePix + ofertasChequePix + missionariasChequePix;
  const totalEntriesAll = cashEntriesTotal + nonCashEntriesTotal;
  const positiveBalance = monthBalance;
  const saldoDepositarBanco = cashEntriesTotal - totalExits;

  const monthNames = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
  ];

  // ── Pesquisa de igreja com debounce ──────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (churchSearch.length < 2) {
      setChurchResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await apiSearchChurches(churchSearch);
        setChurchResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        setChurchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [churchSearch]);

  // Comentario: fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Seleciona uma igreja da pesquisa e preenche os campos ────────────────
  const handleSelectChurch = (church: ApiChurch) => {
    setChurchInfo({
      pdaCode: church.totvs_id,
      churchType: church.class || 'local',
      neighborhood: church.address_neighborhood || '',
      city: church.address_city || '',
      state: church.address_state || '',
      zipCode: church.cep || '',
      churchName: church.church_name,
      email: church.contact_email || '',
      reportClosingDate: churchInfo.reportClosingDate,
    });
    setChurchSearch(church.church_name);
    setShowDropdown(false);
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Comentario: salva todos os dados do relatório na tabela fin_fechamentos_mensais
      await apiSaveFechamento({
        ano: currentYear,
        mes: currentMonth,
        // Totais gerais
        total_receitas: totalEntries,
        total_despesas: totalExits,
        total_transacoes: transactions.length,
        saldo_inicial_mes: previousMonthTransfer,
        saldo_final_mes: monthBalance,
        // Breakdown por tipo de coleta
        dizimos_dinheiro:       dizimoDinheiro,
        dizimos_pix_cartao:     dizimoChequePix,
        ofertas_dinheiro:       ofertaDinheiro,
        ofertas_pix_cartao:     ofertasChequePix,
        missionarias_dinheiro:  missionariaDinheiro,
        missionarias_pix_cartao: missionariasChequePix,
        transferencia_mes_anterior: previousMonthTransfer,
        // Data do fechamento
        data_fechamento:      churchInfo.reportClosingDate || undefined,
      });
      toast({ title: 'Relatório salvo', description: `Fechamento de ${monthNames[currentMonth - 1]}/${currentYear} salvo no banco.` });

      // Comentario: limpa os dados do mês fechado para o próximo mês começar do zero
      localStorage.removeItem('entradasSalvas');
      localStorage.removeItem('registrosDiarios');
      localStorage.removeItem('monthlySheet');
      localStorage.removeItem('transferenciaMesAnterior');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => window.print();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Relatório Financeiro Mensal — {monthNames[currentMonth - 1]} {currentYear}
          </h1>
          <p className="text-gray-600">Movimento financeiro completo da igreja</p>
        </div>
        <div className="flex space-x-3">
          <button onClick={handleSave} disabled={isSaving} className="flex items-center px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] disabled:opacity-50 transition-colors">
            <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
          {canPrint ? (
            <button onClick={handlePrint} className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
              <Printer className="w-4 h-4 mr-2" /> Imprimir
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Informações da Igreja ─────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações da Igreja</h2>

        {/* Comentario: campo de pesquisa — o usuário digita e seleciona a igreja */}
        <div ref={searchRef} className="relative mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pesquisar Igreja
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={churchSearch}
              onChange={(e) => setChurchSearch(e.target.value)}
              placeholder="Digite o nome ou código PDA da igreja..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
            {churchSearch && (
              <button
                onClick={() => { setChurchSearch(''); setChurchResults([]); setShowDropdown(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dropdown de resultados */}
          {showDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {isSearching ? (
                <p className="px-4 py-3 text-sm text-gray-500">Pesquisando...</p>
              ) : (
                churchResults.map((church) => (
                  <button
                    key={church.totvs_id}
                    onClick={() => handleSelectChurch(church)}
                    className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900">{church.church_name}</p>
                    <p className="text-xs text-gray-500">
                      Código: {church.totvs_id} · {church.class} · {church.address_city}/{church.address_state}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Campos da Igreja */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código PDA</label>
            <input type="text" value={churchInfo.pdaCode}
              onChange={(e) => setChurchInfo((p) => ({ ...p, pdaCode: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="Ex: 1930"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={churchInfo.churchType}
              onChange={(e) => setChurchInfo((p) => ({ ...p, churchType: e.target.value }))}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
            <input type="text" value={churchInfo.neighborhood}
              onChange={(e) => setChurchInfo((p) => ({ ...p, neighborhood: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
            <input type="text" value={churchInfo.city}
              onChange={(e) => setChurchInfo((p) => ({ ...p, city: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <input type="text" value={churchInfo.state}
              onChange={(e) => setChurchInfo((p) => ({ ...p, state: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
            <input type="text" value={churchInfo.zipCode}
              onChange={(e) => setChurchInfo((p) => ({ ...p, zipCode: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de Fechamento</label>
            <input type="date" value={churchInfo.reportClosingDate}
              onChange={(e) => setChurchInfo((p) => ({ ...p, reportClosingDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Igreja</label>
            <input type="text" value={churchInfo.churchName}
              onChange={(e) => setChurchInfo((p) => ({ ...p, churchName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input type="email" value={churchInfo.email}
              onChange={(e) => setChurchInfo((p) => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Movimento Financeiro do Mês ────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Movimento Financeiro do Mês</h2>

        <div className="grid grid-cols-1 gap-8">
          {/* ENTRADAS */}
          <div>
            <h3 className="text-md font-semibold text-gray-800 mb-4 bg-green-50 p-3 rounded-lg">ENTRADAS</h3>

            {/* Comentario: todos os campos são automáticos — vêm de fin_contagens_caixa */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-700">
                  Dízimos em Dinheiro:
                  <span className="ml-1 text-xs text-blue-500">(auto)</span>
                </label>
                <input type="number" readOnly value={dizimoDinheiro.toFixed(2)}
                  className="w-36 px-2 py-1 border border-gray-300 rounded text-right text-sm bg-blue-50 text-blue-700 font-medium"
                />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-700">
                  Dízimos em Cheque/Cartão/Pix:
                  <span className="ml-1 text-xs text-blue-500">(auto)</span>
                </label>
                <input type="number" readOnly value={dizimoChequePix.toFixed(2)}
                  className="w-36 px-2 py-1 border border-gray-300 rounded text-right text-sm bg-blue-50 text-blue-700 font-medium"
                />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-700">
                  Ofertas em Dinheiro:
                  <span className="ml-1 text-xs text-blue-500">(auto)</span>
                </label>
                <input type="number" readOnly value={ofertaDinheiro.toFixed(2)}
                  className="w-36 px-2 py-1 border border-gray-300 rounded text-right text-sm bg-blue-50 text-blue-700 font-medium"
                />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-700">
                  Ofertas em Cheque/Cartão/Pix:
                  <span className="ml-1 text-xs text-blue-500">(auto)</span>
                </label>
                <input type="number" readOnly value={ofertasChequePix.toFixed(2)}
                  className="w-36 px-2 py-1 border border-gray-300 rounded text-right text-sm bg-blue-50 text-blue-700 font-medium"
                />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-700">
                  Ofertas Missionárias em Dinheiro:
                  <span className="ml-1 text-xs text-blue-500">(auto)</span>
                </label>
                <input type="number" readOnly value={missionariaDinheiro.toFixed(2)}
                  className="w-36 px-2 py-1 border border-gray-300 rounded text-right text-sm bg-blue-50 text-blue-700 font-medium"
                />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-700">
                  Ofertas Missionárias em Cheque/Cartão/Pix:
                  <span className="ml-1 text-xs text-blue-500">(auto)</span>
                </label>
                <input type="number" readOnly value={missionariasChequePix.toFixed(2)}
                  className="w-36 px-2 py-1 border border-gray-300 rounded text-right text-sm bg-blue-50 text-blue-700 font-medium"
                />
              </div>

              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-700">Transferência Recebida do Mês Anterior:</label>
                <input
                  type="number" step="0.01" min="0"
                  value={previousMonthTransfer || ''}
                  readOnly
                  title="Valor vindo automaticamente da Transfer?ncia do m?s anterior."
                  className="w-36 px-2 py-1 border border-gray-300 rounded text-right text-sm bg-blue-50 text-blue-700 font-medium"
                />
              </div>

              <p className="text-xs text-gray-400 mt-2">
                * Campos (auto) calculados automaticamente das contagens do caixa.
              </p>
            </div>
          </div>

          {/* SAÍDAS */}
          <div>
            <h3 className="text-md font-semibold text-gray-800 mb-4 bg-red-50 p-3 rounded-lg">SAÍDAS</h3>

            <div className="space-y-3">
              <p className="text-sm text-gray-600 italic">
                As saídas são calculadas automaticamente com base nas transações registradas no sistema.
              </p>

              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm font-medium text-gray-700">
                  Total de Saídas: R$ {totalExits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {transactions.filter((t) => t.type === 'saida').length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-gray-700">Detalhamento:</p>
                  {transactions
                    .filter((t) => t.type === 'saida')
                    .map((transaction) => (
                      <div key={transaction.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{transaction.description}:</span>
                        <span className="font-medium">
                          R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Totais ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Totais</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Total Geral de Entradas</h3>
            {/* Comentario: soma automática (digital + caixa) + campos manuais */}
            <p className="text-2xl font-bold text-green-600">
              R$ {totalEntries.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Dízimos: R$ {(dizimoDinheiro + dizimoChequePix).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ·
              Ofertas: R$ {(ofertaDinheiro + ofertasChequePix).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ·
              Missionárias: R$ {(missionariaDinheiro + missionariasChequePix).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-red-50 p-4 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Total Geral das Saídas</h3>
            <p className="text-2xl font-bold text-red-600">
              R$ {totalExits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className={`p-4 rounded-lg ${monthBalance >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Saldo Positivo</h3>
            <p className={`text-2xl font-bold ${monthBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              R$ {monthBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Resumo Financeiro ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo Financeiro</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Entrada Geral em Dinheiro:</span>
            <span className="text-sm font-semibold text-gray-900">
              R$ {cashEntriesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Total das Entradas (Cheque/OCT/Cartão/Pix):</span>
            <span className="text-sm font-semibold text-gray-900">
              R$ {totalEntriesAll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Total das Saídas:</span>
            <span className="text-sm font-semibold text-gray-900">
              R$ {totalExits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Saldo Positivo:</span>
            <span className="text-sm font-semibold text-gray-900">
              R$ {positiveBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Saldo a Depositar no Banco:</span>
            <span className="text-sm font-semibold text-gray-900">
              R$ {saldoDepositarBanco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Transferência para o Próximo Mês:</label>
            <input
              type="number"
              step="0.01"
              value={nextMonthTransfer || ''}
              readOnly
              className="w-32 px-2 py-1 border border-gray-300 rounded text-right text-sm"
            />
          </div>
        </div>
      </div>

    </div>
  );
};

export default RelatorioFinanceiroMensal;
