import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { getFriendlyError } from "@/lib/error-map";
import { formatDateBr } from "@/lib/br-format";
import { getPublicMinisterialMeeting, savePublicMinisterialAttendance, type MinisterialAttendanceStatus } from "@/services/saasService";

type MeetingUser = {
  id: string;
  full_name: string;
  phone?: string | null;
  minister_role?: string | null;
  is_active?: boolean;
  attendance_status?: string | null;
  justification_text?: string | null;
};

export default function PresencaPublica() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Awaited<ReturnType<typeof getPublicMinisterialMeeting>>["meeting"] | null>(null);
  const [users, setUsers] = useState<MeetingUser[]>([]);
  const [search, setSearch] = useState("");
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const data = await getPublicMinisterialMeeting(token);
        if (!active) return;
        setMeeting(data.meeting);
        setUsers(data.users);
      } catch (err) {
        if (!active) return;
        setErrorMessage(getFriendlyError(err, "generic"));
        setMeeting(null);
        setUsers([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (token) void load();
    else {
      setLoading(false);
      setErrorMessage("Link de presença inválido.");
    }

    return () => {
      active = false;
    };
  }, [token]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    if (needle.length < 2) return [];
    const numericNeedle = search.replace(/\D/g, "");
    const searchingByPhone = numericNeedle.length >= 2 && numericNeedle.length === needle.replace(/\s/g, "").length;
    return users.filter((user) => {
      const name = String(user.full_name || "").toLowerCase();
      const role = String(user.minister_role || "").toLowerCase();
      const phone = String(user.phone || "").replace(/\D/g, "");
      if (searchingByPhone) return phone.includes(numericNeedle);
      return name.includes(needle) || role.includes(needle);
    });
  }, [search, users]);

  async function handleSave(userId: string, status: MinisterialAttendanceStatus) {
    setSavingId(userId);
    try {
      const justificationText = String(justifications[userId] || "").trim();
      const data = await savePublicMinisterialAttendance({
        token,
        user_id: userId,
        status,
        justification_text: status === "FALTA_JUSTIFICADA" ? justificationText : "",
      }) as { blocked?: boolean };

      setUsers((prev) => prev.filter((user) => user.id !== userId));
      if (data.blocked) {
        toast.error("Obreiro bloqueado automaticamente por 3 faltas sem justificativa em 180 dias.", { duration: 6000 });
      } else {
        toast.success("Presença registrada com sucesso.");
      }
    } catch (err) {
      toast.error(getFriendlyError(err, "generic"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Lista pública de presença</CardTitle>
                <CardDescription>Marque a presença dos obreiros da reunião ministerial.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando reuniao...
              </div>
            ) : errorMessage ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
            ) : meeting ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-lg font-semibold text-slate-900">{meeting.title || "Reuniao ministerial"}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">
                    <Badge variant="outline">{meeting.church_name || "Igreja"}</Badge>
                    <Badge variant="outline">Data: {formatDateBr(meeting.meeting_date)}</Badge>
                    <Badge variant="outline">Validade: {new Date(meeting.expires_at).toLocaleString()}</Badge>
                  </div>
                  {meeting.notes ? <p className="mt-3 text-sm text-slate-600">{meeting.notes}</p> : null}
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar obreiro por nome, cargo ou telefone"
                    className="pl-10"
                  />
                </div>

                {search.trim().length === 1 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    Digite pelo menos 2 caracteres para buscar.
                  </div>
                ) : null}

                <div className="space-y-3">
                  {filteredUsers.map((user) => {
                    const attendanceLabel = String(user.attendance_status || "SEM_REGISTRO").trim().toUpperCase();
                    const label =
                      attendanceLabel === "PRESENTE"
                        ? "Presente"
                        : attendanceLabel === "FALTA"
                          ? "Falta"
                          : attendanceLabel === "FALTA_JUSTIFICADA"
                            ? "Justificada"
                            : "Sem registro";

                    return (
                      <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1">
                            <div className="text-base font-semibold text-slate-900">{user.full_name}</div>
                            <div className="text-sm text-slate-500">{user.minister_role || "Obreiro"}</div>
                            {user.phone ? <div className="text-sm text-slate-500">{user.phone}</div> : null}
                            <Badge variant="outline" className="mt-1">
                              {label}
                            </Badge>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3 lg:w-[420px]">
                            <Button type="button" variant="outline" disabled={savingId === user.id} onClick={() => void handleSave(user.id, "PRESENTE")}>
                              Presente
                            </Button>
                            <Button type="button" variant="outline" disabled={savingId === user.id} onClick={() => void handleSave(user.id, "FALTA")}>
                              Falta
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={savingId === user.id || !String(justifications[user.id] || "").trim()}
                              onClick={() => void handleSave(user.id, "FALTA_JUSTIFICADA")}
                            >
                              Justificada
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={justifications[user.id] || user.justification_text || ""}
                            onChange={(e) => setJustifications((prev) => ({ ...prev, [user.id]: e.target.value }))}
                            placeholder="Justificativa da falta"
                            className="min-h-[72px]"
                          />
                        </div>
                      </div>
                    );
                  })}

                  {filteredUsers.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                      Nenhum obreiro encontrado para essa busca.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
