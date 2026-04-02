import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ManagementShell } from "@/components/layout/ManagementShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bus, Check, Trash2, Loader2, Users, Map, Calendar, QrCode, Copy, ExternalLink, Plus, Edit, Building2, Phone, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useUser } from "@/context/UserContext";
import { NovaCaravanaForm } from "@/components/shared/NovaCaravanaForm";
import {
  listCaravanas,
  confirmCaravana,
  deleteCaravana,
  type CaravanaItem,
} from "@/services/saasService";
import { post } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function CaravanasPage() {
  const { usuario, session } = useUser();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todas" | "Recebida" | "Confirmada">("todas");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [openNewCaravana, setOpenNewCaravana] = useState(false);
  const [openScheduleEvent, setOpenScheduleEvent] = useState(false);
  const [eventMode, setEventMode] = useState<"select" | "create">("select");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [filterPastor, setFilterPastor] = useState("");
  const [filterDate, setFilterDate] = useState("");

  type EventRow = {
    id: string;
    title?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  };

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events", session?.totvs_id],
    queryFn: async () => {
      const res = await post<any>("announcements-api", {
        action: "list-events",
        church_code: session?.totvs_id || null
      });
      return (res?.events || []) as EventRow[];
    },
    enabled: !!session?.totvs_id,
  });

  const isAdmin = usuario?.role === "admin";
  const roleMode = (usuario?.role || "admin") as "admin" | "pastor" | "secretario";

  const { data: caravanas = [], isLoading } = useQuery({
    queryKey: ["caravanas", filterStatus, searchTerm],
    queryFn: async () => {
      const result = await listCaravanas({
        status: filterStatus === "todas" ? undefined : filterStatus,
        search: searchTerm || undefined,
      });
      return result;
    },
    refetchInterval: 30000,
  });

  const filteredCaravanas = useMemo(() => {
    let list = caravanas;
    if (filterPastor) {
      const p = filterPastor.toLowerCase();
      list = list.filter(c => c.pastor_name?.toLowerCase().includes(p));
    }
    if (filterDate) {
      // filterDate must match created_at date
      list = list.filter(c => {
        if (!c.created_at) return false;
        const d = new Date(c.created_at);
        const iso = d.toISOString().split("T")[0]; // yyyy-mm-dd
        return iso === filterDate;
      });
    }
    return list;
  }, [caravanas, filterPastor, filterDate]);

  const recebidas = useMemo(() => {
    return filteredCaravanas.filter((c) => c.status === "Recebida");
  }, [filteredCaravanas]);

  const confirmadas = useMemo(() => {
    return filteredCaravanas.filter((c) => c.status === "Confirmada");
  }, [filteredCaravanas]);

  const totalIgrejas = useMemo(() => new Set(caravanas.map(c => c.church_name)).size, [caravanas]);
  const totalPastores = useMemo(() => new Set(caravanas.map(c => c.pastor_name).filter(Boolean)).size, [caravanas]);
  const ultimaAtualizacao = useMemo(() => {
    if (caravanas.length === 0) return "-";
    const dates = caravanas.map(c => new Date(c.created_at || 0).getTime());
    const max = Math.max(...dates);
    return new Date(max).toLocaleDateString("pt-BR");
  }, [caravanas]);

  // Real-time subscription para atualizações da tabela caravanas
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("public:caravanas")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "caravanas",
        },
        () => {
          // Invalida a query para buscar dados atualizados
          queryClient.invalidateQueries({ queryKey: ["caravanas"] });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [queryClient]);

  const handleConfirm = async (caravan: CaravanaItem) => {
    setLoadingId(caravan.id);
    try {
      const result = await confirmCaravana(caravan.id);
      if (result?.ok) {
        toast.success("Caravana confirmada!");
        queryClient.invalidateQueries({ queryKey: ["caravanas"] });
      } else {
        toast.error("Erro ao confirmar caravana");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao confirmar caravana");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setLoadingId(id);
    try {
      const result = await deleteCaravana(id);
      if (result?.ok) {
        toast.success("Caravana deletada!");
        queryClient.invalidateQueries({ queryKey: ["caravanas"] });
      } else {
        toast.error("Erro ao deletar caravana");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao deletar caravana");
    } finally {
      setLoadingId(null);
    }
  };

  const handleCreateEvent = async () => {
    if (!eventTitle.trim()) {
      toast.error("Informe o título do evento");
      return;
    }

    setIsCreatingEvent(true);
    try {
      const res = await post<any>("announcements-api", {
        action: "upsert-event",
        title: eventTitle,
        starts_at: eventStartDate || null,
        ends_at: eventEndDate || null,
        is_active: true,
        church_code: session?.totvs_id || null,
      });

      if (res?.ok && res?.event) {
        toast.success("Evento criado com sucesso!");
        setSelectedEvent(res.event);
        setEventMode("select");
        queryClient.invalidateQueries({ queryKey: ["events", session?.totvs_id] });
        // Reset form
        setEventTitle("");
        setEventStartDate("");
        setEventEndDate("");
      } else {
        toast.error("Erro ao criar evento");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao criar evento");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const handleScheduleEvent = (event: EventRow) => {
    setSelectedEvent(event);
    const eventLink = `${window.location.origin}/caravanas/evento/${event.id}`;
    window.open(eventLink, "_blank");
    setOpenScheduleEvent(false);
  };

  return (
    <ManagementShell roleMode={roleMode}>
      <div className="space-y-6">
        {/* Header no novo estilo */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold" style={{ color: "#2e384d" }}>Gerenciamento de Caravanas</h1>
            <p className="text-sm text-slate-500">
              {isAdmin
                ? "Visualize e gerencie todas as caravanas cadastradas"
                : "Visualize e gerencie as caravanas da sua jurisdição"}
            </p>
          </div>
          <div className="flex gap-2">
            {/* Botão de agendamento restaurado para todos */}
            <Button onClick={() => setOpenScheduleEvent(true)} variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm">
              <Calendar className="h-4 w-4 mr-2" />
              Agendar Evento
            </Button>
            <Button onClick={() => setOpenNewCaravana(true)} className="hover:bg-[#1a237e]/90 shadow-sm transition-colors" style={{ backgroundColor: "#1e3a8a", color: "white" }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Caravana
            </Button>
          </div>
        </div>

        {/* 4 Cards Superiores (Resumo) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="rounded-xl border-0 bg-gradient-to-br from-blue-500 to-blue-700 shadow-md flex flex-col justify-between p-4">
            <div className="flex items-center text-white/90 text-sm font-medium mb-3">
              <Bus className="h-4 w-4 mr-2" /> Total de Caravanas
            </div>
            <div className="text-3xl font-bold text-white">{caravanas.length}</div>
          </Card>
          <Card className="rounded-xl border-0 bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md flex flex-col justify-between p-4">
            <div className="flex items-center text-white/90 text-sm font-medium mb-3">
              <Building2 className="h-4 w-4 mr-2" /> Igrejas Diferentes
            </div>
            <div className="text-3xl font-bold text-white">{totalIgrejas}</div>
          </Card>
          <Card className="rounded-xl border-0 bg-gradient-to-br from-purple-500 to-purple-700 shadow-md flex flex-col justify-between p-4">
            <div className="flex items-center text-white/90 text-sm font-medium mb-3">
              <Users className="h-4 w-4 mr-2" /> Pastores
            </div>
            <div className="text-3xl font-bold text-white">{totalPastores}</div>
          </Card>
          <Card className="rounded-xl border-0 bg-gradient-to-br from-amber-400 to-amber-600 shadow-md flex flex-col justify-between p-4">
            <div className="flex items-center text-white/90 text-sm font-medium mb-3">
              <Calendar className="h-4 w-4 mr-2" /> Última Atualização
            </div>
            <div className="text-2xl font-bold text-white">{ultimaAtualizacao}</div>
          </Card>
        </div>

        {/* Linha de Filtros */}
        <div className="flex flex-col md:flex-row items-center gap-3 w-full">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por igreja, pastor ou líder..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full shadow-sm bg-white border-slate-200"
            />
          </div>
          <div className="w-full md:w-auto min-w-[140px]">
             <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
               <SelectTrigger className="shadow-sm bg-white border-slate-200">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="todas">Todas</SelectItem>
                 <SelectItem value="Recebida">Recebidas</SelectItem>
                 <SelectItem value="Confirmada">Confirmadas</SelectItem>
               </SelectContent>
             </Select>
          </div>
          <div className="relative w-full md:w-auto min-w-[200px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Filtrar por pastor..."
              value={filterPastor}
              onChange={(e) => setFilterPastor(e.target.value)}
              className="pl-9 shadow-sm bg-white border-slate-200 w-full"
            />
          </div>
          <div className="w-full md:w-auto">
             <Input
               type="date"
               value={filterDate}
               onChange={(e) => setFilterDate(e.target.value)}
               className="shadow-sm bg-white border-slate-200 w-full"
             />
          </div>
        </div>

        <div className="text-sm text-slate-500 font-medium">
          {filteredCaravanas.length} de {caravanas.length} caravanas encontradas
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
             <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-10">
            {/* Seção Recebidas */}
            {recebidas.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-slate-700 mb-4 tracking-tight">Recebidas</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recebidas.map((caravan) => (
                    <div
                      key={caravan.id}
                      className="border border-slate-200 bg-white shadow-sm hover:shadow relative transition-shadow rounded-xl p-5"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-slate-100 p-2.5 rounded-lg text-slate-600">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 uppercase tracking-wide text-sm">{caravan.church_name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{caravan.city_state || "Local não info."}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <Badge className="bg-amber-100/50 text-amber-700 hover:bg-amber-100/80 font-medium border border-amber-200/50 px-2.5 shadow-none transition-colors">
                              Pendente
                            </Badge>
                            <div className="flex items-center">
                              {isAdmin && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-700 hover:bg-red-50 -mr-1">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Deletar caravana?</AlertDialogTitle></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(caravan.id)} className="bg-red-600">Deletar</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                        </div>
                      </div>

                      <div className="space-y-2.5 text-sm text-slate-600 mb-5">
                        <div className="flex items-center"><Users className="h-4 w-4 mr-2.5 text-slate-400" /> <span className="font-medium mr-1">Pastor:</span> {caravan.pastor_name}</div>
                        <div className="flex items-center"><Bus className="h-4 w-4 mr-2.5 text-slate-400" /> <span className="font-medium mr-1">Placa:</span> {caravan.vehicle_plate}</div>
                        <div className="flex items-center"><Users className="h-4 w-4 mr-2.5 text-slate-400" /> <span className="font-medium mr-1">Líder:</span> {caravan.leader_name}</div>
                        <div className="flex items-center"><Phone className="h-4 w-4 mr-2.5 text-slate-400" /> {caravan.leader_whatsapp}</div>
                      </div>

                      <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between">
                         <div className="flex items-center text-xs font-medium text-slate-400">
                           <Calendar className="h-3.5 w-3.5 mr-1.5" />
                           {caravan.created_at ? new Date(caravan.created_at).toLocaleDateString("pt-BR") : "-"}
                         </div>
                         <Button
                           size="sm"
                           onClick={() => handleConfirm(caravan)}
                           disabled={loadingId === caravan.id}
                           className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3 shadow-none transition-colors"
                         >
                           {loadingId === caravan.id ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Check className="h-3 w-3 mr-1.5" />}
                           Confirmar
                         </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seção Confirmadas */}
            {confirmadas.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-slate-700 mb-4 tracking-tight">Confirmadas</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {confirmadas.map((caravan) => (
                    <div
                      key={caravan.id}
                      className="border border-green-200 bg-green-50/40 shadow-sm relative rounded-xl p-5"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-green-100/70 p-2.5 rounded-lg text-green-700">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 uppercase tracking-wide text-sm">{caravan.church_name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{caravan.city_state || "Local não info."}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                             <Badge className="bg-green-200/50 text-green-700 hover:bg-green-200/70 font-medium px-2.5 shadow-none transition-colors border border-green-300/30">
                              Confirmada
                            </Badge>
                            <div className="flex items-center">
                              {isAdmin && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 -mr-1">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Deletar caravana?</AlertDialogTitle></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(caravan.id)} className="bg-red-600">Deletar</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                        </div>
                      </div>

                      <div className="space-y-2.5 text-sm text-green-900/80 mb-5">
                        <div className="flex items-center"><Users className="h-4 w-4 mr-2.5 text-green-700/60" /> <span className="font-medium mr-1">Pastor:</span> {caravan.pastor_name}</div>
                        <div className="flex items-center"><Bus className="h-4 w-4 mr-2.5 text-green-700/60" /> <span className="font-medium mr-1">Placa:</span> {caravan.vehicle_plate}</div>
                        <div className="flex items-center"><Users className="h-4 w-4 mr-2.5 text-green-700/60" /> <span className="font-medium mr-1">Líder:</span> {caravan.leader_name}</div>
                        <div className="flex items-center"><Phone className="h-4 w-4 mr-2.5 text-green-700/60" /> {caravan.leader_whatsapp}</div>
                      </div>

                      <div className="pt-3.5 border-t border-green-200/60 flex items-center text-xs font-medium text-green-700/70">
                        <Calendar className="h-3.5 w-3.5 mr-1.5" />
                        {caravan.created_at ? new Date(caravan.created_at).toLocaleDateString("pt-BR") : "-"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {!isLoading && filteredCaravanas.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-xl border-slate-200 bg-slate-50/50">
                 <Bus className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                 <p className="text-slate-500 font-medium">Nenhuma caravana encontrada para esses filtros.</p>
              </div>
            )}
          </div>
        )}

        {/* Modal Agendar Evento */}
        <Dialog open={openScheduleEvent} onOpenChange={setOpenScheduleEvent}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agendar Evento para Caravanas</DialogTitle>
              <DialogDescription>
                {eventMode === "select"
                  ? "Selecione um evento existente ou crie um novo"
                  : "Preencha os dados do novo evento"}
              </DialogDescription>
            </DialogHeader>

            {eventMode === "select" ? (
              <div className="space-y-4">
                {eventsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-slate-600 mb-3">Nenhum evento registrado</p>
                    <Button
                      onClick={() => setEventMode("create")}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Novo Evento
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {events.map((event) => (
                        <button
                          key={event.id}
                          onClick={() => handleScheduleEvent(event)}
                          className="w-full text-left p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition"
                        >
                          <div className="font-medium text-slate-900">{event.title}</div>
                          {event.starts_at && (
                            <div className="text-xs text-slate-500 mt-1">
                              {new Date(event.starts_at).toLocaleDateString("pt-BR")}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <Button
                      onClick={() => setEventMode("create")}
                      variant="outline"
                      className="w-full border-blue-600 text-blue-600 hover:bg-blue-50"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Novo Evento
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="eventTitle" className="text-sm font-medium">
                    Título do Evento *
                  </Label>
                  <Input
                    id="eventTitle"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Ex: Conferência de Caravanas 2026"
                    className="text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="eventStart" className="text-sm font-medium">
                      Data de Início
                    </Label>
                    <Input
                      id="eventStart"
                      type="date"
                      value={eventStartDate}
                      onChange={(e) => setEventStartDate(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eventEnd" className="text-sm font-medium">
                      Data de Término
                    </Label>
                    <Input
                      id="eventEnd"
                      type="date"
                      value={eventEndDate}
                      onChange={(e) => setEventEndDate(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setEventMode("select")}
                    variant="outline"
                    className="flex-1"
                    disabled={isCreatingEvent}
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={handleCreateEvent}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={isCreatingEvent}
                  >
                    {isCreatingEvent ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      "Criar Evento"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal Nova Caravana */}
        <Dialog open={openNewCaravana} onOpenChange={setOpenNewCaravana}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Caravana</DialogTitle>
              <DialogDescription>
                Preencha os dados para registrar uma nova caravana
              </DialogDescription>
            </DialogHeader>
            <NovaCaravanaForm onSuccess={() => {
              setOpenNewCaravana(false);
              queryClient.invalidateQueries({ queryKey: ["caravanas"] });
            }} />
          </DialogContent>
        </Dialog>
      </div>
    </ManagementShell>
  );
}
