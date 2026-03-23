import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type MinisterialMeetingFormState = {
  title: string;
  meeting_date: string;
  expires_at: string;
  notes: string;
};

export function MinisterialMeetingDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
  saving = false,
  churchName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: MinisterialMeetingFormState;
  onChange: (value: MinisterialMeetingFormState) => void;
  onSubmit: () => void;
  saving?: boolean;
  churchName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Agendar reuniao ministerial</DialogTitle>
          <DialogDescription>
            Gere o link público da lista de presença para os obreiros da reunião de {churchName || "sua igreja"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meeting-title">Titulo</Label>
            <Input
              id="meeting-title"
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
              placeholder="Ex.: Reuniao ministerial de marco"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-date">Data da reuniao</Label>
              <Input
                id="meeting-date"
                type="date"
                value={value.meeting_date}
                onChange={(e) => onChange({ ...value, meeting_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-expires">Validade do link</Label>
              <Input
                id="meeting-expires"
                type="datetime-local"
                value={value.expires_at}
                onChange={(e) => onChange({ ...value, expires_at: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="meeting-notes">Observacao</Label>
            <Textarea
              id="meeting-notes"
              value={value.notes}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
              placeholder="Opcional: detalhes para a equipe da reuniao"
              className="min-h-[100px]"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={onSubmit} disabled={saving || !value.meeting_date || !value.expires_at}>
              {saving ? "Gerando link..." : "Gerar lista de presença"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
