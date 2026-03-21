/**
 * financeiro.ts
 * =============
 * O que faz: Define os tipos de dados usados no módulo financeiro do sistema principal.
 *            Esses tipos foram adaptados dos tipos originais do financeiro-novo.
 * Para que serve: Garantir consistência dos dados em todas as páginas financeiras.
 *
 * NOTA: Os tipos aqui são do módulo de contagem (dízimos/ofertas por forma de pagamento).
 *       Os tipos de transação do banco (Transacao, Categoria, etc.) ficam em financeiroService.ts
 */

/**
 * Transaction — representa uma transação financeira local.
 * Usada pelo FinanceContext para gerenciar dados em memória.
 */
export interface Transaction {
  id: string;
  /** 'entrada' = receita, 'saida' = despesa */
  type: 'entrada' | 'saida';
  category: string;
  amount: number;
  description: string;
  /** Data no formato YYYY-MM-DD */
  date: string;
  /** ID do usuário que criou o registro */
  userId: string;
}

/**
 * CashCount — contagem de caixa com notas e moedas físicas.
 * Cada entrada do objeto 'notes' é uma denominação (ex: "R$ 50,00") e a quantidade.
 */
export interface CashCount {
  id: string;
  /** Data da contagem no formato YYYY-MM-DD */
  date: string;
  /** Mapa de denominação → quantidade (ex: { "R$ 50,00": 3 }) */
  notes: {
    [key: string]: number;
  };
  /** Total calculado da contagem */
  total: number;
  userId: string;
}

/**
 * ExpenseCategory — categoria de despesa para classificar transações.
 */
export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  /** Cor em hexadecimal, ex: "#FF6F00" */
  color: string;
  userId: string;
}

/**
 * DailyReport — relatório diário consolidado.
 */
export interface DailyReport {
  id: string;
  date: string;
  entries: number;
  exits: number;
  balance: number;
  cashCount?: CashCount;
  userId: string;
}

/**
 * FinanceContextType — interface do contexto financeiro.
 * Define todas as funções e estados disponíveis via useFinance().
 */
export interface FinanceContextType {
  transactions: Transaction[];
  cashCounts: CashCount[];
  categories: ExpenseCategory[];
  /** Adiciona uma nova transação (entrada ou saída) */
  addTransaction: (transaction: Omit<Transaction, 'id' | 'userId'>) => void;
  /** Atualiza parcialmente uma transação existente pelo ID */
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  /** Remove uma transação pelo ID */
  deleteTransaction: (id: string) => void;
  /** Salva uma contagem de caixa */
  saveCashCount: (cashCount: Omit<CashCount, 'id' | 'userId'>) => void;
  /** Adiciona uma nova categoria de despesa */
  addCategory: (category: Omit<ExpenseCategory, 'id' | 'userId'>) => void;
  /** Atualiza parcialmente uma categoria pelo ID */
  updateCategory: (id: string, category: Partial<ExpenseCategory>) => void;
  /** Remove uma categoria pelo ID */
  deleteCategory: (id: string) => void;
}
