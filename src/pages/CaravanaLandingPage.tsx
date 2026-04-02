import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bus, QrCode, ExternalLink, Copy, Check } from "lucide-react";
import QRCode from "qrcode";

export default function CaravanaLandingPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const registroUrl = `${window.location.origin}/caravanas/registrar`;

  useEffect(() => {
    // Gera QR code
    QRCode.toDataURL(registroUrl, {
      errorCorrectionLevel: "H",
      type: "image/png",
      quality: 0.95,
      margin: 1,
      width: 300,
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("Erro ao gerar QR code:", err));
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(registroUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2">
            <Bus className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Caravanas</h1>
          </div>
          <p className="text-slate-600 mt-1">Registre sua caravana e viaje com segurança</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: Info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Como Registrar sua Caravana</CardTitle>
                <CardDescription>Passo a passo para começar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                      1
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Acesse o Formulário</h3>
                      <p className="text-sm text-slate-600">Clique no botão abaixo ou escaneie o QR code</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                      2
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Preencha os Dados</h3>
                      <p className="text-sm text-slate-600">Igreja, placa do veículo, líder e passageiros</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                      3
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Registre</h3>
                      <p className="text-sm text-slate-600">Confirmação será enviada para o WhatsApp do líder</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg text-green-900">Informações Necessárias</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-green-800 space-y-2">
                <p>✓ Igreja de origem</p>
                <p>✓ Nome do pastor responsável</p>
                <p>✓ Placa do veículo</p>
                <p>✓ Quantidade de passageiros</p>
                <p>✓ Nome do líder da caravana</p>
                <p>✓ WhatsApp do líder</p>
              </CardContent>
            </Card>
          </div>

          {/* Right: QR Code & Link */}
          <div className="space-y-6">
            {/* QR Code */}
            <Card className="flex flex-col items-center">
              <CardHeader className="w-full">
                <CardTitle className="text-lg flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Escaneie aqui
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code" className="border-4 border-blue-600 p-4 bg-white" />
                ) : (
                  <div className="w-64 h-64 bg-slate-200 animate-pulse rounded" />
                )}
                <p className="text-sm text-slate-600 text-center">
                  Abra a câmera do seu celular e aponte para este código
                </p>
              </CardContent>
            </Card>

            {/* Link */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ou acesse pelo link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-slate-100 p-3 rounded-lg break-all text-sm font-mono text-blue-600">
                  {registroUrl}
                </div>
                <div className="space-y-2">
                  <Button
                    onClick={() => window.location.href = registroUrl}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-11"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Registrar Caravana Agora
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                    className="w-full h-11"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-green-600" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar Link
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer Info */}
        <Card className="mt-8 bg-indigo-50 border-indigo-200">
          <CardContent className="pt-6">
            <p className="text-sm text-indigo-900 text-center">
              💡 <strong>Dica:</strong> Compartilhe este link com seus voluntários para que possam registrar suas caravanas com facilidade quando chegarem ao local do evento.
            </p>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-white mt-12">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center text-sm">
          <p>© 2026 SGE IPDA - Sistema de Gestão Eclesiástica</p>
        </div>
      </footer>
    </div>
  );
}
