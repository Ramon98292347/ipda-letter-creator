import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
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
const LS_RECEIPT_MODE = "ipda_receipt_mode";
const LS_RECEIPT_THERMAL_WIDTH = "ipda_receipt_thermal_width";
const LS_RECEIPT_VALOR = "ipda_receipt_valor";
const LS_RECEIPT_OBS = "ipda_receipt_obs";

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

function formatCpf(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length !== 11) return String(value || "");
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function ReceiptModal({ open, onOpenChange, data }: ReceiptModalProps) {
  const [valor, setValor] = useState(() => {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(LS_RECEIPT_VALOR) || "");
  });
  const [obs, setObs] = useState(() => {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(LS_RECEIPT_OBS) || "");
  });
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>(() => {
    if (typeof window === "undefined") return "a4";
    const cached = String(window.localStorage.getItem(LS_RECEIPT_MODE) || "").trim();
    return cached === "thermal" ? "thermal" : "a4";
  });
  const [thermalWidth, setThermalWidth] = useState<ThermalWidth>(() => {
    if (typeof window === "undefined") return "80";
    const cached = String(window.localStorage.getItem(LS_RECEIPT_THERMAL_WIDTH) || "").trim();
    return cached === "56" ? "56" : "80";
  });
  const [bluetoothDeviceName, setBluetoothDeviceName] = useState("");
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState(false);
  const [isDataPanelCollapsed, setIsDataPanelCollapsed] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const logoRef = useRef<HTMLImageElement | null>(null);
  const qrRef = useRef<HTMLImageElement | null>(null);
  const printSectionRef = useRef<HTMLDivElement | null>(null);
  const bluetoothDeviceRef = useRef<any>(null);
  const bluetoothCharRef = useRef<any>(null);
  const serialPortRef = useRef<any>(null);

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

  useEffect(() => {
    if (!open) return;
    setDocType("CPF");
    const rawCpf = String(data?.member?.cpf || "").replace(/\D/g, "");
    if (rawCpf.length === 11) {
      setDocNumber(formatCpf(rawCpf));
    } else {
      setDocNumber("");
    }
  }, [open, data?.member?.cpf]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_RECEIPT_MODE, receiptMode);
  }, [receiptMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_RECEIPT_THERMAL_WIDTH, thermalWidth);
  }, [thermalWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_RECEIPT_VALOR, valor);
  }, [valor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_RECEIPT_OBS, obs);
  }, [obs]);

  const handleRecoverManualData = () => {
    if (typeof window === "undefined") return;
    setValor(String(window.localStorage.getItem(LS_RECEIPT_VALOR) || ""));
    setObs(String(window.localStorage.getItem(LS_RECEIPT_OBS) || ""));
  };

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

    const printHtml = `
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
    `;

    // Comentario: no Android/PWA, print via iframe pode imprimir a tela atual.
    // Abre um documento dedicado para garantir que apenas o recibo seja impresso.
    const popup = window.open("", "_blank");
    if (popup && popup.document) {
      popup.document.open();
      popup.document.write(printHtml);
      popup.document.close();
      popup.onload = () => {
        popup.focus();
        popup.print();
      };
      return;
    }

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

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      iframe.remove();
      return;
    }
    iframeDoc.open();
    iframeDoc.write(printHtml);
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

  const handleBluetoothPairing = async () => {
    try {
      if (!window.isSecureContext) {
        window.alert("Bluetooth exige HTTPS ou localhost.");
        return;
      }

      const nav = navigator as Navigator & { bluetooth?: { requestDevice?: (options: unknown) => Promise<any> } };
      if (!nav.bluetooth || typeof nav.bluetooth.requestDevice !== "function") {
        window.alert("Bluetooth nao suportado neste navegador/dispositivo.");
        return;
      }

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "battery_service",
          "device_information",
          "generic_access",
          "000018f0-0000-1000-8000-00805f9b34fb",
          "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
        ],
      });

      if (!device?.gatt) throw new Error("GATT indisponivel");
      const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
      const services = await server.getPrimaryServices();
      let writable: any = null;
      for (const service of services) {
        const chars = await service.getCharacteristics();
        writable =
          chars.find((char: any) => Boolean(char?.properties?.writeWithoutResponse)) ||
          chars.find((char: any) => Boolean(char?.properties?.write));
        if (writable) break;
      }
      if (!writable) {
        window.alert("Impressora pareada, mas nao foi encontrada caracteristica de escrita.");
        return;
      }

      const name = String(device?.name || "Impressora Bluetooth");
      bluetoothDeviceRef.current = device;
      bluetoothCharRef.current = writable;
      setBluetoothDeviceName(name);
      window.alert(`Pareamento concluido com: ${name}`);
    } catch (error) {
      const name = String((error as { name?: string })?.name || "");
      if (name === "NotFoundError") {
        window.alert("Nenhuma impressora selecionada.");
        return;
      }
      window.alert("Falha no pareamento Bluetooth. Verifique se a impressora esta ligada e visivel.");
    }
  };

  const normalizePrintText = (value: string) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "");

  const wrapText = (value: string, width: number): string[] => {
    const words = normalizePrintText(value).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word.length > width ? word.slice(0, width) : word;
    }
    if (line) lines.push(line);
    return lines;
  };

  const centerLine = (value: string, width: number) => {
    const safe = normalizePrintText(value).slice(0, width);
    const pad = Math.max(0, Math.floor((width - safe.length) / 2));
    return `${" ".repeat(pad)}${safe}`;
  };

  const buildThermalReceiptText = (): string => {
    const width = thermalWidth === "56" ? 32 : 48;
    const dash = "-".repeat(width);
    const lines: string[] = [];
    lines.push(centerLine("IGREJA PENTECOSTAL DEUS E AMOR", width));
    lines.push(centerLine("APOIO EVANGELISTICO / PREGACAO", width));
    lines.push(dash);
    lines.push(centerLine(`VALOR: R$ ${valorValido.toFixed(2)}`, width));
    lines.push(dash);
    lines.push(...wrapText("Recebi da IPDA", width));
    lines.push(...wrapText(`a quantia de R$ ${valorValido.toFixed(2)} (${valorExtenso})`, width));
    lines.push(...wrapText(`referente a ${obs || "Contribuicao"}.`, width));
    lines.push(dash);
    lines.push(...wrapText(`Codigo: ${cartaId}`, width));
    lines.push(...wrapText(`Origem: ${data.letter.church_origin || "-"}`, width));
    lines.push(...wrapText(`Funcao: ${data.letter.minister_role || "-"}`, width));
    lines.push(...wrapText(`Data: ${dataAtual}`, width));
    if (docNumber) lines.push(...wrapText(`${docType}: ${docNumber}`, width));
    lines.push(dash);
    lines.push(...wrapText(`Recebedor: ${data.letter.preacher_name || "-"}`, width));
    lines.push("");
    lines.push("");
    lines.push("");
    return `${lines.join("\n")}\n`;
  };

  const writeInChunks = async (characteristic: any, bytes: Uint8Array) => {
    const CHUNK = 20;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.slice(i, i + CHUNK);
      if (characteristic?.properties?.writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(chunk);
      } else {
        await characteristic.writeValue(chunk);
      }
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  };

  const buildEscPosPayload = () => {
    const encoder = new TextEncoder();
    const init = Uint8Array.from([0x1b, 0x40]);
    const text = encoder.encode(buildThermalReceiptText());
    const feedCut = Uint8Array.from([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
    const payload = new Uint8Array(init.length + text.length + feedCut.length);
    payload.set(init, 0);
    payload.set(text, init.length);
    payload.set(feedCut, init.length + text.length);
    return payload;
  };

  const renderReceiptPreviewToCanvas = async (): Promise<HTMLCanvasElement> => {
    const node = printSectionRef.current;
    if (!node) throw new Error("preview_not_found");
    const isThermalCapture = node.getAttribute("data-print-mode") === "thermal";
    const sourceRect = node.getBoundingClientRect();
    const clone = node.cloneNode(true) as HTMLDivElement;

    clone.style.position = "fixed";
    clone.style.left = "-10000px";
    clone.style.top = "0";
    clone.style.margin = "0";
    clone.style.width = `${Math.max(1, sourceRect.width)}px`;
    clone.style.maxWidth = "none";
    clone.style.background = "#fff";
    clone.style.zIndex = "-1";

    if (isThermalCapture) {
      clone.setAttribute("data-capture-font-boost", "1");
      const boostStyle = document.createElement("style");
      boostStyle.setAttribute("data-capture-style", "receipt-font-boost");
      boostStyle.textContent = `
        [data-capture-font-boost="1"] p,
        [data-capture-font-boost="1"] span,
        [data-capture-font-boost="1"] strong {
          font-size: 1.14em !important;
          line-height: 1.3 !important;
        }
      `;
      clone.appendChild(boostStyle);
    }

    document.body.appendChild(clone);

    let captured: HTMLCanvasElement;
    try {
      captured = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
    } finally {
      clone.remove();
    }

    const targetWidth = thermalWidth === "56" ? 384 : 576;
    const ratio = captured.height / captured.width;
    const width = targetWidth;
    const height = Math.max(1, Math.round(width * ratio));
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("canvas_context_unavailable");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(captured, 0, 0, width, height);
    return out;
  };

  const canvasToEscPosRasterPayload = (canvas: HTMLCanvasElement): Uint8Array => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_context_unavailable");
    const width = Math.max(8, Math.floor(canvas.width / 8) * 8);
    const height = canvas.height;
    const image = ctx.getImageData(0, 0, width, height);
    const bytesPerRow = width / 8;
    const raster = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      for (let xb = 0; xb < bytesPerRow; xb++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xb * 8 + bit;
          const idx = (y * width + x) * 4;
          const r = image.data[idx];
          const g = image.data[idx + 1];
          const b = image.data[idx + 2];
          const a = image.data[idx + 3];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const isBlack = a > 20 && lum < 170;
          if (isBlack) byte |= 0x80 >> bit;
        }
        raster[y * bytesPerRow + xb] = byte;
      }
    }

    const header = Uint8Array.from([
      0x1b, 0x40, // initialize
      0x1d, 0x76, 0x30, 0x00, // GS v 0
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ]);
    const footer = Uint8Array.from([0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
    const payload = new Uint8Array(header.length + raster.length + footer.length);
    payload.set(header, 0);
    payload.set(raster, header.length);
    payload.set(footer, header.length + raster.length);
    return payload;
  };

  const printViaWebSerial = async (payload: Uint8Array) => {
    const nav = navigator as Navigator & {
      serial?: {
        requestPort?: (options?: unknown) => Promise<any>;
      };
    };
    if (!nav.serial || typeof nav.serial.requestPort !== "function") return false;

    const port = serialPortRef.current || await nav.serial.requestPort();
    if (!serialPortRef.current) serialPortRef.current = port;

    await port.open({ baudRate: 9600 });
    const writer = port.writable?.getWriter?.();
    if (!writer) throw new Error("serial_writer_unavailable");
    await writer.write(payload);
    writer.releaseLock();
    await port.close();
    return true;
  };

  const printViaWebUsb = async (payload: Uint8Array) => {
    const nav = navigator as Navigator & {
      usb?: {
        requestDevice?: (options: unknown) => Promise<any>;
      };
    };
    if (!nav.usb || typeof nav.usb.requestDevice !== "function") return false;

    const device = await nav.usb.requestDevice({ filters: [] });
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    await device.claimInterface(0);
    await device.transferOut(1, payload);
    try {
      await device.releaseInterface(0);
    } catch {
      // noop
    }
    await device.close();
    return true;
  };

  const ensureBluetoothCharacteristic = async () => {
    if (bluetoothCharRef.current) return bluetoothCharRef.current;
    const device = bluetoothDeviceRef.current;
    if (!device?.gatt) throw new Error("Nenhuma impressora pareada");
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      const writable =
        chars.find((char: any) => Boolean(char?.properties?.writeWithoutResponse)) ||
        chars.find((char: any) => Boolean(char?.properties?.write));
      if (writable) {
        bluetoothCharRef.current = writable;
        return writable;
      }
    }
    throw new Error("Caracteristica de escrita nao encontrada");
  };

  const handlePrimaryPrint = async () => {
    if (isThermal) {
      setIsBluetoothPrinting(true);
      let payload = buildEscPosPayload();
      try {
        try {
          const canvas = await renderReceiptPreviewToCanvas();
          payload = canvasToEscPosRasterPayload(canvas);
        } catch {
          // fallback para texto puro
        }

        try {
          const characteristic = await ensureBluetoothCharacteristic();
          await writeInChunks(characteristic, payload);
          window.alert("Recibo enviado para impressao Bluetooth.");
          return;
        } catch {
          // tenta fallback
        }

        try {
          const serialOk = await printViaWebSerial(payload);
          if (serialOk) {
            window.alert("Recibo enviado para impressao via Web Serial.");
            return;
          }
        } catch {
          // tenta fallback
        }

        try {
          const usbOk = await printViaWebUsb(payload);
          if (usbOk) {
            window.alert("Recibo enviado para impressao via WebUSB.");
            return;
          }
        } catch {
          // fallback para print comum
        }
      } finally {
        setIsBluetoothPrinting(false);
      }

      await handlePrint();
      return;
    }

    setIsBluetoothPrinting(false);
    await handlePrint();
  };

  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const isThermal = receiptMode === "thermal";
  const thermalPaperWidth = thermalWidth === "56" ? "56mm" : "80mm";
  const isCompactThermal = isThermal && thermalWidth === "56";
  const previewScale = isCompactThermal ? 1.42 : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden bg-slate-50 border-slate-200">
        <DialogHeader className="px-6 py-4 bg-white border-b border-slate-200">
          <DialogTitle className="text-xl font-bold flex items-center justify-between gap-2 text-slate-800 flex-wrap">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" /> Emissao de Recibo
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDataPanelCollapsed((prev) => !prev)}
              className="border-slate-300 text-slate-700"
            >
              {isDataPanelCollapsed ? "Mostrar dados" : "Recolher dados"}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className={`flex flex-col md:h-[82vh] max-h-[88vh] overflow-y-auto md:overflow-hidden ${isDataPanelCollapsed ? "" : "md:flex-row"}`}>
          {!isDataPanelCollapsed ? (
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

              <Button
                type="button"
                variant="outline"
                className="w-full border-slate-300 text-slate-700 hover:bg-slate-100"
                onClick={handleRecoverManualData}
              >
                Recuperar dados salvos
              </Button>

              <div className="text-xs text-slate-500 border border-slate-200 rounded-md p-3 bg-slate-50">
                QR local (sem URL externa na hora do print):<br />
                <span className="font-mono break-all">{cartaId}</span>
              </div>
            </div>
          </div>
          ) : null}

          <div className={`w-full p-4 md:p-6 bg-slate-100 flex flex-col items-center justify-start overflow-auto ${isDataPanelCollapsed ? "" : "md:w-2/3"}`}>
            {!isThermal ? (
              <div
                id="receipt-preview-section"
                ref={printSectionRef}
                data-print-mode="a4"
                className="w-full max-w-[182mm] min-h-[268mm] bg-white border border-slate-300 shadow-xl mx-auto p-[10mm]"
              >
                <div className="text-center border-b border-slate-300 pb-[5mm] mb-[5mm]">
                  <img ref={logoRef} src="/logo-recibo.png" alt="Logo Igreja" className="mx-auto w-[80mm] h-auto mb-[1mm]" />
                  <p className="m-0 text-[12pt] font-extrabold uppercase text-[#24388d]">Igreja Pentecostal Deus e Amor</p>
                  <p className="m-0 mt-[1.2mm] text-[9pt] font-bold text-slate-600">CNPJ: 43.208.040/0001-36</p>
                  <h2 className="m-0 mt-[2mm] text-[17pt] font-black uppercase text-slate-900">Apoio Evangelistico / Pregacao</h2>
                  <p className="m-0 mt-[1.5mm] text-[9pt] uppercase tracking-[0.5px] text-slate-500">Comprovante oficial de recebimento</p>
                </div>

                <div className="my-[5mm] border border-slate-300 rounded-[3mm] p-[4.5mm] text-center bg-slate-50">
                  <div className="text-[10pt] font-bold uppercase text-slate-500 mb-[2mm]">Valor Recebido</div>
                  <p className="m-0 text-[26pt] font-black text-slate-900">R$ {valorValido.toFixed(2)}</p>
                </div>

                <div className="border border-slate-200 rounded-[3mm] p-[5mm] mb-[5mm]">
                  <p className="m-0 text-[12pt] leading-[1.6] text-center">
                    Recebi da <strong>IPDA</strong> a quantia de <strong>R$ {valorValido.toFixed(2)}</strong> ({valorExtenso}), referente a <strong>{obs || "Contribuicao"}</strong>.
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
              <div className={isCompactThermal ? "pt-1 pb-16" : ""}>
                <div
                  style={isCompactThermal ? { transform: `scale(${previewScale})`, transformOrigin: "top center" } : undefined}
                >
                  <div
                    id="receipt-preview-section"
                    ref={printSectionRef}
                    data-print-mode="thermal"
                    data-thermal-width={thermalWidth}
                    className={`bg-white border border-slate-300 shadow-xl mx-auto w-full ${thermalWidth === "56" ? "max-w-[56mm]" : "max-w-[80mm]"}`}
                  >
                    <div className="p-[4mm]">
                  <div className="text-center">
                    <img
                      ref={logoRef}
                      src="/logo-recibo.png"
                      alt="Logo Igreja"
                      className="block h-auto w-[calc(100%+8mm)] max-w-none -mx-[4mm] mb-[2mm]"
                    />
                    <p className={`m-0 font-extrabold uppercase leading-[1.25] ${thermalWidth === "56" ? "text-[13px]" : "text-[14px]"}`}>Igreja Pentecostal Deus e Amor</p>
                    <p className={`m-0 mt-[1mm] font-bold leading-[1.2] ${thermalWidth === "56" ? "text-[11px]" : "text-[12px]"}`}>CNPJ: 43.208.040/0001-36</p>
                    <p className={`m-0 mt-[2mm] font-extrabold uppercase leading-[1.25] ${thermalWidth === "56" ? "text-[12px]" : "text-[13px]"}`}>Apoio Evangelistico / Pregacao</p>
                    <p className={`m-0 mt-[1mm] leading-[1.2] ${thermalWidth === "56" ? "text-[10px]" : "text-[11px]"}`}>Comprovante oficial de recebimento</p>
                  </div>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <div className="text-center">
                    <p className={`m-0 uppercase font-bold ${thermalWidth === "56" ? "text-[12px]" : "text-[13px]"}`}>Valor Recebido</p>
                    <p className={`m-0 mt-[1.2mm] font-black leading-[1.1] ${thermalWidth === "56" ? "text-[28px]" : "text-[32px]"}`}>R$ {valorValido.toFixed(2)}</p>
                  </div>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <p className={`m-0 leading-[1.5] text-center ${thermalWidth === "56" ? "text-[11px]" : "text-[12px]"}`}>
                    Recebi da <strong>IPDA</strong> a quantia de <strong>R$ {valorValido.toFixed(2)}</strong> ({valorExtenso}), referente a <strong>{obs || "Contribuicao"}</strong>.
                  </p>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <p className={`m-0 font-extrabold uppercase text-center ${thermalWidth === "56" ? "text-[11px]" : "text-[12px]"}`}>Dados do Recibo</p>
                  <div className={`mt-[2mm] leading-[1.5] ${thermalWidth === "56" ? "text-[10.5px]" : "text-[11.5px]"}`}>
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
                      className={`object-contain mx-auto mb-[2mm] ${thermalWidth === "56" ? "w-[34mm] h-[34mm]" : "w-[44mm] h-[44mm]"}`}
                      alt="QR Code da carta"
                    />
                    <p className={`m-0 font-bold uppercase leading-[1.3] ${thermalWidth === "56" ? "text-[10px]" : "text-[11px]"}`}>Escaneie para abrir a carta</p>
                    <p className={`m-0 mt-[1.5mm] leading-[1.35] break-all ${thermalWidth === "56" ? "text-[9px]" : "text-[10px]"}`}>{cartaId}</p>
                  </div>

                  <div className="border-t border-dashed border-black my-[3mm]" />

                  <div className="text-center">
                    <div className={`border-t border-black mx-auto mt-[7mm] mb-[2mm] ${thermalWidth === "56" ? "w-[42mm]" : "w-[64mm]"}`} />
                    <p className={`m-0 font-extrabold uppercase leading-[1.3] ${thermalWidth === "56" ? "text-[11px]" : "text-[12px]"}`}>{data.letter.preacher_name}</p>
                    {docNumber && <p className={`m-0 mt-[1mm] leading-[1.2] ${thermalWidth === "56" ? "text-[9.5px]" : "text-[10.5px]"}`}>{docType}: {docNumber}</p>}
                    <p className={`m-0 mt-[1mm] uppercase leading-[1.2] ${thermalWidth === "56" ? "text-[9px]" : "text-[10px]"}`}>Assinatura do Recebedor</p>
                  </div>

                </div>
                  </div>
                </div>
              </div>
            )}

            <div className={`sticky bottom-0 z-20 mt-6 w-full ${isCompactThermal ? "max-w-[56mm]" : isThermal ? "max-w-[80mm]" : "max-w-[182mm]"} mx-auto px-4 sm:px-0 bg-slate-100/95 backdrop-blur-sm pb-2`}>
              <div className={`flex items-center w-full ${isCompactThermal ? "justify-center gap-2" : "gap-3"}`}>
                <Button
                  onClick={handlePrimaryPrint}
                  className={isCompactThermal ? "h-10 w-10 p-0 rounded-full shadow-sm bg-blue-600 hover:bg-blue-700" : "flex-1 font-bold h-12 shadow-sm bg-blue-600 hover:bg-blue-700"}
                  title={isCompactThermal ? `Imprimir Termica ${thermalWidth}mm` : undefined}
                  disabled={isBluetoothPrinting}
                >
                  <Printer className={isCompactThermal ? "h-5 w-5" : "mr-2 h-5 w-5"} />
                  {!isCompactThermal ? `${isBluetoothPrinting ? "Enviando..." : `Imprimir ${isThermal ? `Termica ${thermalWidth}mm` : "A4"}`}` : null}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBluetoothPairing}
                  className={isCompactThermal ? "h-10 w-10 p-0 rounded-full border-slate-300 text-slate-700 hover:bg-slate-100" : "flex-1 font-bold h-12 shadow-sm border-slate-300 text-slate-700 hover:bg-slate-100"}
                  title={isCompactThermal ? "Parear Bluetooth" : undefined}
                >
                  <Bluetooth className={isCompactThermal ? "h-5 w-5 text-blue-500" : "mr-2 h-5 w-5 text-blue-500"} />
                  {!isCompactThermal ? "Bluetooth" : null}
                </Button>
              </div>
              {bluetoothDeviceName ? (
                <p className="text-xs text-center text-emerald-700 mt-2">
                  Impressora pareada: {bluetoothDeviceName}
                </p>
              ) : null}
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
