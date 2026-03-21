/**
 * FichaDiariaModal.tsx
 * ====================
 * O que faz: Modal exibido após o usuário calcular o total na contagem do dia.
 *            Permite informar os responsáveis pela contagem, valor de transferências
 *            e oferta missionária antes de salvar a ficha diária.
 *
 * Copiado do financeiro-novo e adaptado para o sistema principal.
 * Usa os componentes Dialog e Button de @/components/ui — já presentes no sistema.
 *
 * Props:
 *   - isOpen: controla se o modal está visível
 *   - onClose: callback para fechar o modal sem salvar
 *   - onSave: callback chamado com os dados quando o usuário clica em Salvar
 *   - total: o valor total da contagem (exibido para conferência)
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Save, X } from 'lucide-react';

/** Dados coletados no modal antes de salvar a ficha diária */
interface FichaDiariaData {
  /** Nome do 1º responsável pela contagem */
  responsible1: string;
  /** Nome do 2º responsável (opcional) */
  responsible2: string;
  /** Nome do 3º responsável (opcional) */
  responsible3: string;
  /** Valor de transferência recebida (OCTe, PIX, etc.) */
  transfer: number;
  /** Valor da oferta missionária */
  missionaryOffering: number;
  /** Nome do responsável pela oferta missionária */
  missionaryResponsible: string;
}

interface FichaDiariaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FichaDiariaData) => void;
  /** Total calculado na contagem — exibido para conferência */
  total: number;
}

const FichaDiariaModal: React.FC<FichaDiariaModalProps> = ({
  isOpen,
  onClose,
  onSave,
  total
}) => {
  // Estado do formulário — começa com valores vazios/zerados
  const [formData, setFormData] = useState<FichaDiariaData>({
    responsible1: '',
    responsible2: '',
    responsible3: '',
    transfer: 0,
    missionaryOffering: 0,
    missionaryResponsible: ''
  });

  /**
   * Atualiza um campo do formulário pelo nome.
   * Aceita string (textos) ou number (valores monetários).
   */
  const handleInputChange = (field: keyof FichaDiariaData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  /**
   * handleSave — chama o callback onSave com os dados e reseta o formulário.
   */
  const handleSave = () => {
    onSave(formData);
    // Reseta o formulário para uso futuro
    setFormData({
      responsible1: '',
      responsible2: '',
      responsible3: '',
      transfer: 0,
      missionaryOffering: 0,
      missionaryResponsible: ''
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Save className="w-5 h-5 mr-2 text-[#1A237E]" />
            Informações da Ficha Diária
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Exibe o total para conferência visual */}
          <div className="bg-[#1A237E] text-white p-3 rounded-lg">
            <p className="text-sm">Total em dinheiro:</p>
            <p className="text-xl font-bold">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {/* Responsáveis pela contagem */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Responsáveis pela contagem:
            </label>

            <input
              type="text"
              value={formData.responsible1}
              onChange={(e) => handleInputChange('responsible1', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="Responsável 1"
            />

            <input
              type="text"
              value={formData.responsible2}
              onChange={(e) => handleInputChange('responsible2', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="Responsável 2 (opcional)"
            />

            <input
              type="text"
              value={formData.responsible3}
              onChange={(e) => handleInputChange('responsible3', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="Responsável 3 (opcional)"
            />
          </div>

          {/* Transferências recebidas (OCTe, PIX bancário, etc.) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transferências (R$):
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.transfer || ''}
              onChange={(e) => handleInputChange('transfer', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="0,00"
            />
          </div>

          {/* Oferta missionária (valor + responsável) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Oferta Missionária (R$):
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.missionaryOffering || ''}
              onChange={(e) => handleInputChange('missionaryOffering', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="0,00"
            />

            <input
              type="text"
              value={formData.missionaryResponsible}
              onChange={(e) => handleInputChange('missionaryResponsible', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none"
              placeholder="Responsável pela oferta missionária"
            />
          </div>
        </div>

        {/* Botões de ação */}
        <div className="flex space-x-3 mt-6">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-[#1A237E] hover:bg-[#0D47A1]"
          >
            <Save className="w-4 h-4 mr-2" />
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FichaDiariaModal;
