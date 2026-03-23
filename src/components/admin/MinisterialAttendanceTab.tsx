import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  ClipboardCopy,
  ClipboardList,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFriendlyError } from "@/lib/error-map";
import { formatDateBr } from "@/lib/br-format";
import {
  createMinisterialMeeting,
  listChurchesInScope,
  listMinisterialMeetings,
  manageMinisterialMeeting,
  type ChurchInScopeItem,
  type MinisterialMeetingItem,
} from "@/services/saasService";
import { MinisterialMeetingDialog, type MinisterialMeetingFormState } from "./MinisterialMeetingDialog";

function getTodayDateInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function buildDefaultMeetingExpiry(dateInput: string) {
  if (!dateInput) return "";
  return `${dateInput}T23:59`;
}

function createEmptyMeetingForm(dateInput = getTodayDateInput()): MinisterialMeetingFormState {
  return {
    title: "",
    meeting_date: dateInput,
    expires_at: buildDefaultMeetingExpiry(dateInput),
    notes: "",
  };
}

function getChurchLabel(church: ChurchInScopeItem | null) {
  if (!church) return "";
  return `${church.totvs_id} - ${church.church_name}`;
}

function getMeetingPublicUrl(publicToken: string) {
  if (!publicToken) return "";
  return `${window.location.origin}/presenca-publica/${publicToken}`;
}

