/**
 * RegistroDiarioCard.tsx
 * ======================
 * O que faz: Exibe um card com o resumo de um registro diário de entradas.
 *            Mostra dízimos, ofertas e ofertas missionárias com detalhamento
 *            por forma de pagamento (dinheiro, PIX, cartão).
 *
 * Copiado do financeiro-novo/financeiro-igreja/src/components/FichaDiaria/RegistroDiarioCard.tsx
 * Adaptado para o sistema principal sem mudanças na lógica.
 */

import React from 'react';
import { Calendar, User, Trash2, DollarSign, Banknote, CreditCard, Smartphone } from 'lucide-react';

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
  /** Detalhes consolidados da contagem do dia (dízimos, ofertas, missionárias) */
  detalhes?: {
    dizimos: { total: number; dinheiro: number; pix: number; cartao: number };
    ofertas: { total: number; dinheiro: number; pix: number; cartao: number };
    ofertasMissionarias: { total: number; dinheiro: number; pix: number; cartao: number };
  };
}

interface RegistroDiarioCardProps {
  registro: RegistroDiario;
  onDelete: (id: string) => void;
}

const RegistroDiarioCard: React.FC<RegistroDiarioCardProps> = ({ registro, onDelete }) => {
  /**
   * Formata data YYYY-MM-DD → DD/MM/YYYY sem bug de timezone.
   */
  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      {/* Cabeçalho: data + botão excluir */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center text-gray-600">
          <Calendar className="w-4 h-4 mr-2" />
          <span className="text-sm font-medium">{formatDate(registro.date)}</span>
        </div>
        <button
          onClick={() => onDelete(registro.id)}
          className="text-red-500 hover:text-red-700 transition-colors"
          title="Excluir registro"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 mb-3">
        {registro.detalhes ? (
          // Exibe detalhes consolidados da contagem do dia
          <div className="space-y-3">
            {/* Dízimos */}
            {registro.detalhes.dizimos.total > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-800 flex items-center">
                    <Banknote className="w-4 h-4 mr-1" />
                    Dízimos
                  </span>
                  <span className="font-bold text-blue-600">
                    R$ {registro.detalhes.dizimos.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center">
                    <DollarSign className="w-3 h-3 mr-1 text-green-600" />
                    <span>R$ {registro.detalhes.dizimos.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center">
                    <Smartphone className="w-3 h-3 mr-1 text-blue-600" />
                    <span>R$ {registro.detalhes.dizimos.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center">
                    <CreditCard className="w-3 h-3 mr-1 text-purple-600" />
                    <span>R$ {registro.detalhes.dizimos.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Ofertas */}
            {registro.detalhes.ofertas.total > 0 && (
              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-800 flex items-center">
                    <Banknote className="w-4 h-4 mr-1" />
                    Ofertas
                  </span>
                  <span className="font-bold text-green-600">
                    R$ {registro.detalhes.ofertas.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center">
                    <DollarSign className="w-3 h-3 mr-1 text-green-600" />
                    <span>R$ {registro.detalhes.ofertas.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center">
                    <Smartphone className="w-3 h-3 mr-1 text-blue-600" />
                    <span>R$ {registro.detalhes.ofertas.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center">
                    <CreditCard className="w-3 h-3 mr-1 text-purple-600" />
                    <span>R$ {registro.detalhes.ofertas.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Ofertas Missionárias */}
            {registro.detalhes.ofertasMissionarias.total > 0 && (
              <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-orange-800 flex items-center">
                    <Banknote className="w-4 h-4 mr-1" />
                    Ofertas Missionárias
                  </span>
                  <span className="font-bold text-orange-600">
                    R$ {registro.detalhes.ofertasMissionarias.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex items-center">
                    <DollarSign className="w-3 h-3 mr-1 text-green-600" />
                    <span>R$ {registro.detalhes.ofertasMissionarias.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center">
                    <Smartphone className="w-3 h-3 mr-1 text-blue-600" />
                    <span>R$ {registro.detalhes.ofertasMissionarias.pix.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center">
                    <CreditCard className="w-3 h-3 mr-1 text-purple-600" />
                    <span>R$ {registro.detalhes.ofertasMissionarias.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Total consolidado */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Total Geral:</span>
                <span className="font-bold text-gray-900 text-lg">
                  R$ {registro.cashAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        ) : (
          // Formato simples para registros manuais (sem detalhes de contagem)
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Entradas em Dinheiro:</span>
              <span className="font-bold text-green-600 flex items-center">
                <DollarSign className="w-4 h-4 mr-1" />
                R$ {registro.cashAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {registro.transfer && registro.transfer > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Transferência:</span>
                <span className="font-medium text-blue-600">
                  R$ {registro.transfer.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {registro.missionaryOffering && registro.missionaryOffering > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Oferta Missionária:</span>
                <span className="font-medium text-purple-600">
                  R$ {registro.missionaryOffering.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Responsáveis (só aparece se preenchidos) */}
      {(registro.responsible1 || registro.responsible2 || registro.responsible3) && (
        <div className="space-y-1">
          <div className="flex items-center text-gray-600 mb-1">
            <User className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Responsáveis:</span>
          </div>
          {registro.responsible1 && (
            <p className="text-sm text-gray-700">• {registro.responsible1}</p>
          )}
          {registro.responsible2 && (
            <p className="text-sm text-gray-700">• {registro.responsible2}</p>
          )}
          {registro.responsible3 && (
            <p className="text-sm text-gray-700">• {registro.responsible3}</p>
          )}
        </div>
      )}

      {/* Responsável pela oferta missionária */}
      {registro.missionaryResponsible && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-sm text-gray-600">
            <span className="font-medium">Resp. Missionária:</span> {registro.missionaryResponsible}
          </p>
        </div>
      )}
    </div>
  );
};

export default RegistroDiarioCard;
