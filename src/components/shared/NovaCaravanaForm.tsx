import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerCaravana, searchChurchesPublic, getChurchDetails } from "@/services/saasService";

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
  // Antigo: AAA0000 ou AAA00000 (3 letras + 3 ou 4 números)
  // Mercosul: AAA0A00 (3 letras + 1 número + 1 letra + 2 números)
  return /^[A-Z]{3}\d{3,4}$/.test(clean) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(clean);
}

export function NovaCaravanaForm({ onSuccess }: { onSuccess?: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

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

  // Busca dados completos da church quando selecionada
  useEffect(() => {
    if (!selectedChurch || isManual) {
      setPastorName("");
      setPastorEmail("");
      setPastorPhone("");
      return;
    }

    const loadChurchDetails = async () => {
      const details = await getChurchDetails(selectedChurch.totvs_id);
      if (details) {
        setPastorName(details.nome_pastor || "");
        setPastorEmail(details.email_pastor || "");
        setPastorPhone(details.phone_pastor || "");
      }
    };

    loadChurchDetails();
  }, [selectedChurch, isManual]);

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
        toast.success("Caravana registrada com sucesso!");
        // Reset form
        setSelectedChurch(null);
        setManualChurch("");
        setManualCity("");
        setPastorName("");
        setVehiclePlate("");
        setPassengerCount("");
        setLeaderName("");
        setLeaderPhone("");
        onSuccess?.();
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Igreja */}
      <div className="space-y-2">
        <Label htmlFor="church" className="text-xs font-semibold">Igreja *</Label>
        <div>
          <Input
            id="church"
            placeholder="Digite para buscar..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleSearchChurches(e.target.value);
            }}
            onFocus={() => setSearchOpen(true)}
            className="mb-2 text-sm"
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute z-10 w-64 bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
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
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-b-0"
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
            className="w-full text-sm h-9"
          >
            Selecionar OUTROS
          </Button>
        </div>
        {selectedChurch && (
          <p className="text-xs text-slate-600">
            ✓ {isManual ? "Outros" : selectedChurch.church_name}
          </p>
        )}
      </div>

      {/* Pastor */}
      <div className="space-y-2">
        <Label htmlFor="pastor" className="text-xs font-semibold">
          Pastor * {selectedChurch && !isManual && <span className="text-green-600 text-xs">✓ Preenchido</span>}
        </Label>
        <Input
          id="pastor"
          value={pastorName}
          onChange={(e) => isManual && setPastorName(e.target.value)}
          placeholder="Nome do pastor"
          readOnly={!isManual && !!selectedChurch}
          className="text-sm h-9"
        />
      </div>

      {/* Email Pastor */}
      <div className="space-y-2">
        <Label htmlFor="pastorEmail" className="text-xs font-semibold">
          Email {selectedChurch && !isManual && pastorEmail && <span className="text-green-600 text-xs">✓</span>}
        </Label>
        <Input
          id="pastorEmail"
          type="email"
          value={pastorEmail}
          onChange={(e) => isManual && setPastorEmail(e.target.value)}
          placeholder="email@exemplo.com"
          readOnly={!isManual && !!selectedChurch}
          className="text-sm h-9"
        />
      </div>

      {/* Telefone Pastor */}
      <div className="space-y-2">
        <Label htmlFor="pastorPhone" className="text-xs font-semibold">
          Telefone {selectedChurch && !isManual && pastorPhone && <span className="text-green-600 text-xs">✓</span>}
        </Label>
        <Input
          id="pastorPhone"
          value={pastorPhone}
          onChange={(e) => isManual && setPastorPhone(maskPhone(e.target.value))}
          placeholder="(XX) XXXXX-XXXX"
          maxLength={15}
          readOnly={!isManual && !!selectedChurch}
          className="text-sm h-9"
        />
      </div>

      {/* Campos Outros */}
      {isManual && (
        <div className="space-y-3 bg-blue-50 p-3 rounded-lg">
          <div className="space-y-2">
            <Label htmlFor="manualChurch" className="text-xs font-semibold">Nome da Igreja *</Label>
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
              className="text-sm h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualCity" className="text-xs font-semibold">Cidade / Estado *</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="manualCity"
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                placeholder="Ex: São Paulo - SP"
                className="pl-9 text-sm h-9"
              />
            </div>
          </div>
        </div>
      )}

      {/* Placa */}
      <div className="space-y-2">
        <Label htmlFor="plate" className="text-xs font-semibold">Placa *</Label>
        <Input
          id="plate"
          value={vehiclePlate}
          onChange={(e) => setVehiclePlate(maskPlate(e.target.value))}
          placeholder="ABC-1234"
          maxLength={8}
          className="text-sm h-9"
        />
      </div>

      {/* Passageiros */}
      <div className="space-y-2">
        <Label htmlFor="passengers" className="text-xs font-semibold">Passageiros *</Label>
        <Input
          id="passengers"
          type="number"
          min={1}
          value={passengerCount}
          onChange={(e) => setPassengerCount(e.target.value)}
          placeholder="45"
          className="text-sm h-9"
        />
      </div>

      {/* Líder */}
      <div className="space-y-2">
        <Label htmlFor="leaderName" className="text-xs font-semibold">Líder *</Label>
        <Input
          id="leaderName"
          value={leaderName}
          onChange={(e) => setLeaderName(e.target.value)}
          placeholder="Nome"
          className="text-sm h-9"
        />
      </div>

      {/* WhatsApp */}
      <div className="space-y-2">
        <Label htmlFor="leaderPhone" className="text-xs font-semibold">WhatsApp *</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            id="leaderPhone"
            value={leaderPhone}
            onChange={(e) => setLeaderPhone(maskPhone(e.target.value))}
            placeholder="(11) 99999-9999"
            className="pl-9 text-sm h-9"
            maxLength={15}
          />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-9 text-sm"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Registrando...
          </>
        ) : (
          "Registrar"
        )}
      </Button>
    </form>
  );
}
