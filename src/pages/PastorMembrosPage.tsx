import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, FileText, Grid2X2, IdCard, List, Loader2, MoreVertical, Printer, Save, Send, Square, Trash2, Users } from "lucide-react";
import { supabaseRealtime } from "@/lib/supabaseRealtime";
import { AvatarCapture } from "@/components/shared/AvatarCapture";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { ObreirosTab } from "@/components/admin/ObreirosTab";
import { MinisterialAttendanceTab } from "@/components/admin/MinisterialAttendanceTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listChurchesInScope, listMembers, type UserListItem, generateMemberDocs, getMemberDocsStatus, deleteMemberDocs, deleteUserPermanently, listReadyCarteirinhas, markCarteirinhasPrinted, generatePrintBatchCarteirinhas, listPrintBatchCarteirinhas, type PrintBatchCarteirinhaItem, type ReadyCarteirinhaItem } from "@/services/saasService";
import { useUser } from "@/context/UserContext";
import { useDebounce } from "@/hooks/useDebounce";
import { fetchAddressByCep, maskCep, onlyDigits } from "@/lib/cep";
import { PageLoading } from "@/components/shared/PageLoading";
import { MobileFiltersCard } from "@/components/shared/MobileFiltersCard";
import { formatCepBr, formatCpfBr, formatDateBr as formatDateBrValue, formatPhoneBr as formatPhoneBrValue } from "@/lib/br-format";
import { BRAZIL_UF_OPTIONS } from "@/lib/brazil-ufs";

type MemberTab = "lista" | "ficha_membro" | "carteirinha" | "ficha_obreiro" | "presenca" | "impressao";
type MemberView = "lista" | "grid";
type CarteirinhaTemplate = "padrao";
type FichaTemplate = "padrao";
const MAX_CARTEIRINHAS_POR_LOTE = 25;
const FAILED_MEMBER_PHOTO_URLS = new Set<string>();
type PrintSectionTab = "selecao" | "documentos";

type MemberDocForm = {
  nome_completo: string;
  matricula: string;
  funcao_ministerial: string;
  data_nascimento: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  estado_civil: string;
  data_batismo: string;
  cpf: string;
  rg: string;
  telefone: string;
  email: string;
  foto_3x4_url: string;
  assinatura_pastor_url: string;
  qr_code_url: string;
  igreja_nome: string;
  ficha_titulo: string;
  ficha_subtitulo: string;
  ficha_rodape: string;
  compromisso_funcao: string;
  congregacao_endereco: string;
  congregacao_numero: string;
  congregacao_bairro: string;
  congregacao_cidade: string;
  antiga_sede_central: string;
  data_termo_cidade: string;
  data_termo_dia: string;
  data_termo_mes: string;
  data_termo_ano: string;
  testemunha1_nome: string;
  testemunha1_documento: string;
  testemunha2_nome: string;
  testemunha2_documento: string;
  observacoes_termo: string;
  nacionalidade: string;
  cidade_nascimento: string;
  uf_nascimento: string;
  data_casamento: string;
  passaporte: string;
  profissao: string;
  ocupacao_atual: string;
  nome_pai: string;
  nome_mae: string;
  tem_filhos: string;
  dependentes_qtd: string;
  filho1_nome: string;
  filho1_nascimento: string;
  filho2_nome: string;
  filho2_nascimento: string;
  filho3_nome: string;
  filho3_nascimento: string;
  doenca_familia: string;
  doenca_familia_qual: string;
  nome_conjuge: string;
  conjuge_nascimento: string;
  conjuge_rg: string;
  conjuge_cpf: string;
  conjuge_e_crente: string;
  conjuge_outro_ministerio: string;
  denominacao_aceitou_jesus: string;
  data_conversao: string;
  data_batismo_aguas: string;
  funcao_ministerial_secundaria: string;
  ordenacao_cooperador: string;
  ordenacao_diacono: string;
  ordenacao_presbitero: string;
  ordenacao_evangelista: string;
  ordenacao_voluntario: string;
  possui_credencial: string;
  recebe_prebenda: string;
  prebenda_tempo: string;
  prebenda_desde: string;
  dirige_alguma_ipda: string;
  dirige_ipda_qual: string;
  endereco_atual_congregacao: string;
  bairro_congregacao: string;
  cidade_congregacao: string;
  uf_congregacao: string;
  cep_congregacao: string;
  dirigente_congregacao: string;
  tel_congregacao: string;
  sede_setorial: string;
  sucursal: string;
  ja_dirigiu_exterior: string;
  cidades_exterior: string;
  paises_exterior: string;
  doenca_exterior: string;
  doenca_exterior_quem: string;
  doenca_exterior_quais: string;
  motivo_volta_brasil: string;
  idioma_fluente: string;
  idioma_quais: string;
  escolaridade: string;
  desempenho_ministerio: string;
  desempenho_ano: string;
  foi_disciplinado: string;
  disciplinado_quantas_vezes: string;
  disciplinado_motivo: string;
  curso_ministerial: string;
  curso_ministerial_qual: string;
  historico_gestao_1_ano: string;
  historico_gestao_1_ipda: string;
  historico_gestao_1_uf: string;
  historico_gestao_1_tempo: string;
  historico_gestao_2_ano: string;
  historico_gestao_2_ipda: string;
  historico_gestao_2_uf: string;
  historico_gestao_2_tempo: string;
  historico_gestao_3_ano: string;
  historico_gestao_3_ipda: string;
  historico_gestao_3_uf: string;
  historico_gestao_3_tempo: string;
};

const emptyForm: MemberDocForm = {
  nome_completo: "",
  matricula: "",
  funcao_ministerial: "",
  data_nascimento: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
  estado_civil: "",
  data_batismo: "",
  cpf: "",
  rg: "",
  telefone: "",
  email: "",
  foto_3x4_url: "",
  assinatura_pastor_url: "",
  qr_code_url: "",
  igreja_nome: "",
  ficha_titulo: "Ficha de cadastro de Membros",
  ficha_subtitulo: "Setorial de Vitória",
  ficha_rodape: "Av Santo Antonio N° 366, Caratoira, Vitória ES",
  compromisso_funcao: "",
  congregacao_endereco: "",
  congregacao_numero: "",
  congregacao_bairro: "",
  congregacao_cidade: "",
  antiga_sede_central: "",
  data_termo_cidade: "",
  data_termo_dia: "",
  data_termo_mes: "",
  data_termo_ano: "",
  testemunha1_nome: "",
  testemunha1_documento: "",
  testemunha2_nome: "",
  testemunha2_documento: "",
  observacoes_termo: "",
  nacionalidade: "",
  cidade_nascimento: "",
  uf_nascimento: "",
  data_casamento: "",
  passaporte: "",
  profissao: "",
  ocupacao_atual: "",
  nome_pai: "",
  nome_mae: "",
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
  data_batismo_aguas: "",
  funcao_ministerial_secundaria: "",
  ordenacao_cooperador: "",
  ordenacao_diacono: "",
  ordenacao_presbitero: "",
  ordenacao_evangelista: "",
  ordenacao_voluntario: "",
  possui_credencial: "",
  recebe_prebenda: "",
  prebenda_tempo: "",
  prebenda_desde: "",
  dirige_alguma_ipda: "",
  dirige_ipda_qual: "",
  endereco_atual_congregacao: "",
  bairro_congregacao: "",
  cidade_congregacao: "",
  uf_congregacao: "",
  cep_congregacao: "",
  dirigente_congregacao: "",
  tel_congregacao: "",
  sede_setorial: "",
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
  desempenho_ministerio: "",
  desempenho_ano: "",
  foi_disciplinado: "",
  disciplinado_quantas_vezes: "",
  disciplinado_motivo: "",
  curso_ministerial: "",
  curso_ministerial_qual: "",
  historico_gestao_1_ano: "",
  historico_gestao_1_ipda: "",
  historico_gestao_1_uf: "",
  historico_gestao_1_tempo: "",
  historico_gestao_2_ano: "",
  historico_gestao_2_ipda: "",
  historico_gestao_2_uf: "",
  historico_gestao_2_tempo: "",
  historico_gestao_3_ano: "",
  historico_gestao_3_ipda: "",
  historico_gestao_3_uf: "",
  historico_gestao_3_tempo: "",
};

function MiniCard({
  title,
  value,
  subtitle,
  gradient,
  onClick,
  active,
}: {
  title: string;
  value: number;
  subtitle: string;
  gradient?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      className={`${gradient || "bg-gradient-to-br from-blue-600 to-blue-500"} rounded-xl p-5 shadow-md ${onClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""} ${active ? "ring-2 ring-white ring-offset-2" : ""}`}
      onClick={onClick}
    >
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold text-white/80">{title}</p>
        <Users className="h-4 w-4 text-white/70" />
      </div>
      <p className="text-4xl font-extrabold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-white/70">{subtitle}</p>
    </div>
  );
}

function statusBadge(isActive: boolean) {
  return isActive
    ? "border-emerald-200 bg-emerald-100 text-emerald-700"
    : "border-rose-200 bg-rose-100 text-rose-700";
}

function toInputDate(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function maskCpf(cpf: string | null | undefined) {
  return formatCpfBr(cpf) || "—";
}

function formatPhone(phone: string | null | undefined) {
  return formatPhoneBrValue(phone) || "—";
}

function formatDateBr(value: string | null | undefined) {
  return formatDateBrValue(value) || "—";
}

function normalizeMinisterRole(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, " ")
    .trim();
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function calcularIdadeBr(dataIso: string | null | undefined) {
  if (!dataIso) return "";
  const parts = String(dataIso).split("-");
  if (parts.length !== 3) return "";
  const ano = Number(parts[0]);
  const mes = Number(parts[1]);
  const dia = Number(parts[2]);
  if (!ano || !mes || !dia) return "";
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const mesAtual = hoje.getMonth() + 1;
  if (mesAtual < mes || (mesAtual === mes && hoje.getDate() < dia)) idade -= 1;
  return idade < 0 ? "" : String(idade);
}

function resolveMemberPhotoUrl(src?: string | null) {
  const url = String(src || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (FAILED_MEMBER_PHOTO_URLS.has(url)) return null;
  return url;
}

function MemberPhoto({ src, alt }: { src?: string | null; alt: string }) {
  const resolved = resolveMemberPhotoUrl(src);
  const [failed, setFailed] = useState(false);
  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={alt}
        className="h-[180px] w-full bg-slate-50 object-contain sm:h-[220px] sm:object-cover sm:object-top"
        onError={() => {
          FAILED_MEMBER_PHOTO_URLS.add(resolved);
          setFailed(true);
        }}
      />
    );
  }
  return (
    <div className="flex h-[180px] w-full items-center justify-center bg-slate-50 sm:h-[220px]">
      <Users className="h-7 w-7 text-slate-400" />
    </div>
  );
}

// Comentario: monta endereco completo da igreja no padrao BR para rodape/webhook.
function buildChurchAddressFooter(params: {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}) {
  const parts = [
    String(params.street || "").trim(),
    params.number ? `numero ${String(params.number).trim()}` : "",
    String(params.neighborhood || "").trim(),
    String(params.city || "").trim(),
  ].filter(Boolean);

  const uf = String(params.state || "").trim().toUpperCase();
  const base = parts.join(", ");
  const withUf = uf ? `${base} - ${uf}` : base;
  const cep = formatCepBr(params.cep || "");
  return cep ? `${withUf} - CEP ${cep}` : withUf;
}

