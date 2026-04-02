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
import { Bus, Check, Trash2, Loader2, Users, Map, Calendar, QrCode, Copy, ExternalLink, Plus, Edit, Building2, Phone } from "lucide-react";
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

  type EventRow = {
    id: string;
    title?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  };

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events", session?.totvs_id],
    queryFn: async () => {
      const res = await post("announcements-api", {
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

  const recebidas = useMemo(() => {
    return caravanas.filter((c) => c.status === "Recebida");
  }, [caravanas]);

  const confirmadas = useMemo(() => {
    return caravanas.filter((c) => c.status === "Confirmada");
  }, [caravanas]);

  const totalPassageiros = useMemo(() => {
    return caravanas.reduce((sum, c) => sum + (c.passenger_count || 0), 0);
  }, [caravanas]);

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
      const res = await post("announcements-api", {
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Bus className="h-6 w-6 text-blue-600" />
              <h1 className="text-3xl font-bold text-slate-900">Caravanas</h1>
            </div>
            <p className="text-slate-600">
              {isAdmin
                ? "Gerencie todas as caravanas registradas"
                : "Veja as caravanas da sua jurisdição"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setOpenScheduleEvent(true)} variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
              <Calendar className="h-4 w-4 mr-2" />
              Agendar Evento
            </Button>
            <Button onClick={() => setOpenNewCaravana(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Nova Caravana
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Recebidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{recebidas.length}</div>
              <p className="text-xs text-slate-500 mt-1">aguardando confirmação</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Confirmadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{confirmadas.length}</div>
              <p className="text-xs text-slate-500 mt-1">prontas para viajar</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">
                Total de Passageiros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{totalPassageiros}</div>
              <p className="text-xs text-slate-500 mt-1">em todas as caravanas</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <Input
                id="search"
                placeholder="Igreja, líder, pastor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="Recebida">Recebidas</SelectItem>
                  <SelectItem value="Confirmada">Confirmadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </CardContent>
          </Card>
        ) : caravanas.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Bus className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">Nenhuma caravana registrada</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Desktop View */}
            <div className="hidden md:block">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Igreja
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Líder
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Veículo
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Passageiros
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {caravanas.map((caravan, idx) => (
                      <tr
                        key={caravan.id}
                        className={`border-b ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                        } hover:bg-blue-50`}
                      >
                        <td className="px-4 py-3 text-sm">
                          <div className="font-medium text-slate-900">
                            {caravan.church_name}
                          </div>
                          {caravan.city_state && (
                            <div className="text-xs text-slate-500">{caravan.city_state}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {caravan.leader_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {caravan.vehicle_plate}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {caravan.passenger_count}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge
                            variant={
                              caravan.status === "Confirmada" ? "default" : "secondary"
                            }
                            className={
                              caravan.status === "Confirmada"
                                ? "bg-green-100 text-green-800"
                                : "bg-amber-100 text-amber-800"
                            }
                          >
                            {caravan.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {caravan.status === "Recebida" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConfirm(caravan)}
                              disabled={loadingId === caravan.id}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              {loadingId === caravan.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Check className="h-4 w-4 mr-1" />
                                  Confirmar
                                </>
                              )}
                            </Button>
                          )}
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Deletar caravana?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(caravan.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Deletar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cards View (Desktop) */}
            <div className="hidden md:grid md:grid-cols-2 gap-4">
              {caravanas.map((caravan) => (
                <Card
                  key={caravan.id}
                  className={`overflow-hidden border-2 ${
                    caravan.status === "Confirmada"
                      ? "bg-green-50 border-green-300"
                      : "bg-amber-50 border-amber-300"
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className={`h-5 w-5 ${caravan.status === "Confirmada" ? "text-green-600" : "text-amber-600"}`} />
                        <div>
                          <div className={`font-semibold ${caravan.status === "Confirmada" ? "text-green-900" : "text-amber-900"}`}>
                            {caravan.church_name}
                          </div>
                        </div>
                      </div>
                      <Badge className={caravan.status === "Confirmada" ? "bg-green-200 text-green-800" : "bg-amber-200 text-amber-800"}>
                        {caravan.status}
                      </Badge>
                    </div>

                    <div className={`text-sm ${caravan.status === "Confirmada" ? "text-green-700" : "text-amber-700"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4" />
                        <span>Pastor: {caravan.pastor_name}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Map className="h-4 w-4" />
                        <span>Placa: {caravan.vehicle_plate}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4" />
                        <span>Líder: {caravan.leader_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{caravan.leader_whatsapp}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t" style={{borderColor: caravan.status === "Confirmada" ? "#86efac" : "#fde047"}}>
                      <div className={`text-xs ${caravan.status === "Confirmada" ? "text-green-600" : "text-amber-600"}`}>
                        {caravan.created_at ? new Date(caravan.created_at).toLocaleDateString("pt-BR") : "-"}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={caravan.status === "Confirmada" ? "text-green-600 hover:bg-green-100" : "text-amber-600 hover:bg-amber-100"}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-100"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deletar caravana?</AlertDialogTitle>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(caravan.id)}
                                  className="bg-red-600"
                                >
                                  Deletar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
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
