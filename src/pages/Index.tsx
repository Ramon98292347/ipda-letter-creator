﻿﻿﻿import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChurchSearch, Church } from "@/components/ChurchSearch";
import { LetterPreview } from "@/components/LetterPreview";
import { FileText, RotateCcw, Send, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createLetterByPastor, getPastorByTotvsPublic, listChurchesInScope, listMembers, searchChurchesPublic, type UserListItem } from "@/services/saasService";
import { format, parse } from "date-fns";
import { useUser } from "@/context/UserContext";
import { useNavigate, useLocation } from "react-router-dom";
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
  warning?: { code?: string; detail?: string } | null;
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
  const [savingLetter, setSavingLetter] = useState(false);
  const [pregadorBusca, setPregadorBusca] = useState("");
  const [destinoSearch, setDestinoSearch] = useState("");
  // Debounce da busca do campo Outros: so dispara apos 300ms sem digitar
  const [outrosDebounced, setOutrosDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setOutrosDebounced(destinoOutros), 300);
    return () => clearTimeout(timer);
  }, [destinoOutros]);

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

  // Funcao auxiliar: converte registro da API para o tipo Church do formulario
  const apiToChurch = (c: { totvs_id?: string | null; church_name?: string | null; address_city?: string | null; address_state?: string | null; stamp_church_url?: string | null; church_class?: string | null; parent_totvs_id?: string | null }, idx: number): Church => ({
    id: Number(c.totvs_id) || idx + 1,
    codigoTotvs: String(c.totvs_id || ""),
    nome: String(c.church_name || ""),
    cidade: String(c.address_city || ""),
    uf: String(c.address_state || ""),
    carimboIgreja: String(c.stamp_church_url || ""),
    carimboPastor: "",
    classificacao: String(c.church_class || ""),
    parentTotvsId: String(c.parent_totvs_id || "") || undefined,
  });

  // Escopo proprio: guardamos os dados brutos para ter acesso ao pastor_user_id de cada igreja
  const { data: rawOwnChurches = [] } = useQuery({
    queryKey: ["churches-letter-form-own", activeTotvsForPastor],
    queryFn: () => listChurchesInScope(1, 1000, activeTotvsForPastor || undefined),
    enabled: role === "admin" || Boolean(activeTotvsForPastor),
    staleTime: 60_000,
    refetchInterval: 10000,
  });
  // Converte para o tipo Church usado nos selects do formulario
  const churches = useMemo(() => rawOwnChurches.map(apiToChurch), [rawOwnChurches]);

  // Igreja propria do usuario logado (para calcular o pai)
  const activeChurch = useMemo(
    () => churches.find((c) => c.codigoTotvs === activeTotvsForPastor) || (churches[0] ?? null),
    [churches, activeTotvsForPastor],
  );
  const parentTotvsId = String(activeChurch?.parentTotvsId || "").trim();

  // Escopo da mae: guardamos os dados brutos para ter acesso ao pastor_user_id
  const { data: rawParentChurches = [] } = useQuery({
    queryKey: ["churches-letter-form-parent", parentTotvsId],
    queryFn: () => listChurchesInScope(1, 1000, parentTotvsId || undefined),
    enabled: (role === "admin" || Boolean(activeTotvsForPastor)) && Boolean(parentTotvsId),
    staleTime: 60_000,
    refetchInterval: 10000,
  });
  const parentScopeChurches = useMemo(() => rawParentChurches.map(apiToChurch), [rawParentChurches]);

  // Mapa totvs_id -> pastor_user_id montado a partir dos dados brutos ja carregados
  const pastorUserIdByTotvs = useMemo(() => {
    const map: Record<string, string> = {};
    [...rawOwnChurches, ...rawParentChurches].forEach((c) => {
      const pid = String(c.pastor_user_id || "").trim();
      if (pid) map[String(c.totvs_id || "")] = pid;
    });
    return map;
  }, [rawOwnChurches, rawParentChurches]);

  // Busca dinamica no campo Outros usando a edge function search-churches-public
  const { data: outrosSuggestions = [] } = useQuery({
    queryKey: ["churches-outros-search", outrosDebounced],
    queryFn: () => searchChurchesPublic(outrosDebounced, 8),
    enabled: outrosDebounced.trim().length >= 2,
    staleTime: 30_000,
    refetchInterval: 10000,
  });

  // Fonte de igrejas para o campo destino: escopo da mae (se carregado) ou escopo proprio
  const destinationSourceChurches = useMemo(
    () => (parentScopeChurches.length ? parentScopeChurches : churches),
    [parentScopeChurches, churches],
  );

  // Sets para detectar se o destino esta fora do escopo proprio
  const ownScopeSet = useMemo(
    () => new Set(churches.map((c) => c.codigoTotvs).filter(Boolean)),
    [churches],
  );
  const parentScopeSet = useMemo(
    () => new Set(destinationSourceChurches.map((c) => c.codigoTotvs).filter(Boolean)),
    [destinationSourceChurches],
  );

  // Igreja mae do usuario logado
  const parentChurch = useMemo(
    () => (parentTotvsId ? destinationSourceChurches.find((c) => c.codigoTotvs === parentTotvsId) || null : null),
    [destinationSourceChurches, parentTotvsId],
  );
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
    refetchInterval: 10000,
  });
  const origemTotvsSelecionada = String(igrejaOrigem?.codigoTotvs || activeTotvsForPastor || "").trim();

  // 1. Tenta achar o pastor_user_id da igreja origem nos dados brutos ja carregados
  const pastorUserIdDaOrigem = pastorUserIdByTotvs[origemTotvsSelecionada] || "";

  // 2. Busca o pastor em preachersInScope pelo ID (prioridade maxima)
  const pastorPorId = useMemo(
    () => (pastorUserIdDaOrigem ? preachersInScope.find((m) => m.id === pastorUserIdDaOrigem) || null : null),
    [pastorUserIdDaOrigem, preachersInScope],
  );

  // 3. Fallback: busca por role "pastor" e totvs na lista de membros do escopo
  const pastorPorTotvs = useMemo(
    () =>
      preachersInScope.find(
        (m) =>
          String(m.role || "").toLowerCase() === "pastor" &&
          String(m.default_totvs_id || "") === origemTotvsSelecionada,
      ) || null,
    [origemTotvsSelecionada, preachersInScope],
  );

  // 4. Fallback final: busca via Supabase (caso o pastor nao esteja no escopo carregado)
  const { data: pastorResponsavelData } = useQuery({
    queryKey: ["pastor-responsavel-carta", origemTotvsSelecionada],
    queryFn: () => getPastorByTotvsPublic(origemTotvsSelecionada),
    // So chama se nao achou nos dados locais
    enabled: Boolean(origemTotvsSelecionada) && !pastorPorId && !pastorPorTotvs,
    refetchInterval: 10000,
  });

  const pastorResponsavel = String(
    pastorPorId?.full_name || pastorPorTotvs?.full_name || pastorResponsavelData?.full_name || "",
  );
  const telefonePastorResponsavel = String(
    pastorPorId?.phone || pastorPorTotvs?.phone || pastorResponsavelData?.phone || "",
  );

  // Origens permitidas: apenas [propria, mae] — igual ao sistema de cartas
  const allowedOriginChurches = useMemo(() => {
    const list: Church[] = [];
    if (activeChurch) list.push(activeChurch);
    if (parentChurch && parentChurch.codigoTotvs !== activeChurch?.codigoTotvs) list.push(parentChurch);
    return list.length ? list : churches.slice(0, 3);
  }, [activeChurch, parentChurch, churches]);

  // Destino esta fora do escopo proprio mas dentro do escopo da mae → ajusta origem para a mae
  const shouldUseParentOrigin = useMemo(() => {
    if (!igrejaDestino || !parentChurch || !activeChurch) return false;
    const d = String(igrejaDestino.codigoTotvs || "");
    return parentScopeSet.has(d) && !ownScopeSet.has(d);
  }, [igrejaDestino, parentChurch, activeChurch, parentScopeSet, ownScopeSet]);

  // Para campo Outros: qualquer texto digitado la → origem vai para a mae mais alta
  const shouldUseParentOriginForOthers = Boolean(destinoOutros.trim() && parentChurch);

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

  // Sugestoes para o campo de busca do destino (escopo da mae)
  const filteredDestinoOptions = useMemo(() => {
    const q = destinoSearch.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (q.length < 2) return [];
    return destinationSourceChurches
      .filter((c: Church) => {
        const hay = `${c.codigoTotvs} ${c.nome} ${c.classificacao || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [destinoSearch, destinationSourceChurches]);

  // Sugestoes para o campo Outros — usa o proprio valor digitado para buscar
  // Converte resultados da edge function para o formato Church usado no JSX
  const filteredOutrosOptions = useMemo(
    () =>
      outrosSuggestions.map((c) => ({
        id: 0,
        codigoTotvs: c.totvs_id,
        nome: c.church_name,
        classificacao: c.class,
      } as Church)),
    [outrosSuggestions],
  );

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

  // Ajuste automatico de origem: se destino esta fora do escopo proprio → usa a mae
  useEffect(() => {
    if (shouldUseParentOrigin || shouldUseParentOriginForOthers) {
      const parent = parentChurch;
      if (parent && igrejaOrigem?.codigoTotvs !== parent.codigoTotvs) {
        setIgrejaOrigem(parent);
        setValue("origemId", parent.id, { shouldValidate: true });
      }
    } else if (activeChurch && !allowedOriginChurches.some((c) => c.codigoTotvs === igrejaOrigem?.codigoTotvs)) {
      // Volta para a propria quando o destino volta ao escopo proprio
      setIgrejaOrigem(activeChurch);
      setValue("origemId", activeChurch.id, { shouldValidate: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldUseParentOrigin, shouldUseParentOriginForOthers]);

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
    if (!igrejaDestino && destinoManual.length < 3) {
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
        destination_totvs_id: igrejaDestino?.codigoTotvs || undefined,
        manual_destination: !igrejaDestino && Boolean(destinoManual),
        phone: (values.telefone || "").replace(/\D/g, ""),
        email: usuarioEmail || selectedPreacher?.email || (usuario as LegacyUsuarioExtra | null)?.email || null,
        // Pastor da igreja de origem — sempre é o pastor da igreja selecionada como origem
        pastor_name: pastorResponsavel || undefined,
        pastor_phone: telefonePastorResponsavel || undefined,
      })) as CreateLetterResult;

      if (result?.warning?.detail) {
        toast.warning(result.warning.detail, { duration: 9000 });
      }

      if (Boolean((result as Record<string, unknown>)?.queued)) {
        toast.success("Sem internet. Carta salva na fila e será enviada automaticamente.");
      } else if (result?.n8n?.ok === false) {
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
    setDestinoSearch("");
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
                  minChars={1}
                  onSelect={(c) => {
                    setIgrejaOrigem(c);
                    setValue("origemId", c.id, { shouldValidate: true });
                  }}
                  value={igrejaOrigem ? (igrejaOrigem.codigoTotvs ? `${igrejaOrigem.codigoTotvs} - ${igrejaOrigem.nome}` : igrejaOrigem.nome) : (usuario?.igreja_nome ?? "")}
                  disabled={disableByPhone}
                  onDisabledClickMessage="Digite seu telefone"
                  inputId="church-origem"
                />
                {/* Aviso quando a origem foi ajustada automaticamente para a mae */}
                {(shouldUseParentOrigin || shouldUseParentOriginForOthers) && parentChurch && (
                  <p className="text-xs text-amber-700">
                    Destino fora do seu escopo. A origem foi ajustada para a mãe: {parentChurch.codigoTotvs} - {parentChurch.nome}.
                  </p>
                )}
                {errors.origemId && <p className="text-xs text-destructive">Selecione a igreja de origem</p>}

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-800">Igreja que vai pregar (destino)</Label>
                  {/* Seletor rapido — traz todas as igrejas do escopo da mae */}
                  <Select
                    value={igrejaDestino ? `${igrejaDestino.codigoTotvs} - ${igrejaDestino.nome}` : ""}
                    onValueChange={(value) => {
                      const found = destinationSourceChurches.find(
                        (c: Church) => `${c.codigoTotvs} - ${c.nome}` === value,
                      );
                      if (found) {
                        setIgrejaDestino(found);
                        setValue("destinoId", found.id, { shouldValidate: true });
                        setDestinoOutros("");
                        setValue("destinoOutros", "", { shouldValidate: false });
                        setDestinoSearch(`${found.codigoTotvs} - ${found.nome}`);
                      }
                    }}
                    disabled={Boolean(destinoOutros.trim())}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-slate-50">
                      <SelectValue placeholder="Selecione uma igreja do seu escopo" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationSourceChurches.map((c: Church) => {
                        const val = `${c.codigoTotvs} - ${c.nome}`;
                        return (
                          <SelectItem key={c.codigoTotvs || String(c.id)} value={val}>
                            {val} {c.classificacao ? `(${c.classificacao})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {/* Busca por texto no escopo da mae */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={destinoSearch}
                      onChange={(e) => {
                        setDestinoSearch(e.target.value);
                        if (!e.target.value.trim()) {
                          setIgrejaDestino(undefined);
                          setValue("destinoId", undefined as unknown as number, { shouldValidate: false });
                        }
                      }}
                      placeholder="Digite o TOTVS ou nome da igreja destino"
                      disabled={Boolean(destinoOutros.trim())}
                      className="h-11 pl-10 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  {filteredDestinoOptions.length > 0 && !destinoOutros.trim() && (
                    <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {filteredDestinoOptions.map((c: Church) => (
                        <button
                          key={c.codigoTotvs || String(c.id)}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                          onClick={() => {
                            setIgrejaDestino(c);
                            setValue("destinoId", c.id, { shouldValidate: true });
                            setDestinoOutros("");
                            setValue("destinoOutros", "", { shouldValidate: false });
                            setDestinoSearch(`${c.codigoTotvs} - ${c.nome}`);
                          }}
                        >
                          <span className="font-medium text-slate-900">{c.codigoTotvs} - {c.nome}</span>
                          <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">{c.classificacao}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Se escolher uma igreja do escopo no seletor, a origem volta para a igreja do seu papel logado. Se digitar um destino fora do escopo, a origem sobe para a igreja mãe.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destinoOutros" className="text-sm font-medium text-slate-800">Outros (se não encontrar na lista)</Label>
                  {/* Campo unico: digitar busca automaticamente, ao sair formata o valor */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                          setDestinoSearch("");
                        }
                      }}
                      onBlur={(e) => {
                        // Formata "9530 campo grande" -> "9530 - CAMPO GRANDE"
                        const raw = e.target.value.trim();
                        if (!raw) return;
                        const match = raw.match(/^(\d{1,10})\s*[-)\s]?\s*(.+)$/);
                        const formatted = match
                          ? `${match[1].trim()} - ${match[2].trim().replace(/\s+/g, " ").toUpperCase()}`
                          : raw.toUpperCase();
                        setDestinoOutros(formatted);
                        setValue("destinoOutros", formatted, { shouldValidate: false });
                      }}
                      placeholder="Ex.: 9530 campo grande → 9530 - CAMPO GRANDE"
                      disabled={Boolean(igrejaDestino) || Boolean(destinoSearch.trim())}
                      className="h-11 pl-10 rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  {/* Sugestoes do campo Outros (busca em todas as igrejas do banco) */}
                  {filteredOutrosOptions.length > 0 && !igrejaDestino && !destinoSearch.trim() && (
                    <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {filteredOutrosOptions.map((c: Church) => (
                        <button
                          key={c.codigoTotvs || String(c.id)}
                          type="button"
                          className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                          onClick={() => {
                            const label = `${c.codigoTotvs} - ${c.nome}`;
                            setDestinoOutros(label);
                            setValue("destinoOutros", label, { shouldValidate: false });
                            setIgrejaDestino(undefined);
                            setValue("destinoId", undefined as unknown as number, { shouldValidate: false });
                            setDestinoSearch("");
                          }}
                        >
                          <span className="font-medium text-slate-900">{c.codigoTotvs} - {c.nome}</span>
                          <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">{c.classificacao}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Modelo: <span className="font-medium">9901 - PIUMA-NITEROI</span>. Use este campo apenas se a igreja não estiver na lista acima.
                  </p>
                </div>
                {errors.destinoId && <p className="text-xs text-destructive">Selecione a igreja de destino.</p>}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataPregacao" className="text-sm font-medium text-slate-800">
                      Data da pregação
                    </Label>
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
                            className="h-11 w-full rounded-xl border-slate-300 bg-slate-50 transition-colors focus:border-blue-500 focus:ring-blue-500"
                            required
                          />
                        );
                      })()}
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
