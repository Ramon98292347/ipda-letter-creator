import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Bluetooth, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any;
}

type ReceiptMode = "a4" | "thermal";
type ThermalWidth = "80" | "56";

const UNIDADES = ["", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function numeroAte999PorExtenso(n: number): string {
  if (n === 0) return "zero";
  if (n === 100) return "cem";

  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  const partes: string[] = [];

  if (c > 0) partes.push(CENTENAS[c]);
  if (d === 1) {
    partes.push(DEZ_A_DEZENOVE[u]);
  } else {
    if (d > 1) partes.push(DEZENAS[d]);
    if (u > 0) partes.push(UNIDADES[u]);
  }

  return partes.filter(Boolean).join(" e ");
}

function numeroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  if (n < 1000) return numeroAte999PorExtenso(n);

  const milhares = Math.floor(n / 1000);
  const resto = n % 1000;
  const prefixo = milhares === 1 ? "mil" : `${numeroAte999PorExtenso(milhares)} mil`;

  if (resto === 0) return prefixo;
  if (resto < 100) return `${prefixo} e ${numeroAte999PorExtenso(resto)}`;
  return `${prefixo} ${numeroAte999PorExtenso(resto)}`;
}

function valorEmExtenso(valor: number): string {
  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);

  const reaisTexto = `${numeroPorExtenso(inteiro)} ${inteiro === 1 ? "real" : "reais"}`;
  if (centavos === 0) return reaisTexto;

  const centavosTexto = `${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return `${reaisTexto} e ${centavosTexto}`;
}

async function waitImageLoaded(img: HTMLImageElement | null): Promise<void> {
  if (!img) return;
  if (!img.complete) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      setTimeout(done, 2500);
    });
  }

  if (img.complete && "decode" in img) {
    try {
      await img.decode();
    } catch {
      // Mantem impressao mesmo com falha no decode
    }
  }
}

export function ReceiptModal({ open, onOpenChange, data }: ReceiptModalProps) {
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>("a4");
  const [thermalWidth, setThermalWidth] = useState<ThermalWidth>("80");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const logoRef = useRef<HTMLImageElement | null>(null);
  const qrRef = useRef<HTMLImageElement | null>(null);
  const printSectionRef = useRef<HTMLDivElement | null>(null);

  if (!data?.letter) return null;

  const cartaId = String(data.letter.id ?? "");
  const cartaUrl = `https://idipilrcaqittmnapmbq.supabase.co/storage/v1/object/public/cartas/documentos/cartas/${cartaId}.pdf`;
  const valorNumero = Number.parseFloat(String(valor).replace(",", "."));
  const valorValido = Number.isFinite(valorNumero) && valorNumero >= 0 ? valorNumero : 0;
  const valorExtenso = valorEmExtenso(valorValido);

  useEffect(() => {
    let mounted = true;

    QRCode.toDataURL(cartaUrl, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (mounted) setQrDataUrl(url);
      })
      .catch(() => {
        if (mounted) setQrDataUrl("");
      });

    return () => {
      mounted = false;
    };
  }, [cartaUrl]);

  const handlePrint = async () => {
    await waitImageLoaded(logoRef.current);
    await waitImageLoaded(qrRef.current);
    const receiptNode = printSectionRef.current;
    if (!receiptNode) return;

    const receiptClone = receiptNode.cloneNode(true) as HTMLDivElement;
    for (const img of Array.from(receiptClone.querySelectorAll("img"))) {
      const src = img.getAttribute("src") || "";
      if (src.startsWith("/")) {
        img.src = `${window.location.origin}${src}`;
      }
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join("\n");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);

    const printStyles = isThermal
      ? `
        @page { size: ${thermalPaperWidth} auto; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          width: ${thermalPaperWidth};
          background: #fff;
          overflow: visible;
        }
        body {
          display: flex;
          justify-content: center;
        }
        #print-root {
          width: ${thermalPaperWidth};
          margin: 0 auto;
          padding: 0;
        }
        #print-root > * {
          width: ${thermalPaperWidth} !important;
          max-width: ${thermalPaperWidth} !important;
          margin: 0 auto !important;
          border: none !important;
          box-shadow: none !important;
        }
      `
      : `
        @page { size: A4 portrait; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          width: 210mm;
          min-height: 297mm;
          background: #fff;
          overflow: visible;
        }
        body {
          display: flex;
          align-items: flex-start;
          justify-content: center;
        }
        #print-root {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding-top: 4mm;
          box-sizing: border-box;
        }
        #print-root > * {
          width: 176mm !important;
          max-width: 176mm !important;
          min-height: 0 !important;
          margin: 0 auto !important;
          padding: 8mm !important;
          border: none !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      `;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      iframe.remove();
      return;
    }

    iframeDoc.open();
    iframeDoc.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Recibo</title>
          ${styleTags}
          <style>
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            ${printStyles}
          </style>
        </head>
        <body>
          <div id="print-root">${receiptClone.outerHTML}</div>
        </body>
      </html>
    `);
    iframeDoc.close();

    const finishPrint = () => {
      setTimeout(() => iframe.remove(), 800);
    };

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        finishPrint();
        return;
      }
      frameWindow.focus();
      frameWindow.print();
      finishPrint();
    };
  };

  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const isThermal = receiptMode === "thermal";
  const thermalPaperWidth = thermalWidth === "56" ? "56mm" : "80mm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden bg-slate-50 border-slate-200">
        <DialogHeader className="px-6 py-4 bg-white border-b border-slate-200">
          <DialogTitle className="text-xl font-bold flex items-center justify-between gap-2 text-slate-800 flex-wrap">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" /> Emissao de Recibo
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row md:h-[82vh] max-h-[88vh] overflow-y-auto md:overflow-hidden">
          <div className="w-full md:w-1/3 flex flex-col border-r border-slate-200 bg-white">
            <div className="p-6 flex flex-col gap-5 overflow-y-visible md:overflow-y-auto flex-shrink-0">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Layout de Impressao</label>
                <select
                  value={receiptMode}
                  onChange={(e) => setReceiptMode(e.target.value as ReceiptMode)}
                  className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="a4">A4</option>
                  <option value="thermal">Termica (80/56mm)</option>
                </select>
              </div>

              {isThermal && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Largura Termica</label>
                  <select
                    value={thermalWidth}
                    onChange={(e) => setThermalWidth(e.target.value as ThermalWidth)}
                    className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="80">80mm</option>
                    <option value="56">56mm</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Valor do Recibo (R$)</label>
                <Input
                  type="number"
                  placeholder="Ex: 150,00"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="text-lg font-semibold"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Observacao / Referente a</label>
                <Input
                  placeholder="Ex: Pregacao quarta-feira"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <div className="w-1/3">
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Documento</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="CPF">CPF</option>
                    <option value="RG">RG</option>
                  </select>
                </div>
                <div className="w-2/3">
                  <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Numero</label>
                  <Input
                    placeholder={docType === "CPF" ? "000.000.000-00" : "00.000.000-X"}
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500 border border-slate-200 rounded-md p-3 bg-slate-50">
                QR local (sem URL externa na hora do print):<br />
                <span className="font-mono break-all">{cartaId}</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-2/3 p-4 md:p-6 bg-slate-100 flex flex-col items-center justify-start overflow-auto">
            {!isThermal ? (
              <div
                id="receipt-preview-section"
                ref={printSectionRef}
                data-print-mode="a4"
                className="w-full max-w-[182mm] min-h-[268mm] bg-white border border-slate-300 shadow-xl mx-auto p-[10mm]"
              >
                <div className="text-center border-b border-slate-300 pb-[5mm] mb-[5mm]">
                  <img ref={logoRef} src="/logo-recibo.png" alt="Logo Igreja" className="mx-auto w-[34mm] h-auto mb-[1mm]" />
                  <p className="m-0 text-[12pt] font-extrabold uppercase text-[#24388d]">Igreja Pentecostal Deus e Amor</p>
                  <p className="m-0 mt-[1.2mm] text-[9pt] font-bold text-slate-600">CNPJ: 43.208.040/0001-36</p>
                  <h2 className="m-0 mt-[2mm] text-[17pt] font-black uppercase text-slate-900">Recibo de Contribuicao / Pregacao</h2>
                  <p className="m-0 mt-[1.5mm] text-[9pt] uppercase tracking-[0.5px] text-slate-500">Comprovante oficial de recebimento</p>
                </div>

                <div className="my-[5mm] border border-slate-300 rounded-[3mm] p-[4.5mm] text-center bg-slate-50">
                  <div className="text-[10pt] font-bold uppercase text-slate-500 mb-[2mm]">Valor Recebido</div>
                  <p className="m-0 text-[26pt] font-black text-slate-900">R$ {valorValido.toFixed(2)}</p>
                </div>

                <div className="border border-slate-200 rounded-[3mm] p-[5mm] mb-[5mm]">
                  <p className="m-0 text-[12pt] leading-[1.6] text-center">
                    Recebemos de <strong>{data.letter.church_destination || "Igreja de Destino"}</strong> a quantia de <strong>R$ {valorValido.toFixed(2)}</strong> ({valorExtenso}), referente a <strong>{obs || "Contribuicao"}</strong>.
                  </p>
                </div>

                <div className="grid grid-cols-[1.25fr_0.75fr] gap-[5mm] mt-[3mm]">
                  <div className="border border-slate-200 rounded-[3mm] p-[4.5mm]">
                    <h3 className="m-0 mb-[3mm] text-[11pt] font-extrabold uppercase text-[#24388d] border-l-4 border-[#24388d] pl-[3mm]">Dados do Recibo</h3>

                    <div className="mb-[2.4mm]">
                      <span className="block text-[8pt] text-slate-500 uppercase font-bold mb-[1mm]">Codigo da Carta</span>
                      <span className="block text-[10.5pt] font-semibold break-all">{cartaId}</span>
                    </div>
                    <div className="mb-[2.4mm]">
                      <span className="block text-[8pt] text-slate-500 uppercase font-bold mb-[1mm]">Igreja de Origem</span>
                      <span className="block text-[10.5pt] font-semibold break-words">{data.letter.church_origin}</span>
                    </div>
                    <div className="mb-[2.4mm]">
                      <span className="block text-[8pt] text-slate-500 uppercase font-bold mb-[1mm]">Funcao</span>
                      <span className="block text-[10.5pt] font-semibold">{data.letter.minister_role}</span>
                    </div>
                    <div className="mb-[2.4mm]">
                      <span className="block text-[8pt] text-slate-500 uppercase font-bold mb-[1mm]">Local e Data</span>
                      <span className="block text-[10.5pt] font-semibold capitalize">{dataAtual}</span>
                    </div>
                    <div>
                      <span className="block text-[8pt] text-slate-500 uppercase font-bold mb-[1mm]">Referencia</span>
                      <span className="block text-[10.5pt] font-semibold break-words">{obs || "Contribuicao"}</span>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="border border-slate-200 rounded-[3mm] p-[4.5mm] bg-white">
                      <img
                        ref={qrRef}
                        src={qrDataUrl}
                        className="w-[42mm] h-[42mm] object-contain block mx-auto mb-[3mm]"
                        alt="QR Code da carta"
                      />
                      <p className="m-0 text-[8pt] text-slate-500 uppercase font-bold">Escaneie para abrir a carta</p>
                      <p className="m-0 mt-[2mm] text-[8pt] text-slate-700 break-all leading-[1.4]">{cartaId}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-[5mm] border border-dashed border-slate-300 rounded-[3mm] py-[3.5mm] px-[4.5mm] bg-slate-50">
                  <p className="m-0 text-[9pt] leading-[1.6] text-center text-slate-600">
                    Para maior clareza, firmamos o presente comprovante de recebimento, servindo este como documento de conferencia e registro.
                  </p>
                </div>

                <div className="mt-[11mm] text-center">
                  <div className="w-[85mm] mx-auto mb-[3mm] border-t border-slate-900" />
                  <p className="m-0 text-[11pt] font-extrabold uppercase">{data.letter.preacher_name}</p>
                  {docNumber && <p className="m-0 mt-[1mm] text-[9pt] text-slate-600">{docType}: {docNumber}</p>}
                  <p className="m-0 mt-[1mm] text-[8pt] uppercase font-bold text-slate-500">Assinatura do Recebedor</p>
                </div>

              </div>
            ) : (
              <div
                id="receipt-preview-section"
                ref={printSectionRef}
                data-print-mode="thermal"
                data-thermal-width={thermalWidth}
                className={`bg-white border border-slate-300 shadow-xl mx-auto w-full ${thermalWidth === "56" ? "max-w-[56mm]" : "max-w-[80mm]"}`}
              >
                <div className="p-[4mm]">
                  <div className="text-center">
                    <img ref={logoRef} src="/logo-recibo.png" alt="Logo Igreja" className="w-[18mm] h-auto mx-auto mb-[2mm]" />
                    <p className="m-0 text-[12px] font-extrabold uppercase leading-[1.25]">Igreja Pentecostal Deus e Amor</p>
                    <p className="m-0 mt-[1mm] text-[10px] font-bold leading-[1.2]">CNPJ: 43.208.040/0001-36</p>
                    <p className="m-0 mt-[2mm] text-[11px] font-extrabold uppercase leading-[1.25]">Recibo de Contribuicao / Pregacao</p>
                    <p className="m-0 mt-[1mm] text-[9px] leading-[1.2]">Comprovante oficial de recebimento</p>
                  </div>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <div className="text-center">
                    <p className="m-0 text-[10px] uppercase font-bold">Valor Recebido</p>
                    <p className="m-0 mt-[1.2mm] text-[24px] font-black leading-[1.1]">R$ {valorValido.toFixed(2)}</p>
                  </div>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <p className="m-0 text-[10px] leading-[1.5] text-center">
                    Recebemos de <strong>{data.letter.church_destination || "Igreja de Destino"}</strong> a quantia de <strong>R$ {valorValido.toFixed(2)}</strong> ({valorExtenso}), referente a <strong>{obs || "Contribuicao"}</strong>.
                  </p>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <p className="m-0 text-[10px] font-extrabold uppercase text-center">Dados do Recibo</p>
                  <div className="mt-[2mm] text-[9.5px] leading-[1.5]">
                    <div className="mb-[1.5mm]"><span className="font-extrabold uppercase">Codigo da Carta:</span><br /><span>{cartaId}</span></div>
                    <div className="mb-[1.5mm]"><span className="font-extrabold uppercase">Igreja de Origem:</span><br /><span>{data.letter.church_origin}</span></div>
                    <div className="mb-[1.5mm]"><span className="font-extrabold uppercase">Funcao:</span><br /><span>{data.letter.minister_role}</span></div>
                    <div className="mb-[1.5mm]"><span className="font-extrabold uppercase">Local e Data:</span><br /><span className="capitalize">{dataAtual}</span></div>
                  </div>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <div className="text-center mt-[2mm]">
                    <img
                      ref={qrRef}
                      src={qrDataUrl}
                      className="w-[28mm] h-[28mm] object-contain mx-auto mb-[2mm]"
                      alt="QR Code da carta"
                    />
                    <p className="m-0 text-[9px] font-bold uppercase leading-[1.3]">Escaneie para abrir a carta</p>
                    <p className="m-0 mt-[1.5mm] text-[8px] leading-[1.35] break-all">{cartaId}</p>
                  </div>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <div className="text-center">
                    <div className="border-t border-black w-[42mm] mx-auto mt-[7mm] mb-[2mm]" />
                    <p className="m-0 text-[10px] font-extrabold uppercase leading-[1.3]">{data.letter.preacher_name}</p>
                    {docNumber && <p className="m-0 mt-[1mm] text-[8.5px] leading-[1.2]">{docType}: {docNumber}</p>}
                    <p className="m-0 mt-[1mm] text-[8px] uppercase leading-[1.2]">Assinatura do Recebedor</p>
                  </div>

                </div>
              </div>
            )}

            <div className={`mt-6 w-full ${isThermal ? "max-w-[80mm]" : "max-w-[182mm]"} mx-auto px-4 sm:px-0`}>
              <div className="flex items-center gap-3 w-full">
                <Button onClick={handlePrint} className="flex-1 font-bold h-12 shadow-sm bg-blue-600 hover:bg-blue-700">
                  <Printer className="mr-2 h-5 w-5" /> Imprimir {isThermal ? `Termica ${thermalWidth}mm` : "A4"}
                </Button>
                <Button variant="outline" className="flex-1 font-bold h-12 shadow-sm border-slate-300 text-slate-700 hover:bg-slate-100">
                  <Bluetooth className="mr-2 h-5 w-5 text-blue-500" /> Bluetooth
                </Button>
              </div>
              <p className="text-xs text-center text-slate-500 mt-2">
                * O QR e a logo sao gerados/carregados na pre-visualizacao antes da impressao.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
