import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChurchSearch, Church } from "@/components/ChurchSearch";
import { LetterPreview } from "@/components/LetterPreview";
import { igrejasMock } from "@/data/mockChurches";
import { FileText, RotateCcw, Send, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { fetchChurches } from "@/services/churchService";
import { createLetterByPastor } from "@/services/saasService";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useUser } from "@/context/UserContext";
import { getIgrejaByTotvs, getUsuarioByTelefone } from "@/services/userService";
import { getPastorByTotvs } from "@/services/churchService";
import { useNavigate, useLocation } from "react-router-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getFriendlyError } from "@/lib/error-map";

type LegacyUsuarioExtra = {
  central_totvs?: string | null;
  central_nome?: string | null;
  ministerial?: string | null;
  data_separacao?: string | null;
  email?: string | null;
  totvs?: string | null;
  default_totvs_id?: string | null;
};

type CreateLetterResult = {
  n8n?: { ok?: boolean };
};

const Index = () => {
  const { usuario, telefone, setUsuario, setTelefone } = useUser();
  const nav = useNavigate();
  const loc = useLocation();
  const [igrejaOrigem, setIgrejaOrigem] = useState<Church | undefined>();
  const [igrejaDestino, setIgrejaDestino] = useState<Church | undefined>();
  const [destinoOutros, setDestinoOutros] = useState("");
  const [usuarioEmail, setUsuarioEmail] = useState<string>("");
  const [usuarioMinisterial, setUsuarioMinisterial] = useState<string>("");
  const [usuarioDataSeparacao, setUsuarioDataSeparacao] = useState<string>("");
  const [isPregacaoCalOpen, setIsPregacaoCalOpen] = useState(false);
  const [pastorResponsavel, setPastorResponsavel] = useState<string>("");
  const [telefonePastorResponsavel, setTelefonePastorResponsavel] = useState<string>("");
  const schema = useMemo(
    () =>
      z
        .object({
          pregadorNome: z.string().min(2),
          telefone: z.string().min(1),
          dataPregacao: z.string().min(1),
          dataEmissao: z.string().min(1),
          origemId: z.number().int().positive(),
          destinoId: z.number().int().positive().optional(),
          destinoOutros: z.string().optional(),
        })
        .refine(
          (v) => new Date(v.dataEmissao).getTime() <= new Date(v.dataPregacao).getTime(),
          {
            path: ["dataEmissao"],
            message: "Data de emissão não pode ser após a pregação",
          },
        )
        .refine(
          (v) => !!v.destinoId || !!(v.destinoOutros && v.destinoOutros.trim().length >= 2),
          { path: ["destinoId"], message: "Selecione a igreja de destino ou informe em Outros" },
        ),
    [],
  );
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<{
    pregadorNome: string;
    telefone: string;
    dataPregacao: string;
    dataEmissao: string;
    origemId: number;
    destinoId?: number;
    destinoOutros?: string;
  }>({
    resolver: zodResolver(schema),
    defaultValues: {
      pregadorNome: "",
      telefone: "",
      dataPregacao: "",
      dataEmissao: format(new Date(), "yyyy-MM-dd", { locale: ptBR }),
      destinoOutros: "",
    },
  });
  const watchedTelefone = watch("telefone");
  const { data: churches = igrejasMock } = useQuery({ queryKey: ["churches"], queryFn: fetchChurches, staleTime: 60_000 });
  const toBr = (iso: string) => {
    if (!iso) return "";
    try {
      return format(parse(iso, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return iso;
    }
  };
  const brToIso = (br: string) => {
    try {
      const d = parse(br, "dd/MM/yyyy", new Date());
      return format(d, "yyyy-MM-dd");
    } catch {
      return br;
    }
  };
  useEffect(() => {
    if (usuario?.nome) setValue("pregadorNome", usuario.nome, { shouldValidate: true });
    if (usuario?.telefone || telefone) setValue("telefone", usuario?.telefone || telefone || "", { shouldValidate: true });
    (async () => {
      if (usuario?.totvs) {
        try {
          const found = await getIgrejaByTotvs(usuario.totvs);
          if (found) {
            const c: Church = { id: Number(found.codigoTotvs) || Date.now(), codigoTotvs: found.codigoTotvs, nome: found.nome, cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" };
            setIgrejaOrigem(c);
            setValue("origemId", c.id, { shouldValidate: true });
          } else if (usuario?.igreja_nome) {
            const c: Church = { id: Date.now(), codigoTotvs: "", nome: usuario.igreja_nome, cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" };
            setIgrejaOrigem(c);
            setValue("origemId", c.id, { shouldValidate: true });
          }
        } catch {
          if (usuario?.igreja_nome) {
            const c: Church = { id: Date.now(), codigoTotvs: "", nome: usuario.igreja_nome, cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" };
            setIgrejaOrigem(c);
            setValue("origemId", c.id, { shouldValidate: true });
          }
        }
      } else if (usuario?.igreja_nome) {
        const c: Church = { id: Date.now(), codigoTotvs: "", nome: usuario.igreja_nome, cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" };
        setIgrejaOrigem(c);
        setValue("origemId", c.id, { shouldValidate: true });
      }
    })();
  }, [usuario, telefone, setValue]);

  // redirecionamento agora é tratado via guarda de rota em App.tsx

  useEffect(() => {
    const st = loc.state as unknown as { reemitir?: { nome?: string; igreja_origem?: string; igreja_destino?: string; ["dia_pregação"]?: string; data_emissao?: string } } | null;
    const r = st?.reemitir;
    if (r) {
      if (r.nome) setValue("pregadorNome", r.nome, { shouldValidate: true });
      if (r["dia_pregação"]) setValue("dataPregacao", brToIso(r["dia_pregação"]), { shouldValidate: true });
      if (r.data_emissao) setValue("dataEmissao", r.data_emissao, { shouldValidate: true });
      if (r.igreja_destino) {
        setDestinoOutros(r.igreja_destino);
        setValue("destinoOutros", r.igreja_destino, { shouldValidate: true });
        setIgrejaDestino(undefined);
        setValue("destinoId", undefined as unknown as number, { shouldValidate: true });
      }
      if (r.igreja_origem) {
        const m = r.igreja_origem.match(/^\\s*(\\d+)/);
        const code = m ? m[1] : "";
        if (code) {
          const found = churches.find((c) => (c.codigoTotvs || "") === code);
          if (found) {
            setIgrejaOrigem(found);
            setValue("origemId", found.id, { shouldValidate: true });
          }
        }
      }
    }
  }, [loc.state, churches, setValue]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const telDigits = (watchedTelefone || "").replace(/\D/g, "");
      if (telDigits.length >= 10) {
        try {
          const u = await getUsuarioByTelefone(telDigits);
          if (u) {
            setUsuario({
              id: u.id,
              nome: u.nome,
              telefone: u.telefone,
              totvs: u.totvs ?? null,
              igreja_nome: u.igreja_nome ?? null,
              email: u.email ?? null,
              ministerial: u.ministerial ?? null,
              data_separacao: u.data_separacao ?? null,
              central_totvs: (u as LegacyUsuarioExtra)?.central_totvs ?? null,
              central_nome: (u as LegacyUsuarioExtra)?.central_nome ?? null,
            });
            setValue("pregadorNome", u.nome, { shouldValidate: true });
            setValue("telefone", u.telefone, { shouldValidate: true });
            if (u.email) setUsuarioEmail(u.email);
            if (u.ministerial) setUsuarioMinisterial(u.ministerial);
            if (u.data_separacao) setUsuarioDataSeparacao(u.data_separacao);
            if (u.totvs) {
              try {
                const found = await getIgrejaByTotvs(u.totvs);
                if (found) {
                  const c: Church = { id: Number(found.codigoTotvs) || Date.now(), codigoTotvs: found.codigoTotvs, nome: found.nome, cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" };
                  setIgrejaOrigem(c);
                  setValue("origemId", c.id, { shouldValidate: true });
                }
              } catch {
                // Comentario: erro ignorado de forma controlada.
              }
            } else if (u.igreja_nome) {
              const c: Church = { id: Date.now(), codigoTotvs: "", nome: u.igreja_nome, cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" };
              setIgrejaOrigem(c);
              setValue("origemId", c.id, { shouldValidate: true });
            }
          }
        } catch {
                // Comentario: erro ignorado de forma controlada.
              }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [watchedTelefone, setUsuario, setValue]);

  const phoneDigits = (watchedTelefone || "").replace(/\D/g, "");
  const phoneEmpty = phoneDigits.length < 10;
  const hasUsuario = Boolean(usuario);
  const disableByPhone = phoneEmpty && !hasUsuario;

  useEffect(() => {
    if (usuario) {
      const u = usuario as LegacyUsuarioExtra | null;
      if (u?.email) setUsuarioEmail(u.email);
      if (u?.ministerial) setUsuarioMinisterial(u.ministerial);
      if (u?.data_separacao) setUsuarioDataSeparacao(u.data_separacao);
      if (usuario.telefone) setValue("telefone", usuario.telefone, { shouldValidate: true });
      if (usuario.nome) setValue("pregadorNome", usuario.nome, { shouldValidate: true });
    }
  }, [usuario, setValue]);

  useEffect(() => {
    (async () => {
      const u = usuario as LegacyUsuarioExtra | null;
      const centralTotvs: string | undefined = (u?.central_totvs ? String(u.central_totvs).trim() : undefined);
      if (centralTotvs) {
        try {
          console.info("pastor-lookup", { centralTotvs });
          const r = await getPastorByTotvs(centralTotvs);
          if (r) {
            console.info("pastor-lookup-result", r);
            setPastorResponsavel(r.pastor || "");
            setTelefonePastorResponsavel(r.telefone || "");
          }
        } catch {
                // Comentario: erro ignorado de forma controlada.
              }
      } else {
        setPastorResponsavel("");
        setTelefonePastorResponsavel("");
      }
    })();
  }, [usuario]);

  const onSubmit = async (values: {
    pregadorNome: string;
    telefone: string;
    dataPregacao: string;
    dataEmissao: string;
    origemId: number;
    destinoId?: number;
    destinoOutros?: string;
  }) => {
    // Comentario: o front chama apenas `create-letter`.
    // A Edge Function salva no banco e dispara o n8n.
    const origemText = igrejaOrigem
      ? (igrejaOrigem.codigoTotvs ? `${igrejaOrigem.codigoTotvs} - ${igrejaOrigem.nome}` : igrejaOrigem.nome)
      : (usuario?.igreja_nome ?? "");
    const destinoText = (watch("destinoOutros") && watch("destinoOutros")!.trim())
      ? watch("destinoOutros")!.trim()
      : (igrejaDestino ? `${igrejaDestino.codigoTotvs} - ${igrejaDestino.nome}` : "");

    try {
      const result = (await createLetterByPastor({
        church_totvs_id: String((usuario as LegacyUsuarioExtra | null)?.totvs || (usuario as LegacyUsuarioExtra | null)?.default_totvs_id || ""),
        preacher_name: values.pregadorNome,
        minister_role: usuarioMinisterial || (usuario as LegacyUsuarioExtra | null)?.ministerial || "Obreiro",
        preach_date: values.dataPregacao,
        church_origin: origemText,
        church_destination: destinoText,
        phone: (values.telefone || "").replace(/\D/g, ""),
        email: usuarioEmail || (usuario as LegacyUsuarioExtra | null)?.email || null,
      })) as CreateLetterResult;

      if ((result as CreateLetterResult)?.n8n?.ok === false) {
        toast.warning("Carta criada, mas houve falha ao enviar para gera??o do PDF.");
      } else {
        toast.success("Carta enviada para gera??o. Aguarde o PDF.");
      }

      setIgrejaOrigem(undefined);
      setIgrejaDestino(undefined);
      reset({
        pregadorNome: "",
        telefone: "",
        dataPregacao: "",
        dataEmissao: format(new Date(), "yyyy-MM-dd", { locale: ptBR }),
        origemId: undefined as unknown as number,
        destinoId: undefined as unknown as number,
      });
      setUsuario(undefined);
      setTelefone(undefined);
      setDestinoOutros("");
      nav("/");
    } catch (err: unknown) {
      toast.error(getFriendlyError(err, "letters"));
    }
  };

  const handleClear = () => {
    setIgrejaOrigem(undefined);
    setIgrejaDestino(undefined);
    reset({
      pregadorNome: "",
      telefone: "",
      dataPregacao: "",
      dataEmissao: format(new Date(), "yyyy-MM-dd", { locale: ptBR }),
      origemId: undefined as unknown as number,
      destinoId: undefined as unknown as number,
      destinoOutros: "",
    });
    setTelefone(undefined);
    setDestinoOutros("");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <img src="/Polish_20220810_001501268%20(2).png" alt="Logo" className="h-12 w-auto rounded-md" />
              <div>
                <h1 className="text-xl md:text-2xl font-bold">Sistema de Cartas de Pregação</h1>
                <p className="text-sm text-white/90">Emissão de Carta</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="bg-white/20 text-white hover:bg-white/30 h-8 px-3 text-xs md:h-10 md:px-4 md:text-sm"
              onClick={() => nav("/usuario")}
            >
              Voltar ao Dashboard
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Form Card */}
          <Card className="card-shadow hover:card-shadow-hover transition-shadow duration-300 border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
                <FileText className="h-6 w-6 text-primary" />
                Registro de Carta de Pregação
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Preencha os dados para emissão da carta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Nome do Pregador */}
                <div className="space-y-2">
                  <Label htmlFor="pregador" className="text-sm font-medium text-foreground">
                    Nome do pregador
                  </Label>
                  <Input
                    id="pregador"
                    type="text"
                    placeholder="Digite o nome completo"
                    {...register("pregadorNome")}
                    onFocus={(e) => { if (disableByPhone) { toast.info("Digite seu telefone"); e.currentTarget.blur(); } }}
                    disabled={disableByPhone}
                    className="bg-card border-input focus:border-primary focus:ring-primary transition-colors"
                    required
                  />
                  {errors.pregadorNome && <p className="text-xs text-destructive">{errors.pregadorNome.message as string}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone" className="text-sm font-medium text-foreground">
                    Telefone
                  </Label>
                  <Input
                    id="telefone"
                    type="tel"
                    placeholder="Digite o telefone"
                    {...register("telefone")}
                    className="bg-card border-input focus:border-primary focus:ring-primary transition-colors"
                    required
                  />
                  {errors.telefone && <p className="text-xs text-destructive">{errors.telefone.message as string}</p>}
                </div>

                {/* Igreja Origem */}
                <ChurchSearch
                  label="Igreja que faz a carta (origem)"
                  placeholder="Buscar por nome ou código TOTVS"
                  churches={churches}
                  onSelect={(c) => {
                    setIgrejaOrigem(c);
                    setValue("origemId", c.id, { shouldValidate: true });
                  }}
                  value={igrejaOrigem ? (igrejaOrigem.codigoTotvs ? `${igrejaOrigem.codigoTotvs} - ${igrejaOrigem.nome}` : igrejaOrigem.nome) : (usuario?.igreja_nome ?? "")}
                  disabled={disableByPhone}
                  onDisabledClickMessage="Digite seu telefone"
                  inputId="church-origem"
                />
                {errors.origemId && <p className="text-xs text-destructive">Selecione a igreja de origem</p>}

                {/* Igreja Destino */}
                <ChurchSearch
                  label="Igreja que vai pregar (destino)"
                  placeholder="Buscar por nome ou código TOTVS"
                  churches={churches}
                  onSelect={(c) => {
                    setIgrejaDestino(c);
                    setValue("destinoId", c.id, { shouldValidate: true });
                    setDestinoOutros("");
                    setValue("destinoOutros", "", { shouldValidate: true });
                  }}
                  value={igrejaDestino ? `${igrejaDestino.codigoTotvs} - ${igrejaDestino.nome}` : ""}
                  disabled={disableByPhone || Boolean(destinoOutros.trim())}
                  onDisabledClickMessage="Digite seu telefone"
                  inputId="church-destino"
                />
                <div className="space-y-2">
                  <Label htmlFor="destinoOutros" className="text-sm font-medium text-foreground">Outros (se não encontrar)</Label>
                  <Input
                    id="destinoOutros"
                    type="text"
                    value={destinoOutros}
                    onChange={(e) => {
                      setDestinoOutros(e.target.value);
                      setValue("destinoOutros", e.target.value, { shouldValidate: true });
                      if (e.target.value.trim()) {
                        setIgrejaDestino(undefined);
                        setValue("destinoId", undefined as unknown as number, { shouldValidate: true });
                      }
                    }}
                    onFocus={(e) => { if (disableByPhone) { toast.info("Digite seu telefone"); e.currentTarget.blur(); } }}
                    placeholder="Digite a igreja manualmente"
                    disabled={disableByPhone || Boolean(igrejaDestino)}
                    className="bg-card border-input focus:border-primary focus:ring-primary transition-colors"
                  />
                  {errors.destinoId && <p className="text-xs text-destructive">Selecione a igreja de destino ou informe em Outros</p>}
                </div>


                {/* Datas */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataPregacao" className="text-sm font-medium text-foreground">
                      Data da pregação
                    </Label>
                    <div className="flex gap-2">
                      {(() => {
                        const { name, ref, onBlur } = register("dataPregacao");
                        return (
                          <Input
                            id="dataPregacao"
                            type="text"
                            inputMode="numeric"
                            placeholder="dd/mm/aaaa"
                            name={name}
                            ref={ref}
                            onBlur={onBlur}
                            value={toBr(watch("dataPregacao"))}
                            onChange={(e) => {
                              const iso = brToIso(e.target.value);
                              setValue("dataPregacao", iso, { shouldValidate: true });
                            }}
                            onFocus={(e) => { if (disableByPhone) { toast.info("Digite seu telefone"); e.currentTarget.blur(); } }}
                            className="bg-card border-input focus:border-primary focus:ring-primary transition-colors flex-1"
                            required
                          />
                        );
                      })()}
                      <Popover
                        open={isPregacaoCalOpen}
                        onOpenChange={(open) => {
                          if (disableByPhone) { setIsPregacaoCalOpen(false); return; }
                          setIsPregacaoCalOpen(open);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="whitespace-nowrap"
                            onClick={(e) => {
                              if (disableByPhone) {
                                toast.info("Digite seu telefone");
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                          >
                            <CalendarIcon className="h-4 w-4 mr-2" />
                            Calendário
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={watch("dataPregacao") ? parse(watch("dataPregacao"), "yyyy-MM-dd", new Date()) : undefined}
                            onSelect={(d) => {
                              if (!d) return;
                              setValue("dataPregacao", format(d, "yyyy-MM-dd"), { shouldValidate: true });
                              setIsPregacaoCalOpen(false);
                            }}
                            disabled={{ before: new Date() }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {errors.dataPregacao && <p className="text-xs text-destructive">{errors.dataPregacao.message as string}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataEmissao" className="text-sm font-medium text-foreground">
                      Data de emissão da carta
                    </Label>
                    {(() => {
                      const { name, ref, onBlur } = register("dataEmissao");
                      return (
                        <Input
                          id="dataEmissao"
                          type="text"
                          inputMode="numeric"
                          placeholder="dd/mm/aaaa"
                          name={name}
                          ref={ref}
                          onBlur={onBlur}
                          value={toBr(watch("dataEmissao"))}
                          disabled
                          className="bg-card border-input focus:border-primary focus:ring-primary transition-colors"
                          required
                        />
                      );
                    })()}
                    {errors.dataEmissao && <p className="text-xs text-destructive">{errors.dataEmissao.message as string}</p>}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    type="submit"
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-md hover:shadow-lg transition-all"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Registrar Carta de Pregação
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClear}
                    className="border-border hover:bg-secondary/50 text-foreground transition-colors"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Limpar formulário
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Preview Card */}
          <div className="lg:sticky lg:top-8 h-fit">
          <LetterPreview
            pregadorNome={watch("pregadorNome")}
            igrejaOrigem={igrejaOrigem}
            igrejaDestino={destinoOutros.trim() ? { id: 0, codigoTotvs: "", nome: destinoOutros.trim(), cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" } : igrejaDestino}
            dataPregacao={watch("dataPregacao")}
            dataEmissao={watch("dataEmissao")}
            email={usuarioEmail || (usuario as LegacyUsuarioExtra | null)?.email || undefined}
            ministerial={usuarioMinisterial || (usuario as LegacyUsuarioExtra | null)?.ministerial || undefined}
            dataSeparacao={usuarioDataSeparacao || (usuario as LegacyUsuarioExtra | null)?.data_separacao || undefined}
            pastorResponsavel={pastorResponsavel || undefined}
            telefonePastorResponsavel={telefonePastorResponsavel || undefined}
          />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
