
import React, { useMemo, useState } from 'react';
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Plus, Edit2, Trash2, ArrowDownLeft, Save, X, Tag } from 'lucide-react';
import { useFinance } from '@/contexts/FinanceContext';
import { getCurrentDateBrazil } from '@/lib/dateUtils';
import { toast } from '@/components/ui/use-toast';

// Cores disponíveis para as categorias
const CORES_DISPONIVEIS = [
  { label: 'Cinza',    value: '#6B7280' },
  { label: 'Vermelho', value: '#EF4444' },
  { label: 'Laranja',  value: '#F97316' },
  { label: 'Amarelo',  value: '#EAB308' },
  { label: 'Verde',    value: '#22C55E' },
  { label: 'Azul',     value: '#3B82F6' },
  { label: 'Roxo',     value: '#8B5CF6' },
  { label: 'Rosa',     value: '#EC4899' },
];

const CadastroSaidas: React.FC = () => {
  const {
    transactions,
    categories,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useFinance();

  // ── Estado do modal de Nova/Editar Saída ──────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    category: '',
    date: getCurrentDateBrazil(),
  });
  const [isCustomDescription, setIsCustomDescription] = useState(false);
  const [customDescription, setCustomDescription] = useState('');

  // ── Estado do modal de Nova/Editar Categoria ──────────────────────────────
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catForm, setCatForm] = useState({ nome: '', cor: '#6B7280' });
  const [isSavingCat, setIsSavingCat] = useState(false);

  // Somente categorias de despesa
  const categoriasDespesa = useMemo(
    () => categories.filter((c) => true), // a API já filtra pelo tipo ao listar
    [categories],
  );

  const saidas = useMemo(() => transactions.filter((t) => t.type === 'saida'), [transactions]);
  const totalSaidas = saidas.length;
  const totalValorSaidas = useMemo(() => saidas.reduce((sum, t) => sum + t.amount, 0), [saidas]);
  const mediaSaida = totalSaidas > 0 ? totalValorSaidas / totalSaidas : 0;

  // ── Handlers de Saída ─────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalDescription = isCustomDescription ? customDescription : formData.description;
    if (!finalDescription.trim() || !formData.amount) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha todos os campos.', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(formData.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Valor inválido', description: 'Informe um valor maior que zero.', variant: 'destructive' });
      return;
    }

    const transactionData = {
      type: 'saida' as const,
      description: finalDescription.trim(),
      amount: parsedAmount,
      category: finalDescription.trim(),
      date: formData.date,
    };

    if (editingTransaction) {
      updateTransaction(editingTransaction, transactionData);
      toast({ title: 'Saída atualizada', description: 'Saída atualizada com sucesso.' });
    } else {
      addTransaction(transactionData);
      toast({ title: 'Saída cadastrada', description: 'Saída cadastrada com sucesso.' });
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({ description: '', amount: '', category: '', date: getCurrentDateBrazil() });
    setIsCustomDescription(false);
    setCustomDescription('');
    setIsModalOpen(false);
    setEditingTransaction(null);
  };

  const handleEdit = (transaction: any) => {
    const isKnown = categoriasDespesa.some((c) => c.name === transaction.description);
    setFormData({
      description: isKnown ? transaction.description : '',
      amount: transaction.amount.toString(),
      category: transaction.category,
      date: transaction.date,
    });
    setIsCustomDescription(!isKnown);
    setCustomDescription(!isKnown ? transaction.description : '');
    setEditingTransaction(transaction.id);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta saída?')) {
      deleteTransaction(id);
      toast({ title: 'Saída excluída', description: 'Saída removida com sucesso.' });
    }
  };

  // ── Handlers de Categoria ─────────────────────────────────────────────────

  const openNovaCat = () => {
    setEditingCatId(null);
    setCatForm({ nome: '', cor: '#6B7280' });
    setIsCatModalOpen(true);
  };

  const openEditCat = (cat: any) => {
    setEditingCatId(cat.id);
    setCatForm({ nome: cat.name, cor: cat.color || '#6B7280' });
    setIsCatModalOpen(true);
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.nome.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe o nome da categoria.', variant: 'destructive' });
      return;
    }
    setIsSavingCat(true);
    try {
      if (editingCatId) {
        await updateCategory(editingCatId, { name: catForm.nome.trim(), color: catForm.cor });
        toast({ title: 'Categoria atualizada' });
      } else {
        await addCategory({ name: catForm.nome.trim(), color: catForm.cor, description: undefined });
        toast({ title: 'Categoria criada' });
      }
      setIsCatModalOpen(false);
    } catch {
      toast({ title: 'Erro ao salvar categoria', variant: 'destructive' });
    } finally {
      setIsSavingCat(false);
    }
  };

  const handleDeleteCat = async (id: string) => {
    if (window.confirm('Excluir esta categoria?')) {
      await deleteCategory(id);
      toast({ title: 'Categoria excluída' });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ManagementShell roleMode="financeiro">
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <ArrowDownLeft className="w-6 h-6 mr-2 text-red-600" />
            Cadastro de Saídas
          </h1>
          <p className="text-gray-600">Gerencie suas despesas e saídas financeiras</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Saída
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Total de Saídas</h3>
          <p className="text-2xl font-bold text-red-600">{totalSaidas}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Valor Total</h3>
          <p className="text-2xl font-bold text-red-600">
            R$ {totalValorSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-medium text-gray-600">Média por Saída</h3>
          <p className="text-2xl font-bold text-[#1A237E]">
            R$ {mediaSaida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* ── Seção de Categorias ────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Tag className="w-5 h-5 mr-2 text-[#1A237E]" />
            Categorias de Despesas
          </h2>
          <button
            onClick={openNovaCat}
            className="flex items-center px-3 py-1.5 bg-[#1A237E] text-white text-sm rounded-lg hover:bg-[#0D47A1] transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" />
            Nova Categoria
          </button>
        </div>

        <div className="p-6">
          {categoriasDespesa.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              Nenhuma categoria cadastrada. Crie a primeira!
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {categoriasDespesa.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Comentario: bolinha colorida mostra a cor da categoria */}
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color || '#6B7280' }}
                    />
                    <span className="text-sm font-medium text-gray-800 truncate">{cat.name}</span>
                  </div>
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={() => openEditCat(cat)}
                      className="text-[#1A237E] hover:text-[#0D47A1] transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCat(cat.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Histórico de Saídas</h2>
        </div>
        <div className="space-y-3 p-4 md:hidden">
          {saidas.length > 0 ? (
            saidas.map((transaction) => (
              <div key={`mobile-${transaction.id}`} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">{transaction.description}</p>
                  <p className="text-xs text-gray-500">
                    {(() => {
                      const [year, month, day] = transaction.date.split('-');
                      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
                        .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    })()}
                  </p>
                  <p className="text-sm font-semibold text-red-600">
                    R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={() => handleEdit(transaction)} className="inline-flex items-center gap-1 text-sm text-[#1A237E] hover:text-[#0D47A1] transition-colors">
                    <Edit2 className="w-4 h-4" /> Editar
                  </button>
                  <button onClick={() => handleDelete(transaction.id)} className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 transition-colors">
                    <Trash2 className="w-4 h-4" /> Excluir
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-5 text-center text-sm text-gray-500">
              Nenhuma saída cadastrada
            </div>
          )}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {saidas.length > 0 ? (
                saidas.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{transaction.description}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-red-600">
                        R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {(() => {
                          const [year, month, day] = transaction.date.split('-');
                          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
                            .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button onClick={() => handleEdit(transaction)} className="text-[#1A237E] hover:text-[#0D47A1] transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(transaction.id)} className="text-red-600 hover:text-red-700 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    Nenhuma saída cadastrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Nova/Editar Saída ─────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingTransaction ? 'Editar Saída' : 'Nova Saída'}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                <select
                  value={isCustomDescription ? 'outro' : formData.description}
                  onChange={(e) => {
                    if (e.target.value === 'outro') {
                      setIsCustomDescription(true);
                      setFormData({ ...formData, description: '' });
                    } else {
                      setIsCustomDescription(false);
                      setCustomDescription('');
                      setFormData({ ...formData, description: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                  required
                >
                  <option value="">Selecione a descrição</option>
                  {/* Comentario: categorias vêm do banco (fin_categorias) via FinanceContext */}
                  {categoriasDespesa.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                  <option value="outro">Outro (inserir manualmente)</option>
                </select>
              </div>

              {isCustomDescription && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição Personalizada *</label>
                  <input
                    type="text"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                    placeholder="Digite a descrição"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                  placeholder="0,00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                  required
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={resetForm} className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Nova/Editar Categoria ─────────────────────────────────────── */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingCatId ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <button onClick={() => setIsCatModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCat} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text"
                  value={catForm.nome}
                  onChange={(e) => setCatForm({ ...catForm, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A237E] focus:border-transparent outline-none transition-colors"
                  placeholder="Ex: Aluguel, Energia Elétrica..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
                {/* Comentario: seletor de cor por bolinhas — fácil de entender */}
                <div className="flex flex-wrap gap-2">
                  {CORES_DISPONIVEIS.map((cor) => (
                    <button
                      key={cor.value}
                      type="button"
                      title={cor.label}
                      onClick={() => setCatForm({ ...catForm, cor: cor.value })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        catForm.cor === cor.value ? 'border-gray-900 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: cor.value }}
                    />
                  ))}
                </div>
                {/* Comentario: mostra preview da cor escolhida */}
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: catForm.cor }} />
                  Cor selecionada
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCat}
                  className="flex-1 px-4 py-2 bg-[#1A237E] text-white rounded-lg hover:bg-[#0D47A1] disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSavingCat ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </ManagementShell>
  );
};

export default CadastroSaidas;
