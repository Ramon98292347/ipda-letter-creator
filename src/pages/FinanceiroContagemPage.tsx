/**
 * FinanceiroContagemPage
 * ======================
 * O que faz: Tela de contagem de caixa.
 *            O usuário informa quantas notas e moedas tem em mãos,
 *            o sistema calcula o total e salva no banco.
 * Quem acessa: Usuários com role "financeiro"
 */
import { useState, useMemo } from "react";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { useMutation } from "@tanstack/react-query";
import { saveContagem } from "@/services/financeiroService";
import { toast } from "sonner";
import { Loader2, Calculator, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// CONFIGURAÇÃO DAS NOTAS E MOEDAS
// =============================================================================

// Comentario: lista de todas as notas do Real Brasileiro
const NOTAS = [
  { denominacao: "R$200", valor_unitario: 200, tipo: "nota" as const },
  { denominacao: "R$100", valor_unitario: 100, tipo: "nota" as const },
  { denominacao: "R$50", valor_unitario: 50, tipo: "nota" as const },
  { denominacao: "R$20", valor_unitario: 20, tipo: "nota" as const },
  { denominacao: "R$10", valor_unitario: 10, tipo: "nota" as const },
  { denominacao: "R$5", valor_unitario: 5, tipo: "nota" as const },
  { denominacao: "R$2", valor_unitario: 2, tipo: "nota" as const },
];

// Comentario: lista de todas as moedas do Real Brasileiro
const MOEDAS = [
  { denominacao: "R$1", valor_unitario: 1, tipo: "moeda" as const },
  { denominacao: "R$0,50", valor_unitario: 0.5, tipo: "moeda" as const },
  { denominacao: "R$0,25", valor_unitario: 0.25, tipo: "moeda" as const },
  { denominacao: "R$0,10", valor_unitario: 0.1, tipo: "moeda" as const },
  { denominacao: "R$0,05", valor_unitario: 0.05, tipo: "moeda" as const },
  { denominacao: "R$0,01", valor_unitario: 0.01, tipo: "moeda" as const },
];

// Comentario: lista com todos os itens (notas + moedas) para gerar o estado inicial
const TODOS_ITENS = [...NOTAS, ...MOEDAS];

// Comentario: tipo para armazenar a quantidade de cada denominação
type QuantidadesMap = Record<string, number>;

// Comentario: formata numero como moeda brasileira
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Comentario: retorna a data de hoje no formato YYYY-MM-DD para o input date
function hojeISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function FinanceiroContagemPage() {
  // Comentario: estado para a data da contagem (começa com hoje)
  const [dataContagem, setDataContagem] = useState(hojeISO());

  // Comentario: estado para as observações gerais
  const [observacoes, setObservacoes] = useState("");

  // Comentario: estado para o saldo que está no sistema (para comparar com o contado)
  const [saldoSistema, setSaldoSistema] = useState("");

  // Comentario: estado para as quantidades de cada nota/moeda
  // Começa com zero para todas as denominações
  const [quantidades, setQuantidades] = useState<QuantidadesMap>(() =>
    Object.fromEntries(TODOS_ITENS.map((item) => [item.denominacao, 0])),
  );

  // Comentario: campos extras — valores digitados em reais
  const [dizimosOcte, setDizimosOcte] = useState("");
  const [dizimosDinheiro, setDizimosDinheiro] = useState("");
  const [ofertasOcte, setOfertasOcte] = useState("");
  const [ofertasMissionarias, setOfertasMissionarias] = useState("");

  // Comentario: calcula o total de notas e moedas contadas
  const totalContado = useMemo(() => {
    let total = 0;
    for (const item of TODOS_ITENS) {
      const qtd = quantidades[item.denominacao] || 0;
      total += qtd * item.valor_unitario;
    }
    // Comentario: soma os valores extras digitados
    total += parseFloat(dizimosOcte || "0") || 0;
    total += parseFloat(dizimosDinheiro || "0") || 0;
    total += parseFloat(ofertasOcte || "0") || 0;
    total += parseFloat(ofertasMissionarias || "0") || 0;
    return total;
  }, [quantidades, dizimosOcte, dizimosDinheiro, ofertasOcte, ofertasMissionarias]);

  // Comentario: diferença entre o contado e o sistema
  const saldoSistemaNum = parseFloat(saldoSistema || "0") || 0;
  const diferenca = totalContado - saldoSistemaNum;

  // Comentario: atualiza a quantidade de uma denominação específica
  function handleQuantidade(denominacao: string, valor: string) {
    const num = parseInt(valor, 10);
    setQuantidades((prev) => ({
      ...prev,
      [denominacao]: isNaN(num) || num < 0 ? 0 : num,
    }));
  }

  // Comentario: mutation para salvar a contagem no banco
  const salvarMutation = useMutation({
    mutationFn: saveContagem,
    onSuccess: () => {
      toast.success("Contagem salva com sucesso!");
      // Comentario: limpa o formulário após salvar
      setQuantidades(Object.fromEntries(TODOS_ITENS.map((item) => [item.denominacao, 0])));
      setObservacoes("");
      setSaldoSistema("");
      setDizimosOcte("");
      setDizimosDinheiro("");
      setOfertasOcte("");
      setOfertasMissionarias("");
      setDataContagem(hojeISO());
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  // Comentario: monta os itens que serão enviados para a Edge Function
  function handleSalvar() {
    if (!dataContagem) {
      toast.error("Informe a data da contagem.");
      return;
    }

    // Comentario: inclui apenas itens com quantidade > 0 para não poluir o banco
    const itensFisicos = TODOS_ITENS.filter((item) => (quantidades[item.denominacao] || 0) > 0).map((item) => ({
      denominacao: item.denominacao,
      tipo: item.tipo,
      quantidade: quantidades[item.denominacao],
      valor_unitario: item.valor_unitario,
    }));

    // Comentario: adiciona os campos extras como itens especiais de receita
    const itensExtras: Array<{ denominacao: string; tipo: "nota" | "moeda"; quantidade: number; valor_unitario: number }> = [];
    if (parseFloat(dizimosOcte || "0") > 0)
      itensExtras.push({ denominacao: "Dízimos OCTe/Cartão/Pix", tipo: "nota", quantidade: 1, valor_unitario: parseFloat(dizimosOcte) });
    if (parseFloat(dizimosDinheiro || "0") > 0)
      itensExtras.push({ denominacao: "Dízimos em Dinheiro", tipo: "nota", quantidade: 1, valor_unitario: parseFloat(dizimosDinheiro) });
    if (parseFloat(ofertasOcte || "0") > 0)
      itensExtras.push({ denominacao: "Ofertas OCTe/Cartão/Pix", tipo: "nota", quantidade: 1, valor_unitario: parseFloat(ofertasOcte) });
    if (parseFloat(ofertasMissionarias || "0") > 0)
      itensExtras.push({ denominacao: "Ofertas Missionárias", tipo: "nota", quantidade: 1, valor_unitario: parseFloat(ofertasMissionarias) });

    salvarMutation.mutate({
      data_contagem: dataContagem,
      saldo_sistema: saldoSistemaNum,
      saldo_contado: totalContado,
      observacoes: observacoes || undefined,
      itens: [...itensFisicos, ...itensExtras],
    });
  }

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">
        {/* Cabeçalho — card com fundo azul escuro #1A237E */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#1A237E] px-6 py-5 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Contagem de Caixa</h1>
            <p className="text-blue-200">Registre as notas e moedas físicas do caixa</p>
          </div>
          <Button
            onClick={handleSalvar}
            disabled={salvarMutation.isPending}
            className="bg-white text-[#1A237E] hover:bg-blue-50 font-semibold"
          >
            {salvarMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Contagem
          </Button>
        </div>

        {/* Dados gerais */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
            <Calculator className="h-4 w-4 text-blue-600" />
            Dados da Contagem
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Data */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Data da Contagem *
              </label>
              <input
                type="date"
                value={dataContagem}
                onChange={(e) => setDataContagem(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Saldo sistema */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Saldo do Sistema (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={saldoSistema}
                onChange={(e) => setSaldoSistema(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Observações */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Observações
              </label>
              <input
                type="text"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Opcional..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Grade de notas */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Notas</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {NOTAS.map((item) => {
              const qtd = quantidades[item.denominacao] || 0;
              const subtotal = qtd * item.valor_unitario;
              return (
                <div
                  key={item.denominacao}
                  className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-3 gap-2"
                >
                  {/* Comentario: valor da nota em destaque */}
                  <span className="text-sm font-bold text-slate-700">{item.denominacao}</span>
                  <input
                    type="number"
                    min="0"
                    value={qtd === 0 ? "" : qtd}
                    onChange={(e) => handleQuantidade(item.denominacao, e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {/* Comentario: subtotal da nota (quantidade * valor) */}
                  <span className="text-xs text-slate-500">{formatarMoeda(subtotal)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grade de moedas */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Moedas</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {MOEDAS.map((item) => {
              const qtd = quantidades[item.denominacao] || 0;
              const subtotal = qtd * item.valor_unitario;
              return (
                <div
                  key={item.denominacao}
                  className="flex flex-col items-center rounded-lg border border-amber-200 bg-amber-50 p-3 gap-2"
                >
                  <span className="text-sm font-bold text-amber-700">{item.denominacao}</span>
                  <input
                    type="number"
                    min="0"
                    value={qtd === 0 ? "" : qtd}
                    onChange={(e) => handleQuantidade(item.denominacao, e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-amber-300 px-2 py-1.5 text-center text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="text-xs text-amber-600">{formatarMoeda(subtotal)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Campos extras de receitas */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            Receitas Adicionais
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Dízimos OCTe/Cartão/Pix (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dizimosOcte}
                onChange={(e) => setDizimosOcte(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Dízimos em Dinheiro (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dizimosDinheiro}
                onChange={(e) => setDizimosDinheiro(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ofertas OCTe/Cartão/Pix (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ofertasOcte}
                onChange={(e) => setOfertasOcte(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ofertas Missionárias (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={ofertasMissionarias}
                onChange={(e) => setOfertasMissionarias(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Resumo do total — cards com fundo colorido */}
        <div className="rounded-xl bg-slate-100 p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-700">Resumo da Contagem</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Total contado — fundo azul escuro */}
            <div className="rounded-xl bg-[#1A237E] p-4 text-center shadow-md">
              <p className="text-sm font-medium text-blue-200">Total Contado</p>
              <p className="mt-1 text-2xl font-bold text-white">{formatarMoeda(totalContado)}</p>
            </div>

            {/* Saldo sistema — fundo cinza */}
            <div className="rounded-xl bg-slate-600 p-4 text-center shadow-md">
              <p className="text-sm font-medium text-slate-300">Saldo do Sistema</p>
              <p className="mt-1 text-2xl font-bold text-white">{formatarMoeda(saldoSistemaNum)}</p>
            </div>

            {/* Diferença — verde (ok), amarelo (sobra) ou vermelho (falta) */}
            <div
              className={`rounded-xl p-4 text-center shadow-md ${
                diferenca === 0 ? "bg-green-600" : diferenca > 0 ? "bg-yellow-500" : "bg-red-600"
              }`}
            >
              <p className="text-sm font-medium text-white text-opacity-80">Diferença</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {diferenca >= 0 ? "+" : ""}{formatarMoeda(diferenca)}
              </p>
              {/* Comentario: mensagem explicando o status da diferença */}
              <p className="mt-1 text-xs text-white text-opacity-80">
                {diferenca === 0 ? "Caixa conferido!" : diferenca > 0 ? "Sobra no caixa" : "Falta no caixa"}
              </p>
            </div>
          </div>
        </div>

        {/* Botão de salvar no final (repetido para facilitar) */}
        <div className="flex justify-end">
          <Button
            onClick={handleSalvar}
            disabled={salvarMutation.isPending}
            className="bg-[#1A237E] hover:bg-[#0D47A1] text-white"
            size="lg"
          >
            {salvarMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Contagem
          </Button>
        </div>
      </div>
    </ManagementShell>
  );
}
