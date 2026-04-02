import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bus, QrCode, ExternalLink, Copy, Check, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { post } from "@/lib/api";
import { CaravanaPublicPage } from "./CaravanaPublicPage";

type EventRow = {
  id: string;
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export default function CaravanaEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const eventLink = `${window.location.origin}/caravanas/evento/${eventId}`;

  useEffect(() => {
    const loadEvent = async () => {
      if (!eventId) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await post("announcements-api", {
          action: "list-events",
        });

        const events = (res?.events || []) as EventRow[];
        const found = events.find((e) => e.id === eventId);
        setEvent(found || null);

        // Gera QR code
        if (found) {
          QRCode.toDataURL(eventLink, {
            errorCorrectionLevel: "H",
            type: "image/png",
            quality: 0.95,
            margin: 1,
            width: 300,
          })
            .then((url) => setQrCodeUrl(url))
            .catch((err) => console.error("Erro ao gerar QR code:", err));
        }
      } catch (error) {
        console.error("Erro ao buscar evento:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEvent();
  }, [eventId, eventLink]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(eventLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600">Carregando evento...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Bus className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">Evento não encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Bus className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Registrar Caravana</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Divulgação Card */}
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <QrCode className="h-5 w-5" />
              {event.title}
            </CardTitle>
            <CardDescription className="text-blue-700">
              Compartilhe este QR code e link com os voluntários para que registrem suas caravanas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* QR Code */}
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-4 rounded-lg border border-blue-200 shadow-md">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="QR Code" className="w-56 h-56" />
                  ) : (
                    <div className="w-56 h-56 bg-slate-200 animate-pulse rounded" />
                  )}
                </div>
                <p className="text-sm text-slate-600 text-center">
                  Escaneie com o celular para acessar o formulário de registro
                </p>
              </div>

              {/* Link */}
              <div className="space-y-4 flex flex-col justify-center">
                <div>
                  <label className="text-sm font-semibold text-blue-900 mb-2 block">
                    Link de Registro
                  </label>
                  <div className="bg-white border border-blue-200 p-3 rounded-lg break-all text-sm font-mono text-blue-600 select-all">
                    {eventLink}
                  </div>
                </div>

                {event.starts_at && (
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">Data do Evento:</span>
                    <div className="text-slate-600">
                      {new Date(event.starts_at).toLocaleDateString("pt-BR", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                      {event.ends_at && event.ends_at !== event.starts_at && (
                        <>
                          {" "}
                          a{" "}
                          {new Date(event.ends_at).toLocaleDateString("pt-BR", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => window.location.href = eventLink}
                  className="w-full bg-blue-600 hover:bg-blue-700 h-10"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Acessar Formulário
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCopyLink}
                  className="w-full h-10 border-blue-200 hover:bg-blue-50"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-green-600" />
                      Link Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar Link
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Formulário de Registro (apenas para display) */}
        <Card>
          <CardHeader>
            <CardTitle>Formulário de Registro de Caravana</CardTitle>
            <CardDescription>
              Preencha os dados abaixo para registrar sua caravana neste evento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">
              Formulário de registro será exibido aqui. Use o link ou QR code acima para acessar no dispositivo do voluntário.
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
