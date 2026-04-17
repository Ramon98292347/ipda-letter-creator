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
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <FileText className="h-5 w-5 text-blue-600" /> Emissão de Recibo
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[70vh] max-h-[800px]">
          {/* Lado Esquerdo: Formulário */}
          <div className="w-full md:w-1/3 p-6 border-r border-slate-200 bg-white flex flex-col gap-6 overflow-y-auto">
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

            <div className="mt-auto space-y-3">
              <Button onClick={handlePrintA4} className="w-full font-bold h-12 text-sm shadow-md bg-blue-600 hover:bg-blue-700">
                <Printer className="mr-2 h-5 w-5" /> Imprimir Recibo A4
              </Button>
              <Button variant="outline" className="w-full font-bold h-12 text-sm border-2 border-slate-300 text-slate-700 hover:bg-slate-100">
                <Bluetooth className="mr-2 h-5 w-5 text-blue-500" /> Bluetooth Térmica
              </Button>
              <p className="text-xs text-center text-slate-500 mt-2">
                * Para conectar via bluetooth, a impressora deve estar ligada e pareada.
              </p>
            </div>
          </div>

          {/* Lado Direito: Preview do Recibo A4 */}
          <div className="w-full md:w-2/3 p-4 md:p-6 bg-slate-100 flex items-start justify-center overflow-auto">
            
            {/* ESTE É O BLOCO QUE SERÁ IMPRESSO (Visualização realista) */}
            <div id="print-receipt-section" className="bg-white w-full sm:w-[210mm] min-h-[auto] sm:min-h-[148mm] shadow-xl p-5 sm:p-10 border border-slate-200 mx-auto relative transform origin-top sm:scale-[0.70] md:scale-[0.8] lg:scale-90 transition-transform">
              
              <div className="flex flex-col sm:flex-row items-center justify-between border-b-2 border-black pb-4 mb-6 gap-3 sm:gap-0">
                <div className="text-center sm:text-left">
                  <h1 className="text-xl sm:text-2xl font-black uppercase text-black font-serif">Igreja Pentecostal Deus é Amor</h1>
                  <p className="text-sm font-medium text-slate-700 mt-1 uppercase tracking-wider">Recibo de Contribuição / Pregação</p>
                </div>
                <div className="text-center sm:text-right">
                  <span className="block text-2xl sm:text-3xl font-black text-black">
                    R$ {valor ? parseFloat(valor.replace(",", ".")).toFixed(2) : "0,00"}
                  </span>
                  <span className="block text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">Valor</span>
                </div>
              </div>

              <div className="space-y-6 text-black text-sm sm:text-base leading-relaxed">
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

                <div className="grid grid-cols-2 gap-4 mt-8 pt-4 border-t border-dashed border-slate-300 text-sm">
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
                <div className="mt-20 pt-8 flex flex-col items-center justify-center">
                  <div className="w-80 border-t-2 border-black text-center pt-2">
                    <p className="font-bold uppercase text-lg">{data.letter.preacher_name}</p>
                    <p className="text-sm font-medium text-slate-600 uppercase tracking-widest">Assinatura do Recebedor</p>
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
