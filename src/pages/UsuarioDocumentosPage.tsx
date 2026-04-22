import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, IdCard, Loader2, Send, Trash2 } from "lucide-react";
import { deleteMemberDocs, generateMemberDocs, getFichaObreiroStatus, getMemberDocsStatus, getPastorByTotvsPublic, submitFichaObreiro, workerDashboard } from "@/services/saasService";
import { supabaseRealtime } from "@/lib/supabaseRealtime";
import { formatCepBr, formatCpfBr, formatDateBr, formatPhoneBr } from "@/lib/br-format";
import { BRAZIL_UF_OPTIONS } from "@/lib/brazil-ufs";

type DocTab = "carteirinha" | "ficha" | "ficha_obreiro";

function normalizeMinisterRole(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const FICHA_OBREIRO_ALL_KEYS = [
  "nome_completo",
  "matricula",
  "funcao_ministerial",
  "data_nascimento",
  "endereco",
  "numero",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "cep_membro",
  "estado_civil",
  "data_batismo",
  "cpf",
  "rg",
  "telefone",
  "email",
  "foto_3x4_url",
  "carimbo_igreja_url",
  "assinatura_pastor_url",
  "qr_code_url",
  "igreja_nome",
  "ficha_titulo",
  "ficha_subtitulo",
  "ficha_rodape",
  "compromisso_funcao",
  "endereco_igreja_completo",
  "pastor_responsavel_nome",
  "pastor_responsavel_telefone",
  "pastor_responsavel_email",
  "congregacao_endereco",
  "congregacao_numero",
  "congregacao_bairro",
  "congregacao_cidade",
  "antiga_sede_central",
  "data_termo_cidade",
  "data_termo_dia",
  "data_termo_mes",
  "data_termo_ano",
  "testemunha1_nome",
  "testemunha1_documento",
  "testemunha2_nome",
  "testemunha2_documento",
  "observacoes_termo",
  "nacionalidade",
  "cidade_nascimento",
  "uf_nascimento",
  "data_casamento",
  "passaporte",
  "profissao",
  "ocupacao_atual",
  "nome_pai",
  "nome_mae",
  "tem_filhos",
  "dependentes_qtd",
  "filho1_nome",
  "filho1_nascimento",
  "filho2_nome",
  "filho2_nascimento",
  "filho3_nome",
  "filho3_nascimento",
  "doenca_familia",
  "doenca_familia_qual",
  "nome_conjuge",
  "conjuge_nascimento",
  "conjuge_rg",
  "conjuge_cpf",
  "conjuge_e_crente",
  "conjuge_outro_ministerio",
  "denominacao_aceitou_jesus",
  "data_conversao",
  "data_batismo_aguas",
  "funcao_ministerial_secundaria",
  "ordenacao_cooperador",
  "ordenacao_diacono",
  "ordenacao_presbitero",
  "ordenacao_evangelista",
  "ordenacao_voluntario",
  "possui_credencial",
  "recebe_prebenda",
  "prebenda_tempo",
  "prebenda_desde",
  "dirige_alguma_ipda",
  "dirige_ipda_qual",
  "endereco_atual_congregacao",
  "bairro_congregacao",
  "cidade_congregacao",
  "uf_congregacao",
  "cep_congregacao",
  "dirigente_congregacao",
  "tel_congregacao",
  "sede_setorial",
  "sucursal",
  "ja_dirigiu_exterior",
  "cidades_exterior",
  "paises_exterior",
  "doenca_exterior",
  "doenca_exterior_quem",
  "doenca_exterior_quais",
  "motivo_volta_brasil",
  "idioma_fluente",
  "idioma_quais",
  "escolaridade",
  "desempenho_ministerio",
  "desempenho_ano",
  "foi_disciplinado",
  "disciplinado_quantas_vezes",
  "disciplinado_motivo",
  "curso_ministerial",
  "curso_ministerial_qual",
  "historico_gestao_1_ano",
  "historico_gestao_1_ipda",
  "historico_gestao_1_uf",
  "historico_gestao_1_tempo",
  "historico_gestao_2_ano",
  "historico_gestao_2_ipda",
  "historico_gestao_2_uf",
  "historico_gestao_2_tempo",
  "historico_gestao_3_ano",
  "historico_gestao_3_ipda",
  "historico_gestao_3_uf",
  "historico_gestao_3_tempo",
  "historico_gestao_4_ano",
  "historico_gestao_4_ipda",
  "historico_gestao_4_uf",
  "historico_gestao_4_tempo",
  "historico_gestao_5_ano",
  "historico_gestao_5_ipda",
  "historico_gestao_5_uf",
  "historico_gestao_5_tempo",
  "historico_gestao_6_ano",
  "historico_gestao_6_ipda",
  "historico_gestao_6_uf",
  "historico_gestao_6_tempo",
];

function fichaFieldLabel(key: string) {
  return key
    .replaceAll("conjuge", "esposa")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function calcularIdade(dataIso: string) {
  if (!dataIso) return "";
  const partes = String(dataIso).split("-");
  if (partes.length !== 3) return "";
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  if (!ano || !mes || !dia) return "";
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const mesAtual = hoje.getMonth() + 1;
  if (mesAtual < mes || (mesAtual === mes && hoje.getDate() < dia)) idade -= 1;
  return idade < 0 ? "" : String(idade);
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function svgPlaceholder(label: string, width = 300, height = 200) {
  const safe = encodeURIComponent(label);
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='100%' height='100%' fill='%23F1F5F9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364758B' font-size='20' font-family='Arial'>${safe}</text></svg>`;
}

function buildChurchFooterAddress(church: Record<string, unknown> | null | undefined) {
  const addressFull = String(church?.address_full || "").trim();
  if (addressFull) return addressFull;

  const parts = [
    String(church?.address_street || "").trim(),
    church?.address_number ? `numero ${String(church.address_number).trim()}` : "",
    String(church?.address_neighborhood || "").trim(),
    String(church?.address_city || "").trim(),
  ].filter(Boolean);
  const uf = String(church?.address_state || "").trim().toUpperCase();
  const cep = formatCepBr(church?.cep || "");
  const base = parts.join(", ");
  const withUf = uf ? `${base} - ${uf}` : base;
  return cep ? `${withUf} - CEP ${cep}` : withUf;
}

function buildCarteirinhaHtml(params: {
  foto: string;
  assinatura: string;
  qr: string;
  nome: string;
  funcao: string;
  matricula: string;
  cpf: string;
  telefone: string;
  batismo: string;
}) {
  const foto = escapeHtml(params.foto || svgPlaceholder("Foto 3x4", 300, 400));
  const assinatura = escapeHtml(params.assinatura || svgPlaceholder("Assinatura Pastor", 600, 160));
  const qr = escapeHtml(params.qr || svgPlaceholder("QR", 300, 300));
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><style>
  body{margin:0;font-family:Montserrat,Arial,sans-serif;background:#fff}.page{width:100%;padding:8px;box-sizing:border-box}
  .wrap{width:176mm;height:55mm;display:flex}.side{width:88mm;height:55mm;position:relative;overflow:hidden;box-sizing:border-box;background:#fff}
  .front{border:.3mm solid rgba(0,0,0,.45);border-right:none;background-image:url("https://idipilrcaqittmnapmbq.supabase.co/storage/v1/object/public/banner/carteirinha/banner%20carteirinha.jpg");background-repeat:no-repeat;background-size:auto 100%;background-position:left center}
  .back{border:.3mm solid rgba(0,0,0,.45);border-left:none}.photo{position:absolute;right:7mm;top:6mm;width:20mm;height:26.5mm;border-radius:4mm;overflow:hidden}.photo img{width:100%;height:100%;object-fit:cover}
  .text-center{position:absolute;left:6mm;right:10mm;bottom:3mm;text-align:center}.name{font-size:10.2pt;font-weight:800;color:#4c63ff;text-transform:uppercase;margin:0 0 1.2mm 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .role{font-size:10pt;font-weight:800;color:#ff6b6b;text-transform:uppercase;margin:0 0 1.6mm 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .info{font-size:6.3pt;font-weight:700;color:#ff6b6b;text-transform:uppercase;letter-spacing:.25px;margin:0}.title{position:absolute;top:5mm;left:0;width:100%;text-align:center;font-size:12pt;font-weight:800;font-style:italic}
  .field-box{position:absolute;border:.4mm solid rgba(0,0,0,.55);border-radius:1mm;background:rgba(255,255,255,.3)}.field-label{position:absolute;font-size:6pt;font-weight:700;text-transform:uppercase;text-align:center;line-height:1}
  .field-value{position:absolute;font-size:7.5pt;font-weight:700;text-align:center;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .id-box{width:29mm;height:4.2mm;top:14mm;left:50%;transform:translateX(-50%)} .id-label{width:29mm;top:19mm;left:50%;transform:translateX(-50%)} .id-value{width:29mm;top:15.2mm;left:50%;transform:translateX(-50%)}
  .cpf-box{width:24.5mm;height:4.4mm;top:23mm;left:6mm}.cpf-label{width:24.5mm;top:28.2mm;left:6mm}.cpf-value{width:24.5mm;top:24.4mm;left:6mm}
  .tel-box{width:24.5mm;height:4.4mm;top:23mm;left:50%;transform:translateX(-50%)}.tel-label{width:24.5mm;top:28.2mm;left:50%;transform:translateX(-50%)}.tel-value{width:24.5mm;top:24.4mm;left:50%;transform:translateX(-50%)}
  .bat-box{width:24.5mm;height:4.4mm;top:23mm;right:6mm}.bat-label{width:24.5mm;top:28.2mm;right:6mm}.bat-value{width:24.5mm;top:24.4mm;right:6mm}
  .line{position:absolute;left:6mm;right:30mm;top:45mm;height:.7mm;background:rgba(0,0,0,.85)}.pastor-sign{position:absolute;left:6mm;right:30mm;top:38.4mm;height:5.8mm;text-align:center}
  .pastor-sign img{max-height:100%;max-width:100%;object-fit:contain}.pastor-label{top:46.6mm;left:6mm;right:30mm}
  .qr{position:absolute;left:65mm;bottom:2mm;width:17.3mm;height:18.7mm;border-radius:4mm;overflow:hidden;border:.3mm solid rgba(0,0,0,.25)}.qr img{width:100%;height:100%;object-fit:cover}
  </style></head><body><div class="page"><div class="wrap"><div class="side front"><div class="photo"><img src="${foto}" alt="Foto"></div><div class="text-center"><p class="name">${escapeHtml(params.nome)}</p><p class="role">${escapeHtml(params.funcao)}</p><p class="info">ESTE DOCUMENTO É PESSOAL E INTRANSFERÍVEL</p></div></div>
  <div class="side back"><div class="title">CARTEIRINHA DE MEMBRO</div><div class="field-box id-box"></div><div class="field-label id-label">ID/REGISTRADO</div><div class="field-value id-value">${escapeHtml(params.matricula)}</div><div class="field-box cpf-box"></div><div class="field-label cpf-label">CPF</div><div class="field-value cpf-value">${escapeHtml(formatCpfBr(params.cpf))}</div>
  <div class="field-box tel-box"></div><div class="field-label tel-label">TELEFONE</div><div class="field-value tel-value">${escapeHtml(formatPhoneBr(params.telefone))}</div><div class="field-box bat-box"></div><div class="field-label bat-label">DATA BATISMO</div><div class="field-value bat-value">${escapeHtml(formatDateBr(params.batismo))}</div>
  <div class="pastor-sign"><img src="${assinatura}" alt="Assinatura"></div><div class="line"></div><div class="field-label pastor-label">ASSINATURA PASTOR</div><div class="qr"><img src="${qr}" alt="QR"></div></div></div></div></body></html>`;
}

function buildFichaMembroHtml(params: {
  foto: string;
  nome: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  rg: string;
  cpf: string;
  nascimento: string;
  cidadeNascimento: string;
  estadoNascimento: string;
  estadoCivil: string;
  telefone: string;
  email: string;
  profissao: string;
  idade: string;
  batismo: string;
  funcao: string;
  ordenacao: string;
  subtitulo: string;
  rodapeIgreja: string;
}) {
  const rodape = escapeHtml(params.rodapeIgreja || "");
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  @page{size:A4;margin:15mm}body{margin:0;font-family:Montserrat,Arial,sans-serif;color:#111}.page{width:210mm;height:297mm;box-sizing:border-box}
  .header{display:flex;align-items:center;justify-content:center;gap:12mm;margin-top:2mm}.header-photo{width:25mm;height:32mm;border:.35mm solid rgba(0,0,0,.25);border-radius:2mm;overflow:hidden;background:rgba(0,0,0,.04)}
  .header-photo img{width:100%;height:100%;object-fit:cover}.logo{height:45mm;width:auto}.title{text-align:center;margin:10mm 0 8mm 0;line-height:1.15}
  .title h1{margin:0;font-size:16pt;font-weight:800}.title h2{margin:2mm 0 0 0;font-size:14pt;font-weight:800}.content{margin-top:4mm;font-size:10.5pt}
  .row{display:flex;gap:10mm;margin:2.2mm 0;flex-wrap:wrap}.field{display:flex;gap:2mm;align-items:baseline;min-width:0}.label{font-weight:600;white-space:nowrap}
  .value{font-weight:500;border-bottom:.25mm solid rgba(0,0,0,.25);padding:0 1mm .6mm 1mm;min-width:40mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .w-70{min-width:70mm}.w-60{min-width:60mm}.w-50{min-width:50mm}.w-45{min-width:45mm}.w-40{min-width:40mm}.w-35{min-width:35mm}.w-30{min-width:30mm}.w-25{min-width:25mm}
  .section-title{text-align:center;margin:22mm 0 8mm 0;font-size:14pt;font-weight:900}.footer{margin-top:14mm;text-align:center;font-weight:800;font-size:11pt;line-height:1.35;white-space:normal;word-break:break-word}
  @media screen and (max-width: 768px){
    body{padding:0}
    .page{width:100%;height:auto;min-height:100%;padding:12px;box-sizing:border-box}
    .header{gap:12px;margin-top:0}
    .header-photo{width:92px;height:120px}
    .logo{height:132px;max-width:58%}
    .title{margin:14px 0 12px 0}
    .title h1{font-size:20px}
    .title h2{font-size:17px}
    .content{margin-top:0;font-size:14px}
    .row{display:grid;grid-template-columns:1fr;gap:8px;margin:8px 0}
    .field{display:grid;grid-template-columns:auto 1fr;align-items:end;gap:8px}
    .value{min-width:0 !important;width:100%;padding:0 4px 4px 4px;white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word}
    .w-70,.w-60,.w-50,.w-45,.w-40,.w-35,.w-30,.w-25{min-width:0 !important;width:100%}
    .section-title{margin:18px 0 10px 0;font-size:22px;line-height:1.2}
    .footer{margin-top:18px;font-size:13px}
  }
  </style></head><body><div class="page"><div class="header"><div class="header-photo"><img src="${escapeHtml(params.foto || svgPlaceholder("Foto 3x4", 300, 400))}" alt="Foto"></div><img class="logo" src="https://idipilrcaqittmnapmbq.supabase.co/storage/v1/object/public/banner/logo/logo%20d.png" alt="Logo"></div>
  <div class="title"><h1>Ficha de cadastro de Membros</h1><h2>${escapeHtml(params.subtitulo)}</h2></div><div class="content">
  <div class="row"><div class="field"><div class="label">Nome:</div><div class="value w-70">${escapeHtml(params.nome)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Endereço:</div><div class="value w-70">${escapeHtml(params.endereco)}</div></div><div class="field"><div class="label">Número da casa:</div><div class="value w-30">${escapeHtml(params.numero)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Bairro:</div><div class="value w-45">${escapeHtml(params.bairro)}</div></div><div class="field"><div class="label">Cidade:</div><div class="value w-45">${escapeHtml(params.cidade)}</div></div><div class="field"><div class="label">Estado:</div><div class="value w-25">${escapeHtml(params.estado)}</div></div><div class="field"><div class="label">Cep:</div><div class="value w-25">${escapeHtml(formatCepBr(params.cep))}</div></div></div>
  <div class="row"><div class="field"><div class="label">RG:</div><div class="value w-35">${escapeHtml(params.rg)}</div></div><div class="field"><div class="label">CPF:</div><div class="value w-35">${escapeHtml(formatCpfBr(params.cpf))}</div></div><div class="field"><div class="label">Data de Nascimento:</div><div class="value w-45">${escapeHtml(formatDateBr(params.nascimento))}</div></div></div>
  <div class="row"><div class="field"><div class="label">Cidade de Nascimento:</div><div class="value w-60">${escapeHtml(params.cidadeNascimento)}</div></div><div class="field"><div class="label">Estado:</div><div class="value w-35">${escapeHtml(params.estadoNascimento)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Estado Civil:</div><div class="value w-40">${escapeHtml(params.estadoCivil)}</div></div><div class="field"><div class="label">Telefone:</div><div class="value w-45">${escapeHtml(formatPhoneBr(params.telefone))}</div></div></div>
  <div class="row"><div class="field"><div class="label">Endereço de email:</div><div class="value w-70">${escapeHtml(params.email)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Profissão:</div><div class="value w-60">${escapeHtml(params.profissao)}</div></div><div class="field"><div class="label">Idade:</div><div class="value w-25">${escapeHtml(params.idade)}</div></div></div>
  <div class="section-title">Dados Ministeriais do Membro e do Obreiro (a)</div><div class="row"><div class="field"><div class="label">Data de Batismo:</div><div class="value w-45">${escapeHtml(formatDateBr(params.batismo))}</div></div><div class="field"><div class="label">Função Ministerial:</div><div class="value w-50">${escapeHtml(params.funcao)}</div></div></div><div class="row"><div class="field"><div class="label">Data da Ordenação:</div><div class="value w-45">${escapeHtml(formatDateBr(params.ordenacao))}</div></div></div></div>
  <div class="footer">${rodape}</div></div></body></html>`;
}

export default function UsuarioDocumentosPage() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { usuario, session } = useUser();
  const isCadastroPendente = usuario?.registration_status === "PENDENTE";
  const [docTab, setDocTab] = useState<DocTab>("carteirinha");
  const [sendingDoc, setSendingDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [fichaObreiroForm, setFichaObreiroForm] = useState<Record<string, string>>({});

  const userId = String(usuario?.id || "");
  const { data } = useQuery({
    queryKey: ["worker-dashboard-docs", userId],
    queryFn: () => workerDashboard(undefined, undefined, 1, 20),
    enabled: Boolean(userId),
  });

  const profile = data?.user;
  const church = data?.church;
  const activeTotvs = String(profile?.default_totvs_id || session?.totvs_id || church?.totvs_id || "");

  const { data: pastor } = useQuery({
    queryKey: ["pastor-by-totvs-docs", activeTotvs],
    queryFn: () => getPastorByTotvsPublic(activeTotvs),
    enabled: Boolean(activeTotvs),
  });

  const { data: docsStatus, refetch: refetchDocsStatus, isFetching: fetchingDocsStatus } = useQuery({
    queryKey: ["worker-docs-status", userId, activeTotvs],
    queryFn: () => getMemberDocsStatus({ member_id: userId, church_totvs_id: activeTotvs }),
    enabled: Boolean(userId && activeTotvs),
  });
  const ministerRoleNormalized = normalizeMinisterRole(profile?.minister_role || usuario?.ministerial || "");
  const roleNormalized = String(usuario?.role || session?.role || "").trim().toLowerCase();
  const cargosComFichaObreiro = new Set(["cooperador", "obreiro", "diacono", "presbitero", "pastor", "evangelista", "missionario"]);
  const canSeeFichaObreiro = roleNormalized === "pastor" || cargosComFichaObreiro.has(ministerRoleNormalized);

  const { data: fichaObreiroStatusData, refetch: refetchFichaObreiroStatus, isFetching: fetchingFichaObreiroStatus } = useQuery({
    queryKey: ["worker-ficha-obreiro-status", userId, activeTotvs],
    queryFn: () => getFichaObreiroStatus({ member_id: userId, church_totvs_id: activeTotvs }),
    enabled: Boolean(canSeeFichaObreiro && userId && activeTotvs),
  });
  const fichaObreiroStatus = String(fichaObreiroStatusData?.ficha_obreiro?.status || "").trim().toUpperCase();
  const fichaObreiroUrl = String(fichaObreiroStatusData?.ficha_obreiro?.url || "").trim();
  const fichaObreiroPronta = fichaObreiroStatus === "PRONTO" && fichaObreiroUrl.length > 0;

  const refetchDocsCb = useCallback(() => { void refetchDocsStatus(); }, [refetchDocsStatus]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabaseRealtime
      .channel(`worker-docs-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_ficha_documents" }, refetchDocsCb)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_carteirinha_documents" }, refetchDocsCb)
      .subscribe();
    return () => { void supabaseRealtime.removeChannel(channel); };
  }, [userId, refetchDocsCb]);

  useEffect(() => {
    if (!userId || !canSeeFichaObreiro) return;
    const channel = supabaseRealtime
      .channel(`worker-ficha-obreiro-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_ficha_obreiro_forms" }, () => { void refetchFichaObreiroStatus(); })
      .subscribe();
    return () => { void supabaseRealtime.removeChannel(channel); };
  }, [userId, canSeeFichaObreiro, refetchFichaObreiroStatus]);

  useEffect(() => {
    if (docTab === "ficha_obreiro" && !canSeeFichaObreiro) {
      setDocTab("carteirinha");
    }
  }, [docTab, canSeeFichaObreiro]);

  const fichaPronta = Boolean(
    docsStatus?.ficha && String(docsStatus?.ficha?.final_url || "").trim().length > 0,
  );
  const carteirinhaPronta =
    String(docsStatus?.carteirinha?.status || "").toUpperCase() === "PRONTO" ||
    Boolean(docsStatus?.carteirinha && String(docsStatus?.carteirinha?.final_url || "").trim().length > 0);
  const carteirinhaLink = String(docsStatus?.carteirinha?.ficha_url_qr || docsStatus?.carteirinha?.final_url || "").trim();

  // Comentario: o banco retorna colunas planas (address_street, cep, etc.) — sem address_json.
  const profileRaw = profile as Record<string, unknown> | undefined;
  const streetFinal = String(profileRaw?.address_street || "");
  const numberFinal = String(profileRaw?.address_number || "");
  const neighborhoodFinal = String(profileRaw?.address_neighborhood || "");
  const cityFinal = String(profileRaw?.address_city || "");
  const stateFinal = String(profileRaw?.address_state || "");
  const zipFinal = String(profileRaw?.cep || "");
  const churchFooter = useMemo(
    () => buildChurchFooterAddress((church || null) as Record<string, unknown> | null),
    [church],
  );
  const setFichaField = (key: string, value: string) => {
    setFichaObreiroForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!canSeeFichaObreiro) return;
    const profileRawLocal = profile as Record<string, unknown> | undefined;
    const ministerRoleAuto = normalizeMinisterRole(profile?.minister_role || usuario?.ministerial || "");
    const ordinationDateAuto = String(profileRawLocal?.ordination_date || "");
    const baptismDateAuto = String(profileRawLocal?.baptism_date || "");
    const ordenacaoAuto = {
      ordenacao_cooperador: ministerRoleAuto === "cooperador" || ministerRoleAuto === "obreiro" ? ordinationDateAuto : "",
      ordenacao_diacono: ministerRoleAuto === "diacono" ? ordinationDateAuto : "",
      ordenacao_presbitero: ministerRoleAuto === "presbitero" ? ordinationDateAuto : "",
      ordenacao_evangelista: ministerRoleAuto === "evangelista" ? ordinationDateAuto : "",
      ordenacao_voluntario: ministerRoleAuto === "voluntario" || ministerRoleAuto === "voluntario financeiro" ? ordinationDateAuto : "",
    };
    const baseDefaults = Object.fromEntries(FICHA_OBREIRO_ALL_KEYS.map((k) => [k, ""])) as Record<string, string>;
    setFichaObreiroForm((prev) => ({
      // mantém o que o usuário já digitou
      ...baseDefaults,
      ...{
        nome_completo: String(profile?.full_name || usuario?.nome || ""),
        matricula: String((profile as Record<string, unknown> | undefined)?.matricula || ""),
        funcao_ministerial: String(profile?.minister_role || ""),
        compromisso_funcao: String(profile?.minister_role || ""),
        data_nascimento: String(profile?.birth_date || ""),
        endereco: streetFinal,
        numero: numberFinal,
        bairro: neighborhoodFinal,
        cidade: cityFinal,
        estado: stateFinal,
        cep: formatCepBr(zipFinal),
        estado_civil: String((profile as Record<string, unknown> | undefined)?.marital_status || ""),
        data_batismo: baptismDateAuto,
        cpf: formatCpfBr(profile?.cpf || ""),
        cep_membro: formatCepBr(zipFinal),
        foto_3x4_url: String(profile?.avatar_url || ""),
        rg: String((profile as Record<string, unknown> | undefined)?.rg || ""),
        email: String(profile?.email || ""),
        telefone: formatPhoneBr(profile?.phone || ""),
        profissao: String((profile as Record<string, unknown> | undefined)?.profession || ""),
        carimbo_igreja_url: String(church?.stamp_church_url || ""),
        igreja_nome: String(session?.church_name || church?.church_name || ""),
        endereco_igreja_completo: churchFooter,
        pastor_responsavel_nome: String(pastor?.full_name || ""),
        pastor_responsavel_telefone: formatPhoneBr(String(pastor?.phone || "")),
        pastor_responsavel_email: String(pastor?.email || ""),
        assinatura_pastor_url: String(pastor?.signature_url || ""),
        ficha_titulo: "Ficha de cadastro de Membros",
        ficha_subtitulo: String(session?.church_name || church?.church_name || "Setorial"),
        ficha_rodape: churchFooter,
        // campos complementares editáveis
        passaporte: "",
        cidade_nascimento: cityFinal,
        uf_nascimento: stateFinal,
        data_casamento: "",
        nome_pai: "",
        nome_mae: "",
        ocupacao_atual: "",
        tem_filhos: "",
        dependentes_qtd: "",
        filho1_nome: "",
        filho1_nascimento: "",
        filho2_nome: "",
        filho2_nascimento: "",
        filho3_nome: "",
        filho3_nascimento: "",
        doenca_familia: "",
        doenca_familia_qual: "",
        nome_conjuge: "",
        conjuge_nascimento: "",
        conjuge_rg: "",
        conjuge_cpf: "",
        conjuge_e_crente: "",
        conjuge_outro_ministerio: "",
        denominacao_aceitou_jesus: "",
        data_conversao: "",
        data_batismo_aguas: baptismDateAuto,
        ...ordenacaoAuto,
        possui_credencial: "",
        recebe_prebenda: "",
        prebenda_tempo: "",
        prebenda_desde: "",
        dirige_alguma_ipda: "",
        dirige_ipda_qual: "",
        endereco_atual_congregacao: streetFinal,
        bairro_congregacao: neighborhoodFinal,
        cidade_congregacao: cityFinal,
        uf_congregacao: stateFinal,
        cep_congregacao: formatCepBr(zipFinal),
        dirigente_congregacao: "",
        tel_congregacao: "",
        sede_setorial: String(session?.church_name || church?.church_name || ""),
        sucursal: "",
        ja_dirigiu_exterior: "",
        cidades_exterior: "",
        paises_exterior: "",
        doenca_exterior: "",
        doenca_exterior_quem: "",
        doenca_exterior_quais: "",
        motivo_volta_brasil: "",
        idioma_fluente: "",
        idioma_quais: "",
        escolaridade: "",
        desempenho_ano: "",
        desempenho_ministerio: "",
        foi_disciplinado: "",
        disciplinado_quantas_vezes: "",
        disciplinado_motivo: "",
        curso_ministerial: "",
        curso_ministerial_qual: "",
      },
      ...prev,
    }));
  }, [
    canSeeFichaObreiro,
    profile,
    usuario?.nome,
    streetFinal,
    numberFinal,
    neighborhoodFinal,
    cityFinal,
    stateFinal,
    zipFinal,
    session?.church_name,
    church?.church_name,
    churchFooter,
    church?.stamp_church_url,
    pastor?.full_name,
    pastor?.phone,
    pastor?.email,
    pastor?.signature_url,
    usuario?.ministerial,
  ]);

  const carteirinhaHtml = useMemo(
    () =>
      buildCarteirinhaHtml({
        foto: String(profile?.avatar_url || ""),
        assinatura: String(pastor?.signature_url || ""),
        qr: String(docsStatus?.ficha?.final_url || ""),
        nome: String(profile?.full_name || usuario?.nome || ""),
        funcao: String(profile?.minister_role || ""),
        matricula: String((profile as Record<string, unknown> | undefined)?.matricula || ""),
        cpf: formatCpfBr(profile?.cpf || ""),
        telefone: formatPhoneBr(profile?.phone || ""),
        batismo: formatDateBr((profile as Record<string, unknown> | undefined)?.baptism_date || ""),
      }),
    [profile, pastor?.signature_url, usuario?.nome, docsStatus?.ficha?.final_url],
  );

  const fichaHtml = useMemo(() => {
    const nascimentoRaw = String(profile?.birth_date || "");
    return buildFichaMembroHtml({
      foto: String(profile?.avatar_url || ""),
      nome: String(profile?.full_name || usuario?.nome || ""),
      endereco: streetFinal,
      numero: numberFinal,
      bairro: neighborhoodFinal,
      cidade: cityFinal,
      estado: stateFinal,
      cep: formatCepBr(zipFinal),
      rg: String((profile as Record<string, unknown> | undefined)?.rg || ""),
      cpf: formatCpfBr(profile?.cpf || ""),
      nascimento: formatDateBr(nascimentoRaw),
      cidadeNascimento: cityFinal,
      estadoNascimento: stateFinal,
      estadoCivil: String((profile as Record<string, unknown> | undefined)?.marital_status || ""),
      telefone: formatPhoneBr(profile?.phone || ""),
      email: String(profile?.email || ""),
      profissao: String((profile as Record<string, unknown> | undefined)?.profession || ""),
      idade: calcularIdade(nascimentoRaw),
      batismo: formatDateBr((profile as Record<string, unknown> | undefined)?.baptism_date || ""),
      funcao: String(profile?.minister_role || ""),
      ordenacao: formatDateBr((profile as Record<string, unknown> | undefined)?.ordination_date || ""),
      subtitulo: String(session?.church_name || church?.church_name || "Setorial"),
      rodapeIgreja: churchFooter,
    });
  }, [profile, usuario?.nome, streetFinal, numberFinal, neighborhoodFinal, cityFinal, stateFinal, zipFinal, session?.church_name, church?.church_name, churchFooter]);

  async function enviarParaConfeccao() {
    if (isCadastroPendente) {
      toast.error("Cadastro pendente. Aguarde aprova??o para enviar documentos.");
      return;
    }
    if (!userId || !activeTotvs) {
      toast.error("Dados de sess?o inv?lidos.");
      return;
    }
    setSendingDoc(true);
    try {
      await generateMemberDocs({
        document_type: "ficha_carteirinha",
        member_id: userId,
        church_totvs_id: activeTotvs,
        dados: {
          nome_completo: String(profile?.full_name || usuario?.nome || ""),
          matricula: String((profile as Record<string, unknown> | undefined)?.matricula || ""),
          funcao_ministerial: String(profile?.minister_role || ""),
          data_nascimento: String(profile?.birth_date || ""),
          endereco: streetFinal,
          numero: numberFinal,
          bairro: neighborhoodFinal,
          cidade: cityFinal,
          estado: stateFinal,
          estado_civil: String((profile as Record<string, unknown> | undefined)?.marital_status || ""),
          data_batismo: String((profile as Record<string, unknown> | undefined)?.baptism_date || ""),
          cpf: formatCpfBr(profile?.cpf || ""),
          foto_3x4_url: String(profile?.avatar_url || ""),
          rg: String((profile as Record<string, unknown> | undefined)?.rg || ""),
          email: String(profile?.email || ""),
          cidade_nascimento: cityFinal,
          uf_nascimento: stateFinal,
          profissao: String((profile as Record<string, unknown> | undefined)?.profession || ""),
          carimbo_igreja_url: String(church?.stamp_church_url || ""),
          assinatura_pastor_url: String(pastor?.signature_url || ""),
          member_id: userId,
          dados: {
            member_cep: formatCepBr(zipFinal),
            endereco_igreja_completo: churchFooter,
            igreja_nome: String(session?.church_name || church?.church_name || ""),
            telefone: formatPhoneBr(profile?.phone || ""),
          },
        },
      });
      await refetchDocsStatus();
      toast.success("Documento enviado para confecção.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar documento.";
      toast.error(message || "Falha ao enviar documento.");
    } finally {
      setSendingDoc(false);
    }
  }

  async function enviarFichaObreiroParaConfeccao() {
    if (isCadastroPendente) {
      toast.error("Cadastro pendente. Aguarde aprovação para enviar documentos.");
      return;
    }
    if (!userId || !activeTotvs) {
      toast.error("Dados de sessão inválidos.");
      return;
    }
    setSendingDoc(true);
    try {
      const dados = {
        ...fichaObreiroForm,
        nome_completo: String(fichaObreiroForm.nome_completo || profile?.full_name || usuario?.nome || ""),
        matricula: String(fichaObreiroForm.matricula || (profile as Record<string, unknown> | undefined)?.matricula || ""),
        funcao_ministerial: String(fichaObreiroForm.funcao_ministerial || profile?.minister_role || ""),
        compromisso_funcao: String(fichaObreiroForm.compromisso_funcao || fichaObreiroForm.funcao_ministerial || profile?.minister_role || ""),
        data_nascimento: String(fichaObreiroForm.data_nascimento || profile?.birth_date || ""),
        data_batismo: String(fichaObreiroForm.data_batismo || (profile as Record<string, unknown> | undefined)?.baptism_date || ""),
        cpf: formatCpfBr(fichaObreiroForm.cpf || profile?.cpf || ""),
        rg: String(fichaObreiroForm.rg || (profile as Record<string, unknown> | undefined)?.rg || ""),
        foto_3x4_url: String(fichaObreiroForm.foto_3x4_url || profile?.avatar_url || ""),
        email: String(fichaObreiroForm.email || profile?.email || ""),
        telefone: formatPhoneBr(fichaObreiroForm.telefone || profile?.phone || ""),
        cep: formatCepBr(fichaObreiroForm.cep || zipFinal),
        cep_membro: formatCepBr(fichaObreiroForm.cep_membro || fichaObreiroForm.cep || zipFinal),
        cep_congregacao: formatCepBr(fichaObreiroForm.cep_congregacao || fichaObreiroForm.cep || zipFinal),
        carimbo_igreja_url: String(fichaObreiroForm.carimbo_igreja_url || church?.stamp_church_url || ""),
        igreja_nome: String(fichaObreiroForm.igreja_nome || session?.church_name || church?.church_name || ""),
        endereco_igreja_completo: String(fichaObreiroForm.endereco_igreja_completo || churchFooter || ""),
        pastor_responsavel_nome: String(fichaObreiroForm.pastor_responsavel_nome || pastor?.full_name || ""),
        pastor_responsavel_telefone: formatPhoneBr(String(fichaObreiroForm.pastor_responsavel_telefone || pastor?.phone || "")),
        pastor_responsavel_email: String(fichaObreiroForm.pastor_responsavel_email || pastor?.email || ""),
        assinatura_pastor_url: String(fichaObreiroForm.assinatura_pastor_url || pastor?.signature_url || ""),
        ficha_titulo: String(fichaObreiroForm.ficha_titulo || "Ficha de cadastro de Membros"),
        ficha_subtitulo: String(fichaObreiroForm.ficha_subtitulo || session?.church_name || church?.church_name || "Setorial"),
        ficha_rodape: String(fichaObreiroForm.ficha_rodape || churchFooter || ""),
      };
      await submitFichaObreiro({
        member_id: userId,
        church_totvs_id: activeTotvs,
        dados,
      });
      await refetchFichaObreiroStatus();
      toast.success("Ficha de obreiro enviada para confecção.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar ficha de obreiro.";
      toast.error(message || "Falha ao enviar ficha de obreiro.");
    } finally {
      setSendingDoc(false);
    }
  }

  async function excluirMeusDocumentos() {
    if (!userId || !activeTotvs) {
      toast.error("Dados de sessão inválidos.");
      return;
    }
    const confirmed = window.confirm("Deseja excluir sua ficha e sua carteirinha? Você poderá gerar novamente quando quiser.");
    if (!confirmed) return;

    setDeletingDoc(true);
    try {
      await deleteMemberDocs({
        member_id: userId,
        church_totvs_id: activeTotvs,
        doc_type: "all",
      });
      await refetchDocsStatus();
      await queryClient.invalidateQueries({ queryKey: ["worker-docs-status", userId, activeTotvs] });
      toast.success("Ficha e carteirinha excluídas com sucesso.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao excluir documentos.";
      toast.error(message || "Falha ao excluir documentos.");
    } finally {
      setDeletingDoc(false);
    }
  }

  const temFilhosSim = String(fichaObreiroForm.tem_filhos || "").trim().toUpperCase() === "SIM";
  const doencaFamiliaSim = String(fichaObreiroForm.doenca_familia || "").trim().toUpperCase() === "SIM";
  const jaDirigiuExteriorSim = String(fichaObreiroForm.ja_dirigiu_exterior || "").trim().toUpperCase() === "SIM";
  const cursoMinisterialSim = String(fichaObreiroForm.curso_ministerial || "").trim().toUpperCase() === "SIM";
  const idiomaFluenteSim = String(fichaObreiroForm.idioma_fluente || "").trim().toUpperCase() === "SIM";
  const recebePrebendaSim = String(fichaObreiroForm.recebe_prebenda || "").trim().toUpperCase() === "SIM";
  const dirigeAlgumaIpdaSim = String(fichaObreiroForm.dirige_alguma_ipda || "").trim().toUpperCase() === "SIM";
  const currentYear = new Date().getFullYear();
  const desempenhoYearOptions = Array.from({ length: 70 }, (_, idx) => String(currentYear - idx));
  const [historicoGestaoVisibleCount, setHistoricoGestaoVisibleCount] = useState(1);
  const fichaCamposJaVisiveis = new Set([
    "nome_completo",
    "funcao_ministerial",
    "cpf",
    "rg",
    "passaporte",
    "nacionalidade",
    "telefone",
    "email",
    "data_nascimento",
    "estado_civil",
    "data_casamento",
    "endereco",
    "numero",
    "bairro",
    "cidade",
    "estado",
    "cep",
    "profissao",
    "ocupacao_atual",
    "cidade_nascimento",
    "uf_nascimento",
    "nome_pai",
    "nome_mae",
    "nome_conjuge",
    "conjuge_nascimento",
    "conjuge_rg",
    "conjuge_cpf",
    "conjuge_e_crente",
    "conjuge_outro_ministerio",
    "tem_filhos",
    "dependentes_qtd",
    "filho1_nome",
    "filho1_nascimento",
    "filho2_nome",
    "filho2_nascimento",
    "filho3_nome",
    "filho3_nascimento",
    "doenca_familia",
    "doenca_familia_qual",
    "denominacao_aceitou_jesus",
    "data_conversao",
    "data_batismo_aguas",
    "possui_credencial",
    "recebe_prebenda",
    "prebenda_tempo",
    "prebenda_desde",
    "dirige_alguma_ipda",
    "dirige_ipda_qual",
    "ordenacao_cooperador",
    "ordenacao_diacono",
    "ordenacao_presbitero",
    "ordenacao_evangelista",
    "ordenacao_voluntario",
    "endereco_igreja_completo",
    "endereco_atual_congregacao",
    "bairro_congregacao",
    "cidade_congregacao",
    "uf_congregacao",
    "cep_congregacao",
  ]);
  const fichaCamposOcultos = new Set([
    "matricula",
    "data_batismo",
    "data_termo_cidade",
    "data_termo_dia",
    "data_termo_mes",
    "data_termo_ano",
    "testemunha1_nome",
    "testemunha1_documento",
    "testemunha2_nome",
    "testemunha2_documento",
    "ficha_titulo",
    "ficha_subtitulo",
    "ficha_rodape",
    "foto_3x4_url",
    "carimbo_igreja_url",
    "igreja_nome",
    "compromisso_funcao",
    "funcao_ministerial_secundaria",
    "cep_membro",
    "antiga_sede_central",
    "sede_setorial",
    "sucursal",
    "congregacao_endereco",
    "congregacao_numero",
    "congregacao_bairro",
    "congregacao_cidade",
    "pastor_responsavel_nome",
    "pastor_responsavel_telefone",
    "pastor_responsavel_email",
    "dirigente_congregacao",
    "tel_congregacao",
    "observacoes_termo",
  ]);
  const fichaCamposAdicionais = FICHA_OBREIRO_ALL_KEYS.filter(
    (k) =>
      !fichaCamposJaVisiveis.has(k) &&
      !fichaCamposOcultos.has(k) &&
      k !== "assinatura_pastor_url" &&
      k !== "qr_code_url",
  );
  const dateKeys = new Set([
    "data_batismo",
    "conjuge_nascimento",
    "filho1_nascimento",
    "filho2_nascimento",
    "filho3_nascimento",
    "ordenacao_voluntario",
  ]);
  const yesNoKeys = new Set([
    "conjuge_e_crente",
    "conjuge_outro_ministerio",
    "tem_filhos",
    "doenca_familia",
    "possui_credencial",
    "recebe_prebenda",
    "dirige_alguma_ipda",
    "ja_dirigiu_exterior",
    "doenca_exterior",
    "idioma_fluente",
    "foi_disciplinado",
    "curso_ministerial",
  ]);
  const ufKeys = new Set(["uf_nascimento", "uf_congregacao", "historico_gestao_1_uf", "historico_gestao_2_uf", "historico_gestao_3_uf"]);
  const exteriorDependentes = new Set([
    "cidades_exterior",
    "paises_exterior",
    "doenca_exterior",
    "doenca_exterior_quem",
    "doenca_exterior_quais",
    "motivo_volta_brasil",
    "idioma_fluente",
    "idioma_quais",
  ]);
  const continuationOrderedKeys = [
    "ja_dirigiu_exterior",
    "cidades_exterior",
    "paises_exterior",
    "doenca_exterior",
    "doenca_exterior_quem",
    "doenca_exterior_quais",
    "motivo_volta_brasil",
    "idioma_fluente",
    "idioma_quais",
    "escolaridade",
    "desempenho_ministerio",
    "desempenho_ano",
    "foi_disciplinado",
    "disciplinado_quantas_vezes",
    "disciplinado_motivo",
    "curso_ministerial",
    "curso_ministerial_qual",
    "historico_gestao_1_ano",
    "historico_gestao_1_ipda",
    "historico_gestao_1_uf",
    "historico_gestao_1_tempo",
    "historico_gestao_2_ano",
    "historico_gestao_2_ipda",
    "historico_gestao_2_uf",
    "historico_gestao_2_tempo",
    "historico_gestao_3_ano",
    "historico_gestao_3_ipda",
    "historico_gestao_3_uf",
    "historico_gestao_3_tempo",
    "historico_gestao_4_ano",
    "historico_gestao_4_ipda",
    "historico_gestao_4_uf",
    "historico_gestao_4_tempo",
    "historico_gestao_5_ano",
    "historico_gestao_5_ipda",
    "historico_gestao_5_uf",
    "historico_gestao_5_tempo",
    "historico_gestao_6_ano",
    "historico_gestao_6_ipda",
    "historico_gestao_6_uf",
    "historico_gestao_6_tempo",
  ];
  const continuationOrderedKeysSet = new Set(continuationOrderedKeys);
  const fichaCamposAdicionaisRestantes = fichaCamposAdicionais.filter((key) => !continuationOrderedKeysSet.has(key));
  const historicoGestaoRows = Array.from({ length: Math.min(6, historicoGestaoVisibleCount) }, (_, idx) => idx + 1);

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-4">
        {isCadastroPendente ? (
          <Card className="border border-amber-200 bg-amber-50">
            <CardContent className="py-3 text-sm text-amber-800">
              Seu cadastro está pendente de liberação. A visualização de documentos será liberada após aprovação.
            </CardContent>
          </Card>
        ) : null}
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5" /> Documentos</CardTitle>
            <Button variant="outline" onClick={() => nav("/usuario")}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex">
              <Button className="w-full md:w-auto" variant={docTab === "carteirinha" ? "default" : "outline"} onClick={() => setDocTab("carteirinha")}>Carteirinha</Button>
              <Button className="w-full md:w-auto" variant={docTab === "ficha" ? "default" : "outline"} onClick={() => setDocTab("ficha")}>Ficha do membro</Button>
              {canSeeFichaObreiro ? (
                <Button className="w-full md:w-auto sm:col-span-2 md:col-auto" variant={docTab === "ficha_obreiro" ? "default" : "outline"} onClick={() => setDocTab("ficha_obreiro")}>Ficha de obreiro</Button>
              ) : null}
            </div>
            {docTab === "ficha" && !fichaPronta ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={enviarParaConfeccao} disabled={sendingDoc || isCadastroPendente || !userId}>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar ficha para confecção
                </Button>
                {fetchingDocsStatus ? <span className="text-xs text-slate-500">Verificando status...</span> : null}
              </div>
            ) : null}
            {docTab === "carteirinha" && carteirinhaPronta ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">Carteirinha pronta.</p>
                <p className="mt-1 text-xs text-emerald-700">O arquivo final está disponível para visualização e download.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => window.open(carteirinhaLink, "_blank", "noopener,noreferrer")}>
                    Visualizar carteirinha
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(carteirinhaLink, "_blank", "noopener,noreferrer")}
                  >
                    Baixar carteirinha
                  </Button>
                  <Button size="sm" variant="destructive" onClick={excluirMeusDocumentos} disabled={deletingDoc}>
                    {deletingDoc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Excluir ficha e carteirinha
                  </Button>
                </div>
              </div>
            ) : null}
            {docTab === "ficha" && fichaPronta ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">Ficha pronta.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => window.open(String(docsStatus?.ficha?.final_url || ""), "_blank", "noopener,noreferrer")}>
                    Abrir ficha final
                  </Button>
                  <Button size="sm" variant="destructive" onClick={excluirMeusDocumentos} disabled={deletingDoc}>
                    {deletingDoc ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Excluir ficha e carteirinha
                  </Button>
                </div>
              </div>
            ) : null}
            {docTab === "carteirinha" && !carteirinhaPronta ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                A carteirinha ainda não está pronta. Aguarde a confecção para visualizar.
              </div>
            ) : null}
            {docTab === "ficha_obreiro" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">Formulário da ficha de obreiro</p>
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Dados Pessoais</p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1"><Label>Nome completo</Label><Input value={fichaObreiroForm.nome_completo || ""} onChange={(e) => setFichaField("nome_completo", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Função ministerial</Label><Input value={fichaObreiroForm.funcao_ministerial || ""} onChange={(e) => setFichaField("funcao_ministerial", e.target.value)} /></div>
                        <div className="space-y-1"><Label>CPF</Label><Input value={fichaObreiroForm.cpf || ""} onChange={(e) => setFichaField("cpf", e.target.value)} /></div>
                        <div className="space-y-1"><Label>RG</Label><Input value={fichaObreiroForm.rg || ""} onChange={(e) => setFichaField("rg", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Passaporte</Label><Input value={fichaObreiroForm.passaporte || ""} onChange={(e) => setFichaField("passaporte", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Nacionalidade</Label><Input value={fichaObreiroForm.nacionalidade || ""} onChange={(e) => setFichaField("nacionalidade", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Telefone</Label><Input value={fichaObreiroForm.telefone || ""} onChange={(e) => setFichaField("telefone", e.target.value)} /></div>
                        <div className="space-y-1"><Label>E-mail</Label><Input value={fichaObreiroForm.email || ""} onChange={(e) => setFichaField("email", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Data de nascimento</Label><Input type="date" value={fichaObreiroForm.data_nascimento || ""} onChange={(e) => setFichaField("data_nascimento", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Estado civil</Label><Input value={fichaObreiroForm.estado_civil || ""} onChange={(e) => setFichaField("estado_civil", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Data de casamento</Label><Input type="date" value={fichaObreiroForm.data_casamento || ""} onChange={(e) => setFichaField("data_casamento", e.target.value)} /></div>
                        <div className="space-y-1 xl:col-span-2"><Label>Endereço</Label><Input value={fichaObreiroForm.endereco || ""} onChange={(e) => setFichaField("endereco", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Número</Label><Input value={fichaObreiroForm.numero || ""} onChange={(e) => setFichaField("numero", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Bairro</Label><Input value={fichaObreiroForm.bairro || ""} onChange={(e) => setFichaField("bairro", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Cidade</Label><Input value={fichaObreiroForm.cidade || ""} onChange={(e) => setFichaField("cidade", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Estado</Label><Input value={fichaObreiroForm.estado || ""} onChange={(e) => setFichaField("estado", e.target.value)} /></div>
                        <div className="space-y-1"><Label>CEP</Label><Input value={fichaObreiroForm.cep || ""} onChange={(e) => setFichaField("cep", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Profissão</Label><Input value={fichaObreiroForm.profissao || ""} onChange={(e) => setFichaField("profissao", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Ocupação atual</Label><Input value={fichaObreiroForm.ocupacao_atual || ""} onChange={(e) => setFichaField("ocupacao_atual", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Cidade nascimento</Label><Input value={fichaObreiroForm.cidade_nascimento || ""} onChange={(e) => setFichaField("cidade_nascimento", e.target.value)} /></div>
                        <div className="space-y-1">
                          <Label>UF nascimento</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.uf_nascimento || ""}
                            onChange={(e) => setFichaField("uf_nascimento", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            {BRAZIL_UF_OPTIONS.map((uf) => (
                              <option key={uf} value={uf}>
                                {uf}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1"><Label>Nome do pai</Label><Input value={fichaObreiroForm.nome_pai || ""} onChange={(e) => setFichaField("nome_pai", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Nome da mãe</Label><Input value={fichaObreiroForm.nome_mae || ""} onChange={(e) => setFichaField("nome_mae", e.target.value)} /></div>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Dados Familiares</p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1"><Label>Nome da esposa</Label><Input value={fichaObreiroForm.nome_conjuge || ""} onChange={(e) => setFichaField("nome_conjuge", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Nascimento da esposa</Label><Input type="date" value={fichaObreiroForm.conjuge_nascimento || ""} onChange={(e) => setFichaField("conjuge_nascimento", e.target.value)} /></div>
                        <div className="space-y-1"><Label>RG esposa</Label><Input value={fichaObreiroForm.conjuge_rg || ""} onChange={(e) => setFichaField("conjuge_rg", e.target.value)} /></div>
                        <div className="space-y-1"><Label>CPF esposa</Label><Input value={fichaObreiroForm.conjuge_cpf || ""} onChange={(e) => setFichaField("conjuge_cpf", e.target.value)} /></div>
                        <div className="space-y-1">
                          <Label>Esposa é crente</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.conjuge_e_crente || ""}
                            onChange={(e) => setFichaField("conjuge_e_crente", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            <option value="SIM">Sim</option>
                            <option value="NÃO">Não</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Esposa de outro ministério</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.conjuge_outro_ministerio || ""}
                            onChange={(e) => setFichaField("conjuge_outro_ministerio", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            <option value="SIM">Sim</option>
                            <option value="NÃO">Não</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Tem filhos</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.tem_filhos || ""}
                            onChange={(e) => setFichaField("tem_filhos", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            <option value="SIM">Sim</option>
                            <option value="NÃO">Não</option>
                          </select>
                        </div>
                        <div className="space-y-1"><Label>Nº dependentes</Label><Input value={fichaObreiroForm.dependentes_qtd || ""} onChange={(e) => setFichaField("dependentes_qtd", e.target.value)} /></div>
                        <div className="space-y-1">
                          <Label>Doença família</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.doenca_familia || ""}
                            onChange={(e) => setFichaField("doenca_familia", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            <option value="SIM">Sim</option>
                            <option value="NÃO">Não</option>
                          </select>
                        </div>
                        {temFilhosSim ? (
                          <>
                            <div className="space-y-1"><Label>Filho1 Nome</Label><Input value={fichaObreiroForm.filho1_nome || ""} onChange={(e) => setFichaField("filho1_nome", e.target.value)} /></div>
                            <div className="space-y-1"><Label>Filho1 Nascimento</Label><Input type="date" value={fichaObreiroForm.filho1_nascimento || ""} onChange={(e) => setFichaField("filho1_nascimento", e.target.value)} /></div>
                            <div className="space-y-1"><Label>Filho2 Nome</Label><Input value={fichaObreiroForm.filho2_nome || ""} onChange={(e) => setFichaField("filho2_nome", e.target.value)} /></div>
                            <div className="space-y-1"><Label>Filho2 Nascimento</Label><Input type="date" value={fichaObreiroForm.filho2_nascimento || ""} onChange={(e) => setFichaField("filho2_nascimento", e.target.value)} /></div>
                            <div className="space-y-1"><Label>Filho3 Nome</Label><Input value={fichaObreiroForm.filho3_nome || ""} onChange={(e) => setFichaField("filho3_nome", e.target.value)} /></div>
                            <div className="space-y-1"><Label>Filho3 Nascimento</Label><Input type="date" value={fichaObreiroForm.filho3_nascimento || ""} onChange={(e) => setFichaField("filho3_nascimento", e.target.value)} /></div>
                          </>
                        ) : null}
                        {doencaFamiliaSim ? (
                          <div className="space-y-1 xl:col-span-2"><Label>Doença família qual</Label><Input value={fichaObreiroForm.doenca_familia_qual || ""} onChange={(e) => setFichaField("doenca_familia_qual", e.target.value)} /></div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Dados Ministeriais Do(a) Obreiro(a)</p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-1"><Label>Em qual denominação aceitou Jesus</Label><Input value={fichaObreiroForm.denominacao_aceitou_jesus || ""} onChange={(e) => setFichaField("denominacao_aceitou_jesus", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Data da conversão</Label><Input type="date" value={fichaObreiroForm.data_conversao || ""} onChange={(e) => setFichaField("data_conversao", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Data Batismo</Label><Input type="date" value={fichaObreiroForm.data_batismo_aguas || ""} onChange={(e) => setFichaField("data_batismo_aguas", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Ordenação cooperador</Label><Input type="date" value={fichaObreiroForm.ordenacao_cooperador || ""} onChange={(e) => setFichaField("ordenacao_cooperador", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Ordenação diácono</Label><Input type="date" value={fichaObreiroForm.ordenacao_diacono || ""} onChange={(e) => setFichaField("ordenacao_diacono", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Ordenação presbítero</Label><Input type="date" value={fichaObreiroForm.ordenacao_presbitero || ""} onChange={(e) => setFichaField("ordenacao_presbitero", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Ordenação evangelista</Label><Input type="date" value={fichaObreiroForm.ordenacao_evangelista || ""} onChange={(e) => setFichaField("ordenacao_evangelista", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Ordenação voluntário(a) financeiro(a)</Label><Input type="date" value={fichaObreiroForm.ordenacao_voluntario || ""} onChange={(e) => setFichaField("ordenacao_voluntario", e.target.value)} /></div>
                        <div className="space-y-1">
                          <Label>Possui credencial</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.possui_credencial || ""}
                            onChange={(e) => setFichaField("possui_credencial", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            <option value="SIM">Sim</option>
                            <option value="NÃO">Não</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Recebe prebenda</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.recebe_prebenda || ""}
                            onChange={(e) => setFichaField("recebe_prebenda", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            <option value="SIM">Sim</option>
                            <option value="NÃO">Não</option>
                          </select>
                        </div>
                        {recebePrebendaSim ? (
                          <>
                            <div className="space-y-1"><Label>Há quanto tempo</Label><Input value={fichaObreiroForm.prebenda_tempo || ""} onChange={(e) => setFichaField("prebenda_tempo", e.target.value)} /></div>
                            <div className="space-y-1"><Label>Prebenda desde</Label><Input value={fichaObreiroForm.prebenda_desde || ""} onChange={(e) => setFichaField("prebenda_desde", e.target.value)} /></div>
                          </>
                        ) : null}
                        <div className="space-y-1">
                          <Label>Dirige alguma IPDA</Label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={fichaObreiroForm.dirige_alguma_ipda || ""}
                            onChange={(e) => setFichaField("dirige_alguma_ipda", e.target.value)}
                          >
                            <option value="">Selecione</option>
                            <option value="SIM">Sim</option>
                            <option value="NÃO">Não</option>
                          </select>
                        </div>
                        {dirigeAlgumaIpdaSim ? (
                          <div className="space-y-1"><Label>Qual IPDA dirige</Label><Input value={fichaObreiroForm.dirige_ipda_qual || ""} onChange={(e) => setFichaField("dirige_ipda_qual", e.target.value)} /></div>
                        ) : null}
                        <div className="space-y-1 xl:col-span-2"><Label>Endereco igreja completo</Label><Input value={fichaObreiroForm.endereco_igreja_completo || ""} onChange={(e) => setFichaField("endereco_igreja_completo", e.target.value)} /></div>
                        <div className="space-y-1 xl:col-span-2"><Label>Endereço atual congregação</Label><Input value={fichaObreiroForm.endereco_atual_congregacao || ""} onChange={(e) => setFichaField("endereco_atual_congregacao", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Bairro congregação</Label><Input value={fichaObreiroForm.bairro_congregacao || ""} onChange={(e) => setFichaField("bairro_congregacao", e.target.value)} /></div>
                        <div className="space-y-1"><Label>Cidade congregação</Label><Input value={fichaObreiroForm.cidade_congregacao || ""} onChange={(e) => setFichaField("cidade_congregacao", e.target.value)} /></div>
                        <div className="space-y-1"><Label>UF congregação</Label><Input value={fichaObreiroForm.uf_congregacao || ""} onChange={(e) => setFichaField("uf_congregacao", e.target.value)} /></div>
                        <div className="space-y-1"><Label>CEP congregação</Label><Input value={fichaObreiroForm.cep_congregacao || ""} onChange={(e) => setFichaField("cep_congregacao", e.target.value)} /></div>
                      </div>
                    </div>
                  </div>
                  {continuationOrderedKeys.length > 0 ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Continuação - Dados Ministeriais</p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {continuationOrderedKeys.map((key) => {
                        if (!Object.prototype.hasOwnProperty.call(fichaObreiroForm, key)) return null;
                        if (exteriorDependentes.has(key) && !jaDirigiuExteriorSim) return null;
                        if (key === "curso_ministerial_qual" && !cursoMinisterialSim) return null;
                        if (key === "idioma_quais" && !idiomaFluenteSim) return null;
                        if (key === "prebenda_tempo" && !recebePrebendaSim) return null;
                        if (key === "prebenda_desde" && !recebePrebendaSim) return null;
                        if (key === "dirige_ipda_qual" && !dirigeAlgumaIpdaSim) return null;
                        if (key.startsWith("historico_gestao_")) return null;
                        const isLong = key.includes("observacao") || key.includes("motivo") || key.includes("desempenho");
                        const isDate = dateKeys.has(key);
                        return (
                          <div className={`space-y-1 ${isLong ? "xl:col-span-2" : ""}`} key={key}>
                            <Label>{fichaFieldLabel(key)}</Label>
                            {isLong ? (
                              <Textarea value={fichaObreiroForm[key] || ""} onChange={(e) => setFichaField(key, e.target.value)} />
                            ) : yesNoKeys.has(key) ? (
                              <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={fichaObreiroForm[key] || ""}
                                onChange={(e) => setFichaField(key, e.target.value)}
                              >
                                <option value="">Selecione</option>
                                <option value="SIM">Sim</option>
                                <option value="NÃO">Não</option>
                              </select>
                            ) : ufKeys.has(key) ? (
                              <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={fichaObreiroForm[key] || ""}
                                onChange={(e) => setFichaField(key, e.target.value)}
                              >
                                <option value="">Selecione</option>
                                {BRAZIL_UF_OPTIONS.map((uf) => (
                                  <option key={uf} value={uf}>
                                    {uf}
                                  </option>
                                ))}
                              </select>
                            ) : key === "desempenho_ano" ? (
                              <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={fichaObreiroForm[key] || ""}
                                onChange={(e) => setFichaField(key, e.target.value)}
                              >
                                <option value="">Selecione o ano</option>
                                {desempenhoYearOptions.map((ano) => (
                                  <option key={ano} value={ano}>
                                    {ano}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input type={isDate ? "date" : "text"} value={fichaObreiroForm[key] || ""} onChange={(e) => setFichaField(key, e.target.value)} />
                            )}
                          </div>
                        );
                      })}
                      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                          Abaixo escreva quais IPDAs você dirigiu, em que ano e quanto tempo durou sua gestão em cada uma delas:
                        </p>
                        {historicoGestaoRows.map((row) => {
                          const anoKey = `historico_gestao_${row}_ano`;
                          const ipdaKey = `historico_gestao_${row}_ipda`;
                          const ufKey = `historico_gestao_${row}_uf`;
                          const tempoKey = `historico_gestao_${row}_tempo`;
                          return (
                            <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)_140px_170px]" key={`historico-row-${row}`}>
                              <div className="space-y-1">
                                <Label>ANO</Label>
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={fichaObreiroForm[anoKey] || ""}
                                  onChange={(e) => setFichaField(anoKey, e.target.value)}
                                >
                                  <option value="">Selecione o ano</option>
                                  {desempenhoYearOptions.map((ano) => (
                                    <option key={`${anoKey}-${ano}`} value={ano}>
                                      {ano}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>IPDA</Label>
                                <Input value={fichaObreiroForm[ipdaKey] || ""} onChange={(e) => setFichaField(ipdaKey, e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>UF</Label>
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={fichaObreiroForm[ufKey] || ""}
                                  onChange={(e) => setFichaField(ufKey, e.target.value)}
                                >
                                  <option value="">Selecione</option>
                                  {BRAZIL_UF_OPTIONS.map((uf) => (
                                    <option key={`${ufKey}-${uf}`} value={uf}>
                                      {uf}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>TEMPO</Label>
                                <Input value={fichaObreiroForm[tempoKey] || ""} onChange={(e) => setFichaField(tempoKey, e.target.value)} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    </div>
                  ) : null}
                  {fichaCamposAdicionaisRestantes.length > 0 ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Dados Complementares</p>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {fichaCamposAdicionaisRestantes.map((key) => {
                          const isLong = key.includes("observacao") || key.includes("motivo") || key.includes("desempenho");
                          const isDate = dateKeys.has(key);
                          return (
                            <div className={`space-y-1 ${isLong ? "xl:col-span-2" : ""}`} key={key}>
                              <Label>{fichaFieldLabel(key)}</Label>
                              {isLong ? (
                                <Textarea value={fichaObreiroForm[key] || ""} onChange={(e) => setFichaField(key, e.target.value)} />
                              ) : yesNoKeys.has(key) ? (
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={fichaObreiroForm[key] || ""}
                                  onChange={(e) => setFichaField(key, e.target.value)}
                                >
                                  <option value="">Selecione</option>
                                  <option value="SIM">Sim</option>
                                  <option value="NÃO">Não</option>
                                </select>
                              ) : ufKeys.has(key) ? (
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={fichaObreiroForm[key] || ""}
                                  onChange={(e) => setFichaField(key, e.target.value)}
                                >
                                  <option value="">Selecione</option>
                                  {BRAZIL_UF_OPTIONS.map((uf) => (
                                    <option key={uf} value={uf}>
                                      {uf}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <Input type={isDate ? "date" : "text"} value={fichaObreiroForm[key] || ""} onChange={(e) => setFichaField(key, e.target.value)} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {historicoGestaoVisibleCount < 6 ? (
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoricoGestaoVisibleCount((prev) => Math.min(6, prev + 1))}
                      >
                        Adicionar mais histórico
                      </Button>
                    </div>
                  ) : null}
                </div>
                {!fichaObreiroPronta ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={enviarFichaObreiroParaConfeccao} disabled={sendingDoc || isCadastroPendente || !userId}>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar ficha de obreiro
                    </Button>
                    {fetchingFichaObreiroStatus ? <span className="text-xs text-slate-500">Verificando status...</span> : null}
                  </div>
                ) : null}
                {fichaObreiroPronta ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-700">Ficha de obreiro pronta.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => window.open(fichaObreiroUrl, "_blank", "noopener,noreferrer")}>
                        Abrir ficha de obreiro
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => window.open(fichaObreiroUrl, "_blank", "noopener,noreferrer")}>
                        Baixar ficha de obreiro
                      </Button>
                    </div>
                  </div>
                ) : null}
                {!fichaObreiroPronta && fichaObreiroStatus === "ERRO" ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    Falha ao processar ficha de obreiro. {String(fichaObreiroStatusData?.ficha_obreiro?.error_message || "").trim()}
                  </div>
                ) : null}
                {!fichaObreiroPronta && fichaObreiroStatus && fichaObreiroStatus !== "ERRO" ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    Status atual: <strong>{fichaObreiroStatus}</strong>.
                  </div>
                ) : null}
              </div>
            ) : null}
            {/* Ficha: mostra sempre a pré-visualização com todos os dados do membro */}
            {docTab === "ficha" ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <iframe title="Ficha do membro" className="h-[720px] w-full" srcDoc={isCadastroPendente ? "" : fichaHtml} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
