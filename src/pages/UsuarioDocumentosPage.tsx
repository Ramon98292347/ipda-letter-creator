import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, IdCard, Send } from "lucide-react";
import { generateMemberDocs, getMemberDocsStatus, getPastorByTotvsPublic, workerDashboard } from "@/services/saasService";

type DocTab = "carteirinha" | "ficha";

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getAddressField(addressJson: unknown, key: string) {
  const address = (addressJson || {}) as Record<string, unknown>;
  return String(address[key] || "");
}

function svgPlaceholder(label: string, width = 300, height = 200) {
  const safe = encodeURIComponent(label);
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='100%' height='100%' fill='%23F1F5F9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364758B' font-size='20' font-family='Arial'>${safe}</text></svg>`;
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
  <div class="side back"><div class="title">CARTEIRINHA DE MEMBRO</div><div class="field-box id-box"></div><div class="field-label id-label">ID/REGISTRADO</div><div class="field-value id-value">${escapeHtml(params.matricula)}</div><div class="field-box cpf-box"></div><div class="field-label cpf-label">CPF</div><div class="field-value cpf-value">${escapeHtml(params.cpf)}</div>
  <div class="field-box tel-box"></div><div class="field-label tel-label">TELEFONE</div><div class="field-value tel-value">${escapeHtml(params.telefone)}</div><div class="field-box bat-box"></div><div class="field-label bat-label">DATA BATISMO</div><div class="field-value bat-value">${escapeHtml(params.batismo)}</div>
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
  return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><style>
  @page{size:A4;margin:15mm}body{margin:0;font-family:Montserrat,Arial,sans-serif;color:#111}.page{width:210mm;height:297mm;box-sizing:border-box}
  .header{display:flex;align-items:center;justify-content:center;gap:12mm;margin-top:2mm}.header-photo{width:25mm;height:32mm;border:.35mm solid rgba(0,0,0,.25);border-radius:2mm;overflow:hidden;background:rgba(0,0,0,.04)}
  .header-photo img{width:100%;height:100%;object-fit:cover}.logo{height:45mm;width:auto}.title{text-align:center;margin:10mm 0 8mm 0;line-height:1.15}
  .title h1{margin:0;font-size:16pt;font-weight:800}.title h2{margin:2mm 0 0 0;font-size:14pt;font-weight:800}.content{margin-top:4mm;font-size:10.5pt}
  .row{display:flex;gap:10mm;margin:2.2mm 0;flex-wrap:wrap}.field{display:flex;gap:2mm;align-items:baseline;min-width:0}.label{font-weight:600;white-space:nowrap}
  .value{font-weight:500;border-bottom:.25mm solid rgba(0,0,0,.25);padding:0 1mm .6mm 1mm;min-width:40mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .w-70{min-width:70mm}.w-60{min-width:60mm}.w-50{min-width:50mm}.w-45{min-width:45mm}.w-40{min-width:40mm}.w-35{min-width:35mm}.w-30{min-width:30mm}.w-25{min-width:25mm}
  .section-title{text-align:center;margin:22mm 0 8mm 0;font-size:14pt;font-weight:900}.footer{position:absolute;bottom:10mm;left:0;right:0;text-align:center;font-weight:800;font-size:11pt}
  </style></head><body><div class="page"><div class="header"><div class="header-photo"><img src="${escapeHtml(params.foto || svgPlaceholder("Foto 3x4", 300, 400))}" alt="Foto"></div><img class="logo" src="https://idipilrcaqittmnapmbq.supabase.co/storage/v1/object/public/banner/logo/logo%20d.png" alt="Logo"></div>
  <div class="title"><h1>Ficha de cadastro de Membros</h1><h2>${escapeHtml(params.subtitulo)}</h2></div><div class="content">
  <div class="row"><div class="field"><div class="label">Nome:</div><div class="value w-70">${escapeHtml(params.nome)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Endereço:</div><div class="value w-70">${escapeHtml(params.endereco)}</div></div><div class="field"><div class="label">Número da casa:</div><div class="value w-30">${escapeHtml(params.numero)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Bairro:</div><div class="value w-45">${escapeHtml(params.bairro)}</div></div><div class="field"><div class="label">Cidade:</div><div class="value w-45">${escapeHtml(params.cidade)}</div></div><div class="field"><div class="label">Estado:</div><div class="value w-25">${escapeHtml(params.estado)}</div></div><div class="field"><div class="label">Cep:</div><div class="value w-25">${escapeHtml(params.cep)}</div></div></div>
  <div class="row"><div class="field"><div class="label">RG:</div><div class="value w-35">${escapeHtml(params.rg)}</div></div><div class="field"><div class="label">CPF:</div><div class="value w-35">${escapeHtml(params.cpf)}</div></div><div class="field"><div class="label">Data de Nascimento:</div><div class="value w-45">${escapeHtml(params.nascimento)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Cidade de Nascimento:</div><div class="value w-60">${escapeHtml(params.cidadeNascimento)}</div></div><div class="field"><div class="label">Estado:</div><div class="value w-35">${escapeHtml(params.estadoNascimento)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Estado Civil:</div><div class="value w-40">${escapeHtml(params.estadoCivil)}</div></div><div class="field"><div class="label">Telefone:</div><div class="value w-45">${escapeHtml(params.telefone)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Endereço de email:</div><div class="value w-70">${escapeHtml(params.email)}</div></div></div>
  <div class="row"><div class="field"><div class="label">Profissão:</div><div class="value w-60">${escapeHtml(params.profissao)}</div></div><div class="field"><div class="label">Idade:</div><div class="value w-25">${escapeHtml(params.idade)}</div></div></div>
  <div class="section-title">Dados Ministeriais do Membro e do Obreiro (a)</div><div class="row"><div class="field"><div class="label">Data de Batismo:</div><div class="value w-45">${escapeHtml(params.batismo)}</div></div><div class="field"><div class="label">Função Ministerial:</div><div class="value w-50">${escapeHtml(params.funcao)}</div></div></div><div class="row"><div class="field"><div class="label">Data da Ordenação:</div><div class="value w-45">${escapeHtml(params.ordenacao)}</div></div></div></div>
  <div class="footer">${rodape}</div></div></body></html>`;
}

