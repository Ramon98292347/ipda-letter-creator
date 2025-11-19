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
import { createCarta } from "@/services/letterService";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useUser } from "@/context/UserContext";
import { getIgrejaByTotvs, getUsuarioByTelefone } from "@/services/userService";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const Index = () => {
  const { usuario, telefone, setUsuario, setTelefone } = useUser();
  const nav = useNavigate();
  const [igrejaOrigem, setIgrejaOrigem] = useState<Church | undefined>();
  const [igrejaDestino, setIgrejaDestino] = useState<Church | undefined>();
  const [destinoOutros, setDestinoOutros] = useState("");
  const [usuarioEmail, setUsuarioEmail] = useState<string>("");
  const [usuarioMinisterial, setUsuarioMinisterial] = useState<string>("");
  const [usuarioDataSeparacao, setUsuarioDataSeparacao] = useState<string>("");
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
    const t = setTimeout(async () => {
      const telDigits = (watch("telefone") || "").replace(/\D/g, "");
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
              } catch {}
            } else if (u.igreja_nome) {
              const c: Church = { id: Date.now(), codigoTotvs: "", nome: u.igreja_nome, cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" };
              setIgrejaOrigem(c);
              setValue("origemId", c.id, { shouldValidate: true });
            }
          }
        } catch {}
      }
    }, 400);
    return () => clearTimeout(t);
  }, [watch("telefone"), setUsuario, setValue]);

  const phoneDigits = (watch("telefone") || "").replace(/\D/g, "");
  const phoneEmpty = phoneDigits.length < 10;
  const hasUsuario = Boolean(usuario);
  const disableByPhone = phoneEmpty && !hasUsuario;

  useEffect(() => {
    if (usuario) {
      const u = usuario as any;
      if (u?.email) setUsuarioEmail(u.email);
      if (u?.ministerial) setUsuarioMinisterial(u.ministerial);
      if (u?.data_separacao) setUsuarioDataSeparacao(u.data_separacao);
      if (usuario.telefone) setValue("telefone", usuario.telefone, { shouldValidate: true });
      if (usuario.nome) setValue("pregadorNome", usuario.nome, { shouldValidate: true });
    }
  }, [usuario, setValue]);

  const onSubmit = async (values: {
    pregadorNome: string;
    telefone: string;
    dataPregacao: string;
    dataEmissao: string;
    origemId: number;
    destinoId?: number;
    destinoOutros?: string;
  }) => {
    const origemText = igrejaOrigem
      ? (igrejaOrigem.codigoTotvs ? `${igrejaOrigem.codigoTotvs} - ${igrejaOrigem.nome}` : igrejaOrigem.nome)
      : (usuario?.igreja_nome ?? "");
    const destinoText = (watch("destinoOutros") && watch("destinoOutros")!.trim())
      ? watch("destinoOutros")!.trim()
      : (igrejaDestino ? `${igrejaDestino.codigoTotvs} - ${igrejaDestino.nome}` : "");
    let saved = false;
    try {
      await createCarta({
        nome: values.pregadorNome,
        igreja_origem: origemText,
        igreja_destino: destinoText,
        dia_pregacao: values.dataPregacao ? format(parse(values.dataPregacao, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR }) : "",
        data_emissao: values.dataEmissao ? format(parse(values.dataEmissao, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR }) : "",
      });
      saved = true;
    } catch (e) {
      toast.error("Falha ao salvar na tabela carta. Verifique RLS.");
    }
    try {
      const webhookUrl = (import.meta as any).env?.VITE_WEBHOOK_CARTA_PREGACAO || "https://n8n-n8n.ynlng8.easypanel.host/webhook/carta-pregacao";
      const ac = new AbortController();
      const res = await fetch(webhookUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          nome: values.pregadorNome,
          telefone: values.telefone,
          igreja_origem: origemText,
          igreja_destino: destinoText,
          dia_pregacao: values.dataPregacao ? format(parse(values.dataPregacao, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR }) : "",
          data_emissao: values.dataEmissao ? format(parse(values.dataEmissao, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR }) : "",
          origem_totvs: igrejaOrigem?.codigoTotvs,
          destino_totvs: (watch("destinoOutros") && watch("destinoOutros")!.trim()) ? undefined : igrejaDestino?.codigoTotvs,
          origem_nome: igrejaOrigem?.nome,
          destino_nome: (watch("destinoOutros") && watch("destinoOutros")!.trim()) ? watch("destinoOutros")!.trim() : igrejaDestino?.nome,
        }),
        signal: ac.signal,
        referrerPolicy: "no-referrer",
      });
      if (!res.ok) throw new Error("webhook-failed");
      toast.success("Olá!", {
        description:
          "A sua resposta foi registrada com sucesso. Solicitamos que, por favor, entre em contato com o seu pastor do Campo da Setorial ou da Central, pois a sua carta de pregação já foi enviada para ele.\n\nPermanecemos à disposição para quaisquer dúvidas.\n\nAtenciosamente,\nEstadual de Vitória",
        duration: 12000,
      });
    } catch {
      toast.error("Falha ao chamar o webhook. Verifique se está ativo.");
    }
    if (saved) {
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
      {/* Header */}
      <header className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center text-center space-y-3">
            <img src="/Polish_20220810_001501268%20(2).png" alt="Logo" className="h-16 w-auto rounded-md" />
            <h1 className="text-3xl md:text-4xl font-bold">
              Sistema de Cartas – IPDA Estadual de Vitória
            </h1>
            <p className="text-lg md:text-xl font-semibold tracking-wide bg-white/10 backdrop-blur-sm px-6 py-2 rounded-full">
              MAIS QUE IGREJA, UMA FAMÍLIA
            </p>
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
                Registro de Carta de Recomendação
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
                      <Popover>
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
                            {/* manter aviso pelo telefone */}
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
                            }}
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
            email={usuarioEmail || (usuario as any)?.email || undefined}
            ministerial={usuarioMinisterial || (usuario as any)?.ministerial || undefined}
            dataSeparacao={usuarioDataSeparacao || (usuario as any)?.data_separacao || undefined}
          />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
