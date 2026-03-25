/**
 * financeiroService.ts
 * ====================
 * O que faz: Serviço de comunicação com a Edge Function fin-api.
 *            Cada função deste arquivo chama uma "action" diferente na Edge Function.
 * Para que serve: Abstrair as chamadas de rede das páginas financeiras.
 *                 As páginas só importam e chamam as funções deste arquivo.
 */
import { post } from "@/lib/api";

// =============================================================================
// TIPOS — definem a forma dos dados que vêm do banco e são usados nas páginas
// =============================================================================

/** Uma transação financeira (receita ou despesa) */
export type Transacao = {
  id: string;
  descricao: string;
  valor: number;
  tipo: "receita" | "despesa";
  data_transacao: string;
  categoria_id?: string;
  observacoes?: string;
  church_totvs_id: string;
  created_at: string;
};

/** Uma categoria para classificar as transações (ex: "Dízimos", "Água") */
export type Categoria = {
  id: string;
  nome: string;
  tipo: "receita" | "despesa";
  cor: string;
  descricao?: string;
};

/** Uma contagem de caixa — registra o dinheiro físico verificado */
export type ContagemCaixa = {
  id: string;
  data_contagem: string;
  saldo_sistema: number;
  saldo_contado: number;
  diferenca: number;
  observacoes?: string;
  status: string;
  created_at: string;
  fin_contagens_caixa_itens?: ItemContagem[];
};

/** Um item dentro de uma contagem (ex: 3 notas de R$50) */
export type ItemContagem = {
  id: string;
  denominacao: string;
  tipo: "nota" | "moeda";
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
};

/** Dados do dashboard financeiro do mês atual */
export type DadosDashboard = {
  total_receitas: string;
  total_despesas: string;
  saldo: string;
  total_transacoes: number;
  mes: number;
  ano: number;
};

// =============================================================================
// FUNÇÕES — cada uma chama a Edge Function com uma action específica
// =============================================================================

/**
 * getDashboard
 * Busca os totais do mês atual: receitas, despesas, saldo e total de transações.
 * Usado na página principal do módulo financeiro.
 */
export async function getDashboard(): Promise<DadosDashboard> {
  const res = await post<{ ok: boolean; data: DadosDashboard }>("fin-api", {
    action: "dashboard",
  });
  return res.data;
}

/**
 * listTransacoes
 * Lista as transações de um mês/ano específico.
 * Se não passar mes e ano, a Edge Function usa o mês atual.
 */
export async function listTransacoes(mes?: number, ano?: number): Promise<Transacao[]> {
  const res = await post<{ ok: boolean; data: Transacao[] }>("fin-api", {
    action: "list-transacoes",
    ...(mes !== undefined && { mes }),
    ...(ano !== undefined && { ano }),
  });
  return res.data;
}

/**
 * saveTransacao
 * Cria ou atualiza uma transação financeira.
 * Se vier "id" no objeto, faz UPDATE; senão, faz INSERT.
 */
export async function saveTransacao(
  data: Omit<Transacao, "id" | "church_totvs_id" | "created_at"> & { id?: string },
): Promise<Transacao> {
  const res = await post<{ ok: boolean; data: Transacao }>("fin-api", {
    action: "save-transacao",
    ...data,
  });
  return res.data;
}

/**
 * deleteTransacao
 * Exclui uma transação pelo ID.
 * Só usuários com role "financeiro" ou "admin" podem chamar isso.
 */
export async function deleteTransacao(id: string): Promise<void> {
  await post("fin-api", { action: "delete-transacao", id });
}

/**
 * listCategorias
 * Lista as categorias ativas da igreja para usar nos formulários.
 */
export async function listCategorias(): Promise<Categoria[]> {
  const res = await post<{ ok: boolean; data: Categoria[] }>("fin-api", {
    action: "list-categorias",
  });
  return res.data;
}

/**
 * saveCategoria
 * Cria ou atualiza uma categoria financeira.
 */
export async function saveCategoria(
  data: Omit<Categoria, "id"> & { id?: string },
): Promise<Categoria> {
  const res = await post<{ ok: boolean; data: Categoria }>("fin-api", {
    action: "save-categoria",
    ...data,
  });
  return res.data;
}

/**
 * saveContagem
 * Salva uma contagem de caixa com todos os seus itens (notas e moedas).
 */
export async function saveContagem(data: {
  data_contagem: string;
  saldo_sistema: number;
  saldo_contado: number;
  observacoes?: string;
  itens: Array<{
    denominacao: string;
    tipo: "nota" | "moeda";
    quantidade: number;
    valor_unitario: number;
  }>;
}): Promise<ContagemCaixa> {
  const res = await post<{ ok: boolean; data: ContagemCaixa }>("fin-api", {
    action: "save-contagem",
    ...data,
  });
  return res.data;
}

/**
 * listContagens
 * Lista as contagens de caixa com seus respectivos itens.
 */
export async function listContagens(): Promise<ContagemCaixa[]> {
  const res = await post<{ ok: boolean; data: ContagemCaixa[] }>("fin-api", {
    action: "list-contagens",
  });
  return res.data;
}

/** Um fechamento mensal — resume o mês financeiro da igreja */
export type FechamentoMensal = {
  id: string;
  ano: number;
  mes: number;
  total_receitas: number;
  total_despesas: number;
  saldo_final_mes: number;
  status: string;
  fechado_em: string;
  responsavel_atual?: string;
};

/**
 * listFechamentos
 * Lista os fechamentos mensais da igreja, do mais recente para o mais antigo.
 * Cada fechamento tem total_receitas, total_despesas e saldo_final_mes do mês.
 */
export async function listFechamentos(): Promise<FechamentoMensal[]> {
  const res = await post<{ ok: boolean; data: FechamentoMensal[] }>("fin-api", {
    action: "list-fechamentos",
  });
  return res.data;
}
