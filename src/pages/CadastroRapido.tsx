import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChurchSearch, Church } from "@/components/ChurchSearch";
import { useUser } from "@/context/UserContext";
import { insertUsuario } from "@/services/userService";
import { useQuery } from "@tanstack/react-query";
import { fetchChurches } from "@/services/churchService";
import { toast } from "sonner";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon } from "lucide-react";

export default function CadastroRapido() {
  const nav = useNavigate();
  const { telefone, setUsuario, setTelefone } = useUser();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [ministerial, setMinisterial] = useState<string>("");
  const [dataSeparacao, setDataSeparacao] = useState<string>(""); // ISO 'yyyy-MM-dd'
  const [igreja, setIgreja] = useState<Church | undefined>(undefined);
  const [igrejaOutros, setIgrejaOutros] = useState("");
  const { data: churches = [] } = useQuery({ queryKey: ["churches"], queryFn: fetchChurches, staleTime: 60_000 });
  const logo = "/Polish_20220810_001501268%20(2).png";

  const toBr = (iso: string) => {
    if (!iso) return "";
    try { return format(parse(iso, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR }); } catch { return iso; }
  };

  async function handleSave() {
    if (!nome || !telefone) { toast.error("Preencha nome e telefone"); return; }
    try {
      const novo = await insertUsuario({
        nome,
        telefone,
        totvs: igreja?.codigoTotvs ?? null,
        igreja_nome: (igreja?.nome ?? igrejaOutros) || null,
        email: email || null,
        data_separacao: dataSeparacao || null,
        ministerial: ministerial || null,
      });
      setUsuario({
        id: novo.id,
        nome: novo.nome,
        telefone: novo.telefone,
        totvs: novo.totvs ?? null,
        igreja_nome: novo.igreja_nome ?? null,
        email: novo.email ?? null,
        ministerial: novo.ministerial ?? null,
        data_separacao: novo.data_separacao ?? null,
      });
      setTelefone(novo.telefone);
      nav("/carta");
    } catch {
      toast.error("Falha ao salvar usuário");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <img src={logo} alt="Logo" className="mx-auto h-16 object-contain" />
        <h1 className="text-2xl font-bold text-center">Cadastro rápido do pregador</h1>
        <div className="space-y-2">
          <Label htmlFor="nome">Nome completo</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value.toUpperCase())}
            placeholder="Digite o nome"
            className="uppercase"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" value={telefone || ""} readOnly placeholder="(99) 99999-9999" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
        </div>
        <div className="space-y-2">
          <Label>Data da separação</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              value={toBr(dataSeparacao)}
              onChange={(e) => {
                try { const d = parse(e.target.value, "dd/MM/yyyy", new Date()); setDataSeparacao(format(d, "yyyy-MM-dd")); } catch {}
              }}
              className="flex-1"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="whitespace-nowrap">
                  <CalendarIcon className="h-4 w-4 mr-2" /> Calendário
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataSeparacao ? parse(dataSeparacao, "yyyy-MM-dd", new Date()) : undefined}
                  onSelect={(d) => { if (d) setDataSeparacao(format(d, "yyyy-MM-dd")); }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Dados ministeriais</Label>
          <Select value={ministerial} onValueChange={setMinisterial}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pastor">Pastor</SelectItem>
              <SelectItem value="Presbítero">Presbítero</SelectItem>
              <SelectItem value="Diácono">Diácono</SelectItem>
              <SelectItem value="Membro">Membro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ChurchSearch label="Igreja (congregação)" placeholder="Buscar por nome ou código TOTVS" churches={churches} onSelect={setIgreja} value={igreja ? `${igreja.codigoTotvs} - ${igreja.nome}` : igrejaOutros} inputId="igreja-cadastro" />
        <div className="space-y-2">
          <Label htmlFor="igrejaOutros">Outros (se não encontrar)</Label>
          <Input id="igrejaOutros" value={igrejaOutros} onChange={(e) => setIgrejaOutros(e.target.value)} placeholder="Descreva a igreja" />
        </div>
        <Button onClick={handleSave} className="w-full">Salvar e continuar</Button>
      </div>
    </div>
  );
}