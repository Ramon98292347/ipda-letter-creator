import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Phone, MapPin, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerCaravana } from "@/services/saasService";
import { supabase } from "@/lib/supabase";

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function maskPlate(value: string): string {
  const upper = value.toUpperCase();
  if (/^[A-Z]{3}\d[A-Z]/.test(upper.slice(0, 5))) {
    return upper.slice(0, 8);
  }
  const parts = upper.replace(/\D/g, "");
  if (parts.length > 4) return `${upper.slice(0, 3)}-${parts.slice(0, 4)}`;
  return upper.slice(0, 7);
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

function isValidPlate(value: string): boolean {
  const clean = value.replace(/[-\s]/g, "").toUpperCase();
  return /^[A-Z]{3}\d{4}$/.test(clean) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(clean);
}

export default function CaravanaByChurchPage() {
  const { churchTotvsId } = useParams<{ churchTotvsId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [church, setChurch] = useState<any>(null);
  const [showManual, setShowManual] = useState(false);

  // Form state
  const [churchName, setChurchName] = useState("");
  const [pastorName, setPastorName] = useState("");
  const [cityState, setCityState] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [passengerCount, setPassengerCount] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [leaderPhone, setLeaderPhone] = useState("");

  // Load church data
  useEffect(() => {
    const loadChurch = async () => {
      if (!churchTotvsId) {
        toast.error("Igreja não especificada");
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("churches")
          .select("totvs_id, nome, nome_pastor, cidade_estado")
          .eq("totvs_id", churchTotvsId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          // Igreja encontrada - preenche automaticamente
          setChurch(data);
          setChurchName(data.nome || "");
          setPastorName(data.nome_pastor || "");
          setCityState(data.cidade_estado || "");
          setShowManual(false);
        } else {
          // Igreja não encontrada - modo manual
          setShowManual(true);
          toast.info("Igreja não encontrada. Preencha os dados manualmente.");
        }
      } catch (error) {
        console.error("Erro ao buscar igreja:", error);
        toast.error("Erro ao carregar dados da igreja");
        setShowManual(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadChurch();
  }, [churchTotvsId]);

  const validateForm = (): boolean => {
    if (!churchName.trim()) {
      toast.error("Nome da igreja é obrigatório");
      return false;
    }
    if (!pastorName.trim()) {
      toast.error("Nome do pastor é obrigatório");
      return false;
    }
    if (!isValidPlate(vehiclePlate)) {
      toast.error("Placa do veículo inválida");
      return false;
    }
    const passengers = parseInt(passengerCount, 10);
    if (isNaN(passengers) || passengers <= 0) {
      toast.error("Informe o número de passageiros");
      return false;
    }
    if (!leaderName.trim()) {
      toast.error("Informe o nome do líder");
      return false;
    }
    if (!isValidPhone(leaderPhone)) {
      toast.error("WhatsApp inválido (10 ou 11 dígitos)");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const result = await registerCaravana({
        church_code: church?.totvs_id || churchTotvsId || null,
        church_name: churchName,
        city_state: cityState || null,
        pastor_name: pastorName,
        vehicle_plate: vehiclePlate,
        leader_name: leaderName,
        leader_whatsapp: leaderPhone,
        passenger_count: parseInt(passengerCount, 10),
      });

      if (result?.ok) {
        toast.success("✅ Caravana registrada com sucesso!");
        // Reset form
        setVehiclePlate("");
        setPassengerCount("");
        setLeaderName("");
        setLeaderPhone("");
      } else {
        toast.error("Erro ao registrar caravana");
      }
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao registrar caravana");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-slate-600">Carregando dados da igreja...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Registrar Caravana</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>
              {church ? `${church.nome}` : "Caravana"}
            </CardTitle>
            <CardDescription>
              {church
                ? "Dados da igreja já preenchidos"
                : "Preencha os dados para registrar uma caravana"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Seção Igreja */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
                  <Building2 className="h-4 w-4" />
                  <span>Dados da Igreja</span>
                  {church && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">✓ Pré-preenchido</span>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="church" className="text-sm">Igreja *</Label>
                  <Input
                    id="church"
                    value={churchName}
                    onChange={(e) => setChurchName(e.target.value)}
                    placeholder="Nome da igreja"
                    disabled={!showManual}
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pastor" className="text-sm">Pastor *</Label>
                  <Input
                    id="pastor"
                    value={pastorName}
                    onChange={(e) => setPastorName(e.target.value)}
                    placeholder="Nome do pastor"
                    disabled={!showManual}
                    className="text-sm"
                  />
                </div>

                {(showManual || cityState) && (
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm">Cidade / Estado</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="city"
                        value={cityState}
                        onChange={(e) => setCityState(e.target.value)}
                        placeholder="Ex: São Paulo - SP"
                        className="pl-9 text-sm"
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Seção Transporte */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
                  <span>📦 Dados do Transporte</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plate" className="text-sm">Placa do Veículo *</Label>
                  <Input
                    id="plate"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(maskPlate(e.target.value))}
                    placeholder="ABC-1234 ou ABC1D23"
                    maxLength={8}
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="passengers" className="text-sm">Quantidade de Passageiros *</Label>
                  <Input
                    id="passengers"
                    type="number"
                    min={1}
                    value={passengerCount}
                    onChange={(e) => setPassengerCount(e.target.value)}
                    placeholder="Ex: 45"
                    className="text-sm"
                  />
                </div>
              </section>

              {/* Seção Líder */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
                  <span>👤 Líder da Caravana</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leaderName" className="text-sm">Nome do Líder *</Label>
                  <Input
                    id="leaderName"
                    value={leaderName}
                    onChange={(e) => setLeaderName(e.target.value)}
                    placeholder="Nome do responsável"
                    className="text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leaderPhone" className="text-sm">WhatsApp do Líder *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="leaderPhone"
                      value={leaderPhone}
                      onChange={(e) => setLeaderPhone(maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="pl-9 text-sm"
                      maxLength={15}
                    />
                  </div>
                </div>
              </section>

              <Button
                type="submit"
                className="w-full h-11 text-base bg-blue-600 hover:bg-blue-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  "Registrar Caravana"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {showManual && (
          <Card className="mt-6 bg-amber-50 border-amber-200">
            <CardContent className="pt-6">
              <p className="text-sm text-amber-900">
                ⚠️ <strong>Atenção:</strong> Igreja não encontrada no sistema. Por favor, preencha todos os dados manualmente.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
