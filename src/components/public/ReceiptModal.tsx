import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Bluetooth, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any; // Using the letter data
}

export function ReceiptModal({ open, onOpenChange, data }: ReceiptModalProps) {
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [docType, setDocType] = useState("CPF");
  const [docNumber, setDocNumber] = useState("");

  if (!data?.letter) return null;

  const handlePrintA4 = () => {
    // A4 printing logic triggered here
    window.print();
  };

  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-slate-50 border-slate-200">
        <DialogHeader className="px-6 py-4 bg-white border-b border-slate-200">
          <DialogTitle className="text-xl font-bold flex items-center justify-between gap-2 text-slate-800 flex-wrap">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" /> Emissão de Recibo
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row md:h-[70vh] max-h-[80vh] md:max-h-[800px] overflow-y-auto md:overflow-hidden">
          {/* Lado Esquerdo: Formulário */}
          <div className="w-full md:w-1/3 flex flex-col border-r border-slate-200 bg-white">
            <div className="p-6 flex flex-col gap-6 overflow-y-visible md:overflow-y-auto flex-shrink-0">
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
              <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Observação / Referente a</label>
              <Input
                placeholder="Ex: Oferta de Missões"
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
                  className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="CPF">CPF</option>
                  <option value="RG">RG</option>
                </select>
              </div>
              <div className="w-2/3">
                <label className="text-sm font-semibold text-slate-700 mb-1.5 block">Número</label>
                <Input
                  placeholder={docType === "CPF" ? "000.000.000-00" : "00.000.000-X"}
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                />
              </div>
            </div>

          </div>
          </div>

          {/* Lado Direito: Preview do Recibo A4 */}
          <div className="w-full md:w-2/3 p-4 md:p-6 bg-slate-100 flex flex-col items-center justify-start overflow-auto">
            
            {/* ESTE É O BLOCO QUE SERÁ IMPRESSO (Visualização realista) */}
            <div id="print-receipt-section" className="bg-white w-full max-w-[80mm] shadow-xl p-5 border border-slate-200 mx-auto relative">
              
              <div className="flex flex-col items-center justify-between border-b-2 border-black pb-3 mb-4 gap-2">
                <div className="text-center">
                  <h1 className="text-base font-black uppercase text-black font-serif leading-tight">Igreja Pentecostal Deus é Amor</h1>
                  <p className="text-[10px] font-medium text-slate-700 mt-1 uppercase tracking-wide">Recibo de Contribuição / Pregação</p>
                </div>
                <div className="text-center">
                  <span className="block text-xl font-black text-black">
                    R$ {valor ? parseFloat(valor.replace(",", ".")).toFixed(2) : "0,00"}
                  </span>
                  <span className="block text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Valor</span>
                </div>
              </div>

              <div className="space-y-3 text-black text-xs leading-relaxed text-center">
                <p>
                  Recebemos de <span className="font-bold uppercase inline-block border-b border-black/20 min-w-full sm:min-w-[300px] text-center px-2">{data.letter.church_destination || "Igreja de Destino"}</span>
                </p>
                <p>
                  a quantia de <span className="font-bold inline-block border-b border-black/20 min-w-[150px] text-center px-2">R$ {valor || "__________"}</span>
                  {obs && <span> referente a <span className="font-bold border-b border-black/20 px-2">{obs}</span></span>}.
                </p>
                <p>
                  Para maior clareza formamos o presente.
                </p>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-dashed border-slate-300 text-[10px] text-left">
                  <div>
                    <span className="font-bold block mb-1">Dados da Carta:</span>
                    Código: <span className="font-mono text-slate-700">{data.letter.id}</span><br/>
                    Igreja de Origem: {data.letter.church_origin}<br/>
                    Função: {data.letter.minister_role}
                  </div>
                  <div className="text-right">
                    <span className="font-bold block mb-1">Local e Data:</span>
                    <span className="capitalize">{dataAtual}</span>
                  </div>
                </div>

                {/* LINHA DE ASSINATURA */}
                <div className="mt-6 pt-4 flex flex-col items-center justify-center">
                  <div className="w-full max-w-[68mm] border-t-2 border-black text-center pt-2">
                    <p className="font-bold uppercase text-sm">{data.letter.preacher_name}</p>
                    {docNumber && (
                      <p className="text-[10px] font-medium text-slate-800 uppercase mt-0.5">
                        {docType}: {docNumber}
                      </p>
                    )}
                    <p className="text-[9px] font-medium text-slate-500 uppercase tracking-widest mt-1">
                      Assinatura do Recebedor
                    </p>
                  </div>
                </div>

              </div>

            </div>

            {/* BOTÕES DE IMPRESSÃO ABAIXO DO RECIBO */}
            <div className="mt-6 w-full max-w-[80mm] mx-auto px-4 sm:px-0">
              <div className="flex items-center gap-3 w-full">
                <Button onClick={handlePrintA4} className="flex-1 font-bold h-12 shadow-sm bg-blue-600 hover:bg-blue-700">
                  <Printer className="mr-2 h-5 w-5" /> Imprimir A4
                </Button>
                <Button variant="outline" className="flex-1 font-bold h-12 shadow-sm border-slate-300 text-slate-700 hover:bg-slate-100">
                  <Bluetooth className="mr-2 h-5 w-5 text-blue-500" /> Bluetooth
                </Button>
              </div>
              <p className="text-xs text-center text-slate-500 mt-2">
                * Para conectar via bluetooth, a impressora deve estar ligada e pareada.
              </p>
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