export default function UsuarioDocumentosPage() {
  const nav = useNavigate();
  const { usuario, session } = useUser();
  const isCadastroPendente = usuario?.registration_status === "PENDENTE";
  const [docTab, setDocTab] = useState<DocTab>("carteirinha");
  const [sendingDoc, setSendingDoc] = useState(false);

  const userId = String(usuario?.id || "");
  const { data } = useQuery({
    queryKey: ["worker-dashboard-docs", userId],
    queryFn: () => workerDashboard(undefined, undefined, 1, 20),
    enabled: Boolean(userId),
  });

  const profile = data?.user;
  const church = data?.church;
  const activeTotvs = String(session?.totvs_id || church?.totvs_id || "");

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

  const fichaPronta = Boolean(
    docsStatus?.ficha && String(docsStatus?.ficha?.final_url || "").trim().length > 0,
  );
  const carteirinhaPronta = Boolean(
    docsStatus?.carteirinha && String(docsStatus?.carteirinha?.final_url || "").trim().length > 0,
  );

  const addressStreet = getAddressField(profile?.address_json, "street");
  const addressNumber = getAddressField(profile?.address_json, "number");
  const addressNeighborhood = getAddressField(profile?.address_json, "neighborhood");
  const city = getAddressField(profile?.address_json, "city");
  const state = getAddressField(profile?.address_json, "state");
  const zip = getAddressField(profile?.address_json, "zip");

  const carteirinhaHtml = useMemo(
    () =>
      buildCarteirinhaHtml({
        foto: String(profile?.avatar_url || ""),
        assinatura: String(pastor?.signature_url || ""),
        qr: String(docsStatus?.ficha?.final_url || ""),
        nome: String(profile?.full_name || usuario?.nome || ""),
        funcao: String(profile?.minister_role || ""),
        matricula: String((profile as Record<string, unknown> | undefined)?.matricula || ""),
        cpf: String(profile?.cpf || ""),
        telefone: String(profile?.phone || ""),
        batismo: String((profile as Record<string, unknown> | undefined)?.baptism_date || ""),
      }),
    [profile, pastor?.signature_url, usuario?.nome, docsStatus?.ficha?.final_url],
  );

  const fichaHtml = useMemo(() => {
    const nascimentoRaw = String(profile?.birth_date || "");
    const ano = nascimentoRaw ? Number(nascimentoRaw.slice(0, 4)) : 0;
    return buildFichaMembroHtml({
      foto: String(profile?.avatar_url || ""),
      nome: String(profile?.full_name || usuario?.nome || ""),
      endereco: addressStreet,
      numero: addressNumber,
      bairro: addressNeighborhood,
      cidade: city,
      estado: state,
      cep: zip,
      rg: String((profile as Record<string, unknown> | undefined)?.rg || ""),
      cpf: String(profile?.cpf || ""),
      nascimento: nascimentoRaw,
      cidadeNascimento: city,
      estadoNascimento: state,
      estadoCivil: String((profile as Record<string, unknown> | undefined)?.marital_status || ""),
      telefone: String(profile?.phone || ""),
      email: String(profile?.email || ""),
      profissao: String((profile as Record<string, unknown> | undefined)?.profession || ""),
      idade: ano > 0 ? String(new Date().getFullYear() - ano) : "",
      batismo: String((profile as Record<string, unknown> | undefined)?.baptism_date || ""),
      funcao: String(profile?.minister_role || ""),
      ordenacao: String((profile as Record<string, unknown> | undefined)?.ordination_date || ""),
      subtitulo: String(session?.church_name || church?.church_name || "Setorial"),
      rodapeIgreja: String(church?.address_full || ""),
    });
  }, [profile, usuario?.nome, addressStreet, addressNumber, addressNeighborhood, city, state, zip, session?.church_name, church?.church_name, church?.address_full]);

  async function enviarParaConfeccao(documentType: "ficha_membro" | "carteirinha") {
    if (isCadastroPendente) {
      toast.error("Cadastro pendente. Aguarde aprova??o para enviar documentos.");
      return;
    }
    if (!userId || !activeTotvs) {
      toast.error("Dados de sess?o inv?lidos.");
      return;
    }
    if (documentType === "carteirinha" && !fichaPronta) {
      toast.error("A carteirinha s? pode ser enviada ap?s a ficha pronta.");
      return;
    }

    setSendingDoc(true);
    try {
      await generateMemberDocs({
        document_type: documentType,
        member_id: userId,
        church_totvs_id: activeTotvs,
        dados: {
          nome_completo: String(profile?.full_name || usuario?.nome || ""),
          funcao_ministerial: String(profile?.minister_role || ""),
          cpf: String(profile?.cpf || ""),
          telefone: String(profile?.phone || ""),
          email: String(profile?.email || ""),
          foto_3x4_url: String(profile?.avatar_url || ""),
          assinatura_pastor_url: String(pastor?.signature_url || ""),
          qr_code_url: String(docsStatus?.ficha?.final_url || ""),
          igreja_nome: String(session?.church_name || church?.church_name || ""),
        },
      });
      await refetchDocsStatus();
      toast.success("Documento enviado para confec??o.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar documento.";
      toast.error(message || "Falha ao enviar documento.");
    } finally {
      setSendingDoc(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <main className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-4">
        {isCadastroPendente ? (
          <Card className="border border-amber-200 bg-amber-50">
            <CardContent className="py-3 text-sm text-amber-800">
              Seu cadastro esta pendente de liberacao. A visualizacao de documentos sera liberada apos aprovacao.
            </CardContent>
          </Card>
        ) : null}
        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5" /> Documentos</CardTitle>
            <Button variant="outline" onClick={() => nav("/usuario")}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant={docTab === "carteirinha" ? "default" : "outline"} onClick={() => setDocTab("carteirinha")}>Carteirinha</Button>
              <Button variant={docTab === "ficha" ? "default" : "outline"} onClick={() => setDocTab("ficha")}>Ficha do membro</Button>
              <Button
                onClick={() => void enviarParaConfeccao(docTab === "ficha" ? "ficha_membro" : "carteirinha")}
                disabled={sendingDoc || fetchingDocsStatus || isCadastroPendente || (docTab === "carteirinha" && !fichaPronta)}
              >
                <Send className="mr-2 h-4 w-4" />
                {sendingDoc ? "Enviando..." : "Enviar para confecção"}
              </Button>
            </div>
            {docTab === "carteirinha" && carteirinhaPronta ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">Carteirinha pronta.</p>
                <p className="mt-1 text-xs text-emerald-700">A pré-visualização foi ocultada porque o arquivo final já está disponível.</p>
                <div className="mt-3">
                  <Button size="sm" onClick={() => window.open(String(docsStatus?.carteirinha?.final_url || ""), "_blank", "noopener,noreferrer")}>
                    Abrir carteirinha
                  </Button>
                </div>
              </div>
            ) : null}
            {docTab === "ficha" && fichaPronta ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">Ficha pronta.</p>
                <p className="mt-1 text-xs text-emerald-700">A pré-visualização foi ocultada porque o arquivo final já está disponível.</p>
                <div className="mt-3">
                  <Button size="sm" onClick={() => window.open(String(docsStatus?.ficha?.final_url || ""), "_blank", "noopener,noreferrer")}>
                    Abrir ficha
                  </Button>
                </div>
              </div>
            ) : null}
            {(docTab === "carteirinha" && !carteirinhaPronta) || (docTab === "ficha" && !fichaPronta) ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {docTab === "carteirinha" ? (
                  <iframe title="Carteirinha do membro" className="h-[340px] w-full" srcDoc={isCadastroPendente ? "" : carteirinhaHtml} />
                ) : (
                  <iframe title="Ficha do membro" className="h-[720px] w-full" srcDoc={isCadastroPendente ? "" : fichaHtml} />
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
