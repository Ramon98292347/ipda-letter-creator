import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChurchSearch, Church } from "@/components/ChurchSearch";
import { useUser } from "@/context/UserContext";
import { insertUsuario } from "@/services/userService";
import { useQuery } from "@tanstack/react-query";
import { fetchChurches } from "@/services/churchService";
import { fetchCentralChurches } from "@/services/centralChurchService";
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
  const [dataSeparacaoStr, setDataSeparacaoStr] = useState<string>(""); // ISO 'yyyy-MM-dd'
  const [igreja, setIgreja] = useState<Church | undefined>(undefined);
  const [igrejaOutros, setIgrejaOutros] = useState("");
  const [igrejaCentral, setIgrejaCentral] = useState<Church | undefined>(undefined);
  const [igrejaCentralOutros, setIgrejaCentralOutros] = useState("");
  const [centralOutrosNotice, setCentralOutrosNotice] = useState(false);
  const centralOutrosTimer = useRef<number | undefined>(undefined);
  const [igrejaOutrosError, setIgrejaOutrosError] = useState("");
  const [igrejaCentralOutrosError, setIgrejaCentralOutrosError] = useState("");
  const [isSepCalOpen, setIsSepCalOpen] = useState(false);
  const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const [sepViewMonth, setSepViewMonth] = useState<Date>(new Date());
  const { data: churches = [] } = useQuery({ queryKey: ["churches"], queryFn: fetchChurches, staleTime: 60_000 });
  const { data: centralChurches = [] } = useQuery({ queryKey: ["central-churches"], queryFn: fetchCentralChurches, staleTime: 60_000 });

  const logo = "/Polish_20220810_001501268%20(2).png";

  const toBr = (iso: string) => {
    if (!iso) return "";
    try { return format(parse(iso, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR }); } catch { return iso; }
  };

  async function handleSave() {
    if (!nome || !telefone) { toast.error("Preencha nome e telefone"); return; }
    try {
      let totvsValue: string | null = igreja?.codigoTotvs ?? null;
      let igrejaNomeValue: string | null = igreja?.nome ?? null;
      if (!igreja && igrejaOutros.trim()) {
        const m = igrejaOutros.match(/^(\d+)\s*-\s+(.+)$/);
        if (!m) { setIgrejaOutrosError("Use o formato 'CODIGO - NOME' (ex.: 12345 - IGREJA EXEMPLO)"); toast.error("Formato inválido em 'Outros (se não encontrar)'"); return; }
        totvsValue = m[1];
        igrejaNomeValue = m[2].trim();
      }
      let centralTotvsValue: string | null = igrejaCentral?.codigoTotvs ?? null;
      let centralNomeValue: string | null = igrejaCentral?.nome ?? null;
      if (!igrejaCentral && igrejaCentralOutros.trim()) {
        const m2 = igrejaCentralOutros.match(/^(\d+)\s*-\s+(.+)$/);
        if (!m2) { setIgrejaCentralOutrosError("Use o formato 'CODIGO - NOME' (ex.: 12345 - IGREJA EXEMPLO)"); toast.error("Formato inválido em 'Outros – Igreja Central'"); return; }
        centralTotvsValue = m2[1];
        centralNomeValue = m2[2].trim();
      }
      const novo = await insertUsuario({
        nome,
        telefone,
        totvs: totvsValue,
        igreja_nome: igrejaNomeValue,
        email: email || null,
        data_separacao: dataSeparacaoStr || null,
        ministerial: ministerial || null,
        central_totvs: centralTotvsValue,
        central_nome: centralNomeValue,
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
        central_totvs: novo.central_totvs ?? null,
        central_nome: novo.central_nome ?? null,
      });
      setTelefone(novo.telefone);
      nav("/carta");
    } catch {
      toast.error("Falha ao salvar usuário");
    }
  }

  useEffect(() => {
    return () => { if (centralOutrosTimer.current) { clearTimeout(centralOutrosTimer.current); centralOutrosTimer.current = undefined; } };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <img src={logo} alt="Logo" className="mx-auto h-16 object-contain" />
        <h1 className="text-2xl font-bold text-center">Cadastro rápido do pregador</h1>
        <Button type="button" variant="outline" className="w-full" onClick={() => nav("/")}>Fechar e voltar</Button>
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
              value={toBr(dataSeparacaoStr)}
              onChange={(e) => {
                try { const d = parse(e.target.value, "dd/MM/yyyy", new Date()); setDataSeparacaoStr(format(d, "yyyy-MM-dd")); } catch {}
              }}
              className="flex-1"
            />
            <Popover open={isSepCalOpen} onOpenChange={setIsSepCalOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="whitespace-nowrap">
                  <CalendarIcon className="h-4 w-4 mr-2" /> Calendário
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={String(sepViewMonth.getMonth())}
                      onValueChange={(v) => setSepViewMonth(new Date(sepViewMonth.getFullYear(), Number(v), 1))}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Mês" /></SelectTrigger>
                      <SelectContent>
                        {months.map((m, idx) => (
                          <SelectItem key={idx} value={String(idx)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(sepViewMonth.getFullYear())}
                      onValueChange={(v) => setSepViewMonth(new Date(Number(v), sepViewMonth.getMonth(), 1))}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Ano" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => 1900 + i)
                          .reverse()
                          .map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Calendar
                    mode="single"
                    month={sepViewMonth}
                    onMonthChange={setSepViewMonth}
                    selected={dataSeparacaoStr ? parse(dataSeparacaoStr, "yyyy-MM-dd", new Date()) : undefined}
                    onSelect={(d) => { if (d) { setDataSeparacaoStr(format(d, "yyyy-MM-dd")); setIsSepCalOpen(false); } }}
                    locale={ptBR}
                    initialFocus
                  />
                </div>
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
              <SelectItem value="Cooperador">Cooperador</SelectItem>
              <SelectItem value="Membro">Membro</SelectItem>
            
            </SelectContent>
          </Select>
        </div>
        <ChurchSearch
          label="Igreja (congregação)"
          placeholder="Buscar por nome ou código TOTVS"
          churches={churches}
          onSelect={(c) => { setIgreja(c); setIgrejaOutros(""); }}
          value={igreja ? `${igreja.codigoTotvs} - ${igreja.nome}` : ""}
          inputId="igreja-cadastro"
          disabled={Boolean(igrejaOutros.trim())}
          onDisabledClickMessage="Preencha apenas um dos campos"
        />
        <div className="space-y-2">
          <Label htmlFor="igrejaOutros">Outros (se não encontrar)</Label>
          <Input
            id="igrejaOutros"
            value={igrejaOutros}
            onChange={(e) => {
              const v = e.target.value;
              setIgrejaOutros(v);
              if (v.trim()) setIgreja(undefined);
              if (v.trim()) {
                setIgrejaOutrosError(/^\d+\s*-\s+.+$/.test(v) ? "" : "Use o formato 'CODIGO - NOME' (ex.: 12345 - IGREJA EXEMPLO)");
              } else {
                setIgrejaOutrosError("");
              }
            }}
            onBlur={() => {
              const v = igrejaOutros;
              if (v.trim() && !/^\d+\s*-\s+.+$/.test(v)) setIgrejaOutrosError("Use o formato 'CODIGO - NOME' (ex.: 12345 - IGREJA EXEMPLO)");
            }}
            placeholder="Descreva a igreja"
            disabled={Boolean(igreja)}
          />
          {igrejaOutrosError ? (<p className="text-sm text-red-600">{igrejaOutrosError}</p>) : null}
        </div>

        <ChurchSearch
          label="Igreja Estadual, Setorial e central que você pertence"
          placeholder="Buscar por nome ou código TOTVS"
          churches={centralChurches}
          onSelect={(c) => { setIgrejaCentral(c); setIgrejaCentralOutros(""); }}
          value={igrejaCentral ? `${igrejaCentral.codigoTotvs} - ${igrejaCentral.nome}` : ""}
          inputId="igreja-central-cadastro"
          disabled={Boolean(igrejaCentralOutros.trim())}
          onDisabledClickMessage="Preencha apenas um dos campos"
        />
        <div className="space-y-2">
          <Label htmlFor="igrejaCentralOutros">Outros (se não encontrar) – Igreja Central</Label>
          <Input
            id="igrejaCentralOutros"
            value={igrejaCentralOutros}
            onChange={(e) => {
              const v = e.target.value;
              setIgrejaCentralOutros(v);
              if (v.trim()) setIgrejaCentral(undefined);
              if (v.trim()) {
                setIgrejaCentralOutrosError(/^\d+\s*-\s+.+$/.test(v) ? "" : "Use o formato 'CODIGO - NOME' (ex.: 12345 - IGREJA EXEMPLO)");
              } else {
                setIgrejaCentralOutrosError("");
              }
            }}
            onFocus={(e) => {
              setCentralOutrosNotice(true);
              if (!centralOutrosTimer.current) {
                centralOutrosTimer.current = window.setTimeout(() => { nav("/"); }, 5000);
              }
              if (igrejaCentral) { toast.info("Preencha apenas um dos campos"); e.currentTarget.blur(); }
            }}
            onClick={() => {
              setCentralOutrosNotice(true);
              if (!centralOutrosTimer.current) {
                centralOutrosTimer.current = window.setTimeout(() => { nav("/"); }, 5000);
              }
            }}
            placeholder="Descreva a igreja central"
            disabled={Boolean(igrejaCentral)}
          />
          {centralOutrosNotice ? (
            <p className="text-sm text-red-600">
              Procure o seu pastor para informar o nome da igreja responsável pelo seu campo, pois a sua carta será enviada para a Estadual, Setorial e Central.
            </p>
          ) : null}
          {igrejaCentralOutrosError ? (<p className="text-sm text-red-600">{igrejaCentralOutrosError}</p>) : null}
        </div>
        <Button onClick={handleSave} className="w-full">Salvar e continuar</Button>
      </div>
    </div>
  );
}
