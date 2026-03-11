﻿﻿﻿import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChurchSearch, Church } from "@/components/ChurchSearch";
import { LetterPreview } from "@/components/LetterPreview";
import { FileText, RotateCcw, Send, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createLetterByPastor, getPastorByTotvsPublic, listChurchesInScope, listMembers, setLetterStatus, type UserListItem } from "@/services/saasService";
import { format, parse } from "date-fns";
import { useUser } from "@/context/UserContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getFriendlyErrorMessage } from "@/services/api";

type LegacyUsuarioExtra = {
  phone?: string | null;
  telefone?: string | null;
  central_totvs?: string | null;
  central_nome?: string | null;
  ministerial?: string | null;
  data_separacao?: string | null;
  email?: string | null;
  totvs?: string | null;
  default_totvs_id?: string | null;
};

type CreateLetterResult = {
  letter?: { id?: string };
  n8n?: { ok?: boolean };
};

type PreachPeriod = "MANHA" | "TARDE" | "NOITE" | "";

type FormData = {
  pregadorNome: string;
  telefone: string;
  dataPregacao: string;
  dataEmissao: string;
  origemId: number;
  destinoId?: number;
  preacherUserId?: string;
  destinoOutros?: string;
};

const Index = () => {
  const { usuario, telefone, session } = useUser();
  const nav = useNavigate();
  const loc = useLocation();
  const role = String(usuario?.role || session?.role || "").toLowerCase();
  const dashboardRoute = role === "admin" ? "/admin/dashboard" : role === "pastor" ? "/pastor/dashboard" : "/usuario";

  const now = new Date();
  const todayIso = format(now, "yyyy-MM-dd");
  const [igrejaOrigem, setIgrejaOrigem] = useState<Church | undefined>();
  const [igrejaDestino, setIgrejaDestino] = useState<Church | undefined>();
  const [destinoOutros, setDestinoOutros] = useState("");
  const [selectedPreacherUserId, setSelectedPreacherUserId] = useState<string>("");
  const [usuarioEmail, setUsuarioEmail] = useState<string>("");
  const [usuarioMinisterial, setUsuarioMinisterial] = useState<string>("");
  const [usuarioDataSeparacao, setUsuarioDataSeparacao] = useState<string>("");
  const [preachPeriod, setPreachPeriod] = useState<PreachPeriod>("");
  const [isPregacaoCalOpen, setIsPregacaoCalOpen] = useState(false);
  const [savingLetter, setSavingLetter] = useState(false);
  const [pregadorBusca, setPregadorBusca] = useState("");

  const activeTotvsForPastor = String(session?.totvs_id || (usuario as LegacyUsuarioExtra | null)?.totvs || (usuario as LegacyUsuarioExtra | null)?.default_totvs_id || "");
  const telefoneUsuarioLogado =
    String(
      usuario?.telefone ||
      (usuario as unknown as LegacyUsuarioExtra | null)?.phone ||
      (usuario as unknown as LegacyUsuarioExtra | null)?.telefone ||
      telefone ||
      "",
    ).trim();

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
          preacherUserId: z.string().optional(),
          destinoOutros: z.string().optional(),
        })
        .refine(
          (v) => new Date(v.dataEmissao).getTime() <= new Date(v.dataPregacao).getTime(),
          {
            path: ["dataEmissao"],
            message: "Data de emissão não pode ser após a pregação",
          },
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
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      pregadorNome: "",
      telefone: "",
      dataPregacao: "",
      dataEmissao: todayIso,
    },
  });

  const { data: churches = [] } = useQuery({
    queryKey: ["churches-letter-form", role, activeTotvsForPastor],
    queryFn: async () => {
      const root = role === "admin" ? undefined : activeTotvsForPastor || undefined;
      const rows = await listChurchesInScope(1, 1000, root);
      return rows.map((c, idx) => ({
        id: Number(c.totvs_id) || idx + 1,
        codigoTotvs: String(c.totvs_id || ""),
        nome: String(c.church_name || ""),
        cidade: String(c.address_city || ""),
        uf: String(c.address_state || ""),
        carimboIgreja: String(c.stamp_church_url || ""),
        carimboPastor: "",
        classificacao: String(c.church_class || ""),
        parentTotvsId: String(c.parent_totvs_id || "") || undefined,
      })) as Church[];
    },
    enabled: role === "admin" || Boolean(activeTotvsForPastor),
    staleTime: 60_000,
  });
  const { data: preachersInScope = [] } = useQuery({
    queryKey: ["letter-preachers-in-scope", session?.totvs_id, role],
    queryFn: async () => {
      const data = await listMembers({
        page: 1,
        page_size: 1000,
        roles: ["pastor", "obreiro"],
        is_active: true,
      });
      return data.workers;
    },
    enabled: Boolean(session?.totvs_id),
    staleTime: 60_000,
  });
  const origemTotvsSelecionada = String(igrejaOrigem?.codigoTotvs || activeTotvsForPastor || "").trim();
  const { data: pastorResponsavelData } = useQuery({
    queryKey: ["pastor-responsavel-carta", origemTotvsSelecionada],
    queryFn: () => getPastorByTotvsPublic(origemTotvsSelecionada),
    enabled: Boolean(origemTotvsSelecionada),
  });
  const pastorResponsavelScope = useMemo(() => {
    const found = preachersInScope.find((m) =>
      String(m.role || "").toLowerCase() === "pastor" &&
      String(m.default_totvs_id || "") === origemTotvsSelecionada,
    );
    return found || null;
  }, [origemTotvsSelecionada, preachersInScope]);

  const pastorResponsavel = String(pastorResponsavelScope?.full_name || pastorResponsavelData?.full_name || "");
  const telefonePastorResponsavel = String(pastorResponsavelScope?.phone || pastorResponsavelData?.phone || "");

  const allowedOriginChurches = useMemo(() => {
    if (!activeTotvsForPastor) return churches;
    const byTotvs = new Map<string, Church>();
    churches.forEach((c) => {
      const id = String(c.codigoTotvs || "").trim();
      if (id) byTotvs.set(id, c);
    });
    const active = byTotvs.get(activeTotvsForPastor);
    if (!active) return churches;

    const allowed = new Set<string>([activeTotvsForPastor]);
    const parent = String(active.parentTotvsId || "").trim();
    if (parent) {
      allowed.add(parent);
      const grand = String(byTotvs.get(parent)?.parentTotvsId || "").trim();
      if (grand) allowed.add(grand);
    }

    const result = churches.filter((c) => allowed.has(String(c.codigoTotvs || "").trim()));
    return result.length ? result : [active];
  }, [churches, activeTotvsForPastor]);

  const allowedDestinationChurches = useMemo(() => {
    if (!igrejaOrigem?.codigoTotvs) return churches;
    const byTotvs = new Map<string, Church>();
    const children = new Map<string, string[]>();

    churches.forEach((church) => {
      const totvs = String(church.codigoTotvs || "").trim();
      if (!totvs) return;
      byTotvs.set(totvs, church);
      const parent = String(church.parentTotvsId || "").trim();
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(totvs);
    });

    const origin = String(igrejaOrigem.codigoTotvs || "").trim();
    const allowed = new Set<string>();

    const queue: string[] = [origin];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (allowed.has(current)) continue;
      allowed.add(current);
      for (const child of children.get(current) || []) queue.push(child);
    }

    let cursor = origin;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      const parent = String(byTotvs.get(cursor)?.parentTotvsId || "").trim();
      if (!parent) break;
      allowed.add(parent);
      cursor = parent;
    }

    return churches.filter((c) => allowed.has(String(c.codigoTotvs || "").trim()));
  }, [churches, igrejaOrigem?.codigoTotvs]);

  const allowDestinoOutros = useMemo(() => {
    const cls = String(igrejaOrigem?.classificacao || "").toLowerCase().trim();
    return cls === "estadual" || cls === "setorial" || cls === "central";
  }, [igrejaOrigem?.classificacao]);

  const preachersMap = useMemo(() => {
    const map = new Map<string, UserListItem>();
    preachersInScope.forEach((item) => map.set(String(item.id || ""), item));
    return map;
  }, [preachersInScope]);

  const preacherOptions = useMemo(() => {
    const loggedId = String(usuario?.id || "").trim();
    if (!loggedId) return preachersInScope;
    if (preachersInScope.some((item) => String(item.id || "") === loggedId)) return preachersInScope;

    return [
      {
        id: loggedId,
        full_name: usuario?.nome || "",
        phone: telefoneUsuarioLogado || null,
        email: (usuario as LegacyUsuarioExtra | null)?.email || null,
        minister_role: (usuario as LegacyUsuarioExtra | null)?.ministerial || "Obreiro",
        role: (String(usuario?.role || "").toLowerCase() as "admin" | "pastor" | "obreiro") || "obreiro",
      } as UserListItem,
      ...preachersInScope,
    ];
  }, [preachersInScope, telefoneUsuarioLogado, usuario]);

  const filteredPreacherOptions = useMemo(() => {
    const q = pregadorBusca.trim().toLowerCase();
    if (!q) return preacherOptions;
    return preacherOptions.filter((member) => {
      const name = String(member.full_name || "").toLowerCase();
      const cpf = String(member.cpf || "").toLowerCase();
      const ministerio = String(member.minister_role || "").toLowerCase();
      return name.includes(q) || cpf.includes(q) || ministerio.includes(q);
    });
  }, [pregadorBusca, preacherOptions]);

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
    if (telefoneUsuarioLogado) setValue("telefone", telefoneUsuarioLogado, { shouldValidate: true });
  }, [usuario, telefone, setValue, telefoneUsuarioLogado]);

  useEffect(() => {
    const st = loc.state as unknown as {
      reemitir?: {
        nome?: string;
        igreja_origem?: string;
        igreja_destino?: string;
        ["dia_pregação"]?: string;
        data_emissao?: string;
      };
    } | null;

    const r = st?.reemitir;
    if (!r) return;

    if (r.nome) setValue("pregadorNome", r.nome, { shouldValidate: true });
    if (r["dia_pregação"]) setValue("dataPregacao", brToIso(r["dia_pregação"]), { shouldValidate: true });
    if (r.data_emissao) setValue("dataEmissao", r.data_emissao, { shouldValidate: true });

    if (r.igreja_destino) {
      const m = r.igreja_destino.match(/^\s*(\d+)/);
      const code = m ? m[1] : "";
      const foundDest = churches.find((c) => (c.codigoTotvs || "") === code);
      if (foundDest) {
        setIgrejaDestino(foundDest);
        setValue("destinoId", foundDest.id, { shouldValidate: true });
        setDestinoOutros("");
        setValue("destinoOutros", "", { shouldValidate: false });
      } else {
        setDestinoOutros(r.igreja_destino);
        setValue("destinoOutros", r.igreja_destino, { shouldValidate: false });
      }
    }

    if (r.igreja_origem) {
      const m = r.igreja_origem.match(/^\s*(\d+)/);
      const code = m ? m[1] : "";
      if (!code) return;
      const found = churches.find((c) => (c.codigoTotvs || "") === code);
      if (found) {
        setIgrejaOrigem(found);
        setValue("origemId", found.id, { shouldValidate: true });
      }
    }
  }, [loc.state, churches, setValue]);

  const disableByPhone = false;

  useEffect(() => {
    if (!usuario) return;

    const u = usuario as LegacyUsuarioExtra | null;
    if (u?.email) setUsuarioEmail(u.email);
    if (u?.ministerial) setUsuarioMinisterial(u.ministerial);
    if (u?.data_separacao) setUsuarioDataSeparacao(u.data_separacao);
    if (telefoneUsuarioLogado) setValue("telefone", telefoneUsuarioLogado, { shouldValidate: true });
    if (usuario.nome) setValue("pregadorNome", usuario.nome, { shouldValidate: true });
  }, [usuario, setValue, telefoneUsuarioLogado]);

  useEffect(() => {
    const loggedId = String(usuario?.id || "");
    if (!loggedId || selectedPreacherUserId) return;
    const me = preachersMap.get(loggedId);
    setSelectedPreacherUserId(loggedId);
    setValue("preacherUserId", loggedId, { shouldValidate: false });
    setValue("pregadorNome", String(me?.full_name || usuario?.nome || ""), { shouldValidate: true });
    setValue("telefone", String(me?.phone || telefoneUsuarioLogado || ""), { shouldValidate: true });
    setUsuarioEmail(String(me?.email || (usuario as LegacyUsuarioExtra | null)?.email || ""));
    setUsuarioMinisterial(String(me?.minister_role || (usuario as LegacyUsuarioExtra | null)?.ministerial || "Obreiro"));
  }, [preachersMap, selectedPreacherUserId, setValue, telefoneUsuarioLogado, usuario]);

  useEffect(() => {
    if (!selectedPreacherUserId) return;
    const selected = preachersMap.get(selectedPreacherUserId);
    if (!selected) return;
    setValue("preacherUserId", selectedPreacherUserId, { shouldValidate: false });
    setValue("pregadorNome", String(selected.full_name || ""), { shouldValidate: true });
    setValue("telefone", String(selected.phone || ""), { shouldValidate: true });
    setUsuarioEmail(String(selected.email || ""));
    setUsuarioMinisterial(String(selected.minister_role || "Obreiro"));
  }, [preachersMap, selectedPreacherUserId, setValue]);

  useEffect(() => {
    if (!allowedOriginChurches.length) return;
    const currentTotvs = String(igrejaOrigem?.codigoTotvs || "").trim();
    const exists = allowedOriginChurches.some((c) => String(c.codigoTotvs || "").trim() === currentTotvs);
    if (exists) return;

    const fallback = allowedOriginChurches[0];
    setIgrejaOrigem(fallback);
    setValue("origemId", fallback.id, { shouldValidate: true });
  }, [allowedOriginChurches, igrejaOrigem?.codigoTotvs, setValue]);

  useEffect(() => {
    if (!igrejaDestino) return;
    const exists = allowedDestinationChurches.some((c) => String(c.codigoTotvs || "") === String(igrejaDestino.codigoTotvs || ""));
    if (exists) return;
    setIgrejaDestino(undefined);
    setValue("destinoId", undefined as unknown as number, { shouldValidate: true });
  }, [allowedDestinationChurches, igrejaDestino, setValue]);

  const onSubmit = async (values: FormData) => {
    if (!preachPeriod) {
      toast.error("Selecione o horário da pregação: Manhã, Tarde ou Noite.");
      return;
    }

    if (values.dataPregacao < todayIso) {
      toast.error("A data de pregação deve ser hoje ou no futuro.");
      return;
    }

    const origemText = igrejaOrigem
      ? igrejaOrigem.codigoTotvs
        ? `${igrejaOrigem.codigoTotvs} - ${igrejaOrigem.nome}`
        : igrejaOrigem.nome
      : (usuario?.igreja_nome ?? "");

    const destinoManual = destinoOutros.trim();
    if (!igrejaDestino && !(allowDestinoOutros && destinoManual.length >= 3)) {
      toast.error("Selecione a igreja de destino ou informe em Outros.");
      return;
    }

    const destinoText = igrejaDestino
      ? `${igrejaDestino.codigoTotvs} - ${igrejaDestino.nome}`
      : destinoManual;

    try {
      setSavingLetter(true);
      const selectedPreacher = selectedPreacherUserId ? preachersMap.get(selectedPreacherUserId) : undefined;

      const result = (await createLetterByPastor({
        church_totvs_id: String(igrejaOrigem?.codigoTotvs || (usuario as LegacyUsuarioExtra | null)?.totvs || (usuario as LegacyUsuarioExtra | null)?.default_totvs_id || ""),
        preacher_name: values.pregadorNome,
        preacher_user_id: selectedPreacherUserId || undefined,
        minister_role: usuarioMinisterial || selectedPreacher?.minister_role || (usuario as LegacyUsuarioExtra | null)?.ministerial || "Obreiro",
        preach_date: values.dataPregacao,
        preach_period: preachPeriod as "MANHA" | "TARDE" | "NOITE",
        church_origin: origemText,
        church_destination: destinoText,
        phone: (values.telefone || "").replace(/\D/g, ""),
        email: usuarioEmail || selectedPreacher?.email || (usuario as LegacyUsuarioExtra | null)?.email || null,
      })) as CreateLetterResult;

      const directReleaseEnabled = Boolean((usuario as LegacyUsuarioExtra & { can_create_released_letter?: boolean } | null)?.can_create_released_letter);
      const isObreiro = String(usuario?.role || "").toLowerCase() === "obreiro";
      const createdLetterId = String(result?.letter?.id || "");
      if (isObreiro && directReleaseEnabled && createdLetterId) {
        try {
          await setLetterStatus(createdLetterId, "LIBERADA");
        } catch {
          // Comentario: nao bloqueia o fluxo da carta quando falhar liberacao automatica.
        }
      }

      if (result?.n8n?.ok === false) {
        toast.warning("Carta criada, mas houve falha ao enviar para geração do PDF.");
      } else {
        toast.success("Carta criada e enviada para geração do PDF.");
      }

      nav(dashboardRoute);
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setSavingLetter(false);
    }
  };

  const handleClear = () => {
    // Comentario: limpa somente o formulario, sem encerrar sessao do usuario.
    setIgrejaDestino(undefined);
    reset({
      pregadorNome: usuario?.nome || "",
      telefone: telefoneUsuarioLogado || "",
      dataPregacao: "",
      dataEmissao: todayIso,
      origemId: igrejaOrigem?.id || (undefined as unknown as number),
      destinoId: undefined as unknown as number,
      preacherUserId: String(usuario?.id || ""),
      destinoOutros: "",
    });
    setSelectedPreacherUserId(String(usuario?.id || ""));
    setDestinoOutros("");
    setPreachPeriod("");
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc]">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 md:text-3xl">Sistema de Gestão Eclesiástica</h1>
              <p className="text-sm text-slate-600">Emissão de carta de pregação</p>
            </div>
            <Button
              variant="outline"
              className="h-8 border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 md:h-10 md:px-4 md:text-sm"
              onClick={() => nav(dashboardRoute)}
            >
              Voltar ao Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl text-slate-900">
                <FileText className="h-6 w-6 text-blue-600" />
                Registro de Carta de Pregação
              </CardTitle>
              <CardDescription className="text-slate-600">
                Preencha os dados para emissão da carta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="pregador-select" className="text-sm font-medium text-slate-800">
                    Nome do pregador
                  </Label>
                  <Input
                    id="pregador-busca"
                    type="text"
                    value={pregadorBusca}
                    onChange={(e) => setPregadorBusca(e.target.value)}
                    placeholder="Buscar pregador por nome, CPF ou cargo..."
                    className="h-11 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500"
                  />
                  <Select
                    value={selectedPreacherUserId}
                    onValueChange={(value) => setSelectedPreacherUserId(value)}
                  >
                    <SelectTrigger id="pregador-select" className="h-11 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Selecione o pregador" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPreacherOptions.map((member) => (
                        <SelectItem key={String(member.id)} value={String(member.id)}>
                          {member.full_name} {member.minister_role ? `(${member.minister_role})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pregadorBusca && filteredPreacherOptions.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum pregador encontrado para o filtro informado.</p>
                  ) : null}
                  <input type="hidden" {...register("pregadorNome")} />
                  <input type="hidden" {...register("preacherUserId")} />
                  {errors.pregadorNome && <p className="text-xs text-destructive">{errors.pregadorNome.message as string}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone" className="text-sm font-medium text-slate-800">
                    Telefone
                  </Label>
                  <Input
                    id="telefone"
                    type="tel"
                    placeholder="Digite o telefone"
                    {...register("telefone")}
                    disabled={Boolean(telefoneUsuarioLogado)}
                    className="h-11 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                  {errors.telefone && <p className="text-xs text-destructive">{errors.telefone.message as string}</p>}
                </div>

                <ChurchSearch
                  label="Igreja que faz a carta (origem)"
                  placeholder="Buscar por nome ou código TOTVS"
                  churches={allowedOriginChurches}
                  minChars={3}
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

                <ChurchSearch
                  label="Igreja que vai pregar (destino)"
                  placeholder="Buscar por nome ou código TOTVS"
                  churches={allowedDestinationChurches}
                  minChars={3}
                  onSelect={(c) => {
                    setIgrejaDestino(c);
                    setValue("destinoId", c.id, { shouldValidate: true });
                    setDestinoOutros("");
                    setValue("destinoOutros", "", { shouldValidate: false });
                  }}
                  value={igrejaDestino ? `${igrejaDestino.codigoTotvs} - ${igrejaDestino.nome}` : ""}
                  disabled={disableByPhone || (allowDestinoOutros && Boolean(destinoOutros.trim()))}
                  onDisabledClickMessage="Digite seu telefone"
                  inputId="church-destino"
                />
                {allowDestinoOutros ? (
                  <div className="space-y-2">
                    <Label htmlFor="destinoOutros" className="text-sm font-medium text-slate-800">Outros (se não estiver no banco)</Label>
                    <Input
                      id="destinoOutros"
                      type="text"
                      value={destinoOutros}
                      onChange={(e) => {
                        setDestinoOutros(e.target.value);
                        setValue("destinoOutros", e.target.value, { shouldValidate: false });
                        if (e.target.value.trim()) {
                          setIgrejaDestino(undefined);
                          setValue("destinoId", undefined as unknown as number, { shouldValidate: false });
                        }
                      }}
                      placeholder="Ex.: 99999 - Igreja não cadastrada"
                      disabled={Boolean(igrejaDestino)}
                      className="h-11 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                ) : null}
                {errors.destinoId && <p className="text-xs text-destructive">Selecione a igreja de destino.</p>}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataPregacao" className="text-sm font-medium text-slate-800">
                      Data da pregação
                    </Label>
                    <div className="flex gap-2">
                      {(() => {
                        const { name, ref, onBlur } = register("dataPregacao");
                        return (
                          <Input
                            id="dataPregacao"
                            type="date"
                            name={name}
                            ref={ref}
                            onBlur={onBlur}
                            value={watch("dataPregacao") || ""}
                            min={todayIso}
                            onChange={(e) => setValue("dataPregacao", e.target.value, { shouldValidate: true })}
                            onFocus={(e) => { if (disableByPhone) { toast.info("Digite seu telefone"); e.currentTarget.blur(); } }}
                            className="h-11 flex-1 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500"
                            required
                          />
                        );
                      })()}
                      <Popover
                        open={isPregacaoCalOpen}
                        onOpenChange={(open) => {
                          if (disableByPhone) {
                            setIsPregacaoCalOpen(false);
                            return;
                          }
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
                              const pickedIso = format(d, "yyyy-MM-dd");
                              if (pickedIso < todayIso) {
                                toast.error("Selecione uma data de hoje em diante.");
                                return;
                              }
                              setValue("dataPregacao", pickedIso, { shouldValidate: true });
                              setIsPregacaoCalOpen(false);
                            }}
                            disabled={(date) => {
                              const current = format(date, "yyyy-MM-dd");
                              return current < todayIso;
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {errors.dataPregacao && <p className="text-xs text-destructive">{errors.dataPregacao.message as string}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dataEmissao" className="text-sm font-medium text-slate-800">
                      Data de emissão da carta
                    </Label>
                    {(() => {
                      const { name, ref } = register("dataEmissao");
                      return (
                        <Input
                          id="dataEmissao"
                          type="date"
                          name={name}
                          ref={ref}
                          value={watch("dataEmissao") || todayIso}
                          disabled
                          className="h-11 rounded-xl border-slate-300 bg-slate-100 transition-colors"
                          required
                        />
                      );
                    })()}
                    {errors.dataEmissao && <p className="text-xs text-destructive">{errors.dataEmissao.message as string}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-800">Horário da pregação</Label>
                    <Select value={preachPeriod} onValueChange={(v) => setPreachPeriod(v as PreachPeriod)}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500">
                      <SelectValue placeholder="Selecione o horário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANHA">Manhã</SelectItem>
                      <SelectItem value="TARDE">Tarde</SelectItem>
                      <SelectItem value="NOITE">Noite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={savingLetter}
                    className="flex-1 bg-blue-600 font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg"
                  >
                    {savingLetter ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    {savingLetter ? "Preenchendo carta..." : "Registrar Carta de Pregação"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClear}
                    disabled={savingLetter}
                    className="border-slate-300 text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Limpar formulário
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="h-fit xl:sticky xl:top-6">
            <LetterPreview
              pregadorNome={watch("pregadorNome")}
              igrejaOrigem={igrejaOrigem}
              igrejaDestino={igrejaDestino || (destinoOutros.trim() ? { id: 0, codigoTotvs: "", nome: destinoOutros.trim(), cidade: "", uf: "", carimboIgreja: "", carimboPastor: "" } : undefined)}
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

      {savingLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white px-6 py-5 shadow-xl flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm font-medium text-slate-800">Carta sendo preenchida e enviada...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
