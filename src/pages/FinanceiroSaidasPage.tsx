/**
 * FinanceiroSaidasPage
 * ====================
 * O que faz: Tela de gestão de saídas (despesas) financeiras.
 *            Lista as despesas do mês e permite criar, editar e excluir.
 * Quem acessa: Usuários com role "financeiro"
 */
import { useState } from "react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTransacoes,
  listCategorias,
  saveTransacao,
  deleteTransacao,
  saveCategoria,
  type Transacao,
  type Categoria,
} from "@/services/financeiroService";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, AlertCircle, X, Tag, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MobileFiltersCard } from "@/components/shared/MobileFiltersCard";

// Comentario: formata numero como moeda brasileira
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Comentario: formata data do formato ISO (YYYY-MM-DD) para DD/MM/YYYY
function formatarData(dataIso: string): string {
  if (!dataIso) return "";
  const partes = dataIso.split("-");
  if (partes.length !== 3) return dataIso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Comentario: retorna a data de hoje no formato YYYY-MM-DD
function hojeISO(): string {
  return new Date().toISOString().split("T")[0];
}

// Comentario: estado inicial de um formulário de saída (despesa) vazio
function salidaVazia(): Omit<Transacao, "id" | "church_totvs_id" | "created_at"> & { id?: string } {
  return {
    descricao: "",
    valor: 0,
    tipo: "despesa",
    data_transacao: hojeISO(),
    categoria_id: undefined,
    observacoes: "",
  };
}

// Comentario: estado inicial de um formulário de categoria vazio
function categoriaVazia(): Omit<Categoria, "id"> & { id?: string } {
  return {
    nome: "",
    tipo: "despesa",
    cor: "#EF4444",
    descricao: "",
  };
}

export default function FinanceiroSaidasPage() {
  const queryClient = useQueryClient();

  // Comentario: mes e ano selecionados para filtro da lista (começa com o mes atual)
  const agora = new Date();
  const [mesFiltro, setMesFiltro] = useState(agora.getMonth() + 1);
  const [anoFiltro, setAnoFiltro] = useState(agora.getFullYear());

  // Comentario: estado do modal de saída (despesa)
  const [modalSaidaAberto, setModalSaidaAberto] = useState(false);
  const [formSaida, setFormSaida] = useState(salidaVazia());

  // Comentario: estado do modal de categoria
  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false);
  const [formCategoria, setFormCategoria] = useState(categoriaVazia());

  // Comentario: busca a lista de transações do mês selecionado
  const {
    data: transacoes = [],
    isLoading: carregandoTransacoes,
    isError: erroTransacoes,
  } = useQuery({
    queryKey: ["fin-transacoes", mesFiltro, anoFiltro],
    queryFn: () => listTransacoes(mesFiltro, anoFiltro),
  });

  // Comentario: busca as categorias para preencher o select do formulário
  const { data: categorias = [] } = useQuery({
    queryKey: ["fin-categorias"],
    queryFn: listCategorias,
  });

  // Comentario: filtra para mostrar apenas despesas na tabela
  const despesas = transacoes.filter((t) => t.tipo === "despesa");

  // Comentario: soma o total de despesas do mês
  const totalDespesas = despesas.reduce((acc, t) => acc + Number(t.valor), 0);

  // =============================================================================
  // MUTATIONS — operações de escrita no banco
  // =============================================================================

  // Comentario: salva (cria ou atualiza) uma despesa
  const salvarSaidaMutation = useMutation({
    mutationFn: saveTransacao,
    onSuccess: () => {
      toast.success(formSaida.id ? "Saída atualizada!" : "Saída cadastrada!");
      setModalSaidaAberto(false);
      setFormSaida(salidaVazia());
      void queryClient.invalidateQueries({ queryKey: ["fin-transacoes"] });
      void queryClient.invalidateQueries({ queryKey: ["financeiro-dashboard"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  // Comentario: exclui uma despesa por ID
  const deletarSaidaMutation = useMutation({
    mutationFn: deleteTransacao,
    onSuccess: () => {
      toast.success("Saída excluída!");
      void queryClient.invalidateQueries({ queryKey: ["fin-transacoes"] });
      void queryClient.invalidateQueries({ queryKey: ["financeiro-dashboard"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao excluir: ${err.message}`);
    },
  });

  // Comentario: salva uma nova categoria
  const salvarCategoriaMutation = useMutation({
    mutationFn: saveCategoria,
    onSuccess: () => {
      toast.success("Categoria salva!");
      setModalCategoriaAberto(false);
      setFormCategoria(categoriaVazia());
      void queryClient.invalidateQueries({ queryKey: ["fin-categorias"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar categoria: ${err.message}`);
    },
  });

  // =============================================================================
  // HANDLERS — funções de interação do usuário
  // =============================================================================

  // Comentario: abre o modal para criar uma nova saída
  function abrirNovaSaida() {
    setFormSaida(salidaVazia());
    setModalSaidaAberto(true);
  }

  // Comentario: abre o modal preenchido para editar uma saída existente
  function abrirEditarSaida(t: Transacao) {
    setFormSaida({
      id: t.id,
      descricao: t.descricao,
      valor: t.valor,
      tipo: "despesa",
      data_transacao: t.data_transacao,
      categoria_id: t.categoria_id,
      observacoes: t.observacoes || "",
    });
    setModalSaidaAberto(true);
  }

  // Comentario: confirma a exclusão com uma mensagem para o usuário
  function confirmarDeletar(id: string, descricao: string) {
    if (window.confirm(`Excluir a saída "${descricao}"? Esta ação não pode ser desfeita.`)) {
      deletarSaidaMutation.mutate(id);
    }
  }

  // Comentario: salva o formulário de saída — valida os campos obrigatorios
  function handleSalvarSaida() {
    if (!formSaida.descricao.trim()) {
      toast.error("Informe a descrição da saída.");
      return;
    }
    if (!formSaida.valor || formSaida.valor <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (!formSaida.data_transacao) {
      toast.error("Informe a data.");
      return;
    }
    salvarSaidaMutation.mutate(formSaida);
  }

  // Comentario: salva o formulário de categoria
  function handleSalvarCategoria() {
    if (!formCategoria.nome.trim()) {
      toast.error("Informe o nome da categoria.");
      return;
    }
    salvarCategoriaMutation.mutate(formCategoria);
  }

  // Comentario: helper para achar o nome da categoria pelo ID
  function nomeDaCategoria(categoriaId?: string): string {
    if (!categoriaId) return "—";
    const cat = categorias.find((c) => c.id === categoriaId);
    return cat?.nome ?? "—";
  }

  // Comentario: anos disponíveis para o filtro (3 anos para trás e o atual)
  const anosDisponiveis = [anoFiltro - 2, anoFiltro - 1, anoFiltro, anoFiltro + 1];

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        {/* Cabeçalho — card com fundo vermelho */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-600 px-6 py-5 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Saídas</h1>
            <p className="text-red-100">Gerencie as despesas da sua igreja</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Botão: Nova Categoria */}
            <Button
              variant="outline"
              onClick={() => {
                setFormCategoria(categoriaVazia());
                setModalCategoriaAberto(true);
              }}
              className="border-white text-white hover:bg-red-700 hover:text-white bg-transparent"
            >
              <Tag className="mr-2 h-4 w-4" />
              Nova Categoria
            </Button>
            {/* Botão: Nova Saída */}
            <Button onClick={abrirNovaSaida} className="bg-white text-red-700 hover:bg-red-50 font-semibold">
              <Plus className="mr-2 h-4 w-4" />
              Nova Saída
            </Button>
          </div>
        </div>

        <MobileFiltersCard
          title="Filtros de sa?das"
          description="Escolha o m?s e o ano para listar as despesas."
          headerRight={!carregandoTransacoes ? <span className="text-sm font-semibold text-red-700">Total: {formatarMoeda(totalDespesas)}</span> : null}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Filtrar por per?odo:</span>
            <select
              value={mesFiltro}
              onChange={(e) => setMesFiltro(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {["Janeiro","Fevereiro","Mar?o","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((nome, i) => (
                <option key={i + 1} value={i + 1}>{nome}</option>
              ))}
            </select>
            <select
              value={anoFiltro}
              onChange={(e) => setAnoFiltro(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>{ano}</option>
              ))}
            </select>
            {!carregandoTransacoes && (
              <span className="text-sm font-semibold text-red-700 md:hidden">
                Total: {formatarMoeda(totalDespesas)}
              </span>
            )}
          </div>
        </MobileFiltersCard>

        {/* Card de total do mês — fundo vermelho */}
        {!carregandoTransacoes && despesas.length > 0 && (
          <div className="rounded-xl bg-red-500 p-5 shadow-md text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-100">Total de Saídas do Mês</p>
                <p className="mt-1 text-2xl font-bold">{formatarMoeda(totalDespesas)}</p>
              </div>
              <div className="rounded-full bg-red-400 bg-opacity-50 p-3">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="mt-2 text-xs text-red-100">{despesas.length} despesa(s) registrada(s)</p>
          </div>
        )}

        {/* Mensagem de erro */}
        {erroTransacoes && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>Erro ao carregar as saídas. Tente novamente.</span>
          </div>
        )}

        {/* Tabela de despesas */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {carregandoTransacoes ? (
            <div className="flex items-center justify-center gap-2 p-10 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando saídas...</span>
            </div>
          ) : despesas.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <p className="text-base font-medium">Nenhuma saída registrada neste período.</p>
              <p className="mt-1 text-sm">Clique em "Nova Saída" para adicionar.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-3 font-semibold text-slate-600">Data</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Descrição</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Categoria</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Valor</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{formatarData(t.data_transacao)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {t.descricao}
                        {t.observacoes && (
                          <p className="text-xs font-normal text-slate-400">{t.observacoes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{nomeDaCategoria(t.categoria_id)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-700">
                        {formatarMoeda(Number(t.valor))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Botão editar */}
                          <button
                            onClick={() => abrirEditarSaida(t)}
                            className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {/* Botão excluir */}
                          <button
                            onClick={() => confirmarDeletar(t.id, t.descricao)}
                            disabled={deletarSaidaMutation.isPending}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Rodapé com total */}
                <tfoot>
                  <tr className="bg-red-50">
                    <td colSpan={3} className="px-4 py-3 font-semibold text-slate-700">Total do Período</td>
                    <td className="px-4 py-3 text-right font-bold text-red-700">{formatarMoeda(totalDespesas)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          MODAL: Nova/Editar Saída
          ===================================================================== */}
      <Dialog open={modalSaidaAberto} onOpenChange={setModalSaidaAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{formSaida.id ? "Editar Saída" : "Nova Saída"}</DialogTitle>
            <DialogDescription>
              {formSaida.id ? "Atualize os dados da despesa." : "Preencha os dados da nova despesa."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Descrição */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Descrição *
              </label>
              <input
                type="text"
                value={formSaida.descricao}
                onChange={(e) => setFormSaida((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex: Conta de água"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Valor e Data na mesma linha */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Valor (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formSaida.valor || ""}
                  onChange={(e) => setFormSaida((p) => ({ ...p, valor: parseFloat(e.target.value) || 0 }))}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Data *
                </label>
                <input
                  type="date"
                  value={formSaida.data_transacao}
                  onChange={(e) => setFormSaida((p) => ({ ...p, data_transacao: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Categoria */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Categoria
              </label>
              <select
                value={formSaida.categoria_id || ""}
                onChange={(e) => setFormSaida((p) => ({ ...p, categoria_id: e.target.value || undefined }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Sem categoria</option>
                {categorias
                  .filter((c) => c.tipo === "despesa")
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
              </select>
            </div>

            {/* Observações */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Observações
              </label>
              <textarea
                value={formSaida.observacoes || ""}
                onChange={(e) => setFormSaida((p) => ({ ...p, observacoes: e.target.value }))}
                placeholder="Opcional..."
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Botões do modal */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalSaidaAberto(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarSaida}
                disabled={salvarSaidaMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {salvarSaidaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {formSaida.id ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          MODAL: Nova Categoria
          ===================================================================== */}
      <Dialog open={modalCategoriaAberto} onOpenChange={setModalCategoriaAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
            <DialogDescription>Crie uma categoria para organizar as despesas.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nome */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nome *
              </label>
              <input
                type="text"
                value={formCategoria.nome}
                onChange={(e) => setFormCategoria((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Contas fixas"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Tipo
              </label>
              <select
                value={formCategoria.tipo}
                onChange={(e) => setFormCategoria((p) => ({ ...p, tipo: e.target.value as "receita" | "despesa" }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>

            {/* Cor */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Cor da categoria
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formCategoria.cor}
                  onChange={(e) => setFormCategoria((p) => ({ ...p, cor: e.target.value }))}
                  className="h-9 w-14 cursor-pointer rounded border border-slate-300"
                />
                <span className="text-sm text-slate-500">{formCategoria.cor}</span>
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Descrição
              </label>
              <input
                type="text"
                value={formCategoria.descricao || ""}
                onChange={(e) => setFormCategoria((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Opcional..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalCategoriaAberto(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button
                onClick={handleSalvarCategoria}
                disabled={salvarCategoriaMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {salvarCategoriaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Categoria
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