export function MinisterialAttendanceTab({
  activeTotvsId,
  initialChurchTotvsId,
}: {
  activeTotvsId: string;
  initialChurchTotvsId?: string;
}) {
  const queryClient = useQueryClient();
  const [selectedChurchTotvsId, setSelectedChurchTotvsId] = useState(initialChurchTotvsId || activeTotvsId || "");
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [managingMeetingId, setManagingMeetingId] = useState<string | null>(null);
  const [meetingForm, setMeetingForm] = useState<MinisterialMeetingFormState>(() => createEmptyMeetingForm());

  const { data: churches = [], isLoading: loadingChurches } = useQuery({
    queryKey: ["ministerial-attendance-churches", activeTotvsId],
    queryFn: () => listChurchesInScope(1, 400, activeTotvsId || undefined),
    enabled: Boolean(activeTotvsId),
    refetchInterval: 10000,
  });

  const { data: meetings = [] } = useQuery({
    queryKey: ["ministerial-meetings", selectedChurchTotvsId || activeTotvsId],
    queryFn: () => listMinisterialMeetings(selectedChurchTotvsId || activeTotvsId),
    enabled: Boolean(selectedChurchTotvsId || activeTotvsId),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (initialChurchTotvsId) {
      setSelectedChurchTotvsId(initialChurchTotvsId);
      return;
    }
    if (!selectedChurchTotvsId && activeTotvsId) {
      setSelectedChurchTotvsId(activeTotvsId);
    }
  }, [initialChurchTotvsId, activeTotvsId, selectedChurchTotvsId]);

  useEffect(() => {
    if (!selectedChurchTotvsId && churches.length === 1) {
      setSelectedChurchTotvsId(String(churches[0].totvs_id || ""));
    }
  }, [churches, selectedChurchTotvsId]);

  useEffect(() => {
    setMeetingForm((prev) => ({
      ...prev,
      expires_at: prev.expires_at || buildDefaultMeetingExpiry(prev.meeting_date || getTodayDateInput()),
    }));
  }, []);

  const selectedChurch = useMemo(
    () => churches.find((item) => String(item.totvs_id || "") === selectedChurchTotvsId) || null,
    [churches, selectedChurchTotvsId],
  );

  const latestMeeting = meetings[0] || null;

  async function refreshMeetings() {
    await queryClient.invalidateQueries({ queryKey: ["ministerial-meetings"] });
  }

  async function handleCreateMeeting() {
    if (!selectedChurchTotvsId) {
      toast.error("Selecione a igreja da reunião.");
      return;
    }
    if (!meetingForm.meeting_date) {
      toast.error("Informe a data da reunião.");
      return;
    }
    if (!meetingForm.expires_at) {
      toast.error("Informe a validade do link.");
      return;
    }

    setMeetingSaving(true);
    try {
      await createMinisterialMeeting({
        church_totvs_id: selectedChurchTotvsId || activeTotvsId,
        title: meetingForm.title.trim() || null,
        meeting_date: meetingForm.meeting_date,
        expires_at: new Date(meetingForm.expires_at).toISOString(),
        notes: meetingForm.notes.trim() || null,
      });
      await refreshMeetings();
      setMeetingDialogOpen(false);
      setMeetingForm(createEmptyMeetingForm(meetingForm.meeting_date));
      toast.success("Lista de presença gerada com sucesso.");
    } catch (err) {
      toast.error(getFriendlyError(err, "generic"));
    } finally {
      setMeetingSaving(false);
    }
  }

  async function handleMeetingAction(meeting: MinisterialMeetingItem, action: "close" | "reopen" | "delete") {
    if (action === "delete") {
      const confirmed = window.confirm(`Excluir a reunião "${meeting.title || "Reunião ministerial"}"?`);
      if (!confirmed) return;
    }

    setManagingMeetingId(meeting.id);
    try {
      await manageMinisterialMeeting({
        meeting_id: meeting.id,
        action,
        church_totvs_id: selectedChurchTotvsId || activeTotvsId,
        expires_at: action === "reopen" ? new Date(buildDefaultMeetingExpiry(getTodayDateInput())).toISOString() : null,
      });
      await refreshMeetings();
      toast.success(
        action === "close"
          ? "Reuniao encerrada."
          : action === "reopen"
            ? "Reuniao reaberta."
            : "Reuniao excluida.",
      );
    } catch (err) {
      toast.error(getFriendlyError(err, "generic"));
    } finally {
      setManagingMeetingId(null);
    }
  }

  async function handleCopyMeetingLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link da lista de presença copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  function handleOpenMeetingLink(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            Presença
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1">
              <Label>Igreja da reunião</Label>
              <Select value={selectedChurchTotvsId} onValueChange={setSelectedChurchTotvsId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingChurches ? "Carregando igrejas..." : "Selecione a igreja"} />
                </SelectTrigger>
                <SelectContent>
                  {churches.map((church) => (
                    <SelectItem key={String(church.totvs_id)} value={String(church.totvs_id)}>
                      {getChurchLabel(church)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="button" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => setMeetingDialogOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> Agendar reunião
            </Button>
          </div>

          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">Link público da presença</div>
                <div className="text-xs text-slate-500">
                  Gere a URL e envie para os obreiros marcarem a presença na lista pública.
                </div>
              </div>

              {latestMeeting ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {latestMeeting.title || "Reunião ministerial"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{formatDateBr(latestMeeting.meeting_date)}</span>
                        <span>Validade: {new Date(latestMeeting.expires_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={latestMeeting.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}
                      >
                        {latestMeeting.is_active ? "Ativa" : "Encerrada"}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => void handleCopyMeetingLink(getMeetingPublicUrl(latestMeeting.public_token))}>
                        <ClipboardCopy className="mr-2 h-4 w-4" /> Copiar URL
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleOpenMeetingLink(getMeetingPublicUrl(latestMeeting.public_token))}>
                        <ExternalLink className="mr-2 h-4 w-4" /> Abrir URL
                      </Button>
                      {latestMeeting.is_active ? (
                        <Button size="sm" variant="outline" disabled={managingMeetingId === latestMeeting.id} onClick={() => void handleMeetingAction(latestMeeting, "close")}>
                          {managingMeetingId === latestMeeting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Encerrar"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={managingMeetingId === latestMeeting.id} onClick={() => void handleMeetingAction(latestMeeting, "reopen")}>
                          {managingMeetingId === latestMeeting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reabrir"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="text-rose-600" disabled={managingMeetingId === latestMeeting.id} onClick={() => void handleMeetingAction(latestMeeting, "delete")}>
                        {managingMeetingId === latestMeeting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500">
                  Nenhuma reunião foi criada ainda para essa igreja.
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <MinisterialMeetingDialog
        open={meetingDialogOpen}
        onOpenChange={setMeetingDialogOpen}
        value={meetingForm}
        onChange={setMeetingForm}
        onSubmit={() => void handleCreateMeeting()}
        saving={meetingSaving}
        churchName={selectedChurch?.church_name || ""}
      />
    </div>
  );
}
