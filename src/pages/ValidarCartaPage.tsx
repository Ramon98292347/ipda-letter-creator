import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Loader2,
  RefreshCcw,
  User,
  Church,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Hash,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import { ReceiptModal } from "@/components/public/ReceiptModal";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface LetterData {
  id: string;
  preacher_name: string;
  minister_role: string;
  church_origin: string;
  church_destination: string;
  preach_date: string;
  preach_period: string;
  created_at: string;
  status: string;
}

interface MemberData {
  id: string | null;
  full_name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface VerifyResponse {
  success: boolean;
  valid: boolean;
  status: string | null;
  message?: string;
  letter?: LetterData;
  member?: MemberData;
  ficha_url?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | undefined | null): string {
  if (!iso) return "-";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function churchNameOnly(text: string): string {
  const idx = text.indexOf(" - ");
  return idx >= 0 ? text.slice(idx + 3).trim() : text.trim();
}

const SUPABASE_FUNC_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "") +
  "/functions/v1/public-verify-letter";

// ─── Componentes de UI simples ───────────────────────────────────────────────

function Field({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  if (!value || value === "-") return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/10 last:border-0">
      <div className="mt-0.5 flex-shrink-0">
        <Icon className="h-4 w-4 text-white/60" />
      </div>
      <div>
        <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

type PageState = "idle" | "loading" | "valid" | "invalid" | "error";

export default function ValidarCartaPage() {
  const [searchParams] = useSearchParams();
  const letterId = searchParams.get("id") || "";

  const [state, setState] = useState<PageState>("idle");
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const verify = useCallback(async () => {
    if (!letterId) {
      setState("invalid");
      setErrorMsg("Nenhum ID de carta foi informado na URL.");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`${SUPABASE_FUNC_URL}?id=${encodeURIComponent(letterId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: VerifyResponse = await res.json();
      setData(json);
      setState(json.success && json.valid ? "valid" : "invalid");
    } catch (e) {
      setState("error");
      setErrorMsg(String(e));
    }
  }, [letterId]);

  useEffect(() => {
    verify();
  }, [verify]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      {/* Google Font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
      />
      <style>{`* { font-family: 'Inter', sans-serif; }`}</style>

      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 flex items-center gap-3">
          <div className="flex-shrink-0 rounded-xl bg-blue-500/20 border border-blue-400/30 p-2.5">
            <ShieldCheck className="h-5 w-5 text-blue-300" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">
              Verificação de Carta de Pregação
            </h1>
            <p className="text-xs text-blue-200/70 mt-0.5">
              Confirmação pública de autenticidade · IPDA
            </p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-4 sm:px-6 py-10">
        <div className="w-full max-w-2xl space-y-4">

          {/* ── LOADING ── */}
          {state === "loading" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-10 text-center shadow-2xl">
              <Loader2 className="h-12 w-12 text-blue-400 animate-spin mx-auto mb-4" />
              <p className="text-white font-semibold text-lg">Verificando autenticidade...</p>
              <p className="text-blue-200/60 text-sm mt-1">Consultando o sistema IPDA</p>
            </div>
          )}

          {/* ── ERRO DE CONEXÃO ── */}
          {state === "error" && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl p-8 text-center shadow-2xl">
              <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <p className="text-white font-bold text-xl mb-1">Erro de Conexão</p>
              <p className="text-red-200/80 text-sm mb-6">
                Não foi possível consultar o servidor. Verifique sua conexão e tente novamente.
              </p>
              <button
                onClick={verify}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-semibold text-sm transition-all active:scale-95"
              >
                <RefreshCcw className="h-4 w-4" />
                Tentar novamente
              </button>
            </div>
          )}

          {/* ── CARTA INVÁLIDA ── */}
          {state === "invalid" && (
            <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-900/40 to-red-800/20 backdrop-blur-xl overflow-hidden shadow-2xl">
              <div className="bg-red-500/20 border-b border-red-500/30 px-6 py-5 flex items-center gap-4">
                <div className="rounded-full bg-red-500/30 p-3 border border-red-400/40">
                  <ShieldX className="h-7 w-7 text-red-300" />
                </div>
                <div>
                  <span className="block text-xs font-bold tracking-[0.2em] text-red-300 uppercase mb-1">
                    Carta Inválida
                  </span>
                  <h2 className="text-xl font-black text-white">INVÁLIDA</h2>
                </div>
              </div>
              <div className="px-6 py-6">
                <p className="text-red-200/90 text-sm leading-relaxed">
                  {data?.message ||
                    errorMsg ||
                    "Não foi possível confirmar a autenticidade desta carta em nosso sistema. Verifique se o QR Code está correto ou entre em contato com a secretaria."}
                </p>
                {letterId && (
                  <p className="mt-4 text-xs text-red-300/50 font-mono">ID: {letterId}</p>
                )}
              </div>
            </div>
          )}

          {/* ── CARTA VÁLIDA ── */}
          {state === "valid" && data?.letter && (
            <>
              {/* Card principal – Verde */}
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 backdrop-blur-xl overflow-hidden shadow-2xl">
                {/* Cabeçalho com badge de autenticidade */}
                <div className="bg-emerald-500/20 border-b border-emerald-500/30 px-6 py-5 flex items-center gap-4">
                  <div className="rounded-full bg-emerald-500/30 p-3 border border-emerald-400/40">
                    <ShieldCheck className="h-7 w-7 text-emerald-300" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold tracking-[0.2em] text-emerald-300 uppercase mb-1">
                      Carta Autêntica
                    </span>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-white">AUTÊNTICA</h2>
                      <span className="rounded-full bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold px-2.5 py-0.5">
                        {data.letter.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-2">
                  <p className="text-emerald-200/70 text-xs py-3 border-b border-white/10">
                    Esta carta foi localizada em nosso sistema e sua autenticidade foi confirmada.
                  </p>

                  <Field icon={User} label="Pregador" value={data.letter.preacher_name} />
                  <Field icon={Hash} label="Função Ministerial" value={data.letter.minister_role} />
                  <Field icon={Church} label="Igreja de Origem" value={churchNameOnly(data.letter.church_origin)} />
                  <Field icon={MapPin} label="Igreja de Destino" value={churchNameOnly(data.letter.church_destination)} />
                  <Field icon={Calendar} label="Data da Pregação" value={formatDate(data.letter.preach_date)} />
                  {data.letter.preach_period && (
                    <Field icon={Calendar} label="Período" value={data.letter.preach_period} />
                  )}

                  {/* Dados de contato do pregador */}
                  {data.member?.phone && (
                    <Field icon={Phone} label="Telefone" value={data.member.phone} />
                  )}
                  {data.member?.email && (
                    <Field icon={Mail} label="E-mail" value={data.member.email} />
                  )}

                  <Field icon={Calendar} label="Data de Emissão" value={formatDateTime(data.letter.created_at)} />

                  {/* ID da carta */}
                  <div className="py-3">
                    <p className="text-xs font-medium text-white/40 uppercase tracking-wide mb-1">
                      Código da Carta
                    </p>
                    <p className="text-xs font-mono text-white/50 break-all">{data.letter.id}</p>
                  </div>

                  {/* Botão de Emissão de Recibo */}
                  <div className="py-4 border-t border-white/10 mt-2">
                    <button
                      onClick={() => setIsReceiptOpen(true)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <FileText className="h-5 w-5" /> Emitir Recibo de Pregação
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal de Recibo */}
              <ReceiptModal open={isReceiptOpen} onOpenChange={setIsReceiptOpen} data={data} />

              {/* ── Seção da Ficha ── */}
              {data.ficha_url ? (
                <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-900/30 to-blue-800/10 backdrop-blur-xl overflow-hidden shadow-xl">
                  <div className="px-6 py-5 flex items-center gap-4 border-b border-blue-500/20">
                    <div className="rounded-full bg-blue-500/20 p-2.5 border border-blue-400/30 flex-shrink-0">
                      <FileText className="h-5 w-5 text-blue-300" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Ficha do Membro / Obreiro</h3>
                      <p className="text-xs text-blue-200/60 mt-0.5">
                        Documento para conferência e emissão de recibo
                      </p>
                    </div>
                  </div>
                  <div className="px-6 py-5">
                    {data.member && (
                      <div className="flex items-center gap-3 mb-5">
                        {data.member.avatar_url && /^https?:\/\//i.test(data.member.avatar_url) ? (
                          <img
                            src={data.member.avatar_url}
                            alt={data.member.full_name}
                            className="h-12 w-12 rounded-full object-cover border-2 border-blue-400/40"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-blue-500/20 border-2 border-blue-400/30 flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-300" />
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-white text-sm">{data.member.full_name}</p>
                          {data.member.phone && (
                            <p className="text-xs text-blue-200/60 mt-0.5">{data.member.phone}</p>
                          )}
                        </div>
                      </div>
                    )}
                    <a
                      href={data.ficha_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2.5 w-full px-5 py-4 rounded-xl bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-bold text-sm transition-all shadow-lg shadow-blue-500/30"
                    >
                      <FileText className="h-5 w-5" />
                      Abrir Ficha em PDF
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-900/30 to-amber-800/10 backdrop-blur-xl px-6 py-5 shadow-xl flex items-start gap-4">
                  <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-200 text-sm">Ficha ainda não disponível</p>
                    <p className="text-amber-200/60 text-xs mt-1">
                      A carta foi localizada, porém a ficha em PDF do membro ainda não foi gerada.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Aguardando ID (estado idle — não deve aparecer normalmente) */}
          {state === "idle" && (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-10 text-center shadow-2xl">
              <CheckCircle2 className="h-10 w-10 text-blue-400 mx-auto mb-3" />
              <p className="text-white font-semibold">Escaneie o QR Code da carta para verificar.</p>
            </div>
          )}

        </div>
      </main>

      {/* Rodapé */}
      <footer className="border-t border-white/10 py-5 px-4">
        <p className="text-center text-xs text-white/30">
          Igreja Pentecostal Deus é Amor · Sistema de Verificação de Cartas · Dados oficiais e protegidos
        </p>
      </footer>
    </div>
  );
}
