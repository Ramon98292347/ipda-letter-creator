import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ManagementShell } from "@/components/layout/ManagementShell";
import {
  TrendingUp, TrendingDown, DollarSign, Calendar,
  ArrowUpRight, ArrowDownRight, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { listFechamentos, listContagens } from "@/services/financeiroService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Comentario: nomes dos meses em portugues para exibir no filtro
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

// Comentario: chave unica para identificar um fechamento pelo ano e mes
function fechamentoKey(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export default function FinanceiroDashboardPage() {
  const navigate = useNavigate();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const today = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;

  // Comentario: filtro selecionado no formato "YYYY-MM" — inicia no mes atual
  const [filtroMes, setFiltroMes] = useState(fechamentoKey(currentYear, currentMonth));

  // Comentario: busca todos os fechamentos mensais (Total Entradas vem de total_receitas)
  const { data: fechamentos = [], isLoading: loadingFechamentos } = useQuery({
    queryKey: ["financeiro-dashboard-fechamentos"],
    queryFn: listFechamentos,
    staleTime: 2 * 60 * 1000,
  });

  // Comentario: contagens para calcular entradas do dia atual
  const { data: contagens = [], isLoading: loadingContagens } = useQuery({
    queryKey: ["financeiro-dashboard-contagens"],
    queryFn: listContagens,
    staleTime: 2 * 60 * 1000,
  });

  // Comentario: opcoes de mes para o Select — gerado a partir dos fechamentos existentes
  const opcoesMes = useMemo(() => {
    const set = new Set<string>();
    // Sempre inclui o mes atual mesmo que nao haja fechamento ainda
    set.add(fechamentoKey(currentYear, currentMonth));
    fechamentos.forEach((f) => set.add(fechamentoKey(f.ano, f.mes)));
    return Array.from(set).sort().reverse(); // mais recente primeiro
  }, [fechamentos, currentYear, currentMonth]);

  // Comentario: encontra o fechamento do mes selecionado
  const fechamentoSelecionado = useMemo(() => {
    const [ano, mes] = filtroMes.split("-").map(Number);
    return fechamentos.find((f) => f.ano === ano && f.mes === mes) || null;
  }, [fechamentos, filtroMes]);

  // Comentario: total do dia vem das contagens registradas hoje
  const totalEntradasHoje = useMemo(() => {
    return contagens
      .filter((c) => c.data_contagem === today)
      .reduce((sum, c) => sum + Number(c.saldo_contado || 0), 0);
  }, [contagens, today]);

  // Comentario: valores do mes selecionado — usa o fechamento se existir, senao mostra zeros
  const totalEntradas = Number(fechamentoSelecionado?.total_receitas || 0);
  const totalSaidas = Number(fechamentoSelecionado?.total_despesas || 0);
  const saldoMes = Number(fechamentoSelecionado?.saldo_final_mes || 0);

  // Comentario: nome legivel do mes selecionado para mostrar no subtitulo
  const [anoFiltro, mesFiltro] = filtroMes.split("-").map(Number);
  const nomeMesSelecionado = `${MESES[mesFiltro - 1]} ${anoFiltro}`;

  const loading = loadingFechamentos || loadingContagens;

  return (
    <ManagementShell roleMode="financeiro">
      <div className="space-y-6">

        {/* ── Cabeçalho + Filtro de Mês ──────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h1>
            <p className="text-gray-600">Visão geral das finanças — {nomeMesSelecionado}</p>
          </div>

          {/* Comentario: filtro por mes — carregado dos fechamentos existentes */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <Select value={filtroMes} onValueChange={setFiltroMes}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecionar mês" />
              </SelectTrigger>
              <SelectContent>
                {opcoesMes.map((key) => {
                  const [a, m] = key.split("-").map(Number);
                  return (
                    <SelectItem key={key} value={key}>
                      {MESES[m - 1]} {a}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Aviso se não há fechamento para o mês ─────────────────── */}
        {!loading && !fechamentoSelecionado && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Nenhum fechamento registrado para <b>{nomeMesSelecionado}</b>. Os valores abaixo são R$ 0,00.
          </div>
        )}

        {/* ── Cards principais ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

          {/* Total Entradas — vem de total_receitas do fin_fechamentos_mensais */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Entradas</p>
                {loading
                  ? <Loader2 className="mt-1 h-6 w-6 animate-spin text-slate-400" />
                  : <p className="text-2xl font-bold text-green-600">R$ {formatCurrency(totalEntradas)}</p>
                }
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-sm">
              <ArrowUpRight className="h-4 w-4 text-green-500" />
              <span className="text-green-600">Fechamento de {nomeMesSelecionado}</span>
            </div>
          </div>

          {/* Total Saídas */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Saídas</p>
                {loading
                  ? <Loader2 className="mt-1 h-6 w-6 animate-spin text-slate-400" />
                  : <p className="text-2xl font-bold text-red-600">R$ {formatCurrency(totalSaidas)}</p>
                }
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-100">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-sm">
              <ArrowDownRight className="h-4 w-4 text-red-500" />
              <span className="text-red-600">Despesas do mês</span>
            </div>
          </div>

          {/* Saldo do Mês */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Saldo do Mês</p>
                {loading
                  ? <Loader2 className="mt-1 h-6 w-6 animate-spin text-slate-400" />
                  : <p className={`text-2xl font-bold ${saldoMes >= 0 ? "text-green-600" : "text-red-600"}`}>
                      R$ {formatCurrency(saldoMes)}
                    </p>
                }
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100">
                <DollarSign className="h-5 w-5 text-[#1A237E]" />
              </div>
            </div>
            <div className="mt-3 text-sm">
              <span className={saldoMes >= 0 ? "text-green-600" : "text-red-600"}>
                {saldoMes >= 0 ? "Saldo positivo" : "Saldo negativo"}
              </span>
            </div>
          </div>

          {/* Caixa Hoje */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Caixa Hoje</p>
                {loading
                  ? <Loader2 className="mt-1 h-6 w-6 animate-spin text-slate-400" />
                  : <p className="text-2xl font-bold text-[#1A237E]">R$ {formatCurrency(totalEntradasHoje)}</p>
                }
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100">
                <Calendar className="h-5 w-5 text-[#1A237E]" />
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-600">
              {totalEntradasHoje > 0 ? "Contagens de hoje" : "Nenhuma entrada hoje"}
            </div>
          </div>
        </div>

        {/* ── Histórico de fechamentos ───────────────────────────────── */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Histórico de Fechamentos</h3>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : fechamentos.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">Nenhum fechamento registrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-slate-600">
                    <th className="px-3 py-2 font-semibold">Mês / Ano</th>
                    <th className="px-3 py-2 font-semibold text-green-700">Entradas</th>
                    <th className="px-3 py-2 font-semibold text-red-700">Saídas</th>
                    <th className="px-3 py-2 font-semibold">Saldo Final</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {fechamentos.map((f) => (
                    <tr
                      key={f.id}
                      className={`cursor-pointer border-b transition-colors hover:bg-slate-50 ${fechamentoKey(f.ano, f.mes) === filtroMes ? "bg-blue-50" : ""}`}
                      onClick={() => setFiltroMes(fechamentoKey(f.ano, f.mes))}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {MESES[f.mes - 1]} {f.ano}
                      </td>
                      <td className="px-3 py-2 font-semibold text-green-700">
                        R$ {formatCurrency(Number(f.total_receitas))}
                      </td>
                      <td className="px-3 py-2 font-semibold text-red-700">
                        R$ {formatCurrency(Number(f.total_despesas))}
                      </td>
                      <td className={`px-3 py-2 font-semibold ${Number(f.saldo_final_mes) >= 0 ? "text-green-700" : "text-red-700"}`}>
                        R$ {formatCurrency(Number(f.saldo_final_mes))}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${f.status === "fechado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {f.status === "fechado" ? "Fechado" : "Aberto"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{f.responsavel_atual || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Ações Rápidas ─────────────────────────────────────────── */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-gray-900">Ações Rápidas</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              onClick={() => navigate("/financeiro/contagem")}
              className="rounded-lg bg-[#1A237E] p-4 text-white transition-colors hover:bg-[#0D47A1]"
            >
              <Calendar className="mx-auto mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Contagem do Dia</span>
            </button>
            <button
              onClick={() => navigate("/financeiro/saidas")}
              className="rounded-lg bg-red-600 p-4 text-white transition-colors hover:bg-red-700"
            >
              <TrendingDown className="mx-auto mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Nova Saída</span>
            </button>
            <button
              onClick={() => navigate("/financeiro/ficha")}
              className="rounded-lg bg-green-600 p-4 text-white transition-colors hover:bg-green-700"
            >
              <DollarSign className="mx-auto mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Ficha Diária</span>
            </button>
            <button
              onClick={() => navigate("/financeiro/relatorios")}
              className="rounded-lg bg-gray-600 p-4 text-white transition-colors hover:bg-gray-700"
            >
              <TrendingUp className="mx-auto mb-2 h-6 w-6" />
              <span className="text-sm font-medium">Relatórios</span>
            </button>
          </div>
        </div>

      </div>
    </ManagementShell>
  );
}
