import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getSignedPdfUrl, requestRelease, updateMyProfile, workerDashboard, type PastorLetter } from "@/services/saasService";
import { Share2, Download, Unlock, LogOut } from "lucide-react";

function statusClass(status: string) {
  if (status === "LIBERADA") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "AGUARDANDO_LIBERACAO") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "BLOQUEADO") return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

export default function UsuarioDashboard() {
  const { usuario, session, clearAuth } = useUser();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [profileForm, setProfileForm] = useState({ phone: "", email: "", address_city: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  const userId = String(usuario?.id || "");

  const { data, isLoading } = useQuery({
    queryKey: ["worker-dashboard", userId, dateStart, dateEnd],
    queryFn: () => workerDashboard(dateStart || undefined, dateEnd || undefined, 1, 50),
    enabled: Boolean(userId),
  });

  const letters = useMemo(() => (data?.letters || []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), [data?.letters]);
  const profile = data?.user;
  const church = data?.church;

  useEffect(() => {
    const city = String((profile?.address_json as any)?.city || "");
    setProfileForm({
      phone: profile?.phone || "",
      email: profile?.email || "",
      address_city: city,
    });
  }, [profile?.phone, profile?.email, (profile?.address_json as any)?.city]);

  function logout() {
    clearAuth();
    nav("/");
  }

  async function openPdf(letter: PastorLetter) {
    if (letter.status !== "LIBERADA") {
      toast.error("Carta bloqueada.");
      return;
    }
    if (!letter.storage_path) {
      toast.error("PDF ainda indisponivel.");
      return;
    }
    try {
      const url = await getSignedPdfUrl(letter.id);
      if (!url) throw new Error("signed-url-empty");
      window.open(url, "_blank");
    } catch {
      toast.error("Falha ao abrir PDF.");
    }
  }

  async function shareLetter(letter: PastorLetter) {
    if (letter.status !== "LIBERADA") {
      toast.error("Carta bloqueada.");
      return;
    }
    try {
      const url = await getSignedPdfUrl(letter.id);
      if (url) {
        window.open(`https://wa.me/?text=${encodeURIComponent(`Carta de pregacao: ${url}`)}`, "_blank");
      }
    } catch {
      toast.error("Falha ao compartilhar.");
    }
  }

  async function pedirLiberacao(letter: PastorLetter) {
    try {
      await requestRelease(letter.id, userId, session?.totvs_id || "");
      toast.success("Pedido enviado.");
      queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao solicitar liberacao.");
    }
  }

  async function salvarPerfil() {
    setSavingProfile(true);
    try {
      await updateMyProfile({
        phone: profileForm.phone || undefined,
        email: profileForm.email || undefined,
        address_city: profileForm.address_city || undefined,
      });
      toast.success("Perfil atualizado.");
      queryClient.invalidateQueries({ queryKey: ["worker-dashboard"] });
    } catch {
      toast.error("Falha ao atualizar perfil.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      <header className="bg-[#2f63d4] text-white shadow-md">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold">Sistema de Cartas de Pregacao</h1>
            <p className="text-sm text-white/90">Dashboard do Usuario</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => nav("/carta")}>
              Gerar carta
            </Button>
            <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Resumo do Usuario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Nome:</strong> {profile?.full_name || usuario?.nome || "-"}</p>
              <p><strong>CPF:</strong> {profile?.cpf || usuario?.cpf || "-"}</p>
              <p><strong>Cargo:</strong> {profile?.minister_role || usuario?.ministerial || "-"}</p>
              <p><strong>Igreja:</strong> {session?.church_name || church?.church_name || "-"}</p>
              <div className="grid gap-2 pt-2">
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Cidade</Label>
                  <Input value={profileForm.address_city} onChange={(e) => setProfileForm((p) => ({ ...p, address_city: e.target.value }))} />
                </div>
                <Button onClick={salvarPerfil} disabled={savingProfile}>
                  {savingProfile ? "Salvando..." : "Atualizar perfil"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle>Dados do seu pastor</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
              <p><strong>Nome:</strong> {church?.pastor_name || "-"}</p>
              <p><strong>Telefone:</strong> {church?.pastor_phone || "-"}</p>
              <p><strong>Email:</strong> {church?.pastor_email || "-"}</p>
              <p><strong>Endereco:</strong> {church?.address_full || "-"}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Historico de Cartas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>Data inicio</Label>
                <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Data fim</Label>
                <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
              </div>
              <div className="self-end">
                <Button variant="outline" onClick={() => { setDateStart(""); setDateEnd(""); }}>Limpar</Button>
              </div>
            </div>

            {isLoading ? <p className="text-sm text-slate-500">Carregando...</p> : null}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-[120px_120px_120px_180px_180px_120px_1fr] border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                  <span>Criada em</span>
                  <span>Data pregacao</span>
                  <span>Data emissao</span>
                  <span>Origem</span>
                  <span>Destino</span>
                  <span>Status</span>
                  <span>Acoes</span>
                </div>

                {letters.map((letter) => {
                  const canOpen = letter.status === "LIBERADA" && Boolean(letter.storage_path);
                  const canRequest = letter.status === "AUTORIZADO" || letter.status === "AGUARDANDO_LIBERACAO";
                  return (
                    <div key={letter.id} className="grid grid-cols-[120px_120px_120px_180px_180px_120px_1fr] items-center border-b px-4 py-3 text-sm">
                      <span>{formatDate(letter.created_at)}</span>
                      <span>{formatDate(letter.preach_date)}</span>
                      <span>{formatDate(letter.created_at)}</span>
                      <span className="truncate">{letter.church_origin || "-"}</span>
                      <span className="truncate">{letter.church_destination || "-"}</span>
                      <span>
                        <Badge variant="outline" className={statusClass(letter.status)}>{letter.status}</Badge>
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={!canOpen} onClick={() => openPdf(letter)}>
                          <Download className="mr-2 h-4 w-4" /> Abrir
                        </Button>
                        <Button variant="outline" disabled={!canOpen} onClick={() => shareLetter(letter)}>
                          <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                        </Button>
                        <Button className="bg-amber-500 hover:bg-amber-600" disabled={!canRequest} onClick={() => pedirLiberacao(letter)}>
                          <Unlock className="mr-2 h-4 w-4" /> Pedir liberacao
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {!isLoading && letters.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-500">Nenhuma carta encontrada.</div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
