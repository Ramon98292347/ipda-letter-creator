/**
 * FinanceContext.tsx
 * ==================
 * O que faz: Contexto React para o módulo financeiro.
 *            Gerencia o estado das transações, contagens de caixa e categorias
 *            que são usados pelas páginas de contagem do dia e relatórios.
 *
 * Diferença do financeiro-novo:
 *   - Em vez de usar localStorage como persistência principal, este contexto
 *     mantém os dados em memória durante a sessão.
 *   - O "userId" é obtido do UserContext do sistema principal (useUser),
 *     não do AuthContext próprio do financeiro-novo.
 *   - As categorias padrão são voltadas para o contexto eclesial (dízimos, ofertas, etc.).
 *
 * Como usar:
 *   1. Envolva as rotas /financeiro/* com <FinanceProvider> no App.tsx
 *   2. Em qualquer componente filho, chame: const { transactions, addTransaction } = useFinance();
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, CashCount, ExpenseCategory, FinanceContextType } from '@/types/financeiro';
import { useUser } from '@/context/UserContext';

// Cria o contexto — começa como undefined até o Provider inicializar
const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

/**
 * useFinance — hook para acessar o contexto financeiro.
 * Lança um erro amigável se usado fora do FinanceProvider.
 */
export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance deve ser usado dentro de um FinanceProvider');
  }
  return context;
};

interface FinanceProviderProps {
  children: ReactNode;
}

/**
 * FinanceProvider — provedor do contexto financeiro.
 *
 * Carrega os dados do usuário logado via useUser() e inicializa:
 *   - transactions: lista de transações (entradas e saídas)
 *   - cashCounts: contagens de caixa salvas
 *   - categories: categorias de despesa/receita
 *
 * Usa localStorage como cache local para manter os dados durante a sessão.
 * O ID do usuário é usado como namespace para não misturar dados entre usuários.
 */