function memberToForm(member: UserListItem, churchName: string, pastorSignature: string, churchFooter: string) {
  return {
    nome_completo: member.full_name || "",
    matricula: member.matricula || "",
    funcao_ministerial: member.minister_role || "",
    data_nascimento: toInputDate(member.birth_date),
    endereco: member.address_street || "",
    numero: member.address_number || "",
    bairro: member.address_neighborhood || "",
    cidade: member.address_city || "",
    estado: member.address_state || "",
    estado_civil: member.marital_status || "",
    data_batismo: toInputDate(member.baptism_date),
    cpf: member.cpf || "",
    rg: member.rg || "",
    telefone: member.phone || "",
    email: member.email || "",
    foto_3x4_url: member.avatar_url || "",
    assinatura_pastor_url: pastorSignature || "",
    qr_code_url: "",
    igreja_nome: churchName,
    ficha_titulo: "Ficha de cadastro de Membros",
    ficha_subtitulo: churchName || "Setorial de Vitória",
    ficha_rodape: churchFooter,
    compromisso_funcao: member.minister_role || "",
    congregacao_endereco: member.address_street || "",
    congregacao_numero: member.address_number || "",
    congregacao_bairro: member.address_neighborhood || "",
    congregacao_cidade: member.address_city || "",
    antiga_sede_central: "",
    data_termo_cidade: member.address_city || "",
    data_termo_dia: "",
    data_termo_mes: "",
    data_termo_ano: "",
    testemunha1_nome: "",
    testemunha1_documento: "",
    testemunha2_nome: "",
    testemunha2_documento: "",
    observacoes_termo: "",
    nacionalidade: "",
    cidade_nascimento: member.address_city || "",
    uf_nascimento: member.address_state || "",
    data_casamento: "",
    passaporte: "",
    profissao: member.profession || "",
    ocupacao_atual: "",
    nome_pai: "",
    nome_mae: "",
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
    data_batismo_aguas: "",
    funcao_ministerial_secundaria: member.minister_role || "",
    ordenacao_cooperador: "",
    ordenacao_diacono: "",
    ordenacao_presbitero: "",
    ordenacao_evangelista: "",
    ordenacao_voluntario: "",
    possui_credencial: "",
    recebe_prebenda: "",
    prebenda_tempo: "",
    prebenda_desde: "",
    dirige_alguma_ipda: "",
    dirige_ipda_qual: "",
    endereco_atual_congregacao: "",
    bairro_congregacao: "",
    cidade_congregacao: "",
    uf_congregacao: "",
    cep_congregacao: member.cep || "",
    dirigente_congregacao: "",
    tel_congregacao: "",
    sede_setorial: "",
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
    desempenho_ministerio: "",
    desempenho_ano: "",
    foi_disciplinado: "",
    disciplinado_quantas_vezes: "",
    disciplinado_motivo: "",
    curso_ministerial: "",
    curso_ministerial_qual: "",
    historico_gestao_1_ano: "",
    historico_gestao_1_ipda: "",
    historico_gestao_1_uf: "",
    historico_gestao_1_tempo: "",
    historico_gestao_2_ano: "",
    historico_gestao_2_ipda: "",
    historico_gestao_2_uf: "",
    historico_gestao_2_tempo: "",
    historico_gestao_3_ano: "",
    historico_gestao_3_ipda: "",
    historico_gestao_3_uf: "",
    historico_gestao_3_tempo: "",
  };
}

function tabLabel(tab: MemberTab) {
  if (tab === "ficha_membro") return "Ficha do membro";
  if (tab === "carteirinha") return "Carteirinha";
  if (tab === "impressao") return "Impressão";
  if (tab === "presenca") return "Presença";
  return "Ficha de obreiro";
}


function svgPlaceholder(label: string, width = 300, height = 200) {
  const safe = encodeURIComponent(label);
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='100%' height='100%' fill='%23F1F5F9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364758B' font-size='20' font-family='Arial'>${safe}</text></svg>`;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildCarteirinhaHtml(form: MemberDocForm) {
  const foto = escapeHtml(form.foto_3x4_url || svgPlaceholder("Foto 3x4", 300, 400));
  const assinatura = escapeHtml(form.assinatura_pastor_url || svgPlaceholder("Assinatura Pastor", 600, 160));
  const qr = escapeHtml(form.qr_code_url || svgPlaceholder("QR", 300, 300));
  const nome = escapeHtml(form.nome_completo || "");
  const funcao = escapeHtml(form.funcao_ministerial || "");
  const matricula = escapeHtml(form.matricula || "");
  const cpf = escapeHtml(formatCpfBr(form.cpf || ""));
  const telefone = escapeHtml(formatPhoneBrValue(form.telefone || ""));
  const batismo = escapeHtml(formatDateBrValue(form.data_batismo || ""));

  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8" />
<style>
body{margin:0;font-family:Montserrat,Arial,sans-serif;background:#fff}
.page{width:100%;padding:8px;box-sizing:border-box}
.wrap{width:176mm;height:55mm;display:flex}
.side{width:88mm;height:55mm;position:relative;overflow:hidden;box-sizing:border-box;background:#fff}
.front{border:.3mm solid rgba(0,0,0,.45);border-right:none;background-image:url("https://idipilrcaqittmnapmbq.supabase.co/storage/v1/object/public/banner/carteirinha/banner%20carteirinha.jpg");background-repeat:no-repeat;background-size:auto 100%;background-position:left center}
.back{border:.3mm solid rgba(0,0,0,.45);border-left:none}
.photo{position:absolute;right:7mm;top:6mm;width:20mm;height:26.5mm;border-radius:4mm;overflow:hidden}
.photo img{width:100%;height:100%;object-fit:cover}
.text-center{position:absolute;left:6mm;right:10mm;bottom:3mm;text-align:center}
.name{font-size:10.2pt;font-weight:800;color:#4c63ff;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 1.2mm 0}
.role{font-size:10pt;font-weight:800;color:#ff6b6b;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 1.6mm 0}
.info{font-size:6.3pt;font-weight:700;color:#ff6b6b;text-transform:uppercase;letter-spacing:.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0}
.title{position:absolute;top:5mm;left:0;width:100%;text-align:center;font-size:12pt;font-weight:800;font-style:italic;color:#000}
.field-box{position:absolute;border:.4mm solid rgba(0,0,0,.55);border-radius:1mm;background:rgba(255,255,255,.3)}
.field-label{position:absolute;font-size:6pt;font-weight:700;color:#000;text-transform:uppercase;text-align:center;line-height:1}
.field-value{position:absolute;font-size:7.5pt;font-weight:700;color:#000;text-align:center;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.id-box{width:29mm;height:4.2mm;top:14mm;left:50%;transform:translateX(-50%)} .id-label{width:29mm;top:19mm;left:50%;transform:translateX(-50%)} .id-value{width:29mm;top:15.2mm;left:50%;transform:translateX(-50%)}
.cpf-box{width:24.5mm;height:4.4mm;top:23mm;left:6mm} .cpf-label{width:24.5mm;top:28.2mm;left:6mm} .cpf-value{width:24.5mm;top:24.4mm;left:6mm}
.tel-box{width:24.5mm;height:4.4mm;top:23mm;left:50%;transform:translateX(-50%)} .tel-label{width:24.5mm;top:28.2mm;left:50%;transform:translateX(-50%)} .tel-value{width:24.5mm;top:24.4mm;left:50%;transform:translateX(-50%)}
.bat-box{width:24.5mm;height:4.4mm;top:23mm;right:6mm} .bat-label{width:24.5mm;top:28.2mm;right:6mm} .bat-value{width:24.5mm;top:24.4mm;right:6mm}
.line{position:absolute;left:6mm;right:30mm;top:45mm;height:.7mm;background:rgba(0,0,0,.85)}
.pastor-sign{position:absolute;left:6mm;right:30mm;top:38.4mm;height:5.8mm;text-align:center}
.pastor-sign img{max-height:100%;max-width:100%;object-fit:contain}
.pastor-label{top:46.6mm;left:6mm;right:30mm}
.qr{position:absolute;left:65mm;bottom:2mm;width:17.3mm;height:18.7mm;border-radius:4mm;overflow:hidden;border:.3mm solid rgba(0,0,0,.25)}
.qr img{width:100%;height:100%;object-fit:cover}
</style></head>
<body><div class="page"><div class="wrap">
<div class="side front">
<div class="photo"><img src="${foto}" alt="Foto"></div>
<div class="text-center"><p class="name">${nome}</p><p class="role">${funcao}</p><p class="info">ESTE DOCUMENTO É PESSOAL E INTRANSFERÍVEL</p></div>
</div>
<div class="side back">
<div class="title">CARTEIRINHA DE MEMBRO</div>
<div class="field-box id-box"></div><div class="field-label id-label">ID/REGISTRADO</div><div class="field-value id-value">${matricula}</div>
<div class="field-box cpf-box"></div><div class="field-label cpf-label">CPF</div><div class="field-value cpf-value">${cpf}</div>
<div class="field-box tel-box"></div><div class="field-label tel-label">TELEFONE</div><div class="field-value tel-value">${telefone}</div>
<div class="field-box bat-box"></div><div class="field-label bat-label">DATA BATISMO</div><div class="field-value bat-value">${batismo}</div>
<div class="pastor-sign"><img src="${assinatura}" alt="Assinatura"></div><div class="line"></div><div class="field-label pastor-label">ASSINATURA PASTOR</div>
<div class="qr"><img src="${qr}" alt="QR"></div>
</div></div></div></body></html>`;
}

function buildFichaMembroHtml(form: MemberDocForm) {
  const foto = escapeHtml(form.foto_3x4_url || svgPlaceholder("Foto 3x4", 300, 400));
  const logo = "https://idipilrcaqittmnapmbq.supabase.co/storage/v1/object/public/banner/logo/logo%20d.png";
  const titulo = escapeHtml(form.ficha_titulo || "Ficha de cadastro de Membros");
  const subtitulo = escapeHtml(form.ficha_subtitulo || "Setorial de Vitória");
  const rodape = escapeHtml(form.ficha_rodape || "");

  const nasc = escapeHtml(formatDateBrValue(form.data_nascimento || ""));
  const bat = escapeHtml(formatDateBrValue(form.data_batismo || ""));
  const ord = escapeHtml(formatDateBrValue(form.ordenacao_presbitero || form.ordenacao_diacono || form.ordenacao_cooperador || ""));

  return `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
@page{size:A4;margin:15mm} body{margin:0;font-family:Montserrat,Arial,sans-serif;color:#111}
.page{width:210mm;height:297mm;box-sizing:border-box}
.header{display:flex;align-items:center;justify-content:center;gap:12mm;margin-top:2mm}
.header-photo{width:25mm;height:32mm;border:.35mm solid rgba(0,0,0,.25);border-radius:2mm;overflow:hidden;background:#ffffff}
.header-photo img{width:100%;height:100%;object-fit:cover}
.logo{height:45mm;width:auto;display:block}
.title{text-align:center;margin:10mm 0 8mm 0;line-height:1.15}
.title h1{margin:0;font-size:16pt;font-weight:800}.title h2{margin:2mm 0 0 0;font-size:14pt;font-weight:800}
.content{margin-top:4mm;font-size:10.5pt}
.row{display:flex;gap:10mm;margin:2.2mm 0;flex-wrap:wrap}
.field{display:flex;gap:2mm;align-items:baseline;min-width:0}
.label{font-weight:600;white-space:nowrap}
.value{font-weight:500;border-bottom:.25mm solid rgba(0,0,0,.25);padding:0 1mm .6mm 1mm;min-width:40mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w-70{min-width:70mm}.w-60{min-width:60mm}.w-50{min-width:50mm}.w-45{min-width:45mm}.w-40{min-width:40mm}.w-35{min-width:35mm}.w-30{min-width:30mm}.w-25{min-width:25mm}
.section-title{text-align:center;margin:22mm 0 8mm 0;font-size:14pt;font-weight:900}
.footer{margin-top:14mm;text-align:center;font-weight:800;font-size:11pt;line-height:1.35;white-space:normal;word-break:break-word}
@media screen and (max-width: 768px){
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
</style></head><body><div class="page">
<div class="header"><div class="header-photo"><img src="${foto}" alt="Foto" /></div><img class="logo" src="${logo}" alt="Logo" /></div>
<div class="title"><h1>${titulo}</h1><h2>${subtitulo}</h2></div>
<div class="content">
<div class="row"><div class="field"><div class="label">Nome:</div><div class="value w-70">${escapeHtml(form.nome_completo)}</div></div></div>
<div class="row"><div class="field"><div class="label">Endereço:</div><div class="value w-70">${escapeHtml(form.endereco)}</div></div><div class="field"><div class="label">Número da casa:</div><div class="value w-30">${escapeHtml(form.numero)}</div></div></div>
<div class="row"><div class="field"><div class="label">Bairro:</div><div class="value w-45">${escapeHtml(form.bairro)}</div></div><div class="field"><div class="label">Cidade:</div><div class="value w-45">${escapeHtml(form.cidade)}</div></div><div class="field"><div class="label">Estado:</div><div class="value w-25">${escapeHtml(form.estado)}</div></div><div class="field"><div class="label">Cep:</div><div class="value w-25">${escapeHtml(formatCepBr(form.cep_congregacao || ""))}</div></div></div>
<div class="row"><div class="field"><div class="label">RG:</div><div class="value w-35">${escapeHtml(form.rg)}</div></div><div class="field"><div class="label">CPF:</div><div class="value w-35">${escapeHtml(formatCpfBr(form.cpf))}</div></div><div class="field"><div class="label">Data de Nascimento:</div><div class="value w-45">${nasc}</div></div></div>
<div class="row"><div class="field"><div class="label">Cidade de Nascimento:</div><div class="value w-60">${escapeHtml(form.cidade_nascimento)}</div></div><div class="field"><div class="label">Estado:</div><div class="value w-35">${escapeHtml(form.uf_nascimento)}</div></div></div>
<div class="row"><div class="field"><div class="label">Estado Civil:</div><div class="value w-40">${escapeHtml(form.estado_civil)}</div></div><div class="field"><div class="label">Telefone:</div><div class="value w-45">${escapeHtml(formatPhoneBrValue(form.telefone))}</div></div></div>
<div class="row"><div class="field"><div class="label">Endereço de email:</div><div class="value w-70">${escapeHtml(form.email)}</div></div></div>
<div class="row"><div class="field"><div class="label">Profissão:</div><div class="value w-60">${escapeHtml(form.profissao)}</div></div><div class="field"><div class="label">Idade:</div><div class="value w-25">${escapeHtml(calcularIdadeBr(form.data_nascimento))}</div></div></div>
<div class="section-title">Dados Ministeriais do Membro e do Obreiro (a)</div>
<div class="row"><div class="field"><div class="label">Data de Batismo:</div><div class="value w-45">${bat}</div></div><div class="field"><div class="label">Função Ministerial:</div><div class="value w-50">${escapeHtml(form.funcao_ministerial)}</div></div></div>
<div class="row"><div class="field"><div class="label">Data da Ordenação:</div><div class="value w-45">${ord}</div></div></div>
</div>
<div class="footer">${rodape}</div>
</div></body></html>`;
}

