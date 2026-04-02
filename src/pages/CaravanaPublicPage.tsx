import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bus, User, Phone, MapPin, Building2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerCaravana, searchChurchesPublic } from "@/services/saasService";
import { toast as useToast } from "sonner";

// Máscaras
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function maskPlate(value: string): string {
  const upper = value.toUpperCase();
  // Tenta Mercosul: AAA0A00
  if (/^[A-Z]{3}\d[A-Z]/.test(upper.slice(0, 5))) {
    return upper.slice(0, 8);
  }
  // Antigo: AAA-0000
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
  // Antigo: AAA0000 ou AAA00000 (3 letras + 3 ou 4 números)
  // Mercosul: AAA0A00 (3 letras + 1 número + 1 letra + 2 números)
  return /^[A-Z]{3}\d{3,4}$/.test(clean) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(clean);
}

export default function CaravanaPublicPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Form state
  const [selectedChurch, setSelectedChurch] = useState<any>(null);
  const [manualChurch, setManualChurch] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [pastorName, setPastorName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [passengerCount, setPassengerCount] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [leaderPhone, setLeaderPhone] = useState("");

  const isManual = selectedChurch?.church_code === "OUTROS";
  const CHURCH_NAME_PATTERN = /^\d{3,6}\s-\s[A-Z0-9À-Ü\s]+$/;

  const handleSearchChurches = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await searchChurchesPublic(query, 10);
      setSearchResults(results);
    } catch (err) {
      console.error("Erro ao buscar igrejas:", err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const validateForm = (): boolean => {
    if (!selectedChurch) {
      toast.error("Selecione uma igreja");
      return false;
    }
    if (isManual && !manualChurch.trim()) {
      toast.error("Informe o nome da igreja");
      return false;
    }
    if (isManual && !CHURCH_NAME_PATTERN.test(manualChurch)) {
      toast.error("Formato inválido. Use: 9530 - CAMPO GRANDE");
      return false;
    }
    if (isManual && !manualCity.trim()) {
      toast.error("Informe a cidade/estado");
      return false;
    }
    if (!pastorName.trim()) {
      toast.error("Informe o nome do pastor");
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

    setIsLoading(true);
    try {
      const churchName = isManual ? manualChurch : selectedChurch?.church_name || "";
      const churchCode = isManual ? null : selectedChurch?.totvs_id || null;
      const cityState = isManual ? manualCity : null;

      const result = await registerCaravana({
        church_code: churchCode,
        church_name: churchName,
        city_state: cityState,
        pastor_name: pastorName,
        vehicle_plate: vehiclePlate,
        leader_name: leaderName,
        leader_whatsapp: leaderPhone,
        passenger_count: parseInt(passengerCount, 10),
      });

      if (result?.ok) {
        setSuccess(true);
        // Reset form
        setSelectedChurch(null);
        setManualChurch("");
        setManualCity("");
        setPastorName("");
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
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-green-200 bg-white">
          <CardContent className="pt-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Caravana Registrada!</h2>
            <p className="text-slate-600 mb-6">
              Os dados foram salvos com sucesso. Tenha uma boa viagem!
            </p>
            <Button onClick={() => window.location.href = "/"} className="w-full">
              Voltar ao Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bus className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900">Caravanas</h1>
          </div>
          <Button variant="ghost" onClick={() => navigate("/")} size="sm">
            Voltar
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Registrar Caravana</CardTitle>
            <CardDescription>
              Preencha os dados para registrar sua caravana
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dados da Igreja */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-semibold">
                  <Building2 className="h-5 w-5" />
                  <span>Dados da Igreja</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="church">Igreja *</Label>
                  <div className="relative">
                    <Input
                      id="church"
                      placeholder="Digite para buscar ou selecione 'Outros'"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        handleSearchChurches(e.target.value);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      className="mb-2"
                    />
                    {searchOpen && searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border rounded-md shadow-lg z-10 max-h-40 overflow-y-auto">
                        {searchResults.map((church) => (
                          <button
                            key={church.totvs_id}
                            type="button"
                            onClick={() => {
                              setSelectedChurch(church);
                              setPastorName(church.church_name);
                              setSearchQuery("");
                              setSearchOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b last:border-b-0"
                          >
                            {church.church_name}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedChurch({ church_code: "OUTROS" });
                        setSearchQuery("");
                        setSearchOpen(false);
                      }}
                      className="w-full"
                    >
                      Não encontrou? Selecione "Outros"
                    </Button>
                  </div>
                  {selectedChurch && (
                    <p className="text-sm text-slate-600">
                      ✓ {isManual ? "Outros" : selectedChurch.church_name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pastor">Nome do Pastor *</Label>
                  <Input
                    id="pastor"
                    value={pastorName}
                    onChange={(e) => setPastorName(e.target.value)}
                    placeholder="Nome do pastor"
                    readOnly={!isManual}
                  />
                </div>

                {isManual && (
                  <div className="space-y-4 bg-blue-50 p-4 rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="manualChurch">Nome da Igreja *</Label>
                      <Input
                        id="manualChurch"
                        value={manualChurch}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          const parts = val.split(" - ");
                          let formatted = val;
                          if (parts.length >= 2) {
                            const code = parts[0].replace(/\D/g, "");
                            const name = parts.slice(1).join(" - ");
                            formatted = `${code} - ${name}`;
                          }
                          setManualChurch(formatted);
                        }}
                        placeholder="Ex: 9530 - CAMPO GRANDE"
                      />
                      {manualChurch && !CHURCH_NAME_PATTERN.test(manualChurch) && (
                        <p className="text-sm text-red-600">Formato inválido</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manualCity">Cidade / Estado *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Input
                          id="manualCity"
                          value={manualCity}
                          onChange={(e) => setManualCity(e.target.value)}
                          placeholder="Ex: São Paulo - SP"
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Dados do Transporte */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-semibold">
                  <Bus className="h-5 w-5" />
                  <span>Dados do Transporte</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plate">Placa do Veículo *</Label>
                  <Input
                    id="plate"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(maskPlate(e.target.value))}
                    placeholder="ABC-1234 ou ABC1D23"
                    maxLength={8}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="passengers">Quantidade de Passageiros *</Label>
                  <Input
                    id="passengers"
                    type="number"
                    min={1}
                    value={passengerCount}
                    onChange={(e) => setPassengerCount(e.target.value)}
                    placeholder="Ex: 45"
                  />
                </div>
              </section>

              {/* Líder da Caravana */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-blue-600 font-semibold">
                  <User className="h-5 w-5" />
                  <span>Líder da Caravana</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leaderName">Nome do Líder *</Label>
                  <Input
                    id="leaderName"
                    value={leaderName}
                    onChange={(e) => setLeaderName(e.target.value)}
                    placeholder="Nome do responsável"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leaderPhone">WhatsApp do Líder *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="leaderPhone"
                      value={leaderPhone}
                      onChange={(e) => setLeaderPhone(maskPhone(e.target.value))}
                      placeholder="(00) 99999-9999"
                      className="pl-10"
                      maxLength={15}
                    />
                  </div>
                </div>
              </section>

              <Button
                type="submit"
                className="w-full h-12 text-base"
                disabled={isLoading}
              >
                {isLoading ? (
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
      </main>
    </div>
  );
}