export const FinanceProvider: React.FC<FinanceProviderProps> = ({ children }) => {
  // Obtém o usuário logado do contexto principal do sistema
  const { usuario } = useUser();

  // Estado das transações financeiras
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Estado das contagens de caixa
  const [cashCounts, setCashCounts] = useState<CashCount[]>([]);

  // Estado das categorias de despesa/receita
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  /**
   * Carrega os dados do usuário quando ele está logado.
   * Usa o ID do usuário como namespace no localStorage para separar
   * os dados de cada usuário.
   */
  useEffect(() => {
    if (usuario) {
      carregarDados();
    }
  }, [usuario]);

  /**
   * carregarDados — carrega transações e contagens do localStorage.
   * Inicializa categorias padrão se não existirem.
   */
  const carregarDados = () => {
    // ID do usuário como namespace — usa o totvs da igreja ou o id generico
    const userId = String(usuario?.default_totvs_id || usuario?.totvs || usuario?.id || 'guest');

    // Categorias padrão para o contexto eclesial
    const categoriasPadrao: ExpenseCategory[] = [
      { id: '1', name: 'Dízimos', color: '#1A237E', userId },
      { id: '2', name: 'Ofertas', color: '#4CAF50', userId },
      { id: '3', name: 'Ofertas Missionárias', color: '#FF6F00', userId },
      { id: '4', name: 'Despesas Gerais', color: '#9C27B0', userId },
    ];

    setCategories(categoriasPadrao);

    // Tenta carregar transações salvas no cache local
    const transacoesSalvas = localStorage.getItem(`fin_transactions_${userId}`);
    const contagensSalvas = localStorage.getItem(`fin_cashCounts_${userId}`);

    if (transacoesSalvas) {
      try {
        setTransactions(JSON.parse(transacoesSalvas));
      } catch {
        setTransactions([]);
      }
    }

    if (contagensSalvas) {
      try {
        setCashCounts(JSON.parse(contagensSalvas));
      } catch {
        setCashCounts([]);
      }
    }
  };

  /**
   * Helper para obter o ID do usuário atual como string.
   * Prioridade: totvs da igreja > id generico > 'guest'
   */
  const getUserId = (): string => {
    return String(usuario?.default_totvs_id || usuario?.totvs || usuario?.id || 'guest');
  };

  // =============================================================================
  // TRANSAÇÕES — adicionar, atualizar, remover
  // =============================================================================

  /**
   * addTransaction — adiciona uma nova transação e salva no cache local.
   * O ID é gerado automaticamente com o timestamp atual.
   */
  const addTransaction = (transaction: Omit<Transaction, 'id' | 'userId'>) => {
    const userId = getUserId();
    const novaTransacao: Transaction = {
      ...transaction,
      id: Date.now().toString(),
      userId
    };

    const transacoesAtualizadas = [...transactions, novaTransacao];
    setTransactions(transacoesAtualizadas);
    // Salva no cache local para persistir durante a sessão
    localStorage.setItem(`fin_transactions_${userId}`, JSON.stringify(transacoesAtualizadas));
  };

  /**
   * updateTransaction — atualiza parcialmente uma transação existente pelo ID.
   */
  const updateTransaction = (id: string, transaction: Partial<Transaction>) => {
    const userId = getUserId();
    const transacoesAtualizadas = transactions.map(t =>
      t.id === id ? { ...t, ...transaction } : t
    );
    setTransactions(transacoesAtualizadas);
    localStorage.setItem(`fin_transactions_${userId}`, JSON.stringify(transacoesAtualizadas));
  };

  /**
   * deleteTransaction — remove uma transação pelo ID.
   */
  const deleteTransaction = (id: string) => {
    const userId = getUserId();
    const transacoesAtualizadas = transactions.filter(t => t.id !== id);
    setTransactions(transacoesAtualizadas);
    localStorage.setItem(`fin_transactions_${userId}`, JSON.stringify(transacoesAtualizadas));
  };

  // =============================================================================
  // CONTAGENS DE CAIXA — salvar
  // =============================================================================

  /**
   * saveCashCount — salva uma nova contagem de caixa.
   * Cada contagem guarda as quantidades de notas e moedas e o total calculado.
   */
  const saveCashCount = (cashCount: Omit<CashCount, 'id' | 'userId'>) => {
    const userId = getUserId();
    const novaContagem: CashCount = {
      ...cashCount,
      id: Date.now().toString(),
      userId
    };

    const contagensAtualizadas = [...cashCounts, novaContagem];
    setCashCounts(contagensAtualizadas);
    localStorage.setItem(`fin_cashCounts_${userId}`, JSON.stringify(contagensAtualizadas));
  };

  // =============================================================================
  // CATEGORIAS — adicionar, atualizar, remover
  // =============================================================================

  /**
   * addCategory — adiciona uma nova categoria de despesa/receita.
   */
  const addCategory = (category: Omit<ExpenseCategory, 'id' | 'userId'>) => {
    const userId = getUserId();
    const novaCategoria: ExpenseCategory = {
      ...category,
      id: Date.now().toString(),
      userId
    };

    const categoriasAtualizadas = [...categories, novaCategoria];
    setCategories(categoriasAtualizadas);
  };

  /**
   * updateCategory — atualiza parcialmente uma categoria pelo ID.
   */
  const updateCategory = (id: string, category: Partial<ExpenseCategory>) => {
    const categoriasAtualizadas = categories.map(c =>
      c.id === id ? { ...c, ...category } : c
    );
    setCategories(categoriasAtualizadas);
  };

  /**
   * deleteCategory — remove uma categoria pelo ID.
   */
  const deleteCategory = (id: string) => {
    const categoriasAtualizadas = categories.filter(c => c.id !== id);
    setCategories(categoriasAtualizadas);
  };

  // Disponibiliza todos os estados e funções para os componentes filhos
  return (
    <FinanceContext.Provider value={{
      transactions,
      cashCounts,
      categories,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      saveCashCount,
      addCategory,
      updateCategory,
      deleteCategory
    }}>
      {children}
    </FinanceContext.Provider>
  );
};