export default function PastorMembrosPage() {
  const { session, usuario } = useUser();
  const queryClient = useQueryClient();
  const activeTotvsId = String(session?.totvs_id || usuario?.default_totvs_id || usuario?.totvs || "");
  const churchClass = String(session?.church_class || "").toLowerCase();
  const [tab, setTab] = useState<MemberTab>("lista");
  const [view, setView] = useState<MemberView>("lista");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [form, setForm] = useState<MemberDocForm>(emptyForm);
  const [manualCarteirinha, setManualCarteirinha] = useState(false);
  const [manualFichaMembro, setManualFichaMembro] = useState(false);
  const [carteirinhaTemplate, setCarteirinhaTemplate] = useState<CarteirinhaTemplate>("padrao");
  const [fichaTemplate, setFichaTemplate] = useState<FichaTemplate>("padrao");
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize, setMembersPageSize] = useState(50);
  const [filterTotvs, setFilterTotvs] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");
  // Comentario: filtro de membros ativos/inativos — undefined = todos ativos, false = so inativos
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  // Comentario: searchChurch e o texto digitado no combobox de busca de igreja.
  const [searchChurch, setSearchChurch] = useState("");
  const debouncedSearchChurch = useDebounce(searchChurch, 400);
  // Comentario: filterCargo controla o Select de cargo na pagina de membros do pastor.
  const [filterCargo, setFilterCargo] = useState("all");
  // Comentario: showChurchList controla visibilidade do dropdown de igrejas no combobox.
  const [showChurchList, setShowChurchList] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingDocs, setDeletingDocs] = useState(false);
  // Comentario: arquivo de foto capturado pela camera, aguardando upload.
  const [pendingFotoFile, setPendingFotoFile] = useState<File | null>(null);
  // Comentario: true enquanto o upload da foto esta em andamento.
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [lastCepLookup, setLastCepLookup] = useState("");
  const carteirinhaHtml = useMemo(() => buildCarteirinhaHtml(form), [form]);
  const fichaMembroHtml = useMemo(() => buildFichaMembroHtml(form), [form]);
  const forceSingleChurchFilter = filterTotvs !== "all";
  const useScopeList = !forceSingleChurchFilter && churchClass === "estadual";
  const membersChurchTotvsFilter = forceSingleChurchFilter
    ? filterTotvs
    : useScopeList
      ? undefined
      : activeTotvsId || undefined;

  // ── Aba Impressão em lote ──────────────────────────────────────────────────
  // Comentario: selectedPrintIds guarda os IDs das carteirinhas selecionadas para imprimir
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(new Set());
  // Comentario: filterPrint controla se mostra todas ou só as não impressas
  const [filterPrint, setFilterPrint] = useState<"all" | "pending">("pending");
  const [sendingBatch, setSendingBatch] = useState(false);
  const [printBatchUrl, setPrintBatchUrl] = useState("");
  const [printSectionTab, setPrintSectionTab] = useState<PrintSectionTab>("selecao");
  const [memberPickerSearch, setMemberPickerSearch] = useState("");

  // Comentario: busca carteirinhas prontas para impressao da igreja ativa
  const { data: readyCarteirinhas = [], isLoading: loadingReady, refetch: refetchReady } = useQuery({
    queryKey: ["ready-carteirinhas", activeTotvsId],
    queryFn: () => listReadyCarteirinhas(activeTotvsId),
    enabled: tab === "impressao" && !!activeTotvsId,
  });
  const { data: printBatchDocs = [], isLoading: loadingBatchDocs, refetch: refetchBatchDocs } = useQuery({
    queryKey: ["print-batch-carteirinhas", activeTotvsId],
    queryFn: () => listPrintBatchCarteirinhas(activeTotvsId),
    enabled: tab === "impressao" && !!activeTotvsId,
  });

  // Comentario: filtra carteirinhas baseado no filtro selecionado
  const filteredCarteirinhas = useMemo(() => {
    if (filterPrint === "pending") return readyCarteirinhas.filter((c) => !c.printed_at);
    return readyCarteirinhas;
  }, [readyCarteirinhas, filterPrint]);

  // Comentario: realtime para atualizar lista de carteirinhas prontas na aba de impressao
  useEffect(() => {
    if (tab !== "impressao") return;
    const channel = supabaseRealtime
      .channel("print-carteirinhas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "member_carteirinha_documents" }, () => {
        void refetchReady();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "member_carteirinha_print_batches" }, () => {
        void refetchBatchDocs();
      })
      .subscribe();
    return () => { void supabaseRealtime.removeChannel(channel); };
  }, [tab, refetchReady, refetchBatchDocs]);

  const { data, isLoading: loadingMembers, isFetching: fetchingMembers, refetch: refetchMembers } = useQuery({
    queryKey: ["pastor-members-page", membersPage, membersPageSize, filterTotvs, filterActive, churchClass, activeTotvsId],
    queryFn: () =>
      listMembers({
        page: membersPage,
        page_size: membersPageSize,
        roles: ["pastor", "obreiro", "secretario", "financeiro"],
        church_totvs_id: membersChurchTotvsFilter,
        is_active: filterActive,
    }),
  });

  const workers = data?.workers || [];
  const membersTotal = Number(data?.total || workers.length);
  const membersTotalPages = Math.max(1, Math.ceil(membersTotal / membersPageSize));

  const { data: allMembersData = [], refetch: refetchAllMembers } = useQuery({
    queryKey: ["pastor-members-all", filterTotvs, filterActive, churchClass, activeTotvsId],
    queryFn: async () => {
      const requestedPageSize = 500;
      let page = 1;
      let total: number | null = null;
      const all: UserListItem[] = [];

      while (page <= 30) {
        const chunk = await listMembers({
          page,
          page_size: requestedPageSize,
          roles: ["pastor", "obreiro", "secretario", "financeiro"],
          church_totvs_id: membersChurchTotvsFilter,
          is_active: filterActive,
        });
        const items = Array.isArray(chunk.workers) ? chunk.workers : [];
        if (items.length === 0) break;
        all.push(...items);
        const chunkTotal = Number(chunk.total || 0);
        if (chunkTotal > 0) total = chunkTotal;
        const effectivePageSize = Number(chunk.page_size || requestedPageSize || items.length);
        if ((total !== null && all.length >= total) || items.length < effectivePageSize) break;
        page += 1;
      }

      return all;
    },
    enabled: Boolean(activeTotvsId) && (tab === "ficha_membro" || tab === "carteirinha" || tab === "ficha_obreiro" || tab === "impressao"),
  });

  // Comentario: busca a contagem de membros inativos para exibir no card
  const { data: inativosData } = useQuery({
    queryKey: ["pastor-members-inativos-count", filterTotvs, churchClass, activeTotvsId],
    queryFn: () =>
      listMembers({
        page: 1,
        page_size: 1,
        roles: ["pastor", "obreiro", "secretario", "financeiro"],
        church_totvs_id: membersChurchTotvsFilter,
        is_active: false,
      }),
  });
  const inativosCount = Number(inativosData?.total || 0);

  const { data: churchesInScope = [], isLoading: loadingChurches, isFetching: fetchingChurches } = useQuery({
    queryKey: ["pastor-members-churches-footer", activeTotvsId],
    queryFn: () => listChurchesInScope(1, 400),
    enabled: Boolean(activeTotvsId),
    // Comentario: igrejas sao usadas apenas para combobox e rodape — podem
    // carregar em background sem bloquear a tabela principal.
    staleTime: 5 * 60_000,
  });

  // Comentario: carregamento progressivo — bloqueia so enquanto members principal
  // nao chegou. Churches carregam em background (usadas so no combobox e rodape).
  const showPageLoading =
    loadingMembers ||
    (fetchingMembers && workers.length === 0);
  const activeChurch = useMemo(
    () => churchesInScope.find((church) => String(church.totvs_id || "") === activeTotvsId) || null,
    [churchesInScope, activeTotvsId],
  );
  const churchFooter = useMemo(() => {
    return buildChurchAddressFooter({
      street: activeChurch?.address_street,
      number: activeChurch?.address_number,
      neighborhood: activeChurch?.address_neighborhood,
      city: activeChurch?.address_city,
      state: activeChurch?.address_state,
      cep: activeChurch?.cep || "",
    });
  }, [activeChurch]);
  const churchFilterOptions = useMemo(() => {
    if (!activeTotvsId || churchesInScope.length === 0) return [];
    const children = new Map<string, string[]>();
    for (const church of churchesInScope) {
      const parent = String(church.parent_totvs_id || "");
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(String(church.totvs_id));
    }
    const scope = new Set<string>();
    const queue = [activeTotvsId];
    while (queue.length) {
      const cur = queue.shift()!;
      if (scope.has(cur)) continue;
      scope.add(cur);
      for (const child of children.get(cur) || []) queue.push(child);
    }
    return churchesInScope.filter((church) => scope.has(String(church.totvs_id)));
  }, [churchesInScope, activeTotvsId]);

  // Comentario: filtra a lista de igrejas pelo texto digitado (2+ chars) para o combobox de busca.
  const filteredChurchOptions = useMemo(() => {
    const typed = debouncedSearchChurch.trim();
    const q = typed.toLowerCase();
    if (!typed) return churchFilterOptions.slice(0, 10);
    if (/^\d+$/.test(typed)) {
      return churchFilterOptions.filter((c) => String(c.totvs_id || "") === typed).slice(0, 1);
    }
    if (q.length < 2) return churchFilterOptions.slice(0, 10);
    return churchFilterOptions
      .filter(
        (c) =>
          String(c.church_name || "").toLowerCase().includes(q) ||
          String(c.totvs_id || "").includes(typed),
      )
      .slice(0, 20);
  }, [churchFilterOptions, debouncedSearchChurch]);

  // Comentario: igreja atualmente selecionada no combobox (pelo totvs_id).
  const selectedFilterChurch = useMemo(
    () => churchFilterOptions.find((c) => String(c.totvs_id) === filterTotvs) || null,
    [churchFilterOptions, filterTotvs],
  );
  useEffect(() => {
    const typed = debouncedSearchChurch.trim();
    if (!typed) {
      if (filterTotvs !== "all") {
        setFilterTotvs("all");
        setMembersPage(1);
      }
      return;
    }

    if (!/^\d+$/.test(typed)) return;

    const matchedChurch = churchFilterOptions.find((church) => String(church.totvs_id) === typed);
    if (!matchedChurch) {
      if (filterTotvs !== "all") {
        setFilterTotvs("all");
        setMembersPage(1);
      }
      return;
    }

    if (filterTotvs !== typed) {
      setFilterTotvs(typed);
      setMembersPage(1);
    }
  }, [debouncedSearchChurch, churchFilterOptions, filterTotvs]);

  const rodapeAuto = useMemo(() => churchFooter || form.ficha_rodape || "", [churchFooter, form.ficha_rodape]);
  const docsMembers = allMembersData || workers;
  const filteredDocsMembers = useMemo(() => {
    const q = normalizeSearchText(memberPickerSearch);
    const qDigits = onlyDigits(memberPickerSearch || "");
    if (!q && !qDigits) return docsMembers;
    if (q.length < 3 && qDigits.length < 3) return docsMembers;
    return docsMembers.filter((member) => {
      const name = normalizeSearchText(member.full_name || "");
      const cpfDigits = onlyDigits(member.cpf || "");
      return (q && name.includes(q)) || (qDigits && cpfDigits.includes(qDigits));
    });
  }, [docsMembers, memberPickerSearch]);
  useEffect(() => {
    const q = normalizeSearchText(memberPickerSearch);
    const qDigits = onlyDigits(memberPickerSearch || "");
    if (q.length < 3 && qDigits.length < 3) return;
    if (filteredDocsMembers.length === 1) {
      setSelectedMemberId(String(filteredDocsMembers[0].id));
    }
  }, [memberPickerSearch, filteredDocsMembers]);
  useEffect(() => {
    const q = normalizeSearchText(memberPickerSearch);
    const qDigits = onlyDigits(memberPickerSearch || "");
    if (q.length < 3 && qDigits.length < 3) return;
    if (!filteredDocsMembers.length) return;
    const existsInFiltered = filteredDocsMembers.some((m) => String(m.id) === selectedMemberId);
    if (!existsInFiltered) {
      setSelectedMemberId(String(filteredDocsMembers[0].id));
    }
  }, [memberPickerSearch, filteredDocsMembers, selectedMemberId]);
  const selectedMember = useMemo(
    () => docsMembers.find((member) => String(member.id) === selectedMemberId) || null,
    [docsMembers, selectedMemberId],
  );

  async function handleDeleteMember(member: UserListItem) {
    const confirmed = window.confirm(`Tem certeza que deseja deletar ${member.full_name || "este usuario"}?`);
    if (!confirmed) return;
    try {
      await deleteUserPermanently(String(member.id));
      toast.success("Usuario deletado.");
      await refetchMembers();
      await refetchAllMembers();
    } catch (err) {
      toast.error(String((err as Error)?.message || "Falha ao deletar usuario."));
    }
  }
  const pastorDaIgreja = useMemo(
    () => docsMembers.find((member) => member.role === "pastor" && String(member.default_totvs_id || "") === activeTotvsId) || null,
    [docsMembers, activeTotvsId],
  );
  const churchName = String(session?.church_name || usuario?.church_name || "");
  const docsTabOpen = tab === "carteirinha" || tab === "ficha_membro";
  // Comentario: usa default_totvs_id do membro selecionado (nao do pastor logado),
  // pois o registro foi salvo com a igreja do membro na edge function.
  const memberChurchTotvsId = String(selectedMember?.default_totvs_id || activeTotvsId);
  const { data: docsStatus, refetch: refetchDocsStatus, isFetching: fetchingDocsStatus } = useQuery({
    queryKey: ["pastor-member-docs-status", selectedMemberId, memberChurchTotvsId],
    queryFn: () => getMemberDocsStatus({ member_id: selectedMemberId, church_totvs_id: memberChurchTotvsId }),
    enabled: Boolean(docsTabOpen && selectedMemberId && memberChurchTotvsId),
  });

  // Comentario: Realtime — escuta mudancas nas tabelas de ficha e carteirinha
  // Substitui o polling de 10s. Quando o webhook atualiza o status, o frontend reage instantaneamente.
  const refetchDocsStatusCb = useCallback(() => { void refetchDocsStatus(); }, [refetchDocsStatus]);
  useEffect(() => {
    if (!selectedMemberId || !docsTabOpen) return;
    const channel = supabaseRealtime
      .channel(`member-docs-${selectedMemberId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_ficha_documents" }, refetchDocsStatusCb)
      .on("postgres_changes", { event: "*", schema: "public", table: "member_carteirinha_documents" }, refetchDocsStatusCb)
      .subscribe();
    return () => { void supabaseRealtime.removeChannel(channel); };
  }, [selectedMemberId, docsTabOpen, refetchDocsStatusCb]);
  const fichaPronta = Boolean(
    docsStatus?.ficha &&
      String(docsStatus?.ficha?.final_url || "").trim().length > 0,
  );
  const carteirinhaPronta =
    String(docsStatus?.carteirinha?.status || "").toUpperCase() === "PRONTO" ||
    Boolean(docsStatus?.carteirinha && String(docsStatus?.carteirinha?.final_url || "").trim().length > 0);
  const carteirinhaLink = String(docsStatus?.carteirinha?.ficha_url_qr || docsStatus?.carteirinha?.final_url || "").trim();

  useEffect(() => {
    if (tab === "ficha_obreiro") {
      setTab("lista");
    }
  }, [tab]);

  useEffect(() => {
    if (!selectedMemberId && docsMembers.length > 0) {
      setSelectedMemberId(String(docsMembers[0].id));
      return;
    }
    if (!selectedMember) return;
    const pastorSignature = String((pastorDaIgreja as UserListItem | null)?.signature_url || "");
    setForm(memberToForm(selectedMember, churchName, pastorSignature, churchFooter));
    // Comentario: limpa o arquivo de foto pendente ao trocar de membro.
    setPendingFotoFile(null);
  }, [selectedMemberId, selectedMember, docsMembers, churchName, pastorDaIgreja, churchFooter]);

  async function autofillCep(force = false) {
    const cepDigits = onlyDigits(form.cep_congregacao);
    if (cepDigits.length !== 8) return;
    if (!force && (cepLookupLoading || lastCepLookup === cepDigits)) return;

    setCepLookupLoading(true);
    try {
      const data = await fetchAddressByCep(cepDigits);
      setForm((prev) => ({
        ...prev,
        cep_congregacao: maskCep(cepDigits),
        congregacao_endereco: prev.congregacao_endereco || data.logradouro,
        congregacao_bairro: prev.congregacao_bairro || data.bairro,
        congregacao_cidade: prev.congregacao_cidade || data.localidade,
        uf_congregacao: prev.uf_congregacao || data.uf,
      }));
      setLastCepLookup(cepDigits);
    } catch (err) {
      if (force) {
        toast.error(String((err as Error)?.message || "") === "cep_not_found" ? "CEP não encontrado." : "Falha ao buscar CEP.");
      }
    } finally {
      setCepLookupLoading(false);
    }
  }

  useEffect(() => {
    const cepDigits = onlyDigits(form.cep_congregacao);
    if (cepDigits.length !== 8) return;
    void autofillCep();
  }, [form.cep_congregacao]);

  const uniqueMembersForCounters = useMemo(() => {
    if (!Array.isArray(allMembersData)) return [];
    const byId = new Map<string, UserListItem>();
    for (const member of allMembersData) {
      const key = String(member.id || "");
      if (!key) continue;
      byId.set(key, member);
    }
    return Array.from(byId.values());
  }, [allMembersData]);

  const counters = useMemo(() => {
    if (membersTotal <= membersPageSize) {
      return {
        total: workers.length,
        pastor: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "pastor").length,
        presbitero: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "presbitero").length,
        diacono: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "diacono").length,
        obreiro: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "cooperador").length,
        batizados: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "membro").length,
      };
    }

    if (uniqueMembersForCounters.length > 0) {
      return {
        total: uniqueMembersForCounters.length,
        pastor: uniqueMembersForCounters.filter((w) => normalizeMinisterRole(w.minister_role) === "pastor").length,
        presbitero: uniqueMembersForCounters.filter((w) => normalizeMinisterRole(w.minister_role) === "presbitero").length,
        diacono: uniqueMembersForCounters.filter((w) => normalizeMinisterRole(w.minister_role) === "diacono").length,
        obreiro: uniqueMembersForCounters.filter((w) => normalizeMinisterRole(w.minister_role) === "cooperador").length,
        batizados: uniqueMembersForCounters.filter((w) => normalizeMinisterRole(w.minister_role) === "membro").length,
      };
    }
    if (data?.metrics) {
      return {
        total: Number(data.metrics.total || 0),
        pastor: Number(data.metrics.pastor || 0),
        presbitero: Number(data.metrics.presbitero || 0),
        diacono: Number(data.metrics.diacono || 0),
        obreiro: Number(data.metrics.obreiro || 0),
        batizados: Number(data.metrics.membro || 0),
      };
    }
    return {
      total: workers.length,
      pastor: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "pastor").length,
      presbitero: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "presbitero").length,
      diacono: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "diacono").length,
      obreiro: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "cooperador").length,
      batizados: workers.filter((w) => normalizeMinisterRole(w.minister_role) === "membro").length,
    };
  }, [membersTotal, membersPageSize, uniqueMembersForCounters, data?.metrics, workers]);

  useEffect(() => {
    if (membersPage >= membersTotalPages) return;
    const nextPage = membersPage + 1;
    void queryClient.prefetchQuery({
      queryKey: ["pastor-members-page", nextPage, membersPageSize, filterTotvs, filterActive, churchClass, activeTotvsId],
      queryFn: () =>
        listMembers({
          page: nextPage,
          page_size: membersPageSize,
          roles: ["pastor", "obreiro", "secretario", "financeiro"],
          church_totvs_id: membersChurchTotvsFilter,
          is_active: filterActive,
        }),
    });
  }, [membersPage, membersPageSize, membersTotalPages, filterTotvs, filterActive, churchClass, activeTotvsId, membersChurchTotvsFilter, queryClient]);

  // Comentario: faz upload da foto para o bucket "avatars" e salva a URL no formulario.
  async function uploadFoto(file: File) {
    if (!supabase) { toast.error("Supabase não configurado."); return; }
    setUploadingFoto(true);
    try {
      const cpfRaw = onlyDigits(form.cpf);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `users/${cpfRaw || `temp_${Date.now()}`}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
      });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      if (data?.publicUrl) {
        // Comentario: timestamp no final evita que o navegador use o cache da foto antiga.
        setForm((prev) => ({ ...prev, foto_3x4_url: `${data.publicUrl}?t=${Date.now()}` }));
      }
    } catch {
      toast.error("Falha ao enviar a foto. Tente novamente.");
    } finally {
      setUploadingFoto(false);
    }
  }

  async function saveDraft() {
    if (!selectedMemberId) {
      toast.error("Selecione um membro.");
      return;
    }
    setSavingDraft(true);
    try {
      localStorage.setItem(`ipda_member_doc_draft_${selectedMemberId}`, JSON.stringify(form));
      toast.success("Rascunho salvo localmente.");
    } catch {
      toast.error("Não foi possível salvar o rascunho.");
    } finally {
      setSavingDraft(false);
    }
  }

  // ── Impressão em lote: envia carteirinhas selecionadas ao webhook n8n ──────
  async function enviarLoteImpressao() {
    if (selectedPrintIds.size === 0) {
      toast.error("Selecione pelo menos uma carteirinha para imprimir.");
      return;
    }
    if (selectedPrintIds.size > MAX_CARTEIRINHAS_POR_LOTE) {
      toast.error(`Selecione no máximo ${MAX_CARTEIRINHAS_POR_LOTE} carteirinhas por lote.`);
      return;
    }

    const selecionadas = filteredCarteirinhas.filter((c) => selectedPrintIds.has(c.id));
    if (selecionadas.length === 0) return;

    setSendingBatch(true);
    try {
      const result = await generatePrintBatchCarteirinhas(activeTotvsId, Array.from(selectedPrintIds));
      setPrintBatchUrl(String(result?.document_url || "").trim());

      await markCarteirinhasPrinted(Array.from(selectedPrintIds));
      setSelectedPrintIds(new Set());
      await refetchReady();
      await refetchBatchDocs();
      setPrintSectionTab("documentos");
      toast.success(`${selecionadas.length} carteirinha(s) enviada(s). Documento único gerado.`);
    } catch {
      toast.error("Falha ao enviar para impressão.");
    } finally {
      setSendingBatch(false);
    }
  }

  // Comentario: seleciona/desmarca uma carteirinha individualmente
  function togglePrintSelection(id: string) {
    setSelectedPrintIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size >= MAX_CARTEIRINHAS_POR_LOTE) {
        toast.error(`Limite de ${MAX_CARTEIRINHAS_POR_LOTE} carteirinhas por envio.`);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Comentario: seleciona/desmarca todas as carteirinhas filtradas
  function toggleSelectAll() {
    if (selectedPrintIds.size === filteredCarteirinhas.length) {
      setSelectedPrintIds(new Set());
    } else {
      const ids = filteredCarteirinhas.slice(0, MAX_CARTEIRINHAS_POR_LOTE).map((c) => c.id);
      if (filteredCarteirinhas.length > MAX_CARTEIRINHAS_POR_LOTE) {
        toast.message(`Foram selecionadas as primeiras ${MAX_CARTEIRINHAS_POR_LOTE} carteirinhas.`);
      }
      setSelectedPrintIds(new Set(ids));
    }
  }

  async function sendToGenerateDocs() {
    if (!selectedMemberId) {
      toast.error("Selecione um membro.");
      return;
    }
    if (tab !== "ficha_membro" && tab !== "carteirinha" && tab !== "ficha_obreiro") {
      toast.error("Selecione o tipo de documento.");
      return;
    }
    if (!form.nome_completo || !form.funcao_ministerial || !form.cpf) {
      toast.error("Preencha nome, cargo e CPF.");
      return;
    }
    setSending(true);
    try {
      const documentType = tab === "ficha_obreiro" ? "ficha_obreiro" : "ficha_carteirinha";
      await generateMemberDocs({
        document_type: documentType,
        member_id: selectedMemberId,
        church_totvs_id: activeTotvsId,
        dados: {
          ...form,
          cpf: formatCpfBr(form.cpf),
          telefone: formatPhoneBrValue(form.telefone),
          data_nascimento: formatDateBrValue(form.data_nascimento),
          data_batismo: formatDateBrValue(form.data_batismo),
          cep_membro: formatCepBr(form.cep_congregacao),
          cep_congregacao: formatCepBr(form.cep_congregacao),
          endereco_igreja_completo: rodapeAuto || churchFooter,
          ficha_rodape: rodapeAuto || churchFooter,
          pastor_responsavel_nome: pastorDaIgreja?.full_name || "",
          pastor_responsavel_telefone: formatPhoneBrValue(pastorDaIgreja?.phone || ""),
        },
      });
      await refetchDocsStatus();
      toast.success("Documento enviado para confecção.");
    } catch {
      toast.error("Falha ao enviar para confecção.");
    } finally {
      setSending(false);
    }
  }

  // Comentario: gera ficha de membro chamando a edge function generate-member-docs.
  // A edge function salva o registro no banco (member_ficha_documents) E envia ao webhook do n8n.
  async function gerarFichaMembro() {
    if (!selectedMemberId || !selectedMember) {
      toast.error("Selecione um membro.");
      return;
    }
    setSending(true);
    try {
      // Comentario: busca dados pela igreja do MEMBRO, nao pela igreja ativa do pastor logado
      const memberChurchTotvs = String(selectedMember.default_totvs_id || activeTotvsId);
      const churchInScope = churchesInScope?.find((c) => String(c.totvs_id) === memberChurchTotvs);
      const churchStamp = churchInScope?.stamp_church_url || "";
      // Busca pastor da igreja do membro (pode ser diferente do pastor logado)
      const pastorDaIgrejaMembro = workers.find(
        (w) => w.role === "pastor" && String(w.default_totvs_id || "") === memberChurchTotvs,
      );
      const pastorSignature = pastorDaIgrejaMembro?.signature_url || pastorDaIgreja?.signature_url || "";

      // Monta os dados do membro no formato esperado pela edge function e pelo webhook
      const dados: Record<string, unknown> = {
        nome_completo: selectedMember.full_name || "",
        matricula: selectedMember.matricula || "",
        funcao_ministerial: selectedMember.minister_role || "",
        data_nascimento: selectedMember.birth_date || "",
        endereco: selectedMember.address_street || "",
        numero: selectedMember.address_number || "",
        bairro: selectedMember.address_neighborhood || "",
        cidade: selectedMember.address_city || "",
        estado: selectedMember.address_state || "",
        estado_civil: selectedMember.marital_status || "",
        data_batismo: selectedMember.baptism_date || "",
        cpf: formatCpfBr(String(selectedMember.cpf || "").replace(/\D/g, "")),
        foto_3x4_url: selectedMember.avatar_url || "",
        rg: selectedMember.rg || "",
        email: selectedMember.email || "",
        cidade_nascimento: form.cidade_nascimento || "",
        uf_nascimento: form.uf_nascimento || "",
        profissao: selectedMember.profession || "",
        carimbo_igreja_url: churchStamp,
        assinatura_pastor_url: pastorSignature,
        // Campos extras usados pela edge function para montar endereco da igreja
        member_cep: formatCepBr(String(selectedMember.cep || "")),
        endereco_igreja_completo: rodapeAuto || churchFooter || "",
        igreja_nome: churchName || "",
        telefone: String(selectedMember.phone || "").replace(/\D/g, ""),
      };

      // Comentario: "ficha_carteirinha" salva em AMBAS as tabelas:
      // member_ficha_documents e member_carteirinha_documents (createBundle=true na edge fn)
      await generateMemberDocs({
        document_type: "ficha_carteirinha",
        member_id: selectedMemberId,
        church_totvs_id: memberChurchTotvs,
        dados,
      });

      toast.success("Ficha enviada para confecção! Aguarde o processamento.");
      await refetchDocsStatus();
    } catch (err) {
      toast.error(`Falha ao gerar ficha: ${String((err as Error)?.message || err)}`);
    } finally {
      setSending(false);
    }
  }

  async function excluirDocumentosMembro() {
    if (!selectedMemberId) {
      toast.error("Selecione um membro.");
      return;
    }
    const confirmed = window.confirm("Deseja excluir a ficha e a carteirinha deste membro? Esta ação permite gerar novamente depois.");
    if (!confirmed) return;

    setDeletingDocs(true);
    try {
      await deleteMemberDocs({
        member_id: selectedMemberId,
        church_totvs_id: memberChurchTotvsId,
        doc_type: "all",
      });
      await refetchDocsStatus();
      await queryClient.invalidateQueries({ queryKey: ["ready-carteirinhas", activeTotvsId] });
      toast.success("Ficha e carteirinha excluídas com sucesso.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao excluir documentos.";
      toast.error(message || "Falha ao excluir documentos.");
    } finally {
      setDeletingDocs(false);
    }
  }

  const showManualForm =
    tab === "ficha_obreiro" ||
    (tab === "carteirinha" && manualCarteirinha) ||
    (tab === "ficha_membro" && manualFichaMembro);

  const memberTone = {
    total: "bg-gradient-to-br from-blue-600 to-blue-500",
    pastor: "bg-gradient-to-br from-blue-500 to-blue-400",
    presbitero: "bg-gradient-to-br from-purple-600 to-purple-500",
    diacono: "bg-gradient-to-br from-emerald-600 to-emerald-500",
    obreiro: "bg-gradient-to-br from-amber-500 to-amber-400",
    batizados: "bg-gradient-to-br from-slate-600 to-slate-500",
    inativos: "bg-gradient-to-br from-red-600 to-red-500",
  };

  return (
    <ManagementShell roleMode="pastor">
      {showPageLoading ? (
        <PageLoading title="Carregando membros" description="Buscando lista, indicadores e documentos..." />
      ) : (
        <>
      <div className="mb-4">
        <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Membros</h2>
        <p className="mt-1 text-base text-slate-600">Gestão de membros com visualização, filtros e documentos.</p>
      </div>

      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <MiniCard title="Total de membros" value={counters.total} subtitle="membros encontrados" gradient={memberTone.total} />
        <MiniCard title="Pastor" value={counters.pastor} subtitle="pastores" gradient={memberTone.pastor} />
        <MiniCard title="Presbítero" value={counters.presbitero} subtitle="presbíteros" gradient={memberTone.presbitero} />
        <MiniCard title="Diácono" value={counters.diacono} subtitle="diáconos" gradient={memberTone.diacono} />
        <MiniCard title="Cooperador" value={counters.obreiro} subtitle="cooperadores" gradient={memberTone.obreiro} />
        <MiniCard title="Membros ativos" value={counters.batizados} subtitle="ministério membro" gradient={memberTone.batizados} />
        {/* Comentario: card clicavel — ao clicar mostra so os inativos, clica de novo volta aos ativos */}
        <div className="col-span-2 md:col-span-1">
          <MiniCard
            title="Inativos"
            value={inativosCount}
            subtitle="membros inativos"
            gradient={memberTone.inativos}
            active={filterActive === false}
            onClick={() => {
              if (filterActive === false) {
                setFilterActive(undefined);
              } else {
                setFilterActive(false);
              }
              setMembersPage(1);
            }}
          />
        </div>
      </section>

      <MobileFiltersCard
        title="Filtros de membros"
        description="Escolha a igreja e o cargo para refinar a lista."
        className="mb-4 rounded-2xl"
      >
          {/* Comentario: combobox de busca de igreja + filtro de cargo lado a lado */}
          <div className="grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setMembersPage(1);
              }}
              placeholder="Buscar nome/cpf..."
            />

            {/* Combobox manual para busca de igreja por nome ou TOTVS */}
            <div className="relative">
              <Input
                value={searchChurch}
                onChange={(e) => { setSearchChurch(e.target.value); setShowChurchList(true); }}
                onFocus={() => setShowChurchList(true)}
                onBlur={() => setTimeout(() => setShowChurchList(false), 200)}
                placeholder={loadingChurches ? "Carregando igrejas..." : "Buscar igreja por nome ou TOTVS..."}
                disabled={loadingChurches}
              />
              {/* Comentario: exibe nome da igreja selecionada quando o dropdown esta fechado */}
              {selectedFilterChurch && !showChurchList && (
                <p className="mt-1 text-xs text-slate-500">
                  Igreja: <span className="font-medium">{selectedFilterChurch.church_name}</span>
                  {" "}<button className="text-blue-600 hover:underline" onClick={() => { setFilterTotvs("all"); setSearchChurch(""); setMembersPage(1); }}>Todas</button>
                </p>
              )}
              {/* Comentario: dropdown de igrejas filtradas pelo texto digitado */}
              {showChurchList && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 font-medium text-blue-700 border-b"
                    onMouseDown={() => { setFilterTotvs("all"); setSearchChurch(""); setShowChurchList(false); setMembersPage(1); }}
                  >
                    Todas as igrejas
                  </button>
                  {filteredChurchOptions.map((church) => (
                    <button
                      key={String(church.totvs_id)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onMouseDown={() => {
                        setFilterTotvs(String(church.totvs_id));
                        setSearchChurch(`${church.totvs_id} - ${church.church_name}`);
                        setShowChurchList(false);
                        setMembersPage(1);
                      }}
                    >
                      <span className="font-mono text-xs text-slate-400">{church.totvs_id}</span>{" "}
                      {church.church_name}
                    </button>
                  ))}
                  {debouncedSearchChurch.trim().length >= 2 && filteredChurchOptions.length === 0 && (
                    <p className="px-3 py-2 text-sm text-slate-400">Nenhuma igreja encontrada.</p>
                  )}
                </div>
              )}
            </div>

            {/* Filtro por cargo ministerial */}
            <Select value={filterCargo} onValueChange={(v) => { setFilterCargo(v); setMembersPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Todos os cargos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cargos</SelectItem>
                <SelectItem value="pastor">Pastor</SelectItem>
                <SelectItem value="presbitero">Presbítero</SelectItem>
                <SelectItem value="diacono">Diácono</SelectItem>
                <SelectItem value="cooperador">Cooperador</SelectItem>
                <SelectItem value="membro">Membro</SelectItem>
              </SelectContent>
            </Select>
          </div>
      </MobileFiltersCard>

      <Card className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full gap-2 overflow-x-auto">
            <Button className="rounded-none border-b-2 border-transparent px-2" variant="ghost" style={{ borderBottomColor: tab === "lista" ? "#2563EB" : "transparent", color: tab === "lista" ? "#2563EB" : "#6B7280" }} onClick={() => setTab("lista")}>Lista de membros</Button>
            <Button className="rounded-none border-b-2 border-transparent px-2" variant="ghost" style={{ borderBottomColor: tab === "ficha_membro" ? "#2563EB" : "transparent", color: tab === "ficha_membro" ? "#2563EB" : "#6B7280" }} onClick={() => setTab("ficha_membro")}>Ficha do membro</Button>
            <Button className="rounded-none border-b-2 border-transparent px-2" variant="ghost" style={{ borderBottomColor: tab === "carteirinha" ? "#2563EB" : "transparent", color: tab === "carteirinha" ? "#2563EB" : "#6B7280" }} onClick={() => setTab("carteirinha")}>Carteirinha</Button>
            <Button className="rounded-none border-b-2 border-transparent px-2" variant="ghost" style={{ borderBottomColor: tab === "impressao" ? "#2563EB" : "transparent", color: tab === "impressao" ? "#2563EB" : "#6B7280" }} onClick={() => setTab("impressao")}>Impressão</Button>
            <Button className="rounded-none border-b-2 border-transparent px-2" variant="ghost" style={{ borderBottomColor: tab === "presenca" ? "#2563EB" : "transparent", color: tab === "presenca" ? "#2563EB" : "#6B7280" }} onClick={() => setTab("presenca")}>Presença</Button>
            <Button variant="ghost" disabled className="text-slate-400">Ficha de obreiro (bloqueada)</Button>
          </div>

          <div className="flex items-center gap-2">
            {tab === "lista" ? (
              <>
            <Button variant={view === "lista" ? "default" : "outline"} size="sm" onClick={() => setView("lista")}>
              <List className="mr-2 h-4 w-4" /> Lista
            </Button>
            <Button variant={view === "grid" ? "default" : "outline"} size="sm" onClick={() => setView("grid")}>
              <Grid2X2 className="mr-2 h-4 w-4" /> Grid
            </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {tab === "lista" && view === "lista" ? (
        <ObreirosTab
          activeTotvsId={activeTotvsId}
          churchTotvsFilter={filterTotvs === "all" ? undefined : filterTotvs}
          forceSingleChurchFilter={filterTotvs !== "all"}
          filterMinisterRole={filterCargo !== "all" ? filterCargo : undefined}
          initialActiveFilter={filterActive === false ? "inactive" : "all"}
          externalSearch={memberSearch}
          onExternalSearchChange={setMemberSearch}
          hideInternalSearch
        />
      ) : null}

      {tab === "presenca" ? (
        <MinisterialAttendanceTab
          activeTotvsId={activeTotvsId}
          initialChurchTotvsId={filterTotvs === "all" ? activeTotvsId : filterTotvs}
        />
      ) : null}

      {/* ── Aba Impressão em lote ───────────────────────────────────────── */}
      {tab === "impressao" ? (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-slate-500" />
              Impressão de carteirinhas em lote
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={printSectionTab === "selecao" ? "default" : "outline"} onClick={() => setPrintSectionTab("selecao")}>
                Seleção de carteirinhas
              </Button>
              <Button size="sm" variant={printSectionTab === "documentos" ? "default" : "outline"} onClick={() => setPrintSectionTab("documentos")}>
                Documentos gerados
              </Button>
            </div>

            {printSectionTab === "selecao" ? (
              <>
                {/* Comentario: filtro e acoes */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Select value={filterPrint} onValueChange={(v) => { setFilterPrint(v as "all" | "pending"); setSelectedPrintIds(new Set()); }}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Não impressas</SelectItem>
                        <SelectItem value="all">Todas (prontas)</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-slate-500">
                      {filteredCarteirinhas.length} carteirinha(s)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                      {selectedPrintIds.size === filteredCarteirinhas.length && filteredCarteirinhas.length > 0
                        ? <><CheckSquare className="mr-1 h-4 w-4" /> Desmarcar todas</>
                        : <><Square className="mr-1 h-4 w-4" /> Selecionar todas</>}
                    </Button>
                    <Button
                      onClick={() => void enviarLoteImpressao()}
                      disabled={sendingBatch || selectedPrintIds.size === 0}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {sendingBatch
                        ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Enviando...</>
                        : <><Printer className="mr-1 h-4 w-4" /> Gerar documento único {selectedPrintIds.size > 0 ? `(${selectedPrintIds.size})` : ""}</>}
                    </Button>
                    {printBatchUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(printBatchUrl, "_blank", "noopener,noreferrer")}
                      >
                        Visualizar documento único
                      </Button>
                    ) : null}
                  </div>
                </div>

                {loadingReady ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : filteredCarteirinhas.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    {filterPrint === "pending"
                      ? "Todas as carteirinhas prontas já foram impressas."
                      : "Nenhuma carteirinha pronta encontrada para esta igreja."}
                  </div>
                ) : (
                  <>
                  <div className="space-y-3 md:hidden">
                    {filteredCarteirinhas.map((c) => (
                      <div
                        key={c.id}
                        className={`rounded-xl border p-3 ${selectedPrintIds.has(c.id) ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
                        onClick={() => togglePrintSelection(c.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5">
                            {selectedPrintIds.has(c.id)
                              ? <CheckSquare className="h-4 w-4 text-blue-600" />
                              : <Square className="h-4 w-4 text-slate-300" />}
                          </div>
                          <AvatarImage
                            src={c.member_avatar_url || null}
                            alt=""
                            className="h-12 w-10 rounded border border-slate-200 object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{c.member_name || "—"}</p>
                            <p className="text-xs text-slate-600">CPF: {c.member_cpf || "—"}</p>
                            <p className="text-xs text-slate-600">Cargo: {c.member_minister_role || "—"}</p>
                            <div className="mt-2">
                              {c.printed_at ? (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Impressa</Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Pendente</Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (c.final_url) window.open(c.final_url, "_blank", "noopener,noreferrer");
                            }}
                            disabled={!c.final_url}
                          >
                            Ver
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2 w-10"></th>
                          <th className="px-3 py-2">Foto</th>
                          <th className="px-3 py-2">Nome</th>
                          <th className="px-3 py-2">CPF</th>
                          <th className="px-3 py-2">Cargo</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredCarteirinhas.map((c) => (
                          <tr
                            key={c.id}
                            className={`cursor-pointer hover:bg-slate-50 ${selectedPrintIds.has(c.id) ? "bg-blue-50" : ""}`}
                            onClick={() => togglePrintSelection(c.id)}
                          >
                            <td className="px-3 py-2 text-center">
                              {selectedPrintIds.has(c.id)
                                ? <CheckSquare className="h-4 w-4 text-blue-600" />
                                : <Square className="h-4 w-4 text-slate-300" />}
                            </td>
                            <td className="px-3 py-2">
                              <AvatarImage
                                src={c.member_avatar_url || null}
                                alt=""
                                className="h-10 w-8 rounded border border-slate-200 object-cover"
                              />
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-900">{c.member_name || "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{c.member_cpf || "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{c.member_minister_role || "—"}</td>
                            <td className="px-3 py-2">
                              {c.printed_at ? (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                  Impressa
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                  Pendente
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (c.final_url) window.open(c.final_url, "_blank", "noopener,noreferrer");
                                }}
                                disabled={!c.final_url}
                              >
                                Ver
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}

                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <b>Como funciona:</b> Selecione as carteirinhas e clique em "Gerar documento único".
                  O sistema envia os dados ao n8n que gera um PDF com <b>4 carteirinhas por A4</b>.
                  Depois use o botão "Visualizar documento único" para abrir e imprimir.
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {loadingBatchDocs ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : printBatchDocs.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nenhum documento único gerado ainda.
                  </div>
                ) : (
                  <>
                  <div className="space-y-3 md:hidden">
                    {printBatchDocs.map((batch: PrintBatchCarteirinhaItem) => (
                      <div key={batch.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium text-slate-700">Criado em:</span> {formatDateBr(batch.created_at)}</p>
                          <p><span className="font-medium text-slate-700">Quantidade:</span> {Number(batch.total_items || 0)}</p>
                          <div className="pt-1">
                            {String(batch.status).toUpperCase() === "PRONTO" ? (
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Pronto</Badge>
                            ) : String(batch.status).toUpperCase() === "ERRO" ? (
                              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Erro</Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Processando</Badge>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!batch.final_url}
                            onClick={() => batch.final_url && window.open(batch.final_url, "_blank", "noopener,noreferrer")}
                          >
                            Visualizar
                          </Button>
                          {String(batch.status).toUpperCase() === "ERRO" && batch.error_message ? (
                            <span className="text-xs text-rose-700">{batch.error_message}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Criado em</th>
                          <th className="px-3 py-2">Quantidade</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {printBatchDocs.map((batch: PrintBatchCarteirinhaItem) => (
                          <tr key={batch.id}>
                            <td className="px-3 py-2 text-slate-600">{formatDateBr(batch.created_at)}</td>
                            <td className="px-3 py-2 text-slate-600">{Number(batch.total_items || 0)}</td>
                            <td className="px-3 py-2">
                              {String(batch.status).toUpperCase() === "PRONTO" ? (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Pronto</Badge>
                              ) : String(batch.status).toUpperCase() === "ERRO" ? (
                                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Erro</Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Processando</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!batch.final_url}
                                  onClick={() => batch.final_url && window.open(batch.final_url, "_blank", "noopener,noreferrer")}
                                >
                                  Visualizar
                                </Button>
                                {String(batch.status).toUpperCase() === "ERRO" && batch.error_message ? (
                                  <span className="max-w-[320px] truncate text-xs text-rose-700">{batch.error_message}</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "lista" && view === "grid" ? (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Membros em grade</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workers.map((member) => (
              <Card key={member.id} className="min-w-0 border border-slate-200 overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="mx-auto w-full max-w-full sm:max-w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <MemberPhoto src={member.avatar_url || null} alt={`Foto de ${member.full_name}`} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-base font-semibold text-slate-900">{member.full_name || "Sem nome"}</p>
                    <p className="text-sm text-slate-500">CPF: {maskCpf(member.cpf)}</p>
                    <p className="text-sm text-slate-500">Nascimento: {formatDateBr(member.birth_date)}</p>
                    <p className="text-sm text-slate-600">Telefone: {formatPhone(member.phone)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      Cargo: {member.minister_role || "—"}
                    </Badge>
                    <Badge variant="outline" className={statusBadge(member.is_active !== false)}>
                      {member.is_active === false ? "Inativo" : "Ativo"}
                    </Badge>
                  </div>
                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 px-2">
                          <MoreVertical className="mr-1 h-4 w-4" />
                          Ações
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedMemberId(String(member.id));
                            setTab("carteirinha");
                          }}
                        >
                          Carteirinha
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedMemberId(String(member.id));
                            setTab("ficha_membro");
                          }}
                        >
                          Ficha
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-700"
                          onClick={() => void handleDeleteMember(member)}
                        >
                          Deletar usuario
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}

            {workers.length === 0 ? <p className="text-sm text-slate-500">Nenhum membro encontrado.</p> : null}
          </CardContent>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <Select
              value={String(membersPageSize)}
              onValueChange={(value) => {
                setMembersPageSize(Number(value));
                setMembersPage(1);
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={membersPage <= 1}
              onClick={() => setMembersPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </Button>
            <span className="text-sm text-slate-600">
              Pagina {membersPage} / {membersTotalPages}
            </span>
            <Button
              variant="outline"
              disabled={membersPage >= membersTotalPages}
              onClick={() => setMembersPage((prev) => Math.min(membersTotalPages, prev + 1))}
            >
              Proxima
            </Button>
          </div>
        </Card>
      ) : null}

      {tab !== "lista" && tab !== "presenca" && tab !== "ficha_obreiro" ? (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="h-5 w-5 text-slate-500" />
              {tabLabel(tab)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(tab === "carteirinha" || tab === "ficha_membro") ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Membro</Label>
                  <Input
                    placeholder="Digite 3 caracteres para buscar por nome ou CPF"
                    value={memberPickerSearch}
                    onChange={(e) => setMemberPickerSearch(e.target.value)}
                  />
                  <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o membro" /></SelectTrigger>
                    <SelectContent>
                      {filteredDocsMembers.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          Nenhum membro encontrado
                        </SelectItem>
                      ) : null}
                      {filteredDocsMembers.map((member) => (
                        <SelectItem key={member.id} value={String(member.id)}>
                          {member.full_name} - {member.cpf || "sem cpf"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {tab === "carteirinha" ? (
                  <div className="space-y-1">
                    <Label>Modelo da carteirinha</Label>
                    <Select value={carteirinhaTemplate} onValueChange={(value) => setCarteirinhaTemplate(value as CarteirinhaTemplate)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padrao">Carteirinha IPDA - Padrão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Modelo da ficha</Label>
                    <Select value={fichaTemplate} onValueChange={(value) => setFichaTemplate(value as FichaTemplate)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="padrao">Ficha de membro - Padrão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ) : null}

            {/* Botão de preenchimento manual da carteirinha removido: documento so aparece quando existir no banco */}

            {tab === "ficha_membro" ? (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setManualFichaMembro((prev) => !prev)}>
                  {manualFichaMembro ? "Ocultar preenchimento manual" : "Preenchimento manual da ficha"}
                </Button>
              </div>
            ) : null}

            {showManualForm ? (
              <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1 xl:col-span-2">
                <Label>Membro</Label>
                <Input
                  placeholder="Digite 3 caracteres para buscar por nome ou CPF"
                  value={memberPickerSearch}
                  onChange={(e) => setMemberPickerSearch(e.target.value)}
                />
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o membro" /></SelectTrigger>
                  <SelectContent>
                    {filteredDocsMembers.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        Nenhum membro encontrado
                      </SelectItem>
                    ) : null}
                    {filteredDocsMembers.map((member) => (
                      <SelectItem key={member.id} value={String(member.id)}>
                        {member.full_name} - {member.cpf || "sem cpf"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Igreja</Label>
                <Input value={form.igreja_nome} onChange={(e) => setForm((prev) => ({ ...prev, igreja_nome: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Matrícula</Label>
                <Input value={form.matricula} onChange={(e) => setForm((prev) => ({ ...prev, matricula: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1 xl:col-span-2"><Label>Nome completo</Label><Input value={form.nome_completo} onChange={(e) => setForm((prev) => ({ ...prev, nome_completo: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Função ministerial</Label><Input value={form.funcao_ministerial} onChange={(e) => setForm((prev) => ({ ...prev, funcao_ministerial: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Data de nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e) => setForm((prev) => ({ ...prev, data_nascimento: e.target.value }))} /></div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1 xl:col-span-2"><Label>Endereço</Label><Input value={form.endereco} onChange={(e) => setForm((prev) => ({ ...prev, endereco: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm((prev) => ({ ...prev, bairro: e.target.value }))} /></div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm((prev) => ({ ...prev, cidade: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select value={form.estado || ""} onValueChange={(value) => setForm((prev) => ({ ...prev, estado: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZIL_UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Cidade de nascimento</Label><Input value={form.cidade_nascimento} onChange={(e) => setForm((prev) => ({ ...prev, cidade_nascimento: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Estado de nascimento</Label>
                <Select value={form.uf_nascimento || ""} onValueChange={(value) => setForm((prev) => ({ ...prev, uf_nascimento: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZIL_UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label>Estado civil</Label>
                <Select value={form.estado_civil || ""} onValueChange={(value) => setForm((prev) => ({ ...prev, estado_civil: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado civil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Solteiro">Solteiro</SelectItem>
                    <SelectItem value="Casado">Casado</SelectItem>
                    <SelectItem value="Viuvo">Viuvo</SelectItem>
                    <SelectItem value="Divorciado">Divorciado</SelectItem>
                    <SelectItem value="Separado">Separado</SelectItem>
                    <SelectItem value="Uniao estavel">Uniao estavel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Data de batismo</Label><Input type="date" value={form.data_batismo} onChange={(e) => setForm((prev) => ({ ...prev, data_batismo: e.target.value }))} /></div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1"><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm((prev) => ({ ...prev, cpf: e.target.value }))} /></div>
              <div className="space-y-1"><Label>RG</Label><Input value={form.rg} onChange={(e) => setForm((prev) => ({ ...prev, rg: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Profissão</Label><Input value={form.profissao} onChange={(e) => setForm((prev) => ({ ...prev, profissao: e.target.value }))} /></div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label>Data da ordenação</Label>
                <Input
                  type="date"
                  value={form.ordenacao_presbitero}
                  onChange={(e) => setForm((prev) => ({ ...prev, ordenacao_presbitero: e.target.value }))}
                />
              </div>
            </div>

            {/* Comentario: captura de foto 3x4 pela camera ou galeria */}
            <div className="space-y-1">
              <Label>Foto 3x4</Label>
              <AvatarCapture
                onFileReady={(file) => {
                  setPendingFotoFile(file);
                  if (file) void uploadFoto(file);
                  else setForm((prev) => ({ ...prev, foto_3x4_url: "" }));
                }}
                disabled={uploadingFoto || savingDraft || sending}
                currentUrl={!pendingFotoFile && form.foto_3x4_url ? form.foto_3x4_url : undefined}
              />
              {uploadingFoto ? (
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> Enviando foto...
                </p>
              ) : null}
              {!pendingFotoFile && form.foto_3x4_url ? (
                <div className="flex items-center gap-2 pt-1">
                  <img src={form.foto_3x4_url} alt="Foto atual" className="h-20 w-16 rounded border border-slate-200 object-cover" />
                  <a href={form.foto_3x4_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Ver foto atual</a>
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>Assinatura do pastor (URL)</Label>
              <Input value={form.assinatura_pastor_url} onChange={(e) => setForm((prev) => ({ ...prev, assinatura_pastor_url: e.target.value }))} />
            </div>
              </>
            ) : null}

            {tab === "carteirinha" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                {carteirinhaPronta ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-700">Carteirinha pronta para uso.</p>
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
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={excluirDocumentosMembro}
                        disabled={deletingDocs}
                      >
                        {deletingDocs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Excluir ficha e carteirinha
                      </Button>
                    </div>
                  </div>
                ) : null}
                {manualCarteirinha ? (
                  <div className="space-y-1">
                    <Label>QR Code (URL)</Label>
                    <Input value={form.qr_code_url} onChange={(e) => setForm((prev) => ({ ...prev, qr_code_url: e.target.value }))} />
                  </div>
                ) : null}
                {!carteirinhaPronta ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    A carteirinha ainda não está pronta. Aguarde a confecção para visualizar.
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "ficha_membro" ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                {/* Botão para gerar a ficha — só aparece quando não há URL pronta */}
                {!fichaPronta ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={gerarFichaMembro}
                      disabled={sending || !selectedMemberId}
                      className="gap-2"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {sending ? "Gerando ficha..." : "Gerar Ficha de Membro"}
                    </Button>
                    {fetchingDocsStatus ? <span className="text-xs text-slate-500">Verificando status...</span> : null}
                  </div>
                ) : null}

                {/* Quando a ficha estiver PRONTA exibe caixa verde com botões de visualizar e baixar */}
                {fichaPronta ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-700">Ficha do membro pronta.</p>
                    <p className="mt-1 text-xs text-emerald-700">O arquivo final está disponível para visualização e download.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => window.open(String(docsStatus?.ficha?.final_url || ""), "_blank", "noopener,noreferrer")}
                      >
                        Visualizar ficha
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(String(docsStatus?.ficha?.final_url || ""), "_blank", "noopener,noreferrer")}
                      >
                        Baixar ficha
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={excluirDocumentosMembro}
                        disabled={deletingDocs}
                      >
                        {deletingDocs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Excluir ficha e carteirinha
                      </Button>
                    </div>
                  </div>
                ) : null}
                {manualFichaMembro ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Título da ficha</Label>
                      <Input value={form.ficha_titulo} onChange={(e) => setForm((prev) => ({ ...prev, ficha_titulo: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Subtítulo da ficha</Label>
                      <Input value={form.ficha_subtitulo} onChange={(e) => setForm((prev) => ({ ...prev, ficha_subtitulo: e.target.value }))} />
                    </div>
                  <div className="space-y-1">
                    <Label>Rodapé endereço</Label>
                    <Input value={rodapeAuto || form.ficha_rodape} disabled />
                  </div>
                </div>
                ) : null}
                {!fichaPronta ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <iframe title="Pré-visualização ficha de membro" className="h-[640px] w-full bg-white" srcDoc={fichaMembroHtml} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "ficha_obreiro" ? (
              <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-800">Ficha de cadastro de obreiro(a) - dados pessoais</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Função no termo</Label>
                    <Select
                      value={form.compromisso_funcao}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, compromisso_funcao: value }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pastor">Pastor</SelectItem>
                        <SelectItem value="Presbítero">Presbítero</SelectItem>
                        <SelectItem value="Diácono">Diácono</SelectItem>
                        <SelectItem value="Cooperador">Cooperador</SelectItem>
                        <SelectItem value="Membro">Membro</SelectItem>
                        <SelectItem value="Voluntario Financeiro">Voluntário Financeiro</SelectItem>
                        <SelectItem value="Dirigente">Dirigente</SelectItem>
                        <SelectItem value="Conselheiro Espiritual">Conselheiro Espiritual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 xl:col-span-2">
                    <Label>Endereço da congregação</Label>
                    <Input value={form.congregacao_endereco} onChange={(e) => setForm((prev) => ({ ...prev, congregacao_endereco: e.target.value }))} />
                  </div>
                  <div className="space-y-1"><Label>Número</Label><Input value={form.congregacao_numero} onChange={(e) => setForm((prev) => ({ ...prev, congregacao_numero: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Bairro</Label><Input value={form.congregacao_bairro} onChange={(e) => setForm((prev) => ({ ...prev, congregacao_bairro: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={form.congregacao_cidade} onChange={(e) => setForm((prev) => ({ ...prev, congregacao_cidade: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Antiga sede central</Label><Input value={form.antiga_sede_central} onChange={(e) => setForm((prev) => ({ ...prev, antiga_sede_central: e.target.value }))} /></div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1"><Label>Nacionalidade</Label><Input value={form.nacionalidade} onChange={(e) => setForm((prev) => ({ ...prev, nacionalidade: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Cidade de nascimento</Label><Input value={form.cidade_nascimento} onChange={(e) => setForm((prev) => ({ ...prev, cidade_nascimento: e.target.value }))} /></div>
                  <div className="space-y-1">
                    <Label>UF de nascimento</Label>
                    <Select value={form.uf_nascimento || ""} onValueChange={(value) => setForm((prev) => ({ ...prev, uf_nascimento: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {BRAZIL_UF_OPTIONS.map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Data de casamento</Label><Input type="date" value={form.data_casamento} onChange={(e) => setForm((prev) => ({ ...prev, data_casamento: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Passaporte</Label><Input value={form.passaporte} onChange={(e) => setForm((prev) => ({ ...prev, passaporte: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Profissão</Label><Input value={form.profissao} onChange={(e) => setForm((prev) => ({ ...prev, profissao: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ocupação atual</Label><Input value={form.ocupacao_atual} onChange={(e) => setForm((prev) => ({ ...prev, ocupacao_atual: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Nome do pai</Label><Input value={form.nome_pai} onChange={(e) => setForm((prev) => ({ ...prev, nome_pai: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Nome da mãe</Label><Input value={form.nome_mae} onChange={(e) => setForm((prev) => ({ ...prev, nome_mae: e.target.value }))} /></div>
                </div>

                <h4 className="text-sm font-semibold text-slate-800">Dados familiares</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1"><Label>Tem filhos (sim/não)</Label><Input value={form.tem_filhos} onChange={(e) => setForm((prev) => ({ ...prev, tem_filhos: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Nº dependentes</Label><Input value={form.dependentes_qtd} onChange={(e) => setForm((prev) => ({ ...prev, dependentes_qtd: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Filho(a) 1 - nome</Label><Input value={form.filho1_nome} onChange={(e) => setForm((prev) => ({ ...prev, filho1_nome: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Filho(a) 1 - nascimento</Label><Input type="date" value={form.filho1_nascimento} onChange={(e) => setForm((prev) => ({ ...prev, filho1_nascimento: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Filho(a) 2 - nome</Label><Input value={form.filho2_nome} onChange={(e) => setForm((prev) => ({ ...prev, filho2_nome: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Filho(a) 2 - nascimento</Label><Input type="date" value={form.filho2_nascimento} onChange={(e) => setForm((prev) => ({ ...prev, filho2_nascimento: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Filho(a) 3 - nome</Label><Input value={form.filho3_nome} onChange={(e) => setForm((prev) => ({ ...prev, filho3_nome: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Filho(a) 3 - nascimento</Label><Input type="date" value={form.filho3_nascimento} onChange={(e) => setForm((prev) => ({ ...prev, filho3_nascimento: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Doença na família (sim/não)</Label><Input value={form.doenca_familia} onChange={(e) => setForm((prev) => ({ ...prev, doenca_familia: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-3"><Label>Qual doença</Label><Input value={form.doenca_familia_qual} onChange={(e) => setForm((prev) => ({ ...prev, doenca_familia_qual: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Nome do(a) cônjuge</Label><Input value={form.nome_conjuge} onChange={(e) => setForm((prev) => ({ ...prev, nome_conjuge: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Cônjuge - nascimento</Label><Input type="date" value={form.conjuge_nascimento} onChange={(e) => setForm((prev) => ({ ...prev, conjuge_nascimento: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Cônjuge - RG</Label><Input value={form.conjuge_rg} onChange={(e) => setForm((prev) => ({ ...prev, conjuge_rg: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Cônjuge - CPF</Label><Input value={form.conjuge_cpf} onChange={(e) => setForm((prev) => ({ ...prev, conjuge_cpf: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Cônjuge é crente</Label><Input value={form.conjuge_e_crente} onChange={(e) => setForm((prev) => ({ ...prev, conjuge_e_crente: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Outro ministério (qual)</Label><Input value={form.conjuge_outro_ministerio} onChange={(e) => setForm((prev) => ({ ...prev, conjuge_outro_ministerio: e.target.value }))} /></div>
                </div>

                <h4 className="text-sm font-semibold text-slate-800">Dados ministeriais do(a) obreiro(a)</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1 xl:col-span-2"><Label>Denominação em que aceitou a Jesus</Label><Input value={form.denominacao_aceitou_jesus} onChange={(e) => setForm((prev) => ({ ...prev, denominacao_aceitou_jesus: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Data da conversão</Label><Input type="date" value={form.data_conversao} onChange={(e) => setForm((prev) => ({ ...prev, data_conversao: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Batismo nas águas</Label><Input type="date" value={form.data_batismo_aguas} onChange={(e) => setForm((prev) => ({ ...prev, data_batismo_aguas: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Função ministerial (texto)</Label><Input value={form.funcao_ministerial_secundaria} onChange={(e) => setForm((prev) => ({ ...prev, funcao_ministerial_secundaria: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ordenação cooperador</Label><Input value={form.ordenacao_cooperador} onChange={(e) => setForm((prev) => ({ ...prev, ordenacao_cooperador: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ordenação diácono</Label><Input value={form.ordenacao_diacono} onChange={(e) => setForm((prev) => ({ ...prev, ordenacao_diacono: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ordenação presbítero</Label><Input value={form.ordenacao_presbitero} onChange={(e) => setForm((prev) => ({ ...prev, ordenacao_presbitero: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ordenação evangelista</Label><Input value={form.ordenacao_evangelista} onChange={(e) => setForm((prev) => ({ ...prev, ordenacao_evangelista: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ordenação voluntário</Label><Input value={form.ordenacao_voluntario} onChange={(e) => setForm((prev) => ({ ...prev, ordenacao_voluntario: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Possui credencial</Label><Input value={form.possui_credencial} onChange={(e) => setForm((prev) => ({ ...prev, possui_credencial: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Recebe prebenda</Label><Input value={form.recebe_prebenda} onChange={(e) => setForm((prev) => ({ ...prev, recebe_prebenda: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Há quanto tempo</Label><Input value={form.prebenda_tempo} onChange={(e) => setForm((prev) => ({ ...prev, prebenda_tempo: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Desde</Label><Input value={form.prebenda_desde} onChange={(e) => setForm((prev) => ({ ...prev, prebenda_desde: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Dirige alguma IPDA</Label><Input value={form.dirige_alguma_ipda} onChange={(e) => setForm((prev) => ({ ...prev, dirige_alguma_ipda: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Qual IPDA</Label><Input value={form.dirige_ipda_qual} onChange={(e) => setForm((prev) => ({ ...prev, dirige_ipda_qual: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Endereço da atual congregação</Label><Input value={form.endereco_atual_congregacao} onChange={(e) => setForm((prev) => ({ ...prev, endereco_atual_congregacao: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Bairro</Label><Input value={form.bairro_congregacao} onChange={(e) => setForm((prev) => ({ ...prev, bairro_congregacao: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Cidade</Label><Input value={form.cidade_congregacao} onChange={(e) => setForm((prev) => ({ ...prev, cidade_congregacao: e.target.value }))} /></div>
                  <div className="space-y-1">
                    <Label>UF</Label>
                    <Select value={form.uf_congregacao || ""} onValueChange={(value) => setForm((prev) => ({ ...prev, uf_congregacao: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {BRAZIL_UF_OPTIONS.map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>CEP</Label>
                    <Input
                      value={maskCep(form.cep_congregacao)}
                      onChange={(e) => setForm((prev) => ({ ...prev, cep_congregacao: e.target.value }))}
                      onBlur={() => void autofillCep(true)}
                      placeholder="00000-000"
                    />
                    <p className="text-xs text-slate-500">{cepLookupLoading ? "Buscando endereco..." : "Endereco preenchido automaticamente pelo CEP."}</p>
                  </div>
                  <div className="space-y-1"><Label>Dirigente</Label><Input value={form.dirigente_congregacao} onChange={(e) => setForm((prev) => ({ ...prev, dirigente_congregacao: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Telefone congregação</Label><Input value={form.tel_congregacao} onChange={(e) => setForm((prev) => ({ ...prev, tel_congregacao: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Sede setorial</Label><Input value={form.sede_setorial} onChange={(e) => setForm((prev) => ({ ...prev, sede_setorial: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Sucursal</Label><Input value={form.sucursal} onChange={(e) => setForm((prev) => ({ ...prev, sucursal: e.target.value }))} /></div>
                </div>

                <h4 className="text-sm font-semibold text-slate-800">Continuação - dados ministeriais</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1"><Label>Já dirigiu no exterior</Label><Input value={form.ja_dirigiu_exterior} onChange={(e) => setForm((prev) => ({ ...prev, ja_dirigiu_exterior: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Em quais cidades</Label><Input value={form.cidades_exterior} onChange={(e) => setForm((prev) => ({ ...prev, cidades_exterior: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Quais países</Label><Input value={form.paises_exterior} onChange={(e) => setForm((prev) => ({ ...prev, paises_exterior: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Doença no exterior (sim/não)</Label><Input value={form.doenca_exterior} onChange={(e) => setForm((prev) => ({ ...prev, doenca_exterior: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Quem</Label><Input value={form.doenca_exterior_quem} onChange={(e) => setForm((prev) => ({ ...prev, doenca_exterior_quem: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Quais</Label><Input value={form.doenca_exterior_quais} onChange={(e) => setForm((prev) => ({ ...prev, doenca_exterior_quais: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-4"><Label>Motivo da volta ao Brasil</Label><Textarea value={form.motivo_volta_brasil} onChange={(e) => setForm((prev) => ({ ...prev, motivo_volta_brasil: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Fala idioma fluente</Label><Input value={form.idioma_fluente} onChange={(e) => setForm((prev) => ({ ...prev, idioma_fluente: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Quais idiomas</Label><Input value={form.idioma_quais} onChange={(e) => setForm((prev) => ({ ...prev, idioma_quais: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Escolaridade</Label><Input value={form.escolaridade} onChange={(e) => setForm((prev) => ({ ...prev, escolaridade: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ano de destaque</Label><Input value={form.desempenho_ano} onChange={(e) => setForm((prev) => ({ ...prev, desempenho_ano: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-4"><Label>Opinião sobre maior desempenho ministerial</Label><Textarea value={form.desempenho_ministerio} onChange={(e) => setForm((prev) => ({ ...prev, desempenho_ministerio: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Já foi disciplinado</Label><Input value={form.foi_disciplinado} onChange={(e) => setForm((prev) => ({ ...prev, foi_disciplinado: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Quantas vezes</Label><Input value={form.disciplinado_quantas_vezes} onChange={(e) => setForm((prev) => ({ ...prev, disciplinado_quantas_vezes: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-2"><Label>Motivo da disciplina</Label><Input value={form.disciplinado_motivo} onChange={(e) => setForm((prev) => ({ ...prev, disciplinado_motivo: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Fez curso ministerial</Label><Input value={form.curso_ministerial} onChange={(e) => setForm((prev) => ({ ...prev, curso_ministerial: e.target.value }))} /></div>
                  <div className="space-y-1 xl:col-span-3"><Label>Qual curso</Label><Input value={form.curso_ministerial_qual} onChange={(e) => setForm((prev) => ({ ...prev, curso_ministerial_qual: e.target.value }))} /></div>
                </div>

                <h4 className="text-sm font-semibold text-slate-800">Histórico de gestão em IPDAs</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1"><Label>Histórico 1 - ano</Label><Input value={form.historico_gestao_1_ano} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_1_ano: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 1 - IPDA</Label><Input value={form.historico_gestao_1_ipda} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_1_ipda: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 1 - UF</Label><Input value={form.historico_gestao_1_uf} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_1_uf: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 1 - tempo</Label><Input value={form.historico_gestao_1_tempo} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_1_tempo: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 2 - ano</Label><Input value={form.historico_gestao_2_ano} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_2_ano: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 2 - IPDA</Label><Input value={form.historico_gestao_2_ipda} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_2_ipda: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 2 - UF</Label><Input value={form.historico_gestao_2_uf} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_2_uf: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 2 - tempo</Label><Input value={form.historico_gestao_2_tempo} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_2_tempo: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 3 - ano</Label><Input value={form.historico_gestao_3_ano} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_3_ano: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 3 - IPDA</Label><Input value={form.historico_gestao_3_ipda} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_3_ipda: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 3 - UF</Label><Input value={form.historico_gestao_3_uf} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_3_uf: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Histórico 3 - tempo</Label><Input value={form.historico_gestao_3_tempo} onChange={(e) => setForm((prev) => ({ ...prev, historico_gestao_3_tempo: e.target.value }))} /></div>
                </div>

                <h4 className="text-sm font-semibold text-slate-800">Termo de compromisso do obreiro</h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1"><Label>Cidade do termo</Label><Input value={form.data_termo_cidade} onChange={(e) => setForm((prev) => ({ ...prev, data_termo_cidade: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Dia</Label><Input value={form.data_termo_dia} onChange={(e) => setForm((prev) => ({ ...prev, data_termo_dia: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Mês</Label><Input value={form.data_termo_mes} onChange={(e) => setForm((prev) => ({ ...prev, data_termo_mes: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Ano</Label><Input value={form.data_termo_ano} onChange={(e) => setForm((prev) => ({ ...prev, data_termo_ano: e.target.value }))} /></div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1"><Label>Testemunha 1 - Nome</Label><Input value={form.testemunha1_nome} onChange={(e) => setForm((prev) => ({ ...prev, testemunha1_nome: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Testemunha 1 - Documento</Label><Input value={form.testemunha1_documento} onChange={(e) => setForm((prev) => ({ ...prev, testemunha1_documento: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Testemunha 2 - Nome</Label><Input value={form.testemunha2_nome} onChange={(e) => setForm((prev) => ({ ...prev, testemunha2_nome: e.target.value }))} /></div>
                  <div className="space-y-1"><Label>Testemunha 2 - Documento</Label><Input value={form.testemunha2_documento} onChange={(e) => setForm((prev) => ({ ...prev, testemunha2_documento: e.target.value }))} /></div>
                </div>
                <div className="space-y-1">
                  <Label>Observações do termo</Label>
                  <Textarea value={form.observacoes_termo} onChange={(e) => setForm((prev) => ({ ...prev, observacoes_termo: e.target.value }))} />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={saveDraft} disabled={savingDraft}>
                <Save className="mr-2 h-4 w-4" /> {savingDraft ? "Salvando..." : "Salvar rascunho"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
        </>
      )}
    </ManagementShell>
  );
}


